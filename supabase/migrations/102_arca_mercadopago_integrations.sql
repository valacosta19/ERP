-- ARCA electronic invoicing and Mercado Pago assisted reconciliation.
-- Secrets and provider calls intentionally live in Edge Functions; this schema
-- only stores immutable fiscal snapshots and auditable external movements.

CREATE TABLE fiscal_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  document_type integer NOT NULL CHECK (document_type IN (80, 86, 96, 99)),
  document_number text NOT NULL DEFAULT '',
  tax_condition_id integer NOT NULL DEFAULT 5 CHECK (tax_condition_id IN (1, 4, 5, 6, 8, 10, 15)),
  address text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT fiscal_customer_document_required CHECK (document_type = 99 OR document_number <> '')
);

CREATE UNIQUE INDEX fiscal_customers_document_key
  ON fiscal_customers(document_type, document_number)
  WHERE document_number <> '';

CREATE TABLE fiscal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL DEFAULT 'homologation' CHECK (environment IN ('homologation', 'production')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'authorized', 'rejected', 'recovery_pending')),
  receipt_type integer NOT NULL DEFAULT 11 CHECK (receipt_type IN (11, 13)),
  point_of_sale integer NOT NULL CHECK (point_of_sale > 0),
  receipt_number bigint,
  issue_date date NOT NULL DEFAULT current_date,
  currency text NOT NULL DEFAULT 'PES' CHECK (currency = 'PES'),
  currency_rate numeric(12,6) NOT NULL DEFAULT 1 CHECK (currency_rate > 0),
  customer_id uuid REFERENCES fiscal_customers(id),
  customer_snapshot jsonb NOT NULL,
  subtotal numeric(12,2) NOT NULL CHECK (subtotal > 0),
  total numeric(12,2) NOT NULL CHECK (total > 0),
  associated_document_id uuid REFERENCES fiscal_documents(id),
  cae text,
  cae_expires_on date,
  qr_payload text,
  provider_response jsonb,
  last_error text,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  authorized_at timestamptz,
  CONSTRAINT fiscal_authorized_fields CHECK (
    status <> 'authorized' OR
    (receipt_number IS NOT NULL AND cae IS NOT NULL AND cae_expires_on IS NOT NULL AND authorized_at IS NOT NULL)
  ),
  CONSTRAINT fiscal_credit_note_link CHECK (receipt_type <> 13 OR associated_document_id IS NOT NULL)
);

CREATE UNIQUE INDEX fiscal_documents_number_key
  ON fiscal_documents(environment, point_of_sale, receipt_type, receipt_number)
  WHERE receipt_number IS NOT NULL;

CREATE TABLE fiscal_document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES fiscal_documents(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total > 0),
  vat_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (vat_rate = 0),
  UNIQUE(document_id, position)
);

CREATE TABLE fiscal_document_transactions (
  document_id uuid NOT NULL REFERENCES fiscal_documents(id) ON DELETE RESTRICT,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  amount_snapshot numeric(12,2) NOT NULL CHECK (amount_snapshot > 0),
  description_snapshot text,
  PRIMARY KEY(document_id, transaction_id)
);

CREATE UNIQUE INDEX fiscal_transaction_authorized_once
  ON fiscal_document_transactions(transaction_id);

CREATE TABLE fiscal_issue_queue (
  document_id uuid PRIMARY KEY REFERENCES fiscal_documents(id) ON DELETE CASCADE,
  tax_id text NOT NULL,
  point_of_sale integer NOT NULL,
  receipt_type integer NOT NULL,
  lease_owner uuid,
  lease_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fiscal_issue_queue_order
  ON fiscal_issue_queue(tax_id, point_of_sale, receipt_type, next_attempt_at);

CREATE TABLE mp_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('requested', 'processing', 'downloaded', 'completed', 'failed')),
  date_from timestamptz NOT NULL,
  date_to timestamptz NOT NULL,
  report_file_name text,
  imported_count integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  CHECK (date_to > date_from)
);

CREATE TABLE mp_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL,
  source_type text NOT NULL DEFAULT 'settlement_report' CHECK (source_type = 'settlement_report'),
  occurred_at timestamptz NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount <> 0),
  gross_amount numeric(12,2),
  fee_amount numeric(12,2),
  currency text NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
  description text,
  movement_type text,
  suggested_classification text NOT NULL DEFAULT 'unknown' CHECK (suggested_classification IN ('received_payment', 'fee', 'tax', 'withholding', 'withdrawal', 'refund', 'chargeback', 'unknown')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reconciled', 'ignored')),
  raw_data jsonb NOT NULL,
  first_seen_run_id uuid REFERENCES mp_sync_runs(id),
  last_seen_run_id uuid REFERENCES mp_sync_runs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type, external_id)
);

