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
- `src/pages/transactions/TransactionsPage.tsx` (~1000 líneas — página principal, formulario inline, lista, balances por método)
- `src/pages/transactions/ReconcileModal.tsx` — conciliación
- `src/hooks/useTransactions.ts` — `useTransactions`, `useCreateTransaction`, `useUpdateTransaction`, `useVoidTransaction`, `useUnrefundedAnticipos`, `usePaymentMethodBalances`
- `src/hooks/useTransactionOrder.ts` — `useReorderTransactions` (orden manual por fecha)
- `src/hooks/useTransactionGroups.ts` — `useTransactionGroups`, `useCreateTransactionGroup`, `useDeleteTransactionGroup`, `useRemoveGroupMember`
- `src/lib/transactionOrder.ts` — `fetchDisplayPositions`, `compareByDisplayOrder`, `reorderIds` (+ `transactionOrder.test.ts`)
- `src/hooks/useTransactionCategories.ts` — `useTransactionCategories`, `useCreateCategory`, `useUpdateCategory`
- `src/hooks/useTransactionPayments.ts`
- `src/hooks/useTransactionRecipeCosts.ts`
- `src/hooks/useAnticipoBalance.ts`, `src/hooks/useAnticipoPresets.ts`
- `src/components/transactions/ProductCombobox.tsx`

**Datos:**
- Tablas: `transactions`, `transaction_payments`, `transaction_hairdressers`, `transaction_categories`, `transaction_recipe_costs`, `transaction_display_order`, `transaction_groups`, `transaction_group_members`, `receivables`, `user_action_logs`
- Vistas: `products_with_stock` (para snapshot de costo al registrar servicio con receta)

