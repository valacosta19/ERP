# PROJECT_STATE.md

Quick-reference for any agent or new context. Keep this file accurate — update it when a phase closes.

---

## Objective
ERP for a hair salon. Replaces an Excel-based system. Core problem: Excel always prices inventory at the last purchase cost; this ERP uses **FIFO** so each sale is costed against the actual lot consumed.

---

## Current phase
**Phase 5** — Reports: gross profit per product and inventory valuation.

---

## Completed phases
| Phase | Summary |
|-------|---------|
| 1 | Scaffold, Supabase setup, Auth, AppShell, empty routes |
| 2 | Transactions, Categories, Dashboard KPIs |
| 3 | Suppliers, Purchase Orders, stock-in (inventory lots created on PO receive) |
| 4 | Inventory page, LotDrawer, SaleForm (cart), `consume_inventory_fifo` RPC wired up |

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
| Transactions | `useTransactions`, `useCategories` | `TransactionsPage` |
| Dashboard | — | `DashboardPage` (KPIs + charts) |
| Suppliers | `useSuppliers` | `SuppliersPage` |
| Purchase Orders | `usePurchaseOrders` | `PurchaseOrdersPage` |
| Inventory / Sales | `useProducts`, `useInventoryLots`, `useSales` | `InventoryPage`, `LotDrawer`, `SaleForm` |
| Reports | — | `ReportsPage` (stub — Phase 5) |
| Import | — | `ImportPage` (stub — Phase 6) |
| Settings | — | `SettingsPage` (stub — Phase 7) |

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

## Phase 5 pending items
- `ReportsPage`: gross profit per product from `sale_items` (revenue, COGS, margin)
- `ReportsPage`: inventory valuation (sum of `remaining_quantity * unit_cost` per product)
- Likely needs a reporting hook (`useReports` or two focused hooks)
- No new migrations expected — queries against existing tables

---

## Open risks / tech debt
- Non-atomic sale: if FIFO RPC fails on product N of M, prior products are consumed and the transaction is already inserted. Fix: wrap in a DB function (Phase 7).
- `useProducts` fires two sequential queries (products + lots). A `products_with_stock` view would consolidate this — consider in Phase 7.
- No optimistic updates anywhere — UI shows stale data until `invalidateQueries` refetches.
- Migration 002 must be run manually in Supabase SQL editor for production environments.

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

## Upcoming phases
| Phase | What |
|-------|------|
| 5 | Reports: gross profit per product, inventory valuation |
| 6 | Excel import wizard (5-step: upload → map → preview → import) |
| 7 | Polish: atomic transactions, responsive layout, error boundaries, production hardening |
