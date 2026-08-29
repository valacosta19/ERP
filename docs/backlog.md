# Backlog — ERP-BO

Features e iniciativas pendientes, ordenadas por prioridad.

---

## Crítico — Seguridad

- [~] **Auditar permisos de EXECUTE en las funciones `SECURITY DEFINER`** — `089` revoca `PUBLIC`/`anon` en las siete que faltaban (`consume_inventory_fifo`, `create_sale`, `receive_purchase_order`, `create_staff_receivable`, `create_staff_advance`, `suggest_reorder_quantity`, `create_funnel_unit`); `verificar-migraciones.sql` lista las que sigan abiertas. — Postgres otorga `EXECUTE` a `PUBLIC` por defecto y Supabase expone todo `public` en `/rest/v1/rpc/<nombre>` al rol `anon`. La anon key viaja pública en el bundle del frontend. Como `SECURITY DEFINER` saltea RLS, cualquier función sin chequeo propio de `auth.uid()` queda accesible sin autenticar. **Verificado empíricamente**: una llamada sin autenticar a `preview_inventory_recount` devolvió datos reales de inventario (arreglado en `067`).

  Funciones sin chequeo de `auth.uid()`, por riesgo:
  - `receive_purchase_order` (últ. `047`) — **muta**: crea lotes, movimientos y marca la OC como recibida.
  - `consume_inventory_fifo` (`002`) — **muta**: descuenta stock y crea `sale_items`.
  - `create_sale` (`003`) — **muta**: crea transacciones y ventas.
  - `compute_period_snapshots` (`063`) — revocado a `anon` en `063`/`084`.
  - `suggest_reorder_quantity` (últ. `058`) — solo lectura, pero filtra historial de ventas y movimientos.

  Al arreglarlo, ojo con **no** exigir rol admin en las que el staff no-admin usa legítimamente (`create_funnel_unit`, `consume_inventory_fifo` vía carga rápida): ahí corresponde exigir usuario autenticado, no admin. Patrón a copiar: `create_staff_receivable` en `061` (chequea `auth.uid() IS NULL`) y `apply_inventory_recount` en `065` (chequea rol admin). Cerrar además con `REVOKE EXECUTE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated`.

---

## Crítico — Integridad contable

- [ ] **Subcategoría requerida en gastos** — `subcategory_id` aún es nullable. Hacer el campo obligatorio en el formulario de transacciones cuando `transaction_type = 'expense'`. El picker debe filtrar subcategorías por tipo de transacción.

- [ ] **Bug: reservas sin categoría al editarlas** — Al editar una reserva (Fondos), el campo "Monto" aparece vacío aunque se ve en la tabla. Investigar state management del modal de edición.

- [x] **Anular una transacción no devuelve el stock** — resuelto en `088_void_restores_inventory.sql`: `void_transaction` repone los lotes de `sale_items` con movimientos `adjustment`.

- [ ] **No existe valuación de inventario a una fecha** — `useInventoryValuation` y `useBalanceSheet` (`src/hooks/useReports.ts`) leen `inventory_lots WHERE remaining_quantity > 0` sin filtro de fecha; `asOfDate` filtra solo pagos. El `inventoryValue` y el patrimonio de meses pasados siempre reflejan el stock de hoy, así que cualquier ajuste reescribe el histórico. La migración `063` resolvió esto para caja con `period_balance_snapshots` y el mismo patrón se puede extender a inventario.

- [ ] **`locked_periods` no protege inventario** — `089` cierra la parte de `transactions` (trigger `SECURITY DEFINER`, `OLD.date` en UPDATE y guarda de DELETE); sigue pendiente `inventory_lots`/`inventory_movements`/`sale_items`. — `check_transaction_period_not_locked()` (`033`) está enganchado solo a `transactions`. No hay trigger en `inventory_lots`, `inventory_movements` ni `sale_items`, y tampoco guarda de DELETE. Se pueden crear, recostear o borrar lotes dentro de un mes cerrado sin resistencia. `docs/ARCHITECTURE.md` afirma una garantía más amplia de la que el schema cumple. `apply_inventory_recount` valida la fecha de corte por su cuenta como paliativo.