**Invariantes (NO romper):**
- **Soft-delete only.** Nunca borrar una transacción. Void = setear `voided_at` + insertar en `user_action_logs`. `useVoidTransaction` ya hace ambos.
- **`amount = 0` solo con `seña_amount > 0`** (mig. `087`): un servicio cubierto íntegramente por el anticipo se graba sin pagos y se contabiliza por la seña.
- **El saldo de anticipos se calcula por subcategoría real.** `useAnticipoBalance` suma `Anticipo de señas`, resta `Devolución anticipo` y resta `seña_amount` de las transacciones con `is_seña = false`; `Anticipo de sueldos` no entra. Si falta la subcategoría de señas el hook falla en vez de devolver un saldo parcial. Pagina con `fetchAllRows` (desde junio 2026 ya hay más de 1000 filas).
- **Toda mutación contable invalida vía `invalidateAccounting(qc)`** (`src/lib/invalidateAccounting.ts`): transacciones, grupos, saldos por método, anticipos, reportes y dashboard. No enumerar claves a mano en cada hook; pasar solo las extra del módulo.
- **"Hoy" es siempre local.** `todayLocal()` / `daysAgoLocal()` en `src/lib/dateRange.ts`; nunca `new Date().toISOString().slice(0, 10)` (en UTC−3 devuelve mañana después de las 21:00).
- **Dinero se formatea con `formatMoney`** (`src/lib/money.ts`): una sola locale y decimales solo cuando hay centavos.
- **`is_seña = true` son anticipos puros.** Se excluyen de revenue, profit y reportes de costos. Solo entran al resultado cuando la transacción final los referencia via `seña_amount`. Verificar exclusión en `useReports.ts` línea ~320.
- **`transaction_payments` es el origen del balance.** El campo `transactions.amount` es suma derivada de `transaction_payments.amount`. Los balances por método de pago (`usePaymentMethodBalances`) leen `transaction_payments`, no `transactions.amount`.
- **`payment_method` es una FK contra `payment_methods.name`** (mig. `082`), con `ON UPDATE CASCADE`: renombrar una cuenta en Ajustes propaga a sus pagos, y no se puede borrar una cuenta con pagos. No escribir nombres de cuenta literales ni centinelas: un gasto costeado desde el stock no lleva fila de pago, lleva `payments: []` (`buildTicket.ts:139`). El catálogo es único sin distinguir mayúsculas.
- **`transaction_payments.amount` tiene las mismas reglas que `transactions.amount`**: `numeric(12,2)` y mayor a cero (mig. `082`). El signo va en `type`, que solo admite `'entrada'` o `'salida'`. Antes ambas columnas eran libres, y el costo FIFO por gramo se filtraba al pago con cuatro decimales.
- **`sale_items` es inmutable** — no tiene UI de edición ni update policy en DB.
- **Anular una transacción repone el inventario que consumió** (mig. `088`). `void_transaction` devuelve la cantidad a los mismos lotes registrados en `sale_items` (`remaining_quantity += quantity`) e inserta un `inventory_movements` `adjustment` positivo por lote con `reference_type = 'transaction_void'` y motivo 'Anulación de venta'. Idempotente: una transacción ya anulada no repone dos veces. Aplica a ventas de producto y a gastos de `Consumos y cortesías`.
- **Period locking.** Antes de crear/editar/anular, verificar que el período no esté en `locked_periods`. La validación se hace en la UI (ver `useLockedPeriods`); la DB tiene triggers que lo refuerzan.
- **El cierre de período aplica a todos los roles** (mig. `089`). `check_transaction_period_not_locked` es `SECURITY DEFINER` para que la RLS de `locked_periods` no lo ciegue a un `employee`; revisa `OLD.date` y `NEW.date` y cubre INSERT, UPDATE y DELETE sobre `transactions`.
- **Edición scoped por RLS.** Un `authenticated` solo puede hacer UPDATE de transacciones con `created_by = auth.uid()` y borrar `transaction_payments` / `transaction_hairdressers` de esas mismas transacciones; admin puede todo. Anular va siempre por `void_transaction`.
- **Toda RPC `SECURITY DEFINER` mutante tiene `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` y `SET search_path = public`.** `verificar-migraciones.sql` lista las que queden abiertas a `anon`.
- **Categorías de gasto.** `subcategory_id` requerido cuando `transaction_type = 'expense'`. La categoría `'Consumos y cortesías'` con `deducts_inventory = true` es la que dispara el descuento físico de inventario vía FIFO.
- **Préstamos otorgados.** Al crear una transacción cuya subcategoría es `'Préstamos otorgados'`, `useCreateTransaction` inserta automáticamente una fila en `receivables`. No duplicar esta lógica.
- **El orden manual vive en `transaction_display_order`, no en `transactions`** (mig. `085`). Se reordena **dentro de una misma fecha**, arrastrando o con `↑`/`↓` tras hacer clic en el handle; el orden por `date DESC` no se toca. La tabla lateral existe porque `trg_check_locked_period_update` (mig. `033`) es `BEFORE UPDATE ON transactions` sin acotar columnas y rechazaría cualquier escritura en un mes cerrado; como el orden es presentación pura, puede convivir con un período cerrado. Al soltar se renumera el grupo de fecha **completo** resuelto contra la base, así que las filas que el filtro oculta conservan su sitio relativo en vez de quedar indefinidas. La ausencia de posición equivale a `0`: una transacción nueva en un día ya reordenado aparece arriba de su grupo.
- **Los grupos de transacciones son presentacionales** (mig. `086`). `transaction_groups` + `transaction_group_members` juntan dos o más transacciones bajo una etiqueta para que la lista las muestre como una sola fila con el total, y sirven para conciliar contra una transferencia que cubrió varios conceptos. Ningún reporte, balance, snapshot ni RPC lee esas tablas: `totals` y `exportCSV` siguen reduciendo sobre la lista **plana** de transacciones, nunca sobre las filas agrupadas, y no existe ninguna transacción "resumen" — crearla duplicaría el importe en todos los agregadores. Igual que el orden manual, la membresía vive en una tabla lateral porque `trg_check_locked_period_update` (mig. `033`) rechazaría un `UPDATE` sobre `transactions` en un mes cerrado, y conciliar una transferencia vieja es justo el caso de uso.
- **Un grupo no mezcla monedas.** `trg_check_group_member_currency` lo rechaza en DB, y el `Select` de moneda del modal de edición queda deshabilitado mientras la transacción pertenezca a un grupo — si no, se podría desarmar la invariante por la puerta de atrás. Sí admite entradas y salidas mezcladas: el total de la fila es la suma con signo vía `getTxDirection`, calculada sobre **todos** los miembros no anulados, no solo los que pasan el filtro activo.
- **Los filtros de la lista viven en la query string** (`cat`, `cur`, `method`, `from`, `to`, `voided`, `pending`); se omite el parámetro cuando vale el default (mes actual, todo, apagado) y un valor inválido cae al default. Selección y expansión siguen en estado React. Al ir a Carga Rápida se llevan en `?back=` (codificados), y las tres salidas del funnel hacia la lista (`goToList`) los devuelven — así volver de cargar una transacción no descoloca la vista. Van en la URL y no en el `state` del router para que sobrevivan a una recarga, que en el funnel offline es un caso real.
- **El buscador (`q`) ignora el rango de fechas a propósito.** Sirve para encontrar una transacción de la que no se recuerda el mes, así que cuando tiene valor la query hace `ilike` sobre `description` y **no** aplica `from`/`to`; el resto de filtros sí se respetan. Mientras hay búsqueda, los inputs de fecha quedan deshabilitados, el pie "Flujo neto del período" se oculta y la exportación a CSV se bloquea: ambos son magnitudes de un período, y sobre un conjunto de coincidencias sin rango darían números sin significado. El texto se escapa antes del `ilike` para que `%` y `_` no actúen como comodines.
- **`transaction_recipe_costs`** se inserta en `useCreateTransaction` si el `catalog_item_id` tiene recetas en `service_recipes`. Es un snapshot del costo de materiales en ese momento — no se recalcula luego.

