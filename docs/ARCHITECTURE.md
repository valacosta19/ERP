# Architecture — ERP-BO

Mapa por módulo de dominio. Para cada área documenta: qué hace, archivos involucrados, datos (tablas/vistas/RPCs) e **invariantes que no se pueden romper** sin provocar bugs silenciosos. Leer la sección relevante **antes** de tocar código de ese módulo.

---

## Auth

**Qué hace:** Login/logout, sesión y perfil de usuario. Diferencia usuarios admin vs. no-admin.

**Archivos:**
- `src/hooks/useAuth.ts` — maneja sesión + perfil vía `onAuthStateChange`
- `src/components/layout/AuthGuard.tsx` — wrapper de rutas protegidas
- `src/pages/auth/LoginPage.tsx`

**Datos:** `profiles` (extiende `auth.users`), `hairdressers`

**Invariantes:**
- No hay React context para auth; `useAuth` se llama directamente en los componentes que lo necesitan.
- Las rutas admin-only usan `<AuthGuard requireAdmin>` — no manejar la restricción en el componente de la página.
- El perfil se carga en `onAuthStateChange`, no en un efecto separado.

---

## Transacciones

**Qué hace:** CRUD de transacciones de caja. Cada transacción puede tener múltiples formas de pago, múltiples profesionales, seña, y vínculo a categoría/subcategoría.

**Archivos:**
- `src/pages/transactions/TransactionsPage.tsx` (746 líneas — página principal, formulario inline, lista, balances por método)
- `src/pages/transactions/ReconcileModal.tsx` — conciliación
- `src/hooks/useTransactions.ts` — `useTransactions`, `useCreateTransaction`, `useUpdateTransaction`, `useVoidTransaction`, `useUnrefundedAnticipos`, `usePaymentMethodBalances`
- `src/hooks/useTransactionCategories.ts` — `useTransactionCategories`, `useCreateCategory`, `useUpdateCategory`
- `src/hooks/useTransactionPayments.ts`
- `src/hooks/useTransactionRecipeCosts.ts`
- `src/hooks/useAnticipoBalance.ts`, `src/hooks/useAnticipoPresets.ts`
- `src/components/transactions/ProductCombobox.tsx`

**Datos:**
- Tablas: `transactions`, `transaction_payments`, `transaction_hairdressers`, `transaction_categories`, `transaction_recipe_costs`, `receivables`, `user_action_logs`
- Vistas: `products_with_stock` (para snapshot de costo al registrar servicio con receta)

**Invariantes (NO romper):**
- **Soft-delete only.** Nunca borrar una transacción. Void = setear `voided_at` + insertar en `user_action_logs`. `useVoidTransaction` ya hace ambos.
- **`is_seña = true` son anticipos puros.** Se excluyen de revenue, profit y reportes de costos. Solo entran al resultado cuando la transacción final los referencia via `seña_amount`. Verificar exclusión en `useReports.ts` línea ~320.
- **`transaction_payments` es el origen del balance.** El campo `transactions.amount` es suma derivada de `transaction_payments.amount`. Los balances por método de pago (`usePaymentMethodBalances`) leen `transaction_payments`, no `transactions.amount`.
- **`sale_items` es inmutable** — no tiene UI de edición ni update policy en DB.
- **Period locking.** Antes de crear/editar/anular, verificar que el período no esté en `locked_periods`. La validación se hace en la UI (ver `useLockedPeriods`); la DB tiene triggers que lo refuerzan.
- **Categorías de gasto.** `subcategory_id` requerido cuando `transaction_type = 'expense'`. La categoría `'Consumos y cortesías'` con `deducts_inventory = true` es la que dispara el descuento físico de inventario vía FIFO.
- **Préstamos otorgados.** Al crear una transacción cuya subcategoría es `'Préstamos otorgados'`, `useCreateTransaction` inserta automáticamente una fila en `receivables`. No duplicar esta lógica.
- **`transaction_recipe_costs`** se inserta en `useCreateTransaction` si el `catalog_item_id` tiene recetas en `service_recipes`. Es un snapshot del costo de materiales en ese momento — no se recalcula luego.

