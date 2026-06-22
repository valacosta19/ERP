# Backlog — ERP-BO

Features e iniciativas pendientes, ordenadas por prioridad.

---

## Crítico — Integridad contable

- [ ] **Subcategoría requerida en gastos** — `subcategory_id` aún es nullable. Hacer el campo obligatorio en el formulario de transacciones cuando `transaction_type = 'expense'`. El picker debe filtrar subcategorías por tipo de transacción.

- [ ] **Bug: reservas sin categoría al editarlas** — Al editar una reserva (Fondos), el campo "Monto" aparece vacío aunque se ve en la tabla. Investigar state management del modal de edición.

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