**Gotchas:**
- Al editar una transacción, los `transaction_payments` y `transaction_hairdressers` se borran y reinsertan (no se actualizan). No usar `update` sobre ellos.
- `voided_at` debe excluirse en todas las queries de reportes y balances (`.is('voided_at', null)`).
- `fetchDisplayPositions` acota siempre por los ids ya traídos. Un `select` sin filtro sobre `transaction_display_order` lo trunca PostgREST a 1000 filas y los días más viejos revertirían a su orden de carga sin ningún error visible.
- La tabla de transacciones no pagina: `Table` recibe `paginate={false}` y rinde por bloques, con un `<tr>` centinela y un `IntersectionObserver` que van añadiendo filas al llegar abajo. `thead` y `tfoot` quedan `sticky`. El resto de tablas del proyecto siguen paginando — la prop es opt-in. `renderCount` no se resetea al cambiar de filtro a propósito: `rows` se reconstruye en cada render, así que atarlo a la identidad del array lo resetearía siempre.
- **El orden se calcula sobre `rows`, no sobre `filteredTransactions`.** `rows` colapsa los miembros de un grupo en una sola fila, así que recorrer las transacciones daba índices que no correspondían a lo que se ve. `rowDateIds` traduce una fila visible a los ids que representa; una fila de grupo aporta solo sus miembros **de esa fecha y no anulados** (`group.members` viene sin filtrar, a propósito, para que el total del grupo sea el real).
- **La mutación de orden trabaja por anclas**, no con el orden entero desde el cliente: `{ date, movedIds, anchorIds, position }`. Resuelve el día completo contra la base y reinserta el bloque movido antes del primer ancla o después del último, conservando su orden interno. Es lo que permite mover un grupo entero, y lo que la deja preparada para cuando la lista cargue por tandas.
- **Las flechas mueven en local y persisten al final de la ráfaga.** Cada pulsación aplica `applyOptimisticReorder` sobre la caché y reprograma un flush de 450ms; al disparar, se lee la posición final de la fila y se manda **una sola** mutación anclada en su vecino de ese momento. Soltar la fila (Esc, el botón, o clicar otro handle) y desmontar la página fuerzan el flush. Persistir en cada pulsación costaba tres viajes a la base más el refetch de la lista, y se sentía a segundos por tecla.

---

## Shell, auth y feedback global

**Archivos:** `src/App.tsx`, `src/components/layout/AuthProvider.tsx`, `AuthContext.ts`, `AuthGuard.tsx`, `ErrorBoundary.tsx`, `src/components/ui/Toaster.tsx`, `ConfirmHost.tsx`, `src/lib/toast.ts`, `src/lib/confirm.ts`.

**Invariantes (NO romper):**
- **Una sola sesión.** `AuthProvider` se monta una vez sobre el router; `useAuth()` es un `useContext`. El perfil es `useQuery(['profile', user.id])`: un fallo al leerlo es un error visible con "Reintentar" en las rutas admin, nunca una degradación silenciosa a "no sos admin".
- **Ningún error de escritura es silencioso.** `QueryClient` lleva un `MutationCache.onError` que muestra el mensaje en un toast; los `try/catch` locales sirven solo para lógica adicional. `mutations.retry = 0`: una RPC no idempotente nunca se reintenta sola.
- **`refetchOnWindowFocus: false` por defecto.** Los reportes descargan tablas enteras; enfocar la pestaña no debe repetirlos. Opt-in por query si hace falta.
- **Sin `alert()` ni `confirm()` nativos.** `showToast()` y `confirmDialog()` (promesa) con hosts globales en `App.tsx`.
- **`ErrorBoundary` envuelve también el `AppShell`** (sidebar, widget IA, flush de la cola) y registra en consola; "Reintentar" remonta el subárbol.
- **Rutas pesadas con `lazy()`**: Dashboard (recharts), Reportes, Ajustes, Pedidos, Importar, Fondos, Cuentas. `xlsx` se importa dinámicamente dentro de los handlers de exportar/importar. El chunk inicial queda por debajo del aviso de 500 kB.
- **El widget IA no consulta hasta abrirse** (`useBusinessSnapshot(isOpen)`): nueve consultas menos por carga de página.

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
- Migración `087_funnel_full_sena.sql`: `transactions.amount` admite `0` solo cuando `seña_amount > 0` (servicio cubierto íntegramente por el anticipo)

