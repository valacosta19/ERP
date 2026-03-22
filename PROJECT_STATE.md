# PROJECT_STATE.md

Quick-reference for any agent or new context. Keep this file accurate — update it when a phase closes.

---

## Objective
ERP for a hair salon. Replaces an Excel-based system. Core problem: Excel always prices inventory at the last purchase cost; this ERP uses **FIFO** so each sale is costed against the actual lot consumed.

---

## Current phase
**Phase 13** — ✅ Completa

### Cambios implementados en Phase 13

#### Fix: parseo de montos en import wizard
- **`parseNum` reescrito** (`StepImport.tsx`): detecta el separador decimal por posición del último separador.
  - `"4,984.00"` → punto es decimal → elimina comas → **4984**
  - `"4.984,00"` → coma es decimal → elimina puntos, coma→punto → **4984**
  - `"1,500"` → solo coma con 3 dígitos exactos después → separador de miles → **1500**
  - Antes: `.replace(/,/g, '.')` convertía `"4,984.00"` en `"4.984.00"` y `parseFloat` devolvía `4.984`.

#### Feature: Multicurrency
- **Migration 013**: `ALTER TABLE transactions ADD COLUMN currency text NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD', 'EUR'))`. Correr manualmente en Supabase.
- **`types/index.ts`**: nuevo tipo `Currency = 'ARS' | 'USD' | 'EUR'`. Campo `currency: Currency` en `Transaction`.
- **`database.ts`**: `currency` en Row/Insert/Update de `transactions`.
- **`useTransactions`**: filtro `currency` en `TransactionFilters`. Campo `currency` en `TransactionPayload` y en el insert de `useCreateTransaction`.
- **`TransactionsPage`**: filtro "Todas las monedas / ARS / USD / EUR" en la barra. Selector de moneda en form inline y modal de edición (defecto ARS). Monto en tabla muestra símbolo correcto (`$`, `U$D`, `€`).
- **Import wizard**: columna `currency` opcional en transacciones; defecto `'ARS'` si vacío o inválido.

#### Fix: edición de transaction_payments no persistía
- **Causa raíz**: `useUpdateTransaction` solo actualizaba la fila de `transactions` pero nunca tocaba `transaction_payments` (los pagos eran inmutables por diseño inicial).
- **Fix**: el hook ahora hace DELETE de los payments existentes + INSERT de los nuevos en cada edición.
- **`handleUpdate`** en `TransactionsPage` ahora pasa `payments` al hook.

#### Fix: método de pago obsoleto en modal
- **Causa raíz**: al abrir el modal de edición, si el `payment_method` guardado en DB ya no existe en la lista activa de métodos de pago, el `<Select>` lo mostraba visualmente como el primer option (ej. "Efectivo") pero el estado React conservaba el valor viejo (ej. "dolares 100"). Al guardar se re-insertaba el método obsoleto.
- **Fix en `openEdit`**: si `payment_method` no existe en `paymentMethodsData` activos, se normaliza al primer método activo disponible antes de setear `editForm`.

#### Fix: invalidación de `payment-method-balances`
- Los hooks `useCreateTransaction`, `useUpdateTransaction`, `useDeleteTransaction` ahora invalidan tanto `['transactions']` como `['payment-method-balances']` en `onSuccess`. Antes solo invalidaban transactions, por lo que las cards de balance no se actualizaban.

#### Feature: cards de balance agrupadas por método + moneda
- **`usePaymentMethodBalances`** retorna ahora `{ method, currencies: { currency, balance }[] }[]` en lugar de `{ method, balance }[]`.
- Agrupa por `payment_method.toLowerCase()` (case-insensitive) para evitar duplicados por capitalización inconsistente en DB.
- Cada card muestra el método una sola vez con una fila por moneda dentro.

---

## Current phase (anterior)
**Phase 12** — ✅ Completa

### Cambios implementados en Phase 12
- **`products_with_stock` view** (migration 012): join `products` + `SUM(inventory_lots.remaining_quantity)`, filtra `deleted_at IS NULL`.
- **`useProducts` simplificado**: una sola query a la view en lugar de dos queries secuenciales. Elimina el `Map` de aggregación manual.
- **`database.ts` actualizado**: `Views` ahora tipea `products_with_stock` con campo `stock: number`.
- **Tech debt cerrado**: ítem "products_with_stock DB view" removido de Open risks.

