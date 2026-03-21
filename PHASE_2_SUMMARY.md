# Phase 2 — Continuity Summary

## What was completed
- **`useTransactions`**: query with filters (type, categoryId, from, to); joins `categories` via `*, category:categories(*)`
- **`useCreateTransaction`**, **`useUpdateTransaction`**, **`useDeleteTransaction`**: mutations with `queryClient.invalidateQueries`
- **`useCategories`**: flat list ordered by type then name
- **`useCreateCategory`**, **`useDeleteCategory`**: create deduplicates by `(name, type)` UNIQUE constraint; delete cascades `category_id` to NULL on transactions (DB default)
- **`TransactionsPage`**: filter bar (type, category, date range + clear), table with edit/delete per row, create/edit modal
- **`DashboardPage`**: 4 KPI cards (ingresos mes, gastos mes, balance neto, count transacciones), Area chart last 6 months ingresos vs gastos using Recharts
- **`SettingsPage`** (admin-only): category management — list split by type (income/expense), create modal, delete with confirm; accessible via `/settings` which is `requireAdmin`-guarded

## Technical decisions
- **Date filter uses `.gte` / `.lte`** on the `date` column (type `DATE`). Dates stored as `YYYY-MM-DD` strings — no timezone conversion needed at query time
- **Dashboard data comes from `useTransactions()` with no filters** — fetches all transactions and aggregates in-memory. Simple for MVP; will need a date-range limit or a DB aggregate query once data grows
- **Chart data is computed with `useMemo`**: `buildChartData` maps last 6 calendar months — always relative to `new Date()`, so it self-updates each month without code changes
- **Categories can only be deleted, not edited** — name changes would break historical categorization; users must delete and recreate
- **`useCreateTransaction` injects `created_by: user.id`** at mutation time (not trusting the UI to pass it) — aligns with the RLS policy `WITH CHECK (auth.uid() = created_by)`

## What is pending (next phase at the time)
- Phase 3: Suppliers, Purchase Orders, stock-in (inventory lots created on PO receive)

## What must not break
- **`created_by` injection in `useCreateTransaction`**: the RLS policy requires `auth.uid() = created_by` for employee inserts — if this is removed, employee inserts will be rejected
- **`transactions.update` payload** does NOT include `created_by` (intentional) — updating a transaction should never change its author
- **Dashboard uses all-time `useTransactions()`** — this query has no filters and grows unbounded. Do not add pagination to `useTransactions` without also updating the dashboard to fetch separately
- **Category UNIQUE constraint `(name, type)`**: `useCreateCategory` relies on the DB rejecting duplicates — the UI does not do client-side dedup

## Validation commands
```bash
npm run build              # must exit 0
npm run dev                # /transactions must show table + modal; /dashboard must show KPIs and chart; /settings (admin) must show categories
```

## Risks / tech debt
- Dashboard fetches ALL transactions with no date ceiling — will degrade as data grows. A future phase should add a `from` filter (e.g., last 12 months) or use a DB aggregate
- No pagination on TransactionsPage — table renders all rows. Acceptable while data is small
- `useAuth` is called inside `AuthGuard` AND `Sidebar` — two independent listeners on the same Supabase auth event. No bug today, but consolidating into a context would reduce redundant fetches
- Recharts `Tooltip formatter` required `as unknown as` cast due to Recharts' loose `ValueType` generic — harmless at runtime