**Gotchas:**
- Al editar una transacción, los `transaction_payments` y `transaction_hairdressers` se borran y reinsertan (no se actualizan). No usar `update` sobre ellos.
- `voided_at` debe excluirse en todas las queries de reportes y balances (`.is('voided_at', null)`).

---

## Carga Rápida (QuickFunnel)

**Qué hace:** Flujo simplificado multi-paso para registrar rápidamente una transacción de servicio o gasto desde el mostrador. Soporta modo offline con cola persistente en localStorage.

**Archivos:**
- `src/pages/transactions/QuickFunnelPage.tsx` (505 líneas)
- `src/components/transactions/QuickFunnel/funnelAtoms.tsx` — estado del funnel
- `src/components/transactions/QuickFunnel/funnelTypes.ts` — tipos del flujo
- `src/components/transactions/QuickFunnel/buildTicket.ts` — construye el `TicketPayload` a partir del estado del funnel
- `src/components/transactions/QuickFunnel/funnelSubmit.ts` — llama al RPC y gestiona el resultado
- `src/components/transactions/QuickFunnel/useFunnelQueue.ts` — hook de cola offline (enqueue/flush/discard/retry)
- `src/components/transactions/QuickFunnel/offlineQueue.ts` — lógica de persistencia en localStorage
- `src/components/transactions/QuickFunnel/StepType.tsx`, `StepAmount.tsx`, `StepDetailIncome.tsx`, `StepDetailSimple.tsx`, `StepPayment.tsx`, `StepAdjust.tsx`, `TicketPanel.tsx`

**Datos:**
- RPC: `create_funnel_unit` (idempotente — recibe un `idempotency_key` en UUID)
- Tablas escritas por el RPC: `transactions`, `transaction_payments`, `transaction_hairdressers`, `transaction_recipe_costs`
- Migración de idempotencia: `059_funnel_idempotency.sql`, `060_funnel_idempotency_race_fix.sql`

**Invariantes (NO romper):**
- **El RPC `create_funnel_unit` es idempotente.** Cada ticket lleva un `idempotency_key` (UUID generado en el cliente). Si la red falla y se reintenta, el RPC detecta la clave duplicada y devuelve el resultado anterior sin reinsertar. No usar `useCreateTransaction` para el funnel.
- **Cola offline en localStorage.** Si el submit falla (sin red), el ticket se encola via `offlineQueue.ts`. Al recuperar conexión, el flush se dispara desde `AppShell` (on-mount + evento `online` + intervalo 20s) — funciona en cualquier página. La fuente de verdad offline es localStorage.
- **Flush global en `AppShell`.** `AppShell.tsx` monta el driver de cola para que los tickets encolados desde Inventario o Carga Rápida drenen automáticamente al recuperar conexión, sin necesidad de estar en QuickFunnelPage.
- **`funnelSubmit.ts` es un dispatcher multi-kind.** `submitTicket` rutea por `unit.kind`: `service/product/tip/simple` → `create_funnel_unit`; `staff_advance` → `create_staff_advance`; `staff_withdrawal` → `create_staff_receivable`. Todos son idempotentes por `client_uuid`.
- **`flushQueue` tiene mutex de módulo.** Previene ejecuciones concurrentes desde múltiples instancias de `useFunnelQueue` (AppShell + QuickFunnelPage).
- **`buildTicket.ts` es la única función** que convierte el estado del funnel en un `TicketPayload`. No construir el payload directamente en componentes.
- **`StepDetailSimple` exige producto cuando `deducts_inventory`.** Si la subcategoría seleccionada tiene `deducts_inventory = true`, el picker de producto es obligatorio y `canAdvance('detail')` retorna false hasta que se seleccione uno.

---

## Inventario / FIFO

**Qué hace:** Gestión de lotes de inventario. Cada ingreso (compra) genera un lote. El descuento físico de stock sigue FIFO estricto via RPC Postgres. La vista `products_with_stock` agrega el stock disponible.

