-- Allow administrators to choose the Factura C issue date while enforcing
-- ARCA's Concepto 2 window at draft creation and again before issuance.

CREATE OR REPLACE FUNCTION fiscal_issue_date_is_allowed(p_issue_date date)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    p_issue_date BETWEEN
      (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 10
      AND (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 10,
    false
  );
$$;
REVOKE ALL ON FUNCTION fiscal_issue_date_is_allowed(date) FROM PUBLIC, anon, authenticated;

DROP FUNCTION create_fiscal_draft(uuid[], uuid, integer, text);

CREATE FUNCTION create_fiscal_draft(
  p_transaction_ids uuid[], p_customer_id uuid, p_point_of_sale integer,
  p_environment text DEFAULT 'homologation',
  p_issue_date date DEFAULT ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_customer jsonb;
  v_total numeric(12,2);
  v_count integer;
BEGIN
  IF NOT integrations_is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede preparar comprobantes.'; END IF;
  IF p_transaction_ids IS NULL OR cardinality(p_transaction_ids) = 0 THEN RAISE EXCEPTION 'Seleccioná al menos una transacción.'; END IF;
  IF p_point_of_sale <= 0 OR p_environment NOT IN ('homologation', 'production') THEN RAISE EXCEPTION 'Configuración fiscal inválida.'; END IF;
  IF NOT fiscal_issue_date_is_allowed(p_issue_date) THEN
    RAISE EXCEPTION 'La fecha del comprobante debe estar dentro de los 10 días anteriores o posteriores a hoy.';
  END IF;

  SELECT count(*), round(sum(amount), 2)
  INTO v_count, v_total
  FROM transactions t
  JOIN transaction_categories tc ON tc.id = t.subcategory_id
  WHERE t.id = ANY(p_transaction_ids)
    AND t.voided_at IS NULL
    AND t.currency = 'ARS'
    AND tc.transaction_type = 'income';

  IF v_count <> cardinality(p_transaction_ids) OR v_total <= 0 THEN
    RAISE EXCEPTION 'El comprobante solo puede incluir ingresos ARS vigentes con total positivo.';
  END IF;
  IF EXISTS (SELECT 1 FROM fiscal_document_transactions WHERE transaction_id = ANY(p_transaction_ids)) THEN
    RAISE EXCEPTION 'Una de las transacciones ya pertenece a un comprobante fiscal.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM transaction_group_members selected_member
    JOIN transaction_group_members group_member ON group_member.group_id = selected_member.group_id
    WHERE selected_member.transaction_id = ANY(p_transaction_ids)
      AND NOT (group_member.transaction_id = ANY(p_transaction_ids))
  ) THEN
    RAISE EXCEPTION 'Una transacción agrupada debe facturarse junto con todos los miembros de su grupo.';
  END IF;
  IF p_customer_id IS NULL THEN
    v_customer := jsonb_build_object('name', 'Consumidor final', 'document_type', 99, 'document_number', '0', 'tax_condition_id', 5);
  ELSE
    SELECT to_jsonb(c) - 'created_by' INTO v_customer FROM fiscal_customers c WHERE c.id = p_customer_id;
    IF v_customer IS NULL THEN RAISE EXCEPTION 'El cliente fiscal no existe.'; END IF;
  END IF;

  INSERT INTO fiscal_documents(environment, point_of_sale, issue_date, customer_id, customer_snapshot, subtotal, total, created_by)
  VALUES (p_environment, p_point_of_sale, p_issue_date, p_customer_id, v_customer, v_total, v_total, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO fiscal_document_transactions(document_id, transaction_id, amount_snapshot, description_snapshot)
  SELECT v_id, t.id, t.amount, t.description FROM transactions t WHERE t.id = ANY(p_transaction_ids);

  INSERT INTO fiscal_document_items(document_id, position, description, quantity, unit_price, line_total)
  SELECT v_id, row_number() OVER (ORDER BY t.date, t.created_at, t.id),
         COALESCE(NULLIF(t.description, ''), 'Servicio'), 1, t.amount, t.amount
  FROM transactions t WHERE t.id = ANY(p_transaction_ids);

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION create_fiscal_draft(uuid[], uuid, integer, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_fiscal_draft(uuid[], uuid, integer, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION update_fiscal_draft_issue_date(p_document_id uuid, p_issue_date date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT integrations_is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede editar comprobantes.'; END IF;
  IF NOT fiscal_issue_date_is_allowed(p_issue_date) THEN
    RAISE EXCEPTION 'La fecha del comprobante debe estar dentro de los 10 días anteriores o posteriores a hoy.';
  END IF;

  UPDATE fiscal_documents
  SET issue_date = p_issue_date, last_error = NULL
  WHERE id = p_document_id AND status IN ('draft', 'rejected');
  IF NOT FOUND THEN RAISE EXCEPTION 'Solo se puede editar la fecha de un comprobante en borrador o rechazado.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION update_fiscal_draft_issue_date(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_fiscal_draft_issue_date(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION queue_fiscal_document(p_document_id uuid, p_tax_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc fiscal_documents%ROWTYPE;
BEGIN
  IF NOT integrations_is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede emitir comprobantes.'; END IF;
  SELECT * INTO v_doc FROM fiscal_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND OR v_doc.status NOT IN ('draft', 'rejected') THEN RAISE EXCEPTION 'El comprobante no está listo para emitir. Un estado recovery_pending requiere verificación manual en ARCA.'; END IF;
  IF NOT fiscal_issue_date_is_allowed(v_doc.issue_date) THEN
    RAISE EXCEPTION 'La fecha del comprobante quedó fuera de la ventana permitida por ARCA. Actualizala antes de emitir.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM fiscal_issue_queue
    WHERE document_id = p_document_id AND lease_expires_at >= now()
  ) THEN
    RAISE EXCEPTION 'El comprobante ya está siendo procesado.';
  END IF;
  INSERT INTO fiscal_issue_queue(document_id, tax_id, point_of_sale, receipt_type)
  VALUES (v_doc.id, p_tax_id, v_doc.point_of_sale, v_doc.receipt_type)
  ON CONFLICT (document_id) DO UPDATE
    SET next_attempt_at = now(), lease_owner = NULL, lease_expires_at = NULL
    WHERE fiscal_issue_queue.lease_expires_at IS NULL OR fiscal_issue_queue.lease_expires_at < now();
  UPDATE fiscal_documents SET
    status = 'queued',
    receipt_number = CASE WHEN status = 'rejected' THEN NULL ELSE receipt_number END,
    last_error = NULL
  WHERE id = p_document_id;
END;
$$;
REVOKE ALL ON FUNCTION queue_fiscal_document(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION queue_fiscal_document(uuid, text) FROM authenticated;

DROP FUNCTION begin_fiscal_issue(uuid, text, uuid, uuid);

CREATE FUNCTION begin_fiscal_issue(
  p_document_id uuid, p_tax_id text, p_worker uuid, p_actor_id uuid
) RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc fiscal_documents%ROWTYPE;
DECLARE v_row_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_actor_id AND role = 'admin') THEN RAISE EXCEPTION 'Admin actor required'; END IF;
  SELECT * INTO v_doc FROM fiscal_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND OR v_doc.status NOT IN ('draft', 'rejected') THEN RAISE EXCEPTION 'El comprobante no está listo para emitir.'; END IF;
  IF NOT fiscal_issue_date_is_allowed(v_doc.issue_date) THEN
    RAISE EXCEPTION 'La fecha del comprobante quedó fuera de la ventana permitida por ARCA. Actualizala antes de emitir.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tax_id || ':' || v_doc.point_of_sale || ':' || v_doc.receipt_type, 23));
  IF EXISTS (
    SELECT 1 FROM fiscal_issue_queue active
    WHERE active.document_id <> p_document_id
      AND active.tax_id = p_tax_id
      AND active.point_of_sale = v_doc.point_of_sale
      AND active.receipt_type = v_doc.receipt_type
      AND active.lease_expires_at >= now()
  ) THEN
    RAISE EXCEPTION 'Otro comprobante del mismo punto de venta está siendo procesado.';
  END IF;

  INSERT INTO fiscal_issue_queue(document_id, tax_id, point_of_sale, receipt_type, lease_owner, lease_expires_at, attempts)
  VALUES (p_document_id, p_tax_id, v_doc.point_of_sale, v_doc.receipt_type, p_worker, now() + interval '5 minutes', 1)
  ON CONFLICT (document_id) DO UPDATE SET
    tax_id = EXCLUDED.tax_id,
    point_of_sale = EXCLUDED.point_of_sale,
    receipt_type = EXCLUDED.receipt_type,
    lease_owner = EXCLUDED.lease_owner,
    lease_expires_at = EXCLUDED.lease_expires_at,
    attempts = fiscal_issue_queue.attempts + 1,
    next_attempt_at = now()
  WHERE fiscal_issue_queue.lease_expires_at IS NULL OR fiscal_issue_queue.lease_expires_at < now();
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN RAISE EXCEPTION 'El comprobante ya tiene un lease fiscal activo.'; END IF;

  UPDATE fiscal_documents SET
    status = 'queued',
    receipt_number = CASE WHEN status = 'rejected' THEN NULL ELSE receipt_number END,
    last_error = NULL
  WHERE id = p_document_id;
  RETURN v_doc.issue_date;
END;
$$;
REVOKE ALL ON FUNCTION begin_fiscal_issue(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION begin_fiscal_issue(uuid, text, uuid, uuid) TO service_role;