- [ ] **`products_with_stock` pierde el costo de lotes agotados** — La migración `017` había agregado un fallback `COALESCE(..., MIN(il.unit_cost))` para que un producto sin stock conservara su rango de costo; `019` recreó la vista sin él y `026` lo arrastró. Hoy `min_cost`/`max_cost` quedan NULL cuando todos los lotes están agotados, y eso se coalescea a 0 en los snapshots de `transaction_recipe_costs`.

- [ ] **`--color-card` no existe** — `ReportsPage.tsx` lo usa 21 veces pero no está definido en `src/index.css` (el token real es `--color-surface`), así que esas tarjetas quedan sin fondo. Reemplazar en bloque.

---

## Features

- [ ] **Exportar transacciones** — Botón para descargar la lista filtrada actual como CSV o Excel.

- [ ] **Consumo automático de inventario por servicio** — Al registrar un servicio con receta, descontar automáticamente los productos de la receta via `consume_inventory_fifo`. Actualmente es manual (registro de "Consumos y cortesías"). Implica decidir el flujo: ¿al registrar la transacción?, ¿con ajuste manual posterior para las diferencias reales? Discutir antes de implementar — ver nota al final.

---

## Mejoras de calidad

- [ ] **Viewer de auditoría** — Vista read-only en Settings (admin) para navegar `user_action_logs`: acción, entidad, usuario, timestamp. Sin edición ni borrado.

---

## Seguridad / Producción

- [ ] **Proteger API key de Gemini** — Mover la llamada a Gemini a una Supabase Edge Function que valide el JWT antes de llamar a la API. Actualmente `VITE_GEMINI_API_KEY` está expuesta en el bundle del cliente.

- [ ] **CI: gate de build** — GitHub Actions que ejecute `tsc -b && vite build + lint` en cada PR. Bloquear merge si falla.

- [ ] **Observabilidad de errores en producción** — Integrar Sentry (o similar) para capturar errores async que no atrapa el `ErrorBoundary` actual.

- [ ] **Auditar cobertura RLS** — Verificar que todas las tablas con datos sensibles tengan Row Level Security habilitado. Solo 4 de 61 migraciones tocan policies actualmente.

---

## Mejoras al AI Widget

- [ ] **Renderizar markdown en el chat** — El modelo genera listas y negritas; agregar un renderer liviano (`react-markdown` o `marked`).
- [ ] **Streaming de respuestas** — Gemini soporta `streamGenerateContent`; mostrarlo mientras genera mejora la percepción de velocidad.
- [ ] **Indicador de tokens / costo estimado** — Mostrar cuántos tokens usó la última llamada para monitorear el consumo.

---

## Deuda técnica

- [ ] **Partir archivos Dios** — Tres páginas superan las 1000 líneas y dificultan el mantenimiento con IA: `SettingsPage.tsx` (1678 líneas), `PurchaseOrdersPage.tsx` (1173 líneas), `ReportsPage.tsx` (1149 líneas). Partir en sub-componentes y hooks por responsabilidad.

- [ ] **Tests sobre lógica crítica** — Sin tests automatizados, los cambios en FIFO, comisiones, exclusión de señas en reportes y conversión multimoneda son frágiles. Introducir Vitest sobre las funciones puras de lógica de negocio.

- [ ] **Doble entrada contable (largo plazo)** — El sistema usa contabilidad de partida simple. Para generar un Balance Sheet real (activo/pasivo/patrimonio) se necesita partida doble. Cambio arquitectónico significativo — evaluar antes de cualquier expansión SaaS. Ver `docs/roadmap/double-entry-migration.md`.

---

## Por consultar

- ¿Cómo descontar del inventario los productos que se compran solo para servicios? ¿Automáticamente al registrar el servicio (usando `service_recipes` × cantidad de servicios), o manualmente con ajuste posterior? ¿Cómo manejar las diferencias cuando el uso real no es exacto por receta?