**Invariantes (NO romper):**
- **El RPC `create_funnel_unit` es idempotente.** Cada ticket lleva un `idempotency_key` (UUID generado en el cliente). Si la red falla y se reintenta, el RPC detecta la clave duplicada y devuelve el resultado anterior sin reinsertar. No usar `useCreateTransaction` para el funnel.
- **Cola offline en localStorage.** Si el submit falla (sin red), el ticket se encola via `offlineQueue.ts`. Al recuperar conexión, el flush se dispara desde `AppShell` (on-mount + evento `online` + intervalo 20s) — funciona en cualquier página. La fuente de verdad offline es localStorage.
- **Flush global en `AppShell`.** `AppShell.tsx` monta el driver de cola para que los tickets encolados desde Inventario o Carga Rápida drenen automáticamente al recuperar conexión, sin necesidad de estar en QuickFunnelPage.
- **`funnelSubmit.ts` es un dispatcher multi-kind.** `submitTicket` rutea por `unit.kind`: `service/product/tip/simple` → `create_funnel_unit`; `staff_advance` → `create_staff_advance`; `staff_withdrawal` → `create_staff_receivable`. Todos son idempotentes por `client_uuid`.
- **`flushQueue` tiene mutex de módulo.** Previene ejecuciones concurrentes desde múltiples instancias de `useFunnelQueue` (AppShell + QuickFunnelPage).
- **`buildTicket.ts` es la única función** que convierte el estado del funnel en un `TicketPayload`. No construir el payload directamente en componentes.
- **Un carrito se graba agrupado.** `TicketPayload.group_label` (nombres de las líneas unidos con ` + `) viaja dentro del ticket, también en la cola offline. Al terminar el bucle de unidades, `submitTicket` recoge los `transaction_id` que devuelve `create_funnel_unit` y crea un `transaction_groups` con ellos vía `createTransactionGroup` (`useTransactionGroups.ts`); la propina entra en el grupo. Es idempotente: si alguno de esos ids ya tiene membresía no se crea nada, así que reintentar un ticket ya sincronizado no duplica el grupo. Los tickets de una sola unidad (simple, adelanto, retiro) no generan grupo.
- **Un fallo a mitad de ticket informa el progreso.** Si falla la unidad `i` de `n`, el error dice `Unidad i de n: …` y, si ya se grabó alguna, añade que reintentar no duplica lo grabado (cada unidad es idempotente por `client_uuid`).
- **El anticipo solo aplica con una línea de servicio.** `chargeTotal` ignora `anticipoAmount` si no hay servicio y `StepPayment` no ofrece imputarlo (`hasService`), igual que la propina en `StepAdjust`.
- **Un ingreso de subcategoría "Otros" no pasa por el carrito.** Elegir un ítem de la pestaña "Otros" en el paso 2 pone el funnel en `incomeMode: 'simple'`: el recorrido se acorta a cuatro pasos (sin Ajustes ni Pago), el monto se carga en un input único y el ticket se guarda como una sola transacción con un solo pago. Es excluyente con el carrito — agregar un servicio o un producto vuelve a `incomeMode: 'cart'` y limpia la selección. Usar `isCartIncome(state)` para distinguir los dos caminos; no comparar `state.type === 'income'` a secas.
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
- `src/pages/inventory/RecountModal.tsx` — recuento físico: subir planilla → vista previa → aplicar
- `src/pages/inventory/countSheet.ts` — genera y parsea la planilla de conteo (XLSX)
- `src/hooks/useInventoryRecount.ts` — historial, preview y apply del recuento
- `src/hooks/usePendingInventoryCount.ts` — contador de transacciones con `inventory_pending`

**Datos:**
- Tablas: `products`, `inventory_lots`, `inventory_movements`, `sale_items`, `inventory_recounts`
- Vista: `products_with_stock` (no tiene `stock` column en `products` — el stock es `SUM(remaining_quantity)`)
- RPC: `consume_inventory_fifo(product_id, quantity, reference_id, reference_type)` — SECURITY DEFINER
- RPC: `preview_inventory_recount(p_lines)` — solo lectura, dry run del recuento
- RPC: `apply_inventory_recount(p_client_uuid, p_cutoff_date, p_lines, p_created_by)` — SECURITY DEFINER, atómico e idempotente
- Trigger: `trg_set_product_sku` en `products` — completa `sku` cuando llega nulo o vacío (`PREFIX-NNNN` con secuencia global `product_sku_seq`)