**Archivos:**
- `src/pages/inventory/InventoryPage.tsx` (311 líneas)
- `src/pages/inventory/LotDrawer.tsx` (347 líneas) — drawer inline de lotes de un producto, edición de cantidad y costo
- `src/hooks/useProducts.ts` — lista productos con stock (query sobre `products_with_stock`)
- `src/hooks/useInventoryLots.ts`
- `src/hooks/useUpdateInventoryLot.ts` — edita lote y registra movimiento de ajuste
- `src/hooks/useCreateInventoryLot.ts`
- `src/hooks/useCreateInventoryMovement.ts`

**Datos:**
- Tablas: `products`, `inventory_lots`, `inventory_movements`, `sale_items`
- Vista: `products_with_stock` (no tiene `stock` column en `products` — el stock es `SUM(remaining_quantity)`)
- RPC: `consume_inventory_fifo(product_id, quantity, reference_id, reference_type)` — SECURITY DEFINER

**Invariantes (NO romper):**
- **FIFO solo en Postgres.** El RPC `consume_inventory_fifo` es la única forma de descontar stock. Nunca restar `remaining_quantity` directamente desde el frontend.
- **Todo cambio a `remaining_quantity` genera un movimiento.** `useUpdateInventoryLot` inserta en `inventory_movements` con el delta. Si se edita el lote por otra vía, igual debe insertarse la fila de movimiento.
- **`unit_cost` es read-only si el lote tiene `sale_items`.** `LotDrawer` verifica esto antes de permitir edición. No omitir esta validación en cambios al drawer.
- **`products_with_stock` debe recrearse con DROP + CREATE** al agregar columnas — `CREATE OR REPLACE` no reordena columnas y puede romper queries por posición.
- **Registrar un servicio NO descuenta inventario.** `service_recipes` solo sirve para calcular el costo teórico. El descuento físico de productos usados en un servicio se registra manualmente como transacción "Consumos y cortesías" (`deducts_inventory = true`), que llama `consume_inventory_fifo` en `TransactionsPage`.
- **`consume_inventory_fifo` se llama desde `TransactionsPage.tsx` línea ~228** cuando la categoría de gasto tiene `deducts_inventory = true`.

---

## Compras / Purchase Orders

**Qué hace:** Gestión de órdenes de compra a proveedores. Soporta recepción parcial (checklist por producto), distribución proporcional de flete, y sugerencia de cantidad a reponer.

**Archivos:**
- `src/pages/purchase-orders/PurchaseOrdersPage.tsx` (1173 líneas — **archivo grande; leer completo antes de tocar**)
- `src/hooks/usePurchaseOrders.ts`
- `src/hooks/useReorderSuggestion.ts`
- `src/hooks/useSuppliers.ts`

**Datos:**
- Tablas: `purchase_orders`, `purchase_order_items`, `suppliers`, `inventory_lots`, `inventory_movements`
- RPC: `receive_purchase_order(po_id, received_items[])` — crea lotes y movimientos
- RPC: `suggest_reorder_quantity(product_id, month, year)` — promedio histórico × tasa de crecimiento, con fallback a mes anterior (3 meses de run-rate)
- Migración relevante: `022_partial_receive_po.sql`, `029_fix_receive_po_lot_id_ambiguous.sql`

**Invariantes (NO romper):**
- **Recepción parcial via RPC.** No insertar lotes manualmente. El RPC `receive_purchase_order` distribuye el flete proporcionalmente por valor de ítem y crea los lotes.
- **Flete editable solo en estado draft.** Una vez recibida la PO, el flete es inmutable.
- **Sugerencia de reposición tiene fallback.** Si no hay historial del mismo mes en años anteriores, cae a promedio de los últimos 3 meses (run-rate). No asumir que siempre retorna un número — puede ser null.

---

## Proveedores

**Qué hace:** CRUD de proveedores.

**Archivos:**
- `src/pages/suppliers/SuppliersPage.tsx`
- `src/hooks/useSuppliers.ts`

**Datos:** `suppliers`

---

## Comisiones / Sueldos

