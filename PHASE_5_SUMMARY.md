# Phase 5 Summary — Reports

## What was built

**Hook: `useReports.ts`**
- `useGrossProfitReport()`: queries `sale_items` joined with `products`, aggregates revenue, COGS, and gross profit per product, computes margin %, sorts by gross profit descending.
- `useInventoryValuation()`: queries `inventory_lots` where `remaining_quantity > 0`, joined with `products`, aggregates units and value per product, sorts by total value descending.
- Both hooks use `as unknown as TargetType` casts for join results (supabase-js 2.99 + TS 5.9 quirk).

**Page: `ReportsPage.tsx`**
- Three KPI cards at the top: total revenue, total gross profit, total inventory value.
- Table: gross profit per product (product, revenue, COGS, gross margin, margin %).
- Table: inventory valuation (product, units in stock, total value).
- Uses existing `Table` UI primitive. No new migrations.

## Validation
- `npm run build` exits 0.
- No new migrations required — all queries target existing tables.

## Notes
- No date filter added (out of scope for MVP).
- Report data is computed client-side from raw `sale_items` / `inventory_lots` rows; no server-side aggregation functions.
