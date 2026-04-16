DO $$
DECLARE
  v_reserve_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO reserve_accounts (id, name, description, created_at)
  VALUES (v_reserve_id, 'reinversión', null, now());

  INSERT INTO reserve_movements (reserve_id, amount, note, date)
  VALUES (v_reserve_id, 1000000, 'Restauración manual — ingreso original 04/03/2025', '2025-03-04');
END $$;