**Qué hace:** Reporte de comisiones por período (quincenal/mensual), liquidación de comisiones, retiros de staff a cuenta de comisión.

**Archivos:**
- `src/pages/reports/ReportsPage.tsx` → tab "Comisiones" y tab "Sueldos"
- `src/hooks/useCommissionsReport.ts`
- `src/hooks/useStaffReceivables.ts` — `useStaffReceivables`, `useStaffReceivableBalance`, `useSettleCommissionPayout`
- `src/hooks/useProfessionals.ts`
- `src/components/SettleCommissionModal.tsx`
- `src/components/StaffWithdrawalModal.tsx` — modal unificado con prop `mode: 'withdrawal' | 'advance'`. Submitea via pipeline offline (no llama RPCs directamente).

**Datos:**
- Tablas: `hairdressers`, `transaction_hairdressers`, `receivables` (con `hairdresser_id + product_id`), `receivable_collections`, `commission_payouts`, `transactions`
- RPC: `create_staff_receivable(p_client_uuid, hairdresser_id, product_id, quantity, value_amount, ...)` — idempotente por `client_uuid`. Registra retiro de producto, inserta `inventory_movements`, NO crea `transactions`.
- RPC: `create_staff_advance(p_client_uuid, hairdresser_id, amount, currency, payment_method, ...)` — idempotente por `client_uuid`. Crea una `transactions` (Movimiento/transfer, salida de caja) + un `receivable` contra el empleado. No toca inventario.
- RPC: `settle_commission_payout(hairdresser_id, period_start, period_end)` — inserta `receivable_collections` por retiros/adelantos, registra en `commission_payouts`, devuelve el monto neto.

**Invariantes (NO romper):**
- **Los retiros de staff NO son gastos en `transactions`.** Un retiro de producto se modela como `receivables` con `hairdresser_id`. Solo la liquidación neta final crea una fila en `transactions` expense.
- **Los adelantos de sueldo son Movimientos (transfer), no gastos.** Salen de caja pero no impactan el P&L. Se modelan como `receivables` con `hairdresser_id` y `source_transaction_id`. Se compensan al liquidar.
- **`create_staff_receivable` descuenta inventario** via `inventory_movements` con `reference_type = 'receivable'`. No crea `transactions`.
- **Ambos RPCs son idempotentes** — el short-circuit por `receivables.client_uuid` evita doble-consumo de FIFO o doble-transacción en reintentos offline.
- **La liquidación (`settle_commission_payout`) compensa CUALQUIER receivable** del hairdresser con saldo positivo, sin distinguir si es retiro de producto o adelanto de dinero.
- **La comisión devengada es siempre en bruto.** El cálculo de descuento por retiros/adelantos ocurre al liquidar.
- **`settle_commission_payout` devuelve el neto.** La UI crea un único `transactions` expense por ese neto. No crear transactions por el bruto.
- **Tasa de comisión por profesional.** Almacenada en `transaction_hairdressers.commission_rate` (libre por transacción). Default array en `hairdressers.commission_rates` (migración `056`).

---

## Reportes

**Qué hace:** Tabs: Financiero, Comisiones, Sueldos, Utilidad (profit), Costos, Valoración de inventario.

**Archivos:**
- `src/pages/reports/ReportsPage.tsx` (1149 líneas — **archivo grande; leer completo antes de tocar**)
- `src/hooks/useReports.ts` (368 líneas) — `useFinancialReport`, `useInventoryValuation`, `useProfitReport`
- `src/hooks/useCommissionsReport.ts`

**Datos:**
- Tablas: `transactions`, `transaction_payments`, `transaction_categories`, `inventory_lots`, `products`, `fixed_costs`, `fixed_cost_rates`, `service_recipes`, `transaction_recipe_costs`
- Vista: `products_with_stock`
- API externa: `dolarapi.com` (tipo de cambio dólar blue, cacheado 30 min) — `src/lib/`