---

### Cambios implementados en Phase 11
- **Auto-detect seña**: checkbox `is_seña` eliminado del formulario. Si `description.trim().toLowerCase() === 'seña'` → `is_seña=true`, `seña_amount=total` automáticamente.
- **Input seña_amount condicional**: solo aparece cuando categoría es "Servicio" y descripción ≠ 'seña'. Gastos/Productos no muestran nada.
- **Fix bug "Total cobrado"**: para transacciones `is_seña=true`, `total_cobrado = amount` (sin sumar `seña_amount` que causaba doble conteo).
- **Modal overflow fix**: `max-h-[90vh]` + `overflow-y-auto` en el contenido. Header siempre visible con `shrink-0`.

---

### Cambios implementados en Phase 10
- **Inline transaction form**: creación de transacciones reemplaza modal con `prependRow` inline (patrón Proveedores). Modal conservado solo para edición.
- **Catálogo de servicios/productos**: nueva tabla `catalog_items` (migration 008). CRUD en Ajustes → sección "Catálogo" para categorías "Servicio" y "Producto".
- **DescriptionCombobox**: al crear una transacción, escribir en descripción muestra sugerencias del catálogo filtradas por categoría; seleccionar autocompleta descripción y monto.
- **Professional selector condicional**: selector de profesionales solo aparece cuando la categoría es "Servicio" (tanto en form inline como en modal de edición).
- **Import: campo `catalog_item`**: en el wizard de importación de transacciones, columna "Servicio/Producto" asigna automáticamente la `category_id` desde el catálogo y autocompleta la descripción.
- **Import: campo `brand` en productos**: nueva columna `brand` en tabla `products` (migration 009). Soportada en el import wizard.
- **Roadmap multi-tenant documentado**: fases 11–14 y sección "Out of MVP scope" en este archivo.
- **10.x2 — Indicador visual de tipo**: eliminada la columna "Tipo" de la lista de transacciones; el monto ya muestra verde (entrada) / rojo (salida).
- **10.x — Balance por método de pago**: panel de 4 tarjetas en `TransactionsPage` con saldo por método de pago (Σ entradas − Σ salidas de `transaction_payments`), filtrable por rango de fechas.
- **10.z — Métodos de pago configurables**: nueva tabla `payment_methods` (migration 010) con CRUD en Ajustes. `TransactionsPage` carga métodos desde DB. `PaymentMethod` widened a `string`.
- **10.y — Seña como concepto separado**: columnas "Seña" y "Total cobrado" en la lista de transacciones. Comisión calculada sobre `amount + seña_amount`. La seña no es un método de pago.
- **Inventario editable + limpieza**: `LotDrawer` con edición inline de `received_date`, `initial_quantity`, `remaining_quantity`, `unit_cost`, `notes`. Nuevo hook `useUpdateInventoryLot`. Eliminados `SaleForm.tsx` y `useSales.ts`. Botón "Nueva venta" removido de `InventoryPage`.
- **Payment direction derivada**: campo `type` (entrada/salida) eliminado de la UI de métodos de pago; se deriva automáticamente del tipo de transacción al guardar. `PaymentDirection` removido de `types/index.ts`.
- **Lint fixes**: `ErrorBoundary`, `Table` (page clamping sin useEffect), `useAuth` (hoisted fetchProfile).

---

## Completed phases
| Phase | Summary |
|-------|---------|
| 1 | Scaffold, Supabase setup, Auth, AppShell, empty routes |
| 2 | Transactions, Categories, Dashboard KPIs |
| 3 | Suppliers, Purchase Orders, stock-in (inventory lots created on PO receive) |
| 4 | Inventory page, LotDrawer, SaleForm (cart), `consume_inventory_fifo` RPC wired up |
| 5 | ReportsPage: gross profit per product + inventory valuation; `useReports` hook |
| 6 | Import wizard (5 steps): upload → sheets → mapping → preview → batch import for all entity types |
| 7 | ✅ Atomic sale + receive-PO RPCs, responsive AppShell sidebar, ErrorBoundary on all routes |
| 8 | ✅ Payment methods, hairdressers, señas, commission reports (Transactions v2) |
| 9 | ✅ Inline editing + inline row creation (no modals), import wizard extended for Entrada/Salida/payment/professional columns, hairdresser→professional rename, dynamic business_name in sidebar |
| 10 | ✅ Catálogo, inline form, DescriptionCombobox, professional selector, import extensions, balance por método de pago, indicador visual de tipo, métodos de pago configurables (DB), seña como concepto separado, LotDrawer editable inline, SaleForm eliminado, payment direction derivada, lint fixes |
| 11 | ✅ Auto-detect seña desde description, fix Total cobrado double-count, modal overflow fix |
| 12 | ✅ `products_with_stock` view, `useProducts` una sola query, `database.ts` Views tipado |
| 13 | ✅ Fix import parseNum, multicurrency (ARS/USD/EUR), fix edición de payments, cards de balance agrupadas por método+moneda |