**Invariantes (NO romper):**
- **FIFO solo en Postgres.** El RPC `consume_inventory_fifo` es la única forma de descontar stock. Nunca restar `remaining_quantity` directamente desde el frontend.
- **Todo cambio a `remaining_quantity` genera un movimiento.** `useUpdateInventoryLot` inserta en `inventory_movements` con el delta. Si se edita el lote por otra vía, igual debe insertarse la fila de movimiento.
- **`unit_cost` es read-only si el lote tiene `sale_items`.** `LotDrawer` verifica esto antes de permitir edición. No omitir esta validación en cambios al drawer.
- **`products_with_stock` debe recrearse con DROP + CREATE** al agregar columnas — `CREATE OR REPLACE` no reordena columnas y puede romper queries por posición. Al recrearla hay que volver a poner `security_invoker = true` (`089`).
- **`products_with_stock` cae al último lote cuando no hay stock.** `min_cost`/`max_cost` son el rango de los lotes con existencias; si no queda ninguno, ambos valen el `unit_cost` del último lote recibido (`091`). Solo son nulos si el producto nunca tuvo un lote. Toda fórmula de costo por gramo pasa por `getCostPerGram` (`src/lib/recipeCost.ts`); no reimplementarla.
- **Registrar un servicio NO descuenta inventario.** `service_recipes` solo sirve para calcular el costo teórico. El descuento físico de productos usados en un servicio se registra manualmente como transacción "Consumos y cortesías" (`deducts_inventory = true`), que llama `consume_inventory_fifo` en `TransactionsPage`.
- **`consume_inventory_fifo` se llama desde `TransactionsPage.tsx` línea ~228** cuando la categoría de gasto tiene `deducts_inventory = true`.
- **El recuento físico nunca borra ni recostea lotes viejos.** `apply_inventory_recount` solo lleva `remaining_quantity` a 0 con un movimiento `adjustment` por lote y abre un lote nuevo fechado en el corte. No toca `unit_cost` de los lotes existentes, porque el costo histórico de cada venta vive en `sale_items.unit_cost` y `sale_items.lot_id` es `NOT NULL` sin `ON DELETE`: borrar lotes exigiría borrar el historial de ventas y destruiría la utilidad de los meses cerrados.
- **El recuento no crea `transactions`.** La merma impacta solo inventario (Valoración y Balance), nunca la utilidad del mes. Se consulta en el historial de recuentos de la pestaña Valoración. Si se quiere llevar a resultado, se registra a mano como gasto en `Consumos y cortesías`.
- **El costo de material histórico se congeló hasta abril 2026.** `066_backfill_recipe_cost_snapshots.sql` escribió las filas faltantes de `transaction_recipe_costs` para los servicios de marzo/abril 2026, que no las tenían, usando los costos vigentes antes del recuento. Sin eso, cambiar costos reescribía la pestaña Costos de esos meses (el fallback de `serviceDeductionsByMonth` lee `min_cost`/`max_cost` en vivo, sin filtro de fecha). Cualquier backfill futuro de este tipo debe correr **antes** de tocar costos, nunca después. `092_backfill_zero_recipe_cost_snapshots.sql` es la única excepción: reescribe solo las fotos que quedaron en 0 por falta de stock (bug de la vista, no costo real) con el costo del último lote a la fecha de cada transacción.
- **En la planilla de conteo, celda vacía ≠ 0.** Vacío significa "no contado" y el producto queda intacto; `0` lleva el stock a cero. `parseCountSheet` usa `parseNumberOrNull` para distinguirlos — no usar un parser que devuelva 0 para vacío.
- **Toda query que alimente un informe tiene que paginar con `fetchAllRows`.** Supabase corta en 1000 filas por request, en silencio: no hay error, simplemente faltan filas. En `transaction_recipe_costs` eso hacía que transacciones con foto de costo guardada parecieran no tenerla, cayeran al costo en vivo y un recuento de inventario moviera la utilidad de meses cerrados. Siempre con un `ORDER BY` de clave única para que la paginación sea determinística. Ojo: un backfill que inserte filas puede cruzar el umbral y destapar el bug de golpe.
- **El SKU se genera en la DB, no en el navegador.** El trigger garantiza unicidad entre inserts concurrentes y entre el importador y los formularios. No reintroducir generación client-side.

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
- Migración relevante: `022_partial_receive_po.sql`, `029_fix_receive_po_lot_id_ambiguous.sql`, `076_link_mirror_transactions.sql`, `077_backfill_po_payment_links.sql`, `078_link_po_payment_outside_flow.sql`