**Invariantes (NO romper):**
- **Señas excluidas de revenue/profit/costos.** Transacciones con `is_seña = true` son anticipos puros. Solo impactan el resultado cuando la transacción final suma `seña_amount`. Toda query de reporte debe filtrar `is_seña = false` o manejar explícitamente este campo.
- **Costos fijos usan historial append-only.** Cada mes se usa la tasa de `fixed_cost_rates` con el `effective_from` más reciente ≤ a ese mes. No leer `fixed_costs.monthly_amount` directamente para períodos históricos.
- **Costo de materiales (`tab Costos`)** viene de `transaction_recipe_costs` (snapshot al momento de la transacción), no de `service_recipes` actuales. Cambiar las recetas no recalcula historial.
- **Conversión multimoneda**: USD→ARS vía dólar blue. EUR→ARS no está implementada aún. No asumir que todas las transacciones son ARS.
- **Transacciones anuladas excluidas.** Todas las queries de reportes filtran `.is('voided_at', null)`.

---

## Cuentas (por pagar / por cobrar)

**Qué hace:** Tab "Por pagar" — deudas a proveedores ligadas a POs. Tab "Por cobrar" — cuentas a cobrar standalone (incluyendo préstamos otorgados y retiros de staff).

**Archivos:**
- `src/pages/cuentas/CuentasPage.tsx` (657 líneas)
- `src/hooks/useSupplierDebts.ts`
- `src/hooks/useReceivables.ts` — `useReceivables`, `useCreateReceivable`, `useRecordReceivableCollection`
- `src/hooks/useStaffReceivables.ts` (ver módulo Comisiones)

**Datos:**
- Tablas: `supplier_debts`, `supplier_debt_payments`, `receivables`, `receivable_collections`, `transactions`

**Invariantes (NO romper):**
- **`supplier_debts`** se crean automáticamente al recibir una PO según `payment_option` (`immediate | deferred | none`). No crearlas manualmente desde la UI de Cuentas.
- **Los pagos/cobros pueden vincular opcionalmente a una `transactions`.** Este vínculo es opcional, no requerido.
- **Los retiros de staff (`hairdresser_id != null`) en `receivables`** aparecen en "Por cobrar" pero se liquidan a través del flujo de comisiones, no del flujo de cobro general. Distinguir en la UI por la presencia de `hairdresser_id`.

---

## Fondos / Reservas

**Qué hace:** Gestión de cuentas de reserva (ej. fondo de reinversión) y sus movimientos.

**Archivos:**
- `src/pages/fondos/FondosPage.tsx` (409 líneas)
- `src/hooks/useReserveAccounts.ts`
- `src/hooks/useReserveMovements.ts`

**Datos:** `reserve_accounts`, `reserve_movements`

**Invariantes:**
- La cuenta de reinversión fue restaurada en migración `048_restore_reinversion_reserve.sql` tras un drop accidental. Si se agrega lógica de seed, verificar que no duplique cuentas existentes.

---

## Settings

**Qué hace:** Administración de: categorías de transacción, métodos de pago, catálogo de servicios, profesionales (hairdressers), costos fijos, recetas de servicio, períodos bloqueados.

**Archivos:**
- `src/pages/settings/SettingsPage.tsx` (1678 líneas — **el archivo más grande del proyecto; leer completo antes de tocar; dividir en sub-componentes es deuda técnica pendiente**)
- `src/hooks/useTransactionCategories.ts`
- `src/hooks/usePaymentMethods.ts`
- `src/hooks/useCatalogItems.ts`
- `src/hooks/useProfessionals.ts`
- `src/hooks/useFixedCosts.ts`
- `src/hooks/useServiceRecipes.ts`
- `src/hooks/useLockedPeriods.ts`

**Datos:** `transaction_categories`, `payment_methods`, `catalog_items`, `hairdressers`, `fixed_costs`, `fixed_cost_rates`, `service_recipes`, `locked_periods`, `user_action_logs`

