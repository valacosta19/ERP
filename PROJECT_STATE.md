# PROJECT_STATE.md

Quick-reference. Keep accurate — update when a phase closes or a major fix lands.
Mapa de módulos, archivos e invariantes: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

---

## Objetivo
ERP para peluquería. Reemplaza Excel. Núcleo: costeo **FIFO** estricto — cada venta refleja el costo real del lote consumido.

---

## Fase actual
**Phase 30** — 🚧 Recetas, insumos y rentabilidad: página `/recetas` con edición en línea ✅ · tab Rentabilidad ✅ · costo de material con último lote (mig. `091`) y corrección de fotos en 0 (mig. `092`) aplicadas ✅ — pendiente validar en producción. Fase 29 sigue pendiente de validar.

> Actualizar esta sección al arrancar cada fase nueva.

---

## Fases completadas

| Fase | Resumen |
|------|---------|
| 1 | Scaffold, Supabase setup, Auth, AppShell, rutas vacías |
| 2 | Transacciones, Categorías, Dashboard KPIs |
| 3 | Proveedores, Pedidos de Compra, stock-in al recibir |
| 4 | Inventario, LotDrawer, SaleForm (carrito), RPC `consume_inventory_fifo` |
| 5 | ReportsPage: ganancia bruta por producto + valoración de inventario |
| 6 | Import wizard (5 pasos): upload → sheets → mapeo → preview → batch import |
| 7 | RPCs atómicos (sale + receive-PO), AppShell responsive, ErrorBoundary |
| 8 | Métodos de pago, peluqueras, señas, reporte de comisiones (Transactions v2) |
| 9 | Edición inline, import extendido, rename profesional, business_name dinámico |
| 10 | Catálogo, DescriptionCombobox, balance por método de pago, métodos de pago configurables, seña como concepto, LotDrawer editable, SaleForm eliminado |
| 11 | Auto-detect seña desde descripción, fix doble conteo Total cobrado, modal overflow |
| 12 | Vista `products_with_stock`, `useProducts` query única, `database.ts` Views tipado |
| 13 | Fix import parseNum, multicurrency (ARS/USD/EUR), fix edición payments, cards balance agrupadas |
| 14 | Comisiones con % libre por profesional, rango precio compra inventario, modal edición productos, fix auto-mapeo import |
| 15 | Panel "Productos para reponer" en POs: chips skip_restock, pre-carga modal, selector por urgencia |
| 16 | RPC `suggest_reorder_quantity`, hook `useReorderSuggestion`, componente `SuggestionHint`. Fix post-26: crash columna eliminada + Tier 2 run-rate (migración 058) |
| 17 | Costo de envío en POs: distribución proporcional al recibir (migración 021), marca en tabla expandida |
| 18 | Recepción parcial de POs: checklist por producto, distribución de flete recalculada (migración 022) |
| 19 | Tab "Utilidad" en Reportes: margen bruto FIFO vs servicios por mes. ReconcileModal para backfill de categorías |
| 20 | Invitación de usuarios por email: Edge Function `invite-user`, sección "Usuarios" en Settings (admin) |
| 21 | Splits quincenales en comisiones: detalle y quincenal agrupados por período, cards con desglose quincenal |
| 22 | Costos de servicios: `fixed_costs` + `service_recipes` + `unit_size`, tab "Costos" en Settings y Reportes |
| 23 | AI Widget (Gemini 2.5 Flash): chat flotante con snapshot del negocio cacheado 5 min. 3 precios por item de catálogo. Revenue real en tab Costos vía dólar blue |
| 24 | Fix modelo de margen en Utilidad y Costos: margen bruto por servicio sin prorrateo de fijos, corrección `seña_amount` doble conteo |
| 25 | Cuentas por Pagar (supplier_debts) y Cuentas por Cobrar (receivables): migraciones 040–041, página `/cuentas`, pago inmediato/diferido al recibir PO |
| 26 | Historial de costos fijos append-only: tabla `fixed_cost_rates` con `effective_from`, hooks actualizados en Settings |
| 27 | Soporte offline para Carga Rápida: RPC atómico `create_funnel_unit` (idempotente vía `client_uuid`), cola offline con estados pending/stuck. Tab "Sueldos" en Reportes |
| 29 | Auditoría de producción. Fase C: `AuthProvider` único, toasts globales para errores de mutación, `confirmDialog` en vez de `confirm()`, `refetchOnWindowFocus` off, widget IA gated, cola offline con refs, Carga Rápida con estado de carga, Gemini detrás de la Edge Function `ask-gemini`, rutas `lazy` + `xlsx` dinámico. Fase B (mig. `089`): cierre de período `SECURITY DEFINER` con guarda de DELETE, policies scoped de UPDATE/DELETE, `REVOKE anon` en 7 RPCs, 9 índices, `products_with_stock` con `security_invoker`, drift check con policies/índices. Fase A: saldo de anticipos por subcategoría real, `fetchAllRows` + `!inner` en reportes/snapshot/dashboard, cotización USD obligatoria y EUR excluido en Utilidad/Comisiones, `invalidateAccounting`, fechas locales (`todayLocal`), `formatMoney` único |
| 28 | Adelantos de sueldo + retiros de producto desde Carga Rápida (offline-capable): RPCs idempotentes `create_staff_advance` / `create_staff_receivable` (mig. 061), dispatcher multi-kind en `funnelSubmit`, flush global en AppShell, `StaffWithdrawalModal` unificado con prop `mode`. Picker de producto obligatorio para subcategorías con `deducts_inventory` en Carga Rápida. Agrupación de transacciones para conciliación: `transaction_groups` + `transaction_group_members` (mig. `086`), fila única con el total y detalle expandible en `/transactions`; la Carga Rápida agrupa sola las unidades de un carrito. `amount = 0` admitido solo con seña (mig. `087`) |
| 30 | Página `/recetas` (admin): tarjetas por familia de servicio con tallas en columnas y edición en línea de gramos, insumos y horas; tab Insumos con envase editable, costo por gramo y servicios que usan cada producto; tab Rentabilidad (simulador de margen bruto por método de cobro, comisión y margen objetivo, con costo fijo por hora solo como referencia, precio sugerido aplicable y margen mensual proyectado). Profesionales asignadas por servicio con % propio (`hairdresser_services`, mig. `093`): matriz por familia en Ajustes › Operaciones (reemplaza los presets `commission_rates`), un toque en Carga Rápida carga la asignada con su %, propuesta en Transacciones, equipo simulado en Rentabilidad. `products_with_stock` cae al costo del último lote cuando no hay stock (mig. `091`, restaura el fallback perdido en `026`) y backfill de las fotos de `transaction_recipe_costs` que quedaron en 0 (mig. `092`). Recetas actualizadas desde el Excel de costos (datos, sin migración) |

---

## Open risks / tech debt

- No optimistic updates — UI muestra datos stale hasta que `invalidateQueries` refetchea.
- Migraciones deben aplicarse manualmente en el SQL editor de Supabase (no hay CLI integrado).
- `VITE_GEMINI_API_KEY` expuesta en el bundle del cliente — deuda de seguridad conocida (ver `docs/backlog.md`).
- `SettingsPage.tsx` (1678 líneas), `PurchaseOrdersPage.tsx` (1173), `ReportsPage.tsx` (1149) — archivos Dios que dificultan el mantenimiento con IA.
- Tests automatizados (`npm run test`, Vitest) sobre lógica pura (`buildTicket`, `funnelSubmit`, `chargeTotal`, `createTransactionGroup`, `recipeCost`, `serviceFamilies`, `profitability`, `commissions`), hooks con `supabase` mockeado (`useHairdresserServices`, `useServiceSales`) y componentes con jsdom + Testing Library (`RecipesPage`, `ProfitabilityTab`, `ProfessionalServicesSection`, `StepAmount`). El resto sigue siendo `npm run build` + verificación manual en el browser.
- RLS: solo 4 de 61 migraciones tocan policies — auditoría pendiente.