**Invariantes (NO romper):**
- **Recepción parcial via RPC.** No insertar lotes manualmente. El RPC `receive_purchase_order` distribuye el flete proporcionalmente por valor de ítem y crea los lotes.
- **Flete editable solo en estado draft.** Una vez recibida la PO, el flete es inmutable.
- **Sugerencia de reposición tiene fallback.** Si no hay historial del mismo mes en años anteriores, cae a promedio de los últimos 3 meses (run-rate). No asumir que siempre retorna un número — puede ser null.
- **Todo pago de una OC va en la categoría `Compra de inventario (OC)`.** Es la única que `useReports.ts:351` excluye de `direct_costs`, porque ese costo entra al resultado como COGS al vender. Un pago de OC en cualquier otra categoría se cuenta dos veces. La mig. `083` reclasifica por `payment_transaction_id`, no por descripción — un pago cargado a mano con texto libre (`'Pago a proveedor (…)'`) no lo encuentra ninguna búsqueda por plantilla.
- **El pago inmediato guarda el id de su transacción.** `purchase_orders.payment_transaction_id` apunta al egreso que generó el pago al recibir la OC. Es el par del `supplier_debts.purchase_order_id` que cubre el camino diferido: las dos formas de pagar una OC quedan rastreables. Las OCs históricas pueden tenerlo en null. Al cerrar el backfill quedaron dos así, y en ninguna de las dos existe una transacción por el monto recibido: entró mercadería al stock sin que se registrara la salida de plata. Eso no es un vínculo perdido sino un gasto sin cargar.
- **Una OC se recibe una sola vez.** `receive_purchase_order` rechaza cualquier OC que no esté en `draft` y la deja en `received`. La recepción parcial es elegir un subconjunto de ítems dentro de ese único evento.

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
- Tablas: `hairdressers`, `transaction_hairdressers`, `receivables` (con `hairdresser_id + product_id`), `receivable_collections`, `commission_settlement_periods`, `commission_payouts`, `transactions`
- RPC: `create_staff_receivable(p_client_uuid, hairdresser_id, product_id, quantity, value_amount, ...)` — idempotente por `client_uuid`. Registra retiro de producto, inserta `inventory_movements`, NO crea `transactions`.
- RPC: `create_staff_advance(p_client_uuid, hairdresser_id, amount, currency, payment_method, ...)` — idempotente por `client_uuid`. Crea una `transactions` (Movimiento/transfer, salida de caja) + un `receivable` contra el empleado. No toca inventario.
- RPC: `record_partial_commission_payout(client_uuid, hairdresser_id, period_start, period_end, installment_amount, ...)` — calcula la comisión autoritativa desde transacciones ARS, registra una cuota, sus compensaciones y el egreso neto en una sola transacción atómica e idempotente.

