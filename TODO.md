# TODO

## Critical — Accounting Integrity

- [x] **Soft-delete transactions instead of hard-delete** — Deleting a transaction permanently erases it with no audit trail. Replace the delete action with a void/cancel mechanism: add a `voided_at` column to transactions, keep the record in the database, and exclude voided transactions from all reports and balances. Voided transactions remain visible in the list with a "Anulada" badge and can be filtered. Any user can void a transaction. Add a `user_action_logs` table to record who voided what and when (see non-essential log viewer item below).

- [x] **Inventory adjustments must generate a movement record** — Editing `remaining_quantity` directly on a lot (via the LotDrawer) bypasses the `inventory_movements` audit log entirely. Any change to stock quantity should insert an `adjustment` movement with the delta and an optional reason, so the movement log always reconciles with the lot quantities.

- [x] **Lock `unit_cost` on lots that have associated sales** — If a lot has already been used in sales (i.e., it has `sale_items` rows referencing it), its `unit_cost` should become read-only. Changing it after the fact creates a discrepancy between the cost shown on the lot and the historical cost recorded in the sold items, breaking FIFO traceability.

## Important — Missing Best Practices

- [ ] **Expense categories (required for meaningful reporting)** — Currently expenses have no category, so they all fall into "Sin categoría" in the Financial report. The balance per category row is meaningless until transactions are categorized.

  **Model: two-level hierarchy (category → subcategory)**

  Top-level categories are fixed and map to transaction types:
  - **Ingresos** — maps to `type = 'income'` transactions
  - **Costos** — maps to `type = 'expense'` transactions that are direct cost of service delivery (COGS)
  - **Gastos** — maps to `type = 'expense'` transactions that are operating expenses
  - **Movimientos** — maps to transfers and reserve movements (non-P&L)

  Subcategories are user-defined and belong to one parent category. They are managed from Settings → Categorías. Examples:
  - Under **Ingresos**: Servicios, Productos (retail)
  - Under **Costos**: Insumos, Productos profesionales
  - Under **Gastos**: Alquiler, Sueldos y cargas sociales, Servicios públicos, Mantenimiento y reparaciones, Marketing y publicidad, Impuestos y tasas, Equipamiento, Otros gastos

  **UX rules:**
  - `subcategory_id` is required when `type = 'expense'` in the transaction form.
  - The subcategory picker is filtered by the parent category inferred from the transaction type.
  - Subcategories can be created, renamed, and soft-deleted from Settings. Deleting a subcategory with linked transactions is not allowed.

  **Schema:**
  - `transaction_categories (id, name, parent_id nullable, created_at)` — flat table with self-referential FK. Top-level rows have `parent_id = null`. Only two levels allowed.
  - `transactions.subcategory_id` — FK to `transaction_categories`, nullable until migration is enforced.

- [x] **Period locking** — Add the ability to close a fiscal month, preventing any creation, edit, or void of transactions dated within that period. Standard pattern in accounting systems (QuickBooks, Xero, etc.):
  - A `locked_periods` table stores `(year, month, locked_at, locked_by)`.
  - Once a month is locked, it is read-only for all users including admins (no exceptions — prevents accidental restatements).
  - The lock UI lives in Settings (admin only). Shows a list of months with lock/unlock toggle.
  - The DB enforces the constraint via a trigger or RPC-level check, not just frontend validation.
  - Unlocking a period is allowed but should log the action in `user_action_logs`.
  - Locking is month-by-month only (no annual lock — annual close is just locking all 12 months).

- [ ] **Double-entry bookkeeping (long term)** — The system currently uses single-entry accounting (one income or expense per transaction). True double-entry assigns a debit and a credit to every movement, ensuring the ledger always balances. This is required to generate a proper Balance Sheet (assets vs. liabilities vs. equity), which is what an accountant or bank will ask for. This is a significant architectural change and should be evaluated before any multi-tenant or SaaS expansion.

- [ ] **Las reservas no están creando categorias o subcategorías** - Ademas cuando intento editarlas me dice que no tiene cargado el Monto, pero si lo veo en la tabla

## Feature

- [x] **Bi-weekly commission splits** — Commissions should be calculated and divided on a bi-weekly (quincenal) basis, not monthly. The commission report or payout logic must split earnings into two periods per month (e.g., 1–15 and 16–end of month) so that stylists can be paid twice a month accurately.

- [x] **Add service cost section** — Implemented in Phase 22 (recipes + fixed costs) and Phase 23 (real avg revenue from linked transactions, USD conversion via dólar blue).

- [x] **Add query params for tabs** — Every page with tabs must reflect the active tab in the URL as a query param (e.g., `?tab=comisiones`). Applies to all pages: Reportes, Ajustes, and any other page with tabs. Enables browser back/forward navigation and direct linking to a specific tab.

- [x] **Add reserves from bank** - Report with general balance (Bank, Cashflow, Utility...).

