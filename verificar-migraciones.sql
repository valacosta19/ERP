-- Verificación de migraciones aplicadas a medias.
-- Compara cada objeto que las migraciones dicen crear contra lo que existe.
-- Cada fila devuelta es algo que FALTA. Cero filas = todo aplicado.

WITH esperado_tablas(nombre, migracion) AS (VALUES
  ('anticipo_presets','057_anticipo_presets.sql'),
  ('catalog_items','008_catalog_items.sql'),
  ('commission_payout_receivables','052_staff_product_withdrawals.sql'),
  ('commission_payouts','052_staff_product_withdrawals.sql'),
  ('commission_settlement_periods','072_partial_commission_payouts.sql'),
  ('fixed_cost_rates','044_fixed_cost_rates.sql'),
  ('fixed_costs','025_service_cost.sql'),
  ('hairdressers','004_phase8_transactions_v2.sql'),
  ('inventory_lots','001_initial_schema.sql'),
  ('inventory_movements','001_initial_schema.sql'),
  ('inventory_recounts','065_inventory_recount.sql'),
  ('locked_periods','033_locked_periods.sql'),
  ('payment_methods','010_payment_methods.sql'),
  ('period_balance_snapshots','063_period_balance_snapshots.sql'),
  ('products','001_initial_schema.sql'),
  ('profiles','001_initial_schema.sql'),
  ('purchase_order_items','001_initial_schema.sql'),
  ('purchase_orders','001_initial_schema.sql'),
  ('receivable_collections','041_receivables.sql'),
  ('receivables','041_receivables.sql'),
  ('reserve_accounts','034_reserve_accounts.sql'),
  ('reserve_movements','034_reserve_accounts.sql'),
  ('sale_items','001_initial_schema.sql'),
  ('service_recipes','025_service_cost.sql'),
  ('supplier_debt_payments','040_supplier_debts.sql'),
  ('supplier_debts','040_supplier_debts.sql'),
  ('suppliers','001_initial_schema.sql'),
  ('transaction_categories','038_transaction_categories.sql'),
  ('transaction_hairdressers','004_phase8_transactions_v2.sql'),
  ('transaction_payments','004_phase8_transactions_v2.sql'),
  ('transaction_recipe_costs','045_transaction_recipe_costs.sql'),
  ('transactions','001_initial_schema.sql'),
  ('user_action_logs','031_user_action_logs.sql')
),
esperado_funciones(nombre, migracion) AS (VALUES
  ('apply_inventory_recount','065_inventory_recount.sql'),
  ('assert_transaction_is_not_commission_payout','075_atomic_void_transactions.sql'),
  ('check_transaction_period_not_locked','033_locked_periods.sql'),
  ('compute_period_snapshots','063_period_balance_snapshots.sql'),
  ('consume_inventory_fifo','001_initial_schema.sql'),
  ('create_funnel_unit','059_funnel_idempotency.sql'),
  ('create_sale','003_atomic_operations.sql'),
  ('create_staff_advance','061_staff_offline_advance.sql'),
  ('create_staff_receivable','052_staff_product_withdrawals.sql'),
  ('enforce_ars_commission_receivable','074_receivable_currency.sql'),
  ('get_opening_balance','063_period_balance_snapshots.sql'),
  ('handle_new_user','001_initial_schema.sql'),
  ('inherit_transaction_type','039_remove_transaction_type.sql'),
  ('lock_period_with_snapshot','063_period_balance_snapshots.sql'),
  ('preview_inventory_recount','065_inventory_recount.sql'),
  ('receive_purchase_order','003_atomic_operations.sql'),
  ('record_partial_commission_payout','072_partial_commission_payouts.sql'),
  ('record_receivable_collection','074_receivable_currency.sql'),
  ('record_supplier_debt_payment','073_atomic_supplier_debt_payments.sql'),
  ('reject_collection_for_voided_transaction','075_atomic_void_transactions.sql'),
  ('reverse_receivables_before_transaction_void','075_atomic_void_transactions.sql'),
  ('reverse_transaction_receivable_collections','075_atomic_void_transactions.sql'),
  ('set_product_sku','064_auto_sku.sql'),
  ('settle_commission_payout','052_staff_product_withdrawals.sql'),
  ('suggest_reorder_quantity','020_reorder_suggestion.sql'),
  ('update_reserve_movement','076_link_mirror_transactions.sql'),
  ('void_transaction','075_atomic_void_transactions.sql')
),
esperado_triggers(nombre, migracion) AS (VALUES
  ('commission_payout_receivables_ars_only','074_receivable_currency.sql'),
  ('on_auth_user_created','001_initial_schema.sql'),
  ('set_transaction_type','039_remove_transaction_type.sql'),
  ('trg_check_locked_period_insert','033_locked_periods.sql'),
  ('trg_check_locked_period_update','033_locked_periods.sql'),
  ('trg_reject_collection_for_voided_transaction','075_atomic_void_transactions.sql'),
  ('trg_reverse_receivables_before_transaction_void','075_atomic_void_transactions.sql'),
  ('trg_set_product_sku','064_auto_sku.sql')
),
esperado_vistas(nombre, migracion) AS (VALUES
  ('products_with_stock','012_products_with_stock_view.sql')
),
esperado_columnas(nombre, migracion) AS (VALUES
  ('catalog_items.hours','025_service_cost.sql'),
  ('catalog_items.price_card','028_catalog_item_prices.sql'),
  ('catalog_items.price_transfer','028_catalog_item_prices.sql'),
  ('commission_payouts.client_uuid','072_partial_commission_payouts.sql'),
  ('commission_payouts.payment_date','072_partial_commission_payouts.sql'),
  ('commission_payouts.payment_method','072_partial_commission_payouts.sql'),
  ('commission_payouts.settlement_period_id','072_partial_commission_payouts.sql'),
  ('hairdressers.commission_rates','056_hairdresser_commission_rates.sql'),
  ('inventory_movements.reason','032_add_reason_to_inventory_movements.sql'),
  ('products.brand','009_add_brand_to_products.sql'),
  ('products.skip_restock','018_add_skip_restock_to_products.sql'),
  ('products.unit_size','025_service_cost.sql'),
  ('profiles.business_name','005_add_business_name.sql'),
  ('purchase_orders.discount_amount','047_add_discount_to_purchase_orders.sql'),
  ('purchase_orders.payment_transaction_id','076_link_mirror_transactions.sql'),
  ('purchase_orders.shipping_cost','021_shipping_cost_on_po.sql'),
  ('receivable_collections.client_uuid','074_receivable_currency.sql'),
  ('receivables.client_uuid','061_staff_offline_advance.sql'),
  ('receivables.currency','074_receivable_currency.sql'),
  ('receivables.hairdresser_id','052_staff_product_withdrawals.sql'),
  ('receivables.product_id','052_staff_product_withdrawals.sql'),
  ('receivables.quantity','052_staff_product_withdrawals.sql'),
  ('receivables.source_transaction_id','042_prestamos_otorgados.sql'),
  ('receivables.unit_cost_snapshot','052_staff_product_withdrawals.sql'),
  ('reserve_movements.payment_method','081_reserve_movement_payment_method.sql'),
  ('reserve_movements.transaction_id','076_link_mirror_transactions.sql'),
  ('supplier_debt_payments.client_uuid','073_atomic_supplier_debt_payments.sql'),
  ('transaction_categories.deducts_inventory','046_category_deducts_inventory.sql'),
  ('transaction_categories.transaction_type','039_remove_transaction_type.sql'),
  ('transaction_hairdressers.commission_rate','015_add_commission_rate_to_transaction_hairdressers.sql'),
  ('transactions.catalog_item_id','027_catalog_item_on_transactions.sql'),
  ('transactions.client_uuid','059_funnel_idempotency.sql'),
  ('transactions.currency','013_add_currency_to_transactions.sql'),
  ('transactions.inventory_pending','054_add_inventory_pending_to_transactions.sql'),
  ('transactions.is_seña','004_phase8_transactions_v2.sql'),
  ('transactions.product_id','050_add_product_id_to_transactions.sql'),
  ('transactions.refunds_anticipo_id','043_add_refunds_anticipo_id.sql'),
  ('transactions.seña_amount','004_phase8_transactions_v2.sql'),
  ('transactions.subcategory_id','038_transaction_categories.sql'),
  ('transactions.voided_at','030_soft_delete_transactions.sql'),
  ('transactions.voided_by','030_soft_delete_transactions.sql')
)
SELECT 'TABLA' AS tipo, e.nombre, e.migracion FROM esperado_tablas e
WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='public' AND c.relname=e.nombre AND c.relkind IN ('r','p'))
UNION ALL
SELECT 'FUNCION', e.nombre, e.migracion FROM esperado_funciones e
WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname=e.nombre)
UNION ALL
SELECT 'TRIGGER', e.nombre, e.migracion FROM esperado_triggers e
WHERE NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname=e.nombre)
UNION ALL
SELECT 'VISTA', e.nombre, e.migracion FROM esperado_vistas e
WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='public' AND c.relname=e.nombre AND c.relkind='v')
UNION ALL
SELECT 'COLUMNA', e.nombre, e.migracion FROM esperado_columnas e
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public'
                    AND table_name=split_part(e.nombre,'.',1)
                    AND column_name=split_part(e.nombre,'.',2))
ORDER BY 3, 1, 2;