**Invariantes (NO romper):**
- **Los retiros de staff NO son gastos en `transactions`.** Un retiro de producto se modela como `receivables` con `hairdresser_id`. Solo la liquidación neta final crea una fila en `transactions` expense.
- **Los adelantos de sueldo son Movimientos (transfer), no gastos.** Salen de caja pero no impactan el P&L. Se modelan como `receivables` con `hairdresser_id` y `source_transaction_id`. Se compensan al liquidar.
- **`create_staff_receivable` descuenta inventario** via `inventory_movements` con `reference_type = 'receivable'`. No crea `transactions`.
- **Ambos RPCs son idempotentes** — el short-circuit por `receivables.client_uuid` evita doble-consumo de FIFO o doble-transacción en reintentos offline.
- **La liquidación compensa CUALQUIER receivable seleccionado** del hairdresser con saldo positivo, sin distinguir si es retiro de producto o adelanto de dinero. Cada retiro seleccionado se aplica completo; si supera la cuota hay que desmarcarlo o aumentar el importe.
- **La comisión devengada es siempre en bruto.** El cálculo de descuento por retiros/adelantos ocurre al liquidar.
- **Cada fila de `commission_payouts` es una cuota bruta liquidada.** Para una profesional y período exactos: `saldo = bruta devengada − SUM(gross_amount)` y `gross_amount = receivables_offset + net_amount`.
- **El RPC crea el egreso por el neto.** Si una cuota queda totalmente compensada no crea `transactions`; siempre conserva fecha, método e historial en `commission_payouts`. No crear transacciones por el bruto.
- **La base calcula el bruto; no confía en el navegador.** Suma `amount + seña_amount` y aplica `transaction_hairdressers.commission_rate` sobre las transacciones ARS no anuladas del rango.
- **Los períodos nuevos de una profesional no se pueden superponer.** `commission_settlement_periods` usa una restricción `EXCLUDE` parcial sobre los encabezados nuevos. Varias cuotas reutilizan exactamente el mismo período. Los rangos históricos se importan con `legacy = true`, incluso si ya se superponían; no se fusionan ni reinterpretan. Si un rango solicitado cruza un rango histórico diferente, el RPC lo bloquea hasta resolver manualmente esa ambigüedad.
- **La concurrencia y los reintentos se resuelven en Postgres.** `client_uuid` evita duplicados y un lock por profesional serializa tanto cuotas concurrentes como la creación de períodos.
- **Un pago neto exige categoría de gasto.** Las cuotas cubiertas solo con retiros/adelantos pueden omitirla porque no crean una transacción.
- **Las tablas de liquidación son de escritura exclusiva del RPC.** `authenticated` conserva `SELECT`, pero no `INSERT`, `UPDATE` ni `DELETE`; RLS sola no debe ser la barrera contra saltarse los controles atómicos.
- **Las comisiones en moneda extranjera no se liquidan hasta tener cotización persistida.** El reporte usa una cotización externa en vivo, que no es evidencia contable autoritativa para un RPC.
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
- **Los reportes con conversión exigen cotización.** `useProfitReport` y `useCommissionsReport` tienen `enabled: usdRate != null` y lanzan si falta: nunca suman USD 1:1. Las transacciones en EUR quedan fuera de esos dos reportes y la UI lo indica junto a la cotización.
- **Filtros sobre embeds con `!inner`.** Un `.gte('transactions.date', …)` sobre `transactions(...)` sin `!inner` no reduce filas, solo anula el embed; combinado con el tope de 1000 filas devuelve un subconjunto arbitrario. Toda consulta que filtre por columnas del embed usa `transactions!inner(...)` y `fetchAllRows`.
- **Señas excluidas de revenue/profit/costos.** Transacciones con `is_seña = true` son anticipos puros. Solo impactan el resultado cuando la transacción final suma `seña_amount`. Toda query de reporte debe filtrar `is_seña = false` o manejar explícitamente este campo.
- **Costos fijos usan historial append-only.** Cada mes se usa la tasa de `fixed_cost_rates` con el `effective_from` más reciente ≤ a ese mes. No leer `fixed_costs.monthly_amount` directamente para períodos históricos.
- **Costo de materiales (`tab Costos`)** viene de `transaction_recipe_costs` (snapshot al momento de la transacción), no de `service_recipes` actuales. Cambiar las recetas no recalcula historial.
- **Conversión multimoneda**: USD→ARS vía dólar blue. EUR→ARS no está implementada aún. No asumir que todas las transacciones son ARS.
- **Transacciones anuladas excluidas.** Todas las queries de reportes filtran `.is('voided_at', null)`.

---

## Recetas (`/recetas`)

**Qué hace:** Página admin con dos tabs: **Recetas** (una tarjeta por familia de servicio con las tallas corto/mediano/largo en columnas, gramos y costo por insumo, total de materiales y % sobre precio; cada tarjeta tiene modo edición para gramos por talla, alta/baja de insumos y horas, con guardado por talla) e **Insumos** (productos usados en alguna receta: envase editable en línea, último costo, costo por gramo, stock y servicios que lo usan, expandible; cada servicio abre su familia en edición).

**Archivos:**
- `src/pages/recipes/RecipesPage.tsx`
- `src/lib/serviceFamilies.ts` — `splitServiceName` / `groupServiceFamilies` (con tests)
- `src/lib/recipeCost.ts` — `getCostPerGram` / `getAvgUnitCost` (con tests)
- `src/hooks/useServiceRecipes.ts` — `useAllServiceRecipes` (clave `['service-recipes-all']`, paginado con `fetchAllRows`)

**Datos:** `catalog_items`, `service_recipes`, vista `products_with_stock`. La edición del envase usa `useUpdateProduct` (mismo campo `unit_size` que Inventario).