- [x] **Agregar cuentas por cobrar**

- [x] **Cuentas por pagar a proveedores** — Separar la recepción del pedido (que mueve el stock) del pago al proveedor (que mueve el dinero). Actualmente recibir una OC no genera transacción de caja, por lo que si el pago es a plazo, parcial o con seña, no hay forma de registrarlo sin entrada manual. Requerimientos:
  - Al recibir una OC, preguntar si el pago es inmediato, parcial o diferido.
  - Si es inmediato: crear transacción de salida automáticamente con el monto total, método de pago y subcategoría (Costos → Productos profesionales).
  - Si es diferido: crear un registro de "deuda pendiente" con el proveedor, monto y fecha límite de pago.
  - Permitir registrar pagos parciales contra esa deuda, cada uno generando su transacción de caja.
  - Vista de cuentas por pagar pendientes (proveedor, monto, vencimiento, saldo pendiente).

- [ ] **Agregar Automatic inventory consumption based on services + manual inventory adjustment**

Goal:
Enable the system to track real service costs and inventory usage without requiring manual input for every product consumed, while keeping the experience simple for small businesses.

Concept:

* When a service is performed, the system should automatically account for the consumption of the products required to deliver that service.

* This consumption should reduce the internal stock levels and contribute to the calculation of service costs.

* Product usage should NOT be treated as a financial transaction, since no cash movement occurs.

* The system should maintain a clear separation between:

  * cash flow (real money in/out)
  * operational costs (inventory consumption)

* Since real-life usage is not perfectly predictable, the system must allow users to manually adjust inventory levels when discrepancies occur.

* Adjustments should be simple, fast, and based on the real stock count, not on complex tracking.

User experience:

* The user should not need to think about inventory consumption during daily operations.
* Inventory should update automatically in the background.
* The only manual interaction should be:

  * checking stock levels
  * correcting them when needed via an "Adjust Inventory" action

Expected outcome:

* Accurate estimation of service costs
* Real-time stock tracking without operational friction
* Clean separation between profitability and cash flow
* A system that is simple enough for small businesses but scalable for future growth

- [ ] **Agregar opción para exportar las transacciones**


## Non-essential — Audit & Observability

- [ ] **User action log viewer** — A `user_action_logs` table is created as part of the soft-delete feature (records who voided what and when). Add a read-only admin view in Settings to browse the log: columns action, entity, entity_id, user email, timestamp. No edit or delete on this view.

---

## Costo por método de pago (pendiente)

Tarjeta de crédito/débito tiene un costo de procesamiento (2–5%) que actualmente se cubre cobrando precios diferenciados por método de pago (precio tarjeta > precio efectivo). No está modelado como costo en el reporte porque ya se refleja en el precio de venta promedio. Si en el futuro se quiere mostrar el costo neto por método de pago, se necesita:
- Registrar el porcentaje de comisión por método de pago en `payment_methods`
- Deducirlo del ingreso bruto en el cálculo de `avgRevenue` en `costRows`

## Asistente IA — Mejoras futuras

- [ ] **Renderizar markdown en el chat** — El modelo a veces genera listas y negritas útiles. Agregar un renderer liviano (ej. `marked` o `react-markdown`) para que las respuestas se vean formateadas en el panel del widget.

- [ ] **Streaming de respuestas** — La API de Gemini soporta streaming (`streamGenerateContent`). Mostrar el texto mientras se genera mejora mucho la percepción de velocidad, especialmente en respuestas largas.

- [ ] **Persistencia del historial de chat en Supabase** — Guardar las conversaciones por usuario en una tabla `ai_conversations`. Permite recuperar el historial al reabrir el widget y auditar qué se consultó.

- [ ] **Indicador de tokens / costo estimado** — Mostrar en el header del widget cuántos tokens usó la última llamada, para monitorear el consumo del free tier.

- [ ] **Modo "Análisis automático mensual"** — Botón o trigger automático al inicio de cada mes que genera un resumen proactivo: "Cerraste [mes] con X de ganancia neta, tu mejor servicio fue Y, tu mayor gasto fue Z. Recomendaciones para el mes que viene: ...".

- [ ] **Proteger la API key con una Edge Function** — Actualmente la key de Gemini está expuesta en el cliente (`VITE_GEMINI_API_KEY`). Para producción o multi-usuario, mover la llamada a una Supabase Edge Function que valide el JWT antes de llamar a Gemini.

- [ ] **Soporte de adjuntos / contexto extra** — Permitir al usuario pegar una lista de precios de la competencia o una foto de un presupuesto, y que el asistente lo compare con el catálogo actual.

## Por consultar
- Cómo debería descontar del inventario los productos que solo se compran para los servicios? Automáticamente cuando se consuma la cantidad de mL por la cantidad de servicios realizados o manualmente? Como controlo si no es exacto?