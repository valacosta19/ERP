-- 090: elimina la sobrecarga vieja de create_staff_receivable.
--
-- La 052 definió create_staff_receivable con 7 parámetros (sin client_uuid).
-- La 061 la "reemplazó" con 8 parámetros, pero CREATE OR REPLACE con otra
-- firma crea una función nueva y deja la anterior residente. La de 7 sigue
-- ejecutable por anon (verificar-migraciones.sql la lista como RPC_ANON),
-- consume inventario vía FIFO y no es idempotente. Ningún cliente la llama:
-- funnelSubmit.ts pasa siempre p_client_uuid.

DROP FUNCTION IF EXISTS create_staff_receivable(uuid, uuid, numeric, numeric, date, text, uuid);
