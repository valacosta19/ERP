# ERP Peluquería — Plan de Desarrollo

## Problema que resuelve
Excel siempre costea las ventas al último precio de compra. Este ERP implementa **FIFO por lotes** para que cada venta refleje el costo real del lote consumido.

---

## Fases

| Fase | Contenido | Estado |
|------|-----------|--------|
| 1 | Scaffolding, Supabase, Auth, AppShell, rutas vacías | ✅ |
| 2 | Módulo Transacciones + Categorías + Dashboard KPIs | ✅ |
| 3 | Proveedores + Pedidos de Compra + stock-in | ✅ |
| 4 | Inventario + venta con RPC FIFO + `sale_items` | ✅ |
| 5 | Reportes: utilidad bruta por producto + valorización de inventario | ✅ |
| 6 | Wizard de importación Excel (upload → mapeo → preview → import) | ✅ |
| 7 | Polish: transacciones atómicas, responsive, error boundaries | ✅ |
| 8 | Transactions v2: métodos de pago, peluqueras, señas, reporte de comisiones | ✅ |
| 9 | Edición inline tipo Excel: todas las vistas principales con tabla editable celda a celda | 🔄 actual |
| 10 | TBD | — |

---

## Scope por fase pendiente

### Fase 5 — Reportes
- Tabla: utilidad bruta por producto (revenue, COGS, margen) desde `sale_items`
- Tabla: valorización de inventario (`remaining_quantity × unit_cost` por producto)
- Hook(s) de reporting; sin nuevas migraciones

### Fase 6 — Importación Excel
- Wizard 5 pasos: upload → selección de pestañas → mapeo de columnas → preview → import
- Batch inserts: categories → suppliers → products → transactions → opening balance lots → POs históricos
- Deduplicación por `sku` (products) y `name.toLowerCase()` (categories, suppliers)

### Fase 7 — Polish
- Envolver venta multi-producto y receive-PO en una función DB (actualmente no atómica)
- Layout responsive
- Error boundaries
- Vista `products_with_stock` para consolidar las dos queries de `useProducts`

### Fase 8 — Transactions v2
- Migración 004: tablas `hairdressers`, `transaction_payments`, `transaction_hairdressers`; columnas `is_seña` + `seña_amount` en `transactions`
- Formulario de transacción: filas dinámicas de método de pago, multi-select de peluqueras, toggle de seña
- Lista de transacciones: badges de método de pago, nombres de peluqueras
- Tab "Comisiones" en ReportsPage (40% si 1 peluquera, 20% c/u si 2+)
- Sección "Peluqueras" en SettingsPage con CRUD

### Fase 9 — Edición inline tipo Excel
- Reemplazar formularios modales por tablas con edición celda a celda en todas las vistas principales
- Vistas a migrar: Transacciones, Proveedores, Pedidos de Compra, Inventario/Productos, Peluqueras
- Comportamiento esperado: click en celda → editable in-place → Enter/Tab confirma → Escape cancela
- Nueva fila al final de la tabla (como agregar fila en Excel)
- Validación inline con highlight de error en la celda
- Sin modales para crear/editar registros simples; mantener modal solo para flujos complejos (recibir PO, nueva venta con carrito)