**Invariantes (NO romper):**
- **La familia se deduce del nombre.** Un servicio pertenece a la familia `X` si se llama `X corto`, `X mediano` o `X largo` (sufijo final, sin distinguir mayúsculas); sin sufijo es talla única. `anticipo` y `Seña` quedan fuera. No hay columna de familia en la DB: si se renombra un servicio rompiendo el patrón, deja de agruparse.
- **Guardar una familia escribe solo las tallas que cambiaron.** Cada talla es un `catalog_item` distinto: al guardar se compara la receta de cada columna con la actual y solo las distintas pasan por `useUpsertServiceRecipes` (borrado + inserción de esa talla); las horas van por `useUpdateCatalogItemHours`. Una sola familia en edición a la vez. El editor de Ajustes › Costos sigue existiendo y usa los mismos hooks.
- **Un solo cálculo de costo por gramo.** `getCostPerGram` es el que usan Ajustes, Reportes y esta página. La foto en `useCreateTransaction` y el RPC `create_funnel_unit` replican la misma fórmula en su capa.

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
- **Toda transacción espejo guarda el id de la fila que la originó.** El vínculo lo lleva siempre la fila de dominio, nunca `transactions`: `receivable_collections.transaction_id`, `supplier_debt_payments.transaction_id`, `commission_payouts.paid_via_transaction_id`, `receivables.source_transaction_id`, `reserve_movements.transaction_id`, `purchase_orders.payment_transaction_id`. La columna es nullable pero no opcional: un null solo es admisible cuando no hubo transacción — el caso legítimo es una liquidación de comisiones totalmente compensada por retiros, que no genera egreso de caja. Sin este vínculo, `void_transaction` no puede revertir el efecto de una anulación y el monto queda contado dos veces.
- **Los retiros de staff (`hairdresser_id != null`) en `receivables`** aparecen en "Por cobrar" pero se liquidan a través del flujo de comisiones, no del flujo de cobro general. Distinguir en la UI por la presencia de `hairdresser_id`.

---

## Fondos / Reservas

**Qué hace:** Gestión de cuentas de reserva (ej. fondo de reinversión) y sus movimientos.

**Archivos:**
- `src/pages/fondos/FondosPage.tsx` (409 líneas)
- `src/hooks/useReserveAccounts.ts`
- `src/hooks/useReserveMovements.ts`

**Datos:**
- Tablas: `reserve_accounts`, `reserve_movements`, `transactions`
- RPC: `update_reserve_movement(p_id, p_amount, p_date)` — edita movimiento y espejo de forma atómica; devuelve `{ mirror_updated }`
- Migración relevante: `034_reserve_accounts.sql`, `076_link_mirror_transactions.sql`, `079_fix_reinversion_reserve_movement.sql`, `080_fix_reserve_movement_payment_sync.sql`, `081_reserve_movement_payment_method.sql`

**Invariantes:**
- La cuenta de reinversión fue restaurada en migración `048_restore_reinversion_reserve.sql` tras un drop accidental. Si se agrega lógica de seed, verificar que no duplique cuentas existentes.
- **Cada movimiento guarda el id de su transacción espejo** en `reserve_movements.transaction_id`. Las filas anteriores a la migración `076` pueden tenerlo en null cuando el cruce por descripción, fecha y monto resultó ambiguo o no había espejo.
- **`amount` lleva signo**: positivo entra a la reserva, negativo vuelve a la caja principal. La transacción espejo guarda el valor absoluto. La dirección no se edita.
- **Una reserva es una cuenta real, no una marca contable.** Las cuentas de reserva son cuentas separadas dentro del banco o billetera (hoy, Mercado Pago), así que transferir a una reserva saca plata de la cuenta de origen de verdad. Cada movimiento guarda su `payment_method` y su espejo escribe una fila en `transaction_payments`: `salida` al transferir, `entrada` al retornar. Por eso el saldo por método que se ve en Transacciones muestra solo la cuenta principal.
- **FondosPage NO resta el total reservado.** `baseBalance` ya excluye lo reservado, porque los pagos lo sacaron del saldo del método. La tarjeta "Cuenta principal" es `baseBalance` a secas y la de "Total" es `baseBalance + totalReserved`. Restar el total reservado del saldo principal lo descontaría dos veces (era el modelo anterior, previo a la mig. `081`).
- **Toda edición pasa por `update_reserve_movement`.** Actualiza movimiento, espejo y el pago del espejo en una sola transacción, y no toca un espejo anulado. No editar `reserve_movements` con un update directo.
- **El espejo puede tener `transaction_payments`.** El hook no los crea, pero hay espejos históricos cargados a mano desde el formulario de transacciones que sí los tienen. Al editar el monto hay que sincronizar el pago o los saldos por método quedan mal. Si el espejo tuviera más de un pago, el RPC aborta (mig. `080`).

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
- `src/lib/gemini.ts` — cliente que invoca la Edge Function `ask-gemini`
- `supabase/functions/ask-gemini/index.ts` — Edge Function autenticada que reenvía la consulta a Gemini
- `src/lib/buildSystemPrompt.ts` — construye el system prompt con el snapshot

**Datos:** Todas las tablas principales (snapshot de solo lectura).

**Invariantes:**
- La API key de Gemini vive únicamente como secret de la Edge Function (`supabase secrets set GEMINI_API_KEY=...`); el cliente nunca la conoce. No agregar API keys al bundle (`VITE_*`).
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