---

## Stack
- **Frontend**: React 18 + Vite + TypeScript + TailwindCSS + React Router
- **Data**: Supabase (Postgres + GoTrue Auth) + TanStack Query
- **Build**: `npm run build` (tsc + vite) — must exit 0 before any phase closes
- **Lint**: `npm run lint`

---

## Architecture

### Data flow
```
Postgres (Supabase)
  └─ migrations/         schema, RLS, RPCs
  └─ supabaseClient.ts   typed createClient<Database>
  └─ hooks/              TanStack Query — one useX + useCreateX/useUpdateX/useDeleteX per domain
  └─ pages/              React components — consume hooks only, no direct Supabase calls
```

### Auth
`useAuth` manages session + profile via `onAuthStateChange`. No React context. `AuthGuard` wraps protected routes; `<AuthGuard requireAdmin>` for admin-only routes.

### UI primitives
`src/components/ui/`: Button, Input, Select, Modal, Badge, Table. No third-party form/table libs. Styling via `var(--color-*)` CSS custom properties — no raw Tailwind color classes.

---

## Implemented modules

| Module | Hook(s) | Page |
|--------|---------|------|
| Auth | `useAuth` | `LoginPage` |
| Transactions | `useTransactions`, `useCategories`, `useTransactionPayments` | `TransactionsPage` |
| Hairdressers | `useHairdressers` | `SettingsPage` (Peluqueras section) |
| Commissions | `useCommissionsReport` | `ReportsPage` (Comisiones tab) |
| Dashboard | — | `DashboardPage` (KPIs + charts) |
| Suppliers | `useSuppliers` | `SuppliersPage` |
| Purchase Orders | `usePurchaseOrders` | `PurchaseOrdersPage` |
| Inventory / Sales | `useProducts`, `useInventoryLots`, `useSales` | `InventoryPage`, `LotDrawer`, `SaleForm` |
| Reports | `useGrossProfitReport`, `useInventoryValuation` | `ReportsPage` |
| Import | — | `ImportPage` (5-step wizard) |
| Settings | — | `SettingsPage` (category management) |

---

## Key technical decisions

- **`Relationships: []`** required on every table in `database.ts` — without it, `@supabase/supabase-js` 2.99 + TS 5.9 infers insert/update params as `never`.
- **Join queries** return `SelectQueryError` — cast with `as unknown as TargetType`.
- **Stock** is computed client-side in `useProducts` by summing `inventory_lots.remaining_quantity`. No `stock` column on `products`.
- **FIFO** is entirely in the `consume_inventory_fifo` Postgres RPC (`SECURITY DEFINER`). Never replicate in frontend.
- **Receive-PO** and **multi-product sale** are non-atomic sequential loops. Acceptable for MVP; wrap in a DB transaction in Phase 7.
- **`sale_items` rows are immutable** — no edit UI, no update policy.

---

## Key contracts

- `supabase/migrations/001_initial_schema.sql` — all tables, indexes, RLS
- `supabase/migrations/002_fifo_security_definer.sql` — FIFO RPC as SECURITY DEFINER
- `src/types/database.ts` — must stay in sync with migrations
- `src/types/index.ts` — shared domain types consumed by frontend

---

## Phase 8 scope — Transactions v2

### Goal
Replace the simple `amount` + `type` model with a richer structure that mirrors the salon's Excel: multiple payment methods per transaction, hairdresser attribution, and seña (advance payment) tracking.

### New DB objects (migration 004)

**`hairdressers` table**
- `id uuid PK`, `name text UNIQUE NOT NULL`, `active boolean default true`
- Managed from Settings by admin users.

