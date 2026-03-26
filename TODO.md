# TODO

## Critical — Accounting Integrity

- [ ] **Soft-delete transactions instead of hard-delete** — Deleting a transaction permanently erases it with no audit trail. Replace the delete action with a void/cancel mechanism: add a `deleted_at` or `voided_at` column to transactions, keep the record in the database, and exclude voided transactions from all reports and balances. The transaction should remain visible in the history marked as cancelled.

- [ ] **Inventory adjustments must generate a movement record** — Editing `remaining_quantity` directly on a lot (via the LotDrawer) bypasses the `inventory_movements` audit log entirely. Any change to stock quantity should insert an `adjustment` movement with the delta and an optional reason, so the movement log always reconciles with the lot quantities.

- [ ] **Lock `unit_cost` on lots that have associated sales** — If a lot has already been used in sales (i.e., it has `sale_items` rows referencing it), its `unit_cost` should become read-only. Changing it after the fact creates a discrepancy between the cost shown on the lot and the historical cost recorded in the sold items, breaking FIFO traceability.

## Important — Missing Best Practices

- [ ] **Expense categories (required for meaningful reporting)** — Currently expenses have no category, so they all fall into "Sin categoría" in the Financial report. The balance per category row is meaningless until expenses are categorized. Category should be required on all expense transactions.

  Standard expense categories for a hair salon:
  - **Alquiler** — monthly rent
  - **Sueldos y cargas sociales** — payroll and social contributions (if employees are not on commission only)
  - **Productos / Insumos** — professional products and materials used in services
  - **Servicios públicos** — electricity, water, internet, phone
  - **Mantenimiento y reparaciones** — equipment repair, salon maintenance
  - **Marketing y publicidad** — social media, promotions, printed materials
  - **Impuestos y tasas** — monotributo, municipal fees, etc.
  - **Equipamiento** — tools and furniture (one-time or amortizable)
  - **Otros gastos** — catch-all for anything that doesn't fit above

  Implementation: make `category_id` required when `type = 'expense'` in the transaction form. Seed the above categories in a migration or via the Settings UI.

- [ ] **Period locking** — Add the ability to close a fiscal month or year, preventing any creation, edit, or deletion of transactions with a date in that period. Once a period is closed, it should be read-only for all users including admins. This is standard practice: once an accountant reviews a month, those numbers should not change.

- [ ] **Double-entry bookkeeping (long term)** — The system currently uses single-entry accounting (one income or expense per transaction). True double-entry assigns a debit and a credit to every movement, ensuring the ledger always balances. This is required to generate a proper Balance Sheet (assets vs. liabilities vs. equity), which is what an accountant or bank will ask for. This is a significant architectural change and should be evaluated before any multi-tenant or SaaS expansion.

## Feature

- [x] **Bi-weekly commission splits** — Commissions should be calculated and divided on a bi-weekly (quincenal) basis, not monthly. The commission report or payout logic must split earnings into two periods per month (e.g., 1–15 and 16–end of month) so that stylists can be paid twice a month accurately.

- [x] **Add service cost section** — Implemented in Phase 22 (recipes + fixed costs) and Phase 23 (real avg revenue from linked transactions, USD conversion via dólar blue).

- [ ] **Add query params for tabs** - Every tab inside a section must have a unique query param to navigate

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
