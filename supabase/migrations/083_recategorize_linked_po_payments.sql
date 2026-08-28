-- ============================================================
-- Reclasifica los pagos de OC que quedaron con categoría libre.
--
-- El pago de la OC de Fanatic (2026-05-29, $337.804,70) se cargó a mano como
-- 'Pago a proveedor (Fanatic Barber)' con categoría 'Inventario', en vez de la
-- categoría dedicada 'Compra de inventario (OC)'. Como está, resta en la
-- utilidad Y además su mercadería va a restar otra vez como COGS al venderse:
-- el doble conteo que la 070 vino a resolver. Se le escapó porque la 070
-- buscaba por descripción ILIKE 'Pago OC%' y esta no sigue esa plantilla.
--
-- Ahora no hace falta adivinar por texto: desde las migraciones 076–078 cada
-- OC pagada guarda el id de su transacción en payment_transaction_id. Se
-- reclasifica exactamente lo que ese vínculo señala, que es la definición
-- correcta de "pago de una OC".
--
-- Efecto contable: la utilidad del mes de cada pago reclasificado SUBE por su
-- importe, porque ese costo deja de contarse dos veces. El número corregido es
-- el verdadero.
--
-- CÓMO CORRERLA: el pago de Fanatic cae en mayo 2026, que está cerrado, y el
-- trigger de locked_periods bloquea el UPDATE. Antes de ejecutarla hay que
-- desbloquear ese mes desde Ajustes, y volver a cerrarlo después — la apertura
-- queda registrada en user_action_logs a nombre de quien la hizo. No sortear el
-- cierre desde SQL: el registro de quién abrió un período cerrado es el motivo
-- por el que existe ese mecanismo.
--
-- Es idempotente: solo toca las transacciones cuya categoría difiere de la
-- destino, así que volver a correrla no hace nada.
-- ============================================================

DO $$
DECLARE
  v_destino uuid;
  v_admin   uuid;
  v_rows    int;
  v_total   numeric;
BEGIN
  SELECT id INTO v_destino
  FROM transaction_categories WHERE name = 'Compra de inventario (OC)';
  IF v_destino IS NULL THEN
    RAISE EXCEPTION 'No existe la categoría "Compra de inventario (OC)" (mig. 070).';
  END IF;

  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'No hay usuario admin en profiles.';
  END IF;

  SELECT COALESCE(SUM(t.amount), 0) INTO v_total
  FROM transactions t
  JOIN purchase_orders po ON po.payment_transaction_id = t.id
  WHERE t.voided_at IS NULL
    AND t.subcategory_id IS DISTINCT FROM v_destino;

  UPDATE transactions t
  SET subcategory_id = v_destino
  FROM purchase_orders po
  WHERE po.payment_transaction_id = t.id
    AND t.voided_at IS NULL
    AND t.subcategory_id IS DISTINCT FROM v_destino;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RAISE NOTICE 'Pagos de OC reclasificados: % (total $%)', v_rows, v_total;

  IF v_rows > 0 THEN
    INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
    VALUES (v_admin, 'po_payments_recategorized', 'transaction_categories', v_destino,
            jsonb_build_object('transacciones_reclasificadas', v_rows,
                               'importe_total', v_total,
                               'motivo', 'Pagos de OC enlazados por payment_transaction_id que habían quedado con categoría libre (mig. 083)'));
  END IF;
END $$;

-- Verificación: pagos de OC que siguen fuera de la categoría dedicada.
-- Debe devolver cero filas.
--
-- SELECT t.date, t.amount, t.description, c.name AS categoria
-- FROM transactions t
-- JOIN purchase_orders po ON po.payment_transaction_id = t.id
-- LEFT JOIN transaction_categories c ON c.id = t.subcategory_id
-- WHERE t.voided_at IS NULL AND c.name IS DISTINCT FROM 'Compra de inventario (OC)';