**Invariantes (NO romper):**
- **Costos fijos son append-only en `fixed_cost_rates`.** Editar un costo fijo inserta una nueva fila con `effective_from = today`, no sobreescribe el histórico. `useFixedCosts` debe respetar este patrón.
- **Categorías son dos niveles.** Top-level (parent_id null) fijo por tipo de transacción. Subcategorías son user-defined. No permitir más de dos niveles.
- **No borrar subcategorías con transacciones vinculadas.** La UI valida esto antes de eliminar.
- **`deducts_inventory` en `transaction_categories`** es la flag que dispara el FIFO en `TransactionsPage`. Solo subcategorías de "Consumos y cortesías" deben tenerla en `true`.
- **Locked periods** se gestionan desde Settings (admin only). Una vez bloqueado un mes, ninguna transacción de ese período puede crearse/editarse/anularse.

---

## AI Widget

**Qué hace:** Chat flotante (bottom-right) con contexto del negocio. Alimentado por un snapshot de 9 queries paralelas, cacheado 5 min.

**Archivos:**
- `src/components/AIWidget/AIWidget.tsx`
- `src/hooks/useBusinessSnapshot.ts` (253 líneas) — 9 queries paralelas en `Promise.all`
- `src/lib/gemini.ts` — cliente Gemini API
- `src/lib/buildSystemPrompt.ts` — construye el system prompt con el snapshot

**Datos:** Todas las tablas principales (snapshot de solo lectura).

**Invariantes:**
- **`VITE_GEMINI_API_KEY`** se expone en el bundle del cliente — es una deuda de seguridad conocida (ver `docs/backlog.md`). No agregar otras API keys al bundle.
- El snapshot se invalida cada 5 min (`staleTime: 5 * 60 * 1000`). No reducir este TTL sin medir el costo en llamadas a Supabase.

---

## Import (wizard)

**Qué hace:** Importación masiva de datos históricos desde Excel. Flujo de 5 pasos.

**Archivos:**
- `src/pages/import/ImportPage.tsx`
- `src/pages/import/steps/StepUpload.tsx`, `StepSheets.tsx`, `StepMapping.tsx`, `StepPreview.tsx`, `StepImport.tsx` (363 líneas)
- `src/pages/import/importLogic.ts` (217 líneas)

**Datos:** Escribe en `transactions`, `transaction_payments`, `transaction_hairdressers`.

**Invariantes:**
- La importación crea transacciones que deben cumplir las mismas reglas de integridad contable que la creación manual (no void, no borrado).

---

## Dashboard

**Qué hace:** KPIs resumen y gráficos de tendencia.

**Archivos:**
- `src/pages/dashboard/DashboardPage.tsx`

**Datos:** Lee `transactions`, `transaction_payments`.

---

## Transversales / Infraestructura

### Tipos
- `src/types/database.ts` (950 líneas) — generado desde el schema de Supabase. **Cada tabla debe incluir `Relationships: []`** o los tipos de insert/update infieren como `never` (bug conocido de `@supabase/supabase-js` 2.99 + TS 5.9).
- `src/types/index.ts` (310 líneas) — tipos de dominio del frontend. Deben estar en sync con `database.ts`.

### Supabase Client
- `src/lib/supabaseClient.ts` — único punto de acceso al cliente Supabase tipado.
- `src/lib/fetchAllRows.ts` — helper para paginar queries (`.range(from, to)`) sin límite de 1000 filas.

### Joins y casts
- Las queries con joins retornan `SelectQueryError` en lugar del tipo inferido. Siempre castear con `as unknown as TargetType`.

### Error Boundary
- `src/components/layout/ErrorBoundary.tsx` — wrappea la app en `App.tsx`. Atrapa errores de render. No atrapa errores async en hooks.

### UI Primitives
- `src/components/ui/` — Button, Input, Select, Modal, Badge, Table, InlineEditCell.
- Estilos via `var(--color-*)` CSS custom properties. **Nunca usar clases de color Tailwind directas** como `bg-green-500`.

---

## Convención de mantenimiento

Al cerrar una feature o fase:
1. Actualizar la sección del módulo afectado en este archivo (nuevas invariantes, archivos nuevos, cambios de tabla).
2. Agregar una línea en `PROJECT_STATE.md` bajo "Fases completadas".
3. No crear `PHASE_N_SUMMARY.md` — este archivo + git log son la única fuente de verdad.