CREATE INDEX mp_movements_pending_order ON mp_movements(status, occurred_at DESC);

CREATE TABLE mp_reconciliation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  match_text text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('received_payment', 'fee', 'tax', 'withholding', 'withdrawal', 'refund', 'chargeback')),
  subcategory_id uuid REFERENCES transaction_categories(id),
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE mp_reconciliation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid NOT NULL UNIQUE REFERENCES mp_movements(id) ON DELETE RESTRICT,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  classification text NOT NULL CHECK (classification IN ('received_payment', 'fee', 'tax', 'withholding', 'withdrawal', 'refund', 'chargeback')),
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  reconciled_by uuid REFERENCES auth.users(id),
  notes text
);

CREATE OR REPLACE FUNCTION integrations_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;
REVOKE ALL ON FUNCTION integrations_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION integrations_is_admin() TO authenticated;

-- The legacy own-profile UPDATE policy is intentionally kept so users can
-- edit their name/business name. This trigger closes its privilege-escalation
-- hole: only an existing admin (or service_role) may change `role`.
CREATE OR REPLACE FUNCTION protect_profile_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT integrations_is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar roles.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_protect_role ON profiles;
CREATE TRIGGER profiles_protect_role
  BEFORE UPDATE OF role ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_role();
REVOKE ALL ON FUNCTION protect_profile_role() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION reject_authorized_fiscal_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'authorized' THEN
    RAISE EXCEPTION 'Un comprobante autorizado es inmutable. Emití una Nota de Crédito C para corregirlo.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fiscal_documents_immutable_after_authorization
  BEFORE UPDATE OR DELETE ON fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION reject_authorized_fiscal_mutation();

CREATE OR REPLACE FUNCTION reject_authorized_fiscal_child_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_document_id uuid;
BEGIN
  v_document_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.document_id ELSE NEW.document_id END;
  IF EXISTS (SELECT 1 FROM fiscal_documents WHERE id = v_document_id AND status = 'authorized') THEN
    RAISE EXCEPTION 'Los datos de un comprobante autorizado son inmutables.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fiscal_items_immutable_after_authorization
  BEFORE INSERT OR UPDATE OR DELETE ON fiscal_document_items
  FOR EACH ROW EXECUTE FUNCTION reject_authorized_fiscal_child_mutation();
CREATE TRIGGER fiscal_transactions_immutable_after_authorization
  BEFORE INSERT OR UPDATE OR DELETE ON fiscal_document_transactions
  FOR EACH ROW EXECUTE FUNCTION reject_authorized_fiscal_child_mutation();

