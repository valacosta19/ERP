# PROJECT_STATE.md

Quick-reference for any agent or new context. Keep this file accurate — update it when a phase closes.

---

## Objective
ERP for a hair salon. Replaces an Excel-based system. Core problem: Excel always prices inventory at the last purchase cost; this ERP uses **FIFO** so each sale is costed against the actual lot consumed.

---

## Current phase
**Phase 10** — ✅ Completa

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
| 10 | ✅ Catálogo, inline form, DescriptionCombobox, professional selector, import extensions, balance por método de pago, indicador visual de tipo, métodos de pago configurables (DB), seña como concepto separado, lint fixes |

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
- `useProducts` fires two sequential queries (products + lots). A `products_with_stock` view would consolidate this — deferred, not in Phase 7 scope.
- No optimistic updates anywhere — UI shows stale data until `invalidateQueries` refetches.
- Migrations 002 and 003 must be run manually in Supabase SQL editor for production environments.

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
- `/inventory` — stock column correct, "Ver lotes" opens drawer, "Nueva venta" creates sale and decrements stock

---

## Upcoming phases (MVP)
| Phase | What |
|-------|------|
| 11 | Multi-tenant foundation |

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
| `products_with_stock` DB view | Would replace the two-query pattern in `useProducts` |
| Optimistic UI updates | Currently refetches on every mutation via `invalidateQueries` |
