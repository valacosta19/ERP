# ERP Peluquería — Plan de Desarrollo

## Problema que resuelve
El sistema actual en Excel no permite separar el inventario por lotes, por lo que la utilidad por producto siempre se calcula con el último precio de compra y no con el precio real del lote que se está vendiendo. Este ERP implementa **FIFO** para solucionar ese problema.

---

## Tech Stack
- **Frontend**: React + Vite + TailwindCSS + React Router
- **DB/Auth**: Supabase (Postgres + Auth)
- **Data fetching**: TanStack Query
- **Excel parsing**: SheetJS (xlsx)
- **Charts**: Recharts

---

## Base de Datos — Schema

```sql
profiles           (id → auth.users, full_name, role: 'admin'|'employee')
categories         (id, name, type: 'income'|'expense')
transactions       (id, date, type, amount, category_id, description, created_by)
suppliers          (id, name, contact, phone, email, notes)
products           (id, name, sku UNIQUE, unit, sale_price, min_stock, deleted_at)
purchase_orders    (id, supplier_id, order_date, status: 'draft'|'received'|'cancelled', created_by)
purchase_order_items (id, purchase_order_id, product_id, quantity, unit_cost, lot_id)
inventory_lots     (id, product_id, purchase_order_item_id, received_date, initial_quantity, remaining_quantity, unit_cost)
inventory_movements (id, lot_id, product_id, movement_type: 'in'|'out'|'adjustment', quantity, unit_cost, reference_type, reference_id, created_by)
sale_items         (id, transaction_id, product_id, lot_id, quantity, unit_cost, unit_sale_price)
```

**Índice clave**: `inventory_lots(product_id, received_date) WHERE remaining_quantity > 0` — usado por FIFO.

`inventory_movements` es append-only (nunca se edita), sirve como audit log completo.

`sale_items.unit_cost` se snapshottea al momento de venta para que los reportes históricos sean estables.

### RLS
- Todos los autenticados: lectura de categories, products, suppliers, inventory, transactions
- Solo admins: crear/editar purchase_orders, ajustar inventario, gestionar usuarios, importar Excel
- Empleados: pueden insertar sus propias transactions y sale_items

---

## Lógica FIFO

Cuando se venden N unidades de un producto, se ejecuta un **Postgres RPC** con `FOR UPDATE` para prevenir race conditions:

1. Busca lotes del producto con `remaining_quantity > 0` ordenados por `received_date ASC`
2. Consume de cada lote hasta completar la cantidad requerida
3. Decrementa `remaining_quantity` en cada lote tocado
4. Inserta filas en `sale_items` e `inventory_movements` por cada lote consumido
5. Si no hay suficiente stock, lanza excepción

**Cálculo de utilidad**:
```sql
SELECT p.name,
  SUM(si.unit_sale_price * si.quantity) AS revenue,
  SUM(si.unit_cost * si.quantity)       AS cogs,
  SUM((si.unit_sale_price - si.unit_cost) * si.quantity) AS gross_profit
FROM sale_items si JOIN products p ON p.id = si.product_id
GROUP BY p.id, p.name;
```

---

## Estructura Frontend

```
src/
  lib/supabaseClient.ts
  types/index.ts
  hooks/            useProfile, useProducts, useTransactions, useInventory, usePurchaseOrders, useSuppliers
  components/
    layout/         AppShell, Sidebar, TopBar
    ui/             Button, Input, Modal, Table, Badge, Select
  pages/
    auth/           LoginPage
    dashboard/      DashboardPage (KPIs + charts)
    transactions/   TransactionsPage (tabla + formulario modal)
    inventory/      InventoryPage (stock actual + LotDrawer + SaleForm)
    purchase-orders/ POTable + POForm + POReceiveModal
    suppliers/      SuppliersPage
    reports/        ReportsPage (utilidad por producto, valorización inventario)
    import/         ImportPage (wizard Excel)
    settings/       SettingsPage (categorías + usuarios, admin only)
```

**Rutas**: `/login`, `/dashboard`, `/transactions`, `/inventory`, `/purchase-orders`, `/suppliers`, `/reports`, `/import`, `/settings`

Todas protegidas por `AuthGuard`. Rutas admin verifican `profile.role === 'admin'`.

---

## Importación desde Excel

Wizard de 5 pasos:

1. **Upload** — SheetJS lee el `.xlsx` y detecta pestañas
2. **Selección** — mapear cada pestaña a su módulo (Transacciones / Inventario / Pedidos)
3. **Column Mapping** — mapear columnas Excel a campos DB (con auto-detección por nombre)
4. **Preview** — primeras 20 filas, errores resaltados en rojo
5. **Import** — batch inserts en orden:
   ```
   1. Upsert categories
   2. Upsert suppliers
   3. Upsert products
   4. Insert transactions
   5. Insert inventory_lots como "opening balance" (1 lote por producto con stock existente)
   6. Insert purchase_orders + items + lots históricos
   ```

Los productos sin historial reciben un lote con `notes = 'Opening balance — imported from Excel'`.

Deduplicación por `sku` (productos) y `name.toLowerCase()` (categorías, proveedores). Los errores se acumulan sin abortar el proceso.

---

## Fases de Desarrollo

| Fase | Contenido | Entregable |
|------|-----------|------------|
| ✅ 1 | Scaffolding (Vite + React + Tailwind), Supabase, migraciones, AppShell, Auth | Login funcional, navegación entre páginas vacías |
| ✅ 2 | Módulo Transacciones + Categorías + Dashboard KPIs | Reemplaza Tab 1 del Excel |
| ✅ 3 | Proveedores + Pedidos de Compra + stock-in (crear lotes al recibir) | Reemplaza Tab 3, stock se incrementa |
| 4 | Venta de productos + RPC FIFO + `sale_items` | Costeo correcto por lote |
| 5 | Reportes (utilidad por producto, valorización de inventario) | Vista completa de rentabilidad |
| 6 | Wizard de importación Excel | Migración de datos existentes |
| 7 | Polish: responsive, UX empleado, error boundaries | Listo para producción |

---

---

## Protocolo de continuidad

Al terminar cada fase, crear un archivo `PHASE_N_SUMMARY.md` en la raíz con el siguiente contenido:
- Qué se completó
- Decisiones técnicas tomadas
- Qué quedó pendiente
- Qué no debe romperse
- Comandos para validar
- Riesgos o deuda técnica abierta

Al iniciar cada fase, leer el summary de la fase anterior antes de escribir código.

---

## Archivos críticos (al construirse)

| Archivo | Rol |
|---------|-----|
| `supabase/migrations/001_initial_schema.sql` | Todas las tablas, índices y RLS |
| `supabase/functions/consume-inventory-fifo/index.ts` | Edge Function → RPC FIFO |
| `src/lib/supabaseClient.ts` | Cliente Supabase compartido |
| `src/types/index.ts` | Tipos TypeScript del schema |
| `src/pages/import/ImportPage.tsx` | Flujo más complejo del frontend |