**`transaction_payments` table** — payment method breakdown per transaction
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `transaction_id` | uuid FK → transactions | |
| `payment_method` | text | MP \| PPY \| Efectivo \| Santander |
| `instrument` | text nullable | Transferencia \| Tarjeta |
| `amount` | numeric | always positive |
| `type` | text | entrada \| salida |

**`transaction_hairdressers` table** — many-to-many
- `(transaction_id, hairdresser_id)` composite PK

**Columns added to `transactions`**
- `is_seña boolean default false` — this transaction IS an advance payment
- `seña_amount numeric nullable` — advance already collected for this service (manual, no FK)

`transactions.amount` stays as the computed total (sum of its `transaction_payments`).

### Commission rules (derived, not stored)
- 1 hairdresser: 40% of transaction amount
- 2+ hairdressers: 20% each
- Calculated in a new commission report tab inside `ReportsPage`.

### UI changes
- **Transaction form**: add payment method rows (method + instrument + amount + direction), hairdresser multi-select, seña toggle and seña_amount field. Total auto-calculated from payment rows.
- **Transaction list**: show payment method badge(s), hairdresser names.
- **ReportsPage**: new "Comisiones" tab — per-hairdresser commission total for the selected date range.
- **SettingsPage**: new "Peluqueras" section — CRUD for hairdressers.

### Out of scope for Phase 8
- Linking a seña transaction to the service transaction it was applied to (deferred).
- Commission rates that differ per service category.
- Editing existing `transaction_payments` rows (immutable like `sale_items`).

---

## Open risks / tech debt
- No optimistic updates anywhere — UI shows stale data until `invalidateQueries` refetches.
- All migrations must be run manually in Supabase SQL editor for production environments.

---

## How to validate manually
```bash
npm run build   # zero errors
npm run dev     # then:
```
- `/login` — auth works, redirects to `/dashboard`
- `/transactions` — list loads, create/edit modal works
- `/suppliers` — CRUD works
- `/purchase-orders` — create PO, receive it, stock increases on `/inventory`
- `/inventory` — stock column correct, "Ver lotes" opens drawer (lotes editables inline), NO botón "Nueva venta" — el descuento de inventario ocurre automáticamente al registrar una transacción Gasto con categoría "Producto"

---

## Future roadmap — Multi-Tenant SaaS

These phases convert the single-tenant MVP into a sellable SaaS. Architecture stays the same (Supabase + RLS); multi-tenancy is additive.

| Phase | Name | Scope |
|-------|------|-------|
| 11 | Multi-tenant foundation | Add `tenants` table; add `tenant_id` to all tables; update RLS policies to filter by `tenant_id` derived from `auth.uid()`; update `profiles` + `handle_new_user` trigger |
| 12 | Tenant onboarding | Registration flow for new businesses, tenant provisioning, role system (owner / admin / staff per tenant) |
| 13 | Billing (Stripe) | Subscription plans, Stripe webhook to grant/revoke tenant access, auto-invoices |
| 14 | Super-admin panel | Cross-tenant view of usage, billing status, and support tools |

---

## Out of MVP scope

Features discussed or requested that are explicitly deferred. Pick them up when starting a future phase.

| Feature | Notes |
|---------|-------|
| Multi-tenant isolation | `tenant_id` on all tables + RLS — tracked in Phase 11 |
| Billing / Stripe | Subscription management, payment failure handling — tracked in Phase 13 |
| Backend API layer | Custom Node.js server not needed; Supabase RPC + Edge Functions cover all business logic |
| Automated test suite | Current validation gate is `npm run build` + manual browser check |
| Seña ↔ service linking | Link a seña transaction to the service transaction it was applied to |
| Per-category commission rates | Currently fixed at 40% solo / 20% each for 2+ hairdressers |
| ~~`products_with_stock` DB view~~ | Implementado en Phase 12 |
| Optimistic UI updates | Currently refetches on every mutation via `invalidateQueries` |

## TODO
~~1. Fix import parseNum: "4,984.00" ahora se interpreta como 4984 (detecta separador decimal por posición).~~
~~2. Multicurrency: columna `currency` en `transactions` (migration 013). Filtro ARS/USD/EUR en TransactionsPage. Balances agrupados por moneda activa. Selector en form inline y modal de edición. Soporte en import wizard.~~
3. Reportes financieros y comisiones se debe popular con la información de "transacciones"