CREATE OR REPLACE FUNCTION create_fiscal_draft(
  p_transaction_ids uuid[], p_customer_id uuid, p_point_of_sale integer,
  p_environment text DEFAULT 'homologation'
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

  INSERT INTO fiscal_documents(environment, point_of_sale, customer_id, customer_snapshot, subtotal, total, created_by)
  VALUES (p_environment, p_point_of_sale, p_customer_id, v_customer, v_total, v_total, auth.uid())
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
REVOKE ALL ON FUNCTION create_fiscal_draft(uuid[], uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_fiscal_draft(uuid[], uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION queue_fiscal_document(p_document_id uuid, p_tax_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc fiscal_documents%ROWTYPE;
BEGIN
  IF NOT integrations_is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede emitir comprobantes.'; END IF;
  SELECT * INTO v_doc FROM fiscal_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND OR v_doc.status NOT IN ('draft', 'rejected') THEN RAISE EXCEPTION 'El comprobante no está listo para emitir. Un estado recovery_pending requiere verificación manual en ARCA.'; END IF;
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
  UPDATE fiscal_documents SET status = 'queued', last_error = NULL WHERE id = p_document_id;
END;
$$;
REVOKE ALL ON FUNCTION queue_fiscal_document(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION queue_fiscal_document(uuid, text) FROM authenticated;

CREATE OR REPLACE FUNCTION claim_fiscal_document(p_document_id uuid, p_worker uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended((SELECT tax_id || ':' || point_of_sale || ':' || receipt_type FROM fiscal_issue_queue WHERE document_id = p_document_id), 23));
  UPDATE fiscal_issue_queue candidate
  SET lease_owner = p_worker, lease_expires_at = now() + interval '5 minutes', attempts = attempts + 1
  WHERE candidate.document_id = p_document_id
    AND candidate.next_attempt_at <= now()
    AND (candidate.lease_expires_at IS NULL OR candidate.lease_expires_at < now())
    AND NOT EXISTS (
      SELECT 1 FROM fiscal_issue_queue active
      WHERE active.document_id <> candidate.document_id
        AND active.tax_id = candidate.tax_id
        AND active.point_of_sale = candidate.point_of_sale
        AND active.receipt_type = candidate.receipt_type
        AND active.lease_expires_at >= now()
    );
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count = 1;
END;
$$;
REVOKE ALL ON FUNCTION claim_fiscal_document(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_fiscal_document(uuid, uuid) TO service_role;

-- Edge Functions use this single atomic transition; splitting queue and claim
-- would leave a queued document orphaned when another document owns the tuple.
CREATE OR REPLACE FUNCTION begin_fiscal_issue(
  p_document_id uuid, p_tax_id text, p_worker uuid, p_actor_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc fiscal_documents%ROWTYPE;
DECLARE v_row_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_actor_id AND role = 'admin') THEN RAISE EXCEPTION 'Admin actor required'; END IF;
  SELECT * INTO v_doc FROM fiscal_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND OR v_doc.status NOT IN ('draft', 'rejected') THEN RAISE EXCEPTION 'El comprobante no está listo para emitir.'; END IF;

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

  UPDATE fiscal_documents SET status = 'queued', last_error = NULL WHERE id = p_document_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION begin_fiscal_issue(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION begin_fiscal_issue(uuid, text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION record_fiscal_attempt_number(
  p_document_id uuid, p_worker uuid, p_receipt_number bigint
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM fiscal_issue_queue
    WHERE document_id = p_document_id AND lease_owner = p_worker AND lease_expires_at >= now()
  ) THEN RAISE EXCEPTION 'Lease fiscal inválido.'; END IF;
  UPDATE fiscal_documents SET receipt_number = p_receipt_number
  WHERE id = p_document_id AND status = 'queued' AND receipt_number IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo fijar el número fiscal antes de emitir.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION record_fiscal_attempt_number(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_fiscal_attempt_number(uuid, uuid, bigint) TO service_role;

CREATE OR REPLACE FUNCTION finalize_fiscal_document(
  p_document_id uuid, p_worker uuid, p_status text,
  p_receipt_number bigint, p_cae text, p_cae_expires_on date,
  p_qr_payload text, p_last_error text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_queue fiscal_issue_queue%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status NOT IN ('draft', 'authorized', 'rejected', 'recovery_pending') THEN RAISE EXCEPTION 'Transición fiscal inválida.'; END IF;
  SELECT * INTO v_queue FROM fiscal_issue_queue
  WHERE document_id = p_document_id FOR UPDATE;
  IF NOT FOUND OR v_queue.lease_owner IS DISTINCT FROM p_worker OR v_queue.lease_expires_at < now() THEN
    RAISE EXCEPTION 'Lease fiscal inexistente, vencido o perteneciente a otro worker.';
  END IF;
  IF p_status = 'authorized' AND (p_receipt_number IS NULL OR p_cae IS NULL OR p_cae_expires_on IS NULL OR p_qr_payload IS NULL) THEN
    RAISE EXCEPTION 'Una autorización requiere número, CAE, vencimiento y QR.';
  END IF;

  UPDATE fiscal_documents SET
    status = p_status,
    receipt_number = CASE WHEN p_status = 'draft' THEN NULL ELSE COALESCE(p_receipt_number, receipt_number) END,
    cae = CASE WHEN p_status = 'authorized' THEN p_cae ELSE cae END,
    cae_expires_on = CASE WHEN p_status = 'authorized' THEN p_cae_expires_on ELSE cae_expires_on END,
    qr_payload = CASE WHEN p_status = 'authorized' THEN p_qr_payload ELSE qr_payload END,
    authorized_at = CASE WHEN p_status = 'authorized' THEN now() ELSE authorized_at END,
    last_error = p_last_error
  WHERE id = p_document_id AND status IN ('queued', 'recovery_pending');
  IF NOT FOUND THEN RAISE EXCEPTION 'El documento no admite esta transición.'; END IF;

  IF p_status = 'recovery_pending' THEN
    UPDATE fiscal_issue_queue SET lease_owner = NULL, lease_expires_at = NULL WHERE document_id = p_document_id;
  ELSE
    DELETE FROM fiscal_issue_queue WHERE document_id = p_document_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION finalize_fiscal_document(uuid, uuid, text, bigint, text, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finalize_fiscal_document(uuid, uuid, text, bigint, text, date, text, text) TO service_role;

CREATE OR REPLACE FUNCTION record_fiscal_recovery_evidence(
  p_document_id uuid, p_worker uuid, p_receipt_number bigint,
  p_evidence jsonb, p_last_error text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM fiscal_issue_queue
    WHERE document_id = p_document_id AND lease_owner = p_worker
  ) THEN RAISE EXCEPTION 'El worker no posee la emisión fiscal.'; END IF;
  UPDATE fiscal_documents SET
    status = 'recovery_pending',
    receipt_number = p_receipt_number,
    provider_response = COALESCE(provider_response, '{}'::jsonb) || jsonb_build_object('recovery_evidence', p_evidence, 'recorded_at', now()),
    last_error = p_last_error
  WHERE id = p_document_id AND status = 'queued';
  IF NOT FOUND THEN RAISE EXCEPTION 'El documento ya no admite evidencia de recuperación.'; END IF;
  UPDATE fiscal_issue_queue SET lease_owner = NULL, lease_expires_at = NULL WHERE document_id = p_document_id;
END;
$$;
REVOKE ALL ON FUNCTION record_fiscal_recovery_evidence(uuid, uuid, bigint, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_fiscal_recovery_evidence(uuid, uuid, bigint, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION mark_stale_fiscal_recovery(
  p_document_id uuid, p_actor_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_actor_id AND role = 'admin') THEN RAISE EXCEPTION 'Admin actor required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM fiscal_issue_queue
    WHERE document_id = p_document_id AND lease_expires_at < now()
  ) THEN RAISE EXCEPTION 'La emisión sigue activa o no tiene evidencia recuperable.'; END IF;
  UPDATE fiscal_documents SET status = 'recovery_pending', last_error = COALESCE(last_error, 'La emisión perdió su worker; consultar ARCA sin reemitir.')
  WHERE id = p_document_id AND status = 'queued' AND receipt_number IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'El documento no admite recuperación por lease vencido.'; END IF;
  UPDATE fiscal_issue_queue SET lease_owner = NULL, lease_expires_at = NULL WHERE document_id = p_document_id;
END;
$$;
REVOKE ALL ON FUNCTION mark_stale_fiscal_recovery(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_stale_fiscal_recovery(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION recover_fiscal_document(
  p_document_id uuid, p_actor_id uuid, p_receipt_number bigint,
  p_cae text, p_cae_expires_on date, p_qr_payload text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_actor_id AND role = 'admin') THEN RAISE EXCEPTION 'Admin actor required'; END IF;
  UPDATE fiscal_documents SET
    status = 'authorized', cae = p_cae, cae_expires_on = p_cae_expires_on,
    qr_payload = p_qr_payload, authorized_at = now(), last_error = NULL
  WHERE id = p_document_id
    AND status = 'recovery_pending'
    AND receipt_number = p_receipt_number
    AND p_cae IS NOT NULL AND p_cae_expires_on IS NOT NULL AND p_qr_payload IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'La recuperación no coincide con el documento pendiente.'; END IF;
  DELETE FROM fiscal_issue_queue WHERE document_id = p_document_id;
END;
$$;
REVOKE ALL ON FUNCTION recover_fiscal_document(uuid, uuid, bigint, text, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recover_fiscal_document(uuid, uuid, bigint, text, date, text) TO service_role;

CREATE OR REPLACE FUNCTION publish_mp_reconciliation(
  p_movement_id uuid, p_classification text, p_existing_transaction_id uuid DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL, p_destination_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_movement mp_movements%ROWTYPE;
  v_tx_id uuid;
  v_amount numeric(12,2);
  v_direction text;
  v_transfer_category uuid;
BEGIN
  IF NOT integrations_is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede conciliar movimientos.'; END IF;
  SELECT * INTO v_movement FROM mp_movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND OR v_movement.status <> 'pending' THEN RAISE EXCEPTION 'El movimiento ya fue procesado o no existe.'; END IF;
  IF EXISTS (SELECT 1 FROM locked_periods WHERE year = extract(year FROM v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires') AND month = extract(month FROM v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')) THEN
    RAISE EXCEPTION 'El período contable del movimiento está cerrado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE lower(name) = lower('Mercado Pago') AND active) THEN RAISE EXCEPTION 'Configurá el método de pago Mercado Pago antes de conciliar.'; END IF;
  v_amount := abs(v_movement.amount);

  IF p_classification = 'received_payment' THEN
    IF p_existing_transaction_id IS NULL THEN RAISE EXCEPTION 'Un cobro debe vincularse a una venta existente para no duplicarla.'; END IF;
    SELECT id INTO v_tx_id FROM transactions WHERE id = p_existing_transaction_id AND voided_at IS NULL;
    IF v_tx_id IS NULL THEN RAISE EXCEPTION 'La venta seleccionada no existe o está anulada.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM transaction_payments WHERE transaction_id = v_tx_id AND lower(payment_method) = lower('Mercado Pago') AND type = 'entrada') THEN
      RAISE EXCEPTION 'La venta seleccionada no tiene un cobro de Mercado Pago.';
    END IF;
  ELSIF p_classification = 'withdrawal' THEN
    IF p_destination_payment_method IS NULL OR lower(p_destination_payment_method) = lower('Mercado Pago') THEN RAISE EXCEPTION 'Elegí la cuenta de destino del retiro.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = p_destination_payment_method AND active) THEN RAISE EXCEPTION 'La cuenta de destino no existe o está inactiva.'; END IF;
    SELECT id INTO v_transfer_category FROM transaction_categories WHERE lower(name) = lower('Transferencia interna') LIMIT 1;
    IF v_transfer_category IS NULL THEN RAISE EXCEPTION 'Falta la categoría Transferencia interna.'; END IF;
    INSERT INTO transactions(date, amount, currency, subcategory_id, description, created_by)
    VALUES ((v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, v_amount, 'ARS', v_transfer_category, COALESCE(p_notes, v_movement.description, 'Retiro de Mercado Pago'), auth.uid()) RETURNING id INTO v_tx_id;
    INSERT INTO transaction_payments(transaction_id, payment_method, amount, type) VALUES
      (v_tx_id, 'Mercado Pago', v_amount, 'salida'),
      (v_tx_id, p_destination_payment_method, v_amount, 'entrada');
  ELSIF p_classification IN ('fee', 'tax', 'withholding', 'refund', 'chargeback') THEN
    IF p_subcategory_id IS NULL THEN RAISE EXCEPTION 'Elegí una categoría contable.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM transaction_categories WHERE id = p_subcategory_id AND transaction_type = 'expense') THEN RAISE EXCEPTION 'La categoría debe ser un egreso.'; END IF;
    INSERT INTO transactions(date, amount, currency, subcategory_id, description, created_by)
    VALUES ((v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, v_amount, 'ARS', p_subcategory_id, COALESCE(p_notes, v_movement.description, 'Movimiento de Mercado Pago'), auth.uid()) RETURNING id INTO v_tx_id;
    INSERT INTO transaction_payments(transaction_id, payment_method, amount, type)
    VALUES (v_tx_id, 'Mercado Pago', v_amount, 'salida');
  ELSE
    RAISE EXCEPTION 'Clasificación no publicable. Los movimientos desconocidos deben permanecer pendientes.';
  END IF;

  INSERT INTO mp_reconciliation_links(movement_id, transaction_id, classification, reconciled_by, notes)
  VALUES (p_movement_id, v_tx_id, p_classification, auth.uid(), p_notes);
  UPDATE mp_movements SET status = 'reconciled', suggested_classification = p_classification, updated_at = now() WHERE id = p_movement_id;
  RETURN v_tx_id;
END;
$$;
REVOKE ALL ON FUNCTION publish_mp_reconciliation(uuid, text, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION publish_mp_reconciliation(uuid, text, uuid, uuid, text, text) TO authenticated;

-- Reconciled ledger rows are managed by the integration and cannot be edited,
-- voided or deleted through generic transaction/payment paths.
CREATE OR REPLACE FUNCTION transaction_managed_source(p_transaction_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM mp_reconciliation_links WHERE transaction_id = p_transaction_id) THEN 'conciliación de Mercado Pago'
    WHEN EXISTS (SELECT 1 FROM commission_payouts WHERE paid_via_transaction_id = p_transaction_id) THEN 'liquidación de comisiones'
    WHEN EXISTS (SELECT 1 FROM supplier_debt_payments WHERE transaction_id = p_transaction_id) THEN 'pago de deuda a proveedor'
    WHEN EXISTS (SELECT 1 FROM purchase_orders WHERE payment_transaction_id = p_transaction_id) THEN 'pago de orden de compra'
    WHEN EXISTS (SELECT 1 FROM receivables WHERE source_transaction_id = p_transaction_id) THEN 'origen de cuenta por cobrar'
    WHEN EXISTS (SELECT 1 FROM receivable_collections WHERE transaction_id = p_transaction_id) THEN 'cobranza de cuenta por cobrar'
    WHEN EXISTS (SELECT 1 FROM reserve_movements WHERE transaction_id = p_transaction_id) THEN 'movimiento de reserva'
    ELSE NULL
  END;
$$;
REVOKE ALL ON FUNCTION transaction_managed_source(uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE fiscal_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_document_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_issue_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_reconciliation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_reconciliation_links ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fiscal_customers','fiscal_documents','fiscal_document_items','fiscal_document_transactions','mp_sync_runs','mp_movements','mp_reconciliation_rules','mp_reconciliation_links'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (integrations_is_admin())', 'admin read ' || t, t);
  END LOOP;
END $$;

CREATE POLICY "admin manage fiscal customers" ON fiscal_customers FOR ALL TO authenticated USING (integrations_is_admin()) WITH CHECK (integrations_is_admin());
CREATE POLICY "admin manage mp rules" ON mp_reconciliation_rules FOR ALL TO authenticated USING (integrations_is_admin()) WITH CHECK (integrations_is_admin());

REVOKE ALL ON fiscal_customers, fiscal_documents, fiscal_document_items, fiscal_document_transactions, fiscal_issue_queue,
  mp_sync_runs, mp_movements, mp_reconciliation_rules, mp_reconciliation_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fiscal_customers TO authenticated;
GRANT SELECT ON fiscal_documents, fiscal_document_items, fiscal_document_transactions TO authenticated;
GRANT SELECT ON mp_sync_runs, mp_movements, mp_reconciliation_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mp_reconciliation_rules TO authenticated;

-- Optional daily scheduler. It stores only the Vault secret NAME in pg_cron;
-- the secret value is resolved at execution time and never embedded in SQL.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION configure_mp_daily_sync(
  p_project_url text,
  p_anon_key_secret_name text,
  p_cron_secret_name text,
  p_hour_utc integer DEFAULT 8
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron, vault, extensions AS $$
DECLARE v_job_id bigint;
DECLARE v_poll_job_id bigint;
BEGIN
  IF NOT integrations_is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede configurar la sincronización.'; END IF;
  IF p_project_url !~ '^https://[a-z0-9-]+\.supabase\.co$' OR p_hour_utc NOT BETWEEN 0 AND 23 THEN
    RAISE EXCEPTION 'URL de proyecto u hora UTC inválida.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = p_cron_secret_name AND decrypted_secret <> '')
     OR NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = p_anon_key_secret_name AND decrypted_secret <> '') THEN
    RAISE EXCEPTION 'Los secrets indicados no existen en Vault.';
  END IF;
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'erp-mp-daily-sync';
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
  SELECT jobid INTO v_poll_job_id FROM cron.job WHERE jobname = 'erp-mp-poll-sync';
  IF v_poll_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_poll_job_id); END IF;
  SELECT cron.schedule(
    'erp-mp-daily-sync',
    format('0 %s * * *', p_hour_utc),
    format(
      'SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',''Bearer '' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=%L LIMIT 1),''x-cron-secret'',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=%L LIMIT 1)), body := ''{"action":"run","mode":"start_or_advance","days":3}''::jsonb);',
      p_project_url || '/functions/v1/mercadopago-sync', p_anon_key_secret_name, p_cron_secret_name
    )
  ) INTO v_job_id;
  PERFORM cron.schedule(
    'erp-mp-poll-sync',
    '*/10 * * * *',
    format(
      'SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',''Bearer '' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=%L LIMIT 1),''x-cron-secret'',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=%L LIMIT 1)), body := ''{"action":"run","mode":"advance_only"}''::jsonb);',
      p_project_url || '/functions/v1/mercadopago-sync', p_anon_key_secret_name, p_cron_secret_name
    )
  );
  RETURN v_job_id;
END;
$$;
REVOKE ALL ON FUNCTION configure_mp_daily_sync(text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION configure_mp_daily_sync(text, text, text, integer) TO authenticated;
