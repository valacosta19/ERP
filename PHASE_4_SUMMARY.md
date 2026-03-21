# Phase 4 — Continuity Summary

## What was completed
- `supabase/migrations/002_fifo_security_definer.sql` — re-declares `consume_inventory_fifo` as `SECURITY DEFINER` so employees can call it without needing direct INSERT on `sale_items`/`inventory_movements` or UPDATE on `inventory_lots`. Grants EXECUTE to `authenticated`.
- `src/hooks/useInventoryLots.ts` — `useInventoryLots(productId)` query; fetches all lots for a product ordered by `received_date ASC`. Disabled when `productId` is null.
- `src/hooks/useSales.ts` — `useCreateSale` mutation: inserts an `income` transaction, then calls `consume_inventory_fifo` RPC per line item. Invalidates `['products']` and `['transactions']` on success.
- `src/pages/inventory/LotDrawer.tsx` — Modal showing all lots for a selected product (date, initial qty, remaining qty, unit cost, available/depleted badge).
- `src/pages/inventory/SaleForm.tsx` — Cart-based sale modal: date, category (filtered to income), description, multi-product cart with quantity + price inputs pre-filled from `product.sale_price`, running total, submit.
- `src/pages/inventory/InventoryPage.tsx` — Full implementation: product table with stock column (computed via lots), min_stock, status badge (OK/Stock bajo/Sin stock), "Ver lotes" button per row, "Nueva venta" button in header.

## Technical decisions
- **SECURITY DEFINER on FIFO RPC**: the function needs to UPDATE `inventory_lots` and INSERT into `sale_items` and `inventory_movements`. Rather than adding per-table employee policies (which would open those tables for direct writes), SECURITY DEFINER keeps the write surface minimal.
- **Cart approach for SaleForm**: supports multi-product sales in a single transaction. One `income` transaction is created; the RPC is called once per distinct product. If one product fails (out of stock), the error surfaces and the user can correct before retrying.
- **Non-atomic multi-product sale**: if RPC call fails mid-loop (product 2 of 3), the transaction is already inserted but some products haven't been consumed. This is acceptable for MVP — same pattern as the receive-PO flow in Phase 3. A DB-level transaction wrapping everything would fix this in Phase 7.
- **`useInventoryLots` separate from `useProducts`**: lots are only needed in the drawer, which opens on demand. Fetching them eagerly for all products would be wasteful.

## What is pending (next phase)
- Phase 5: ReportsPage — utilidad por producto (revenue, COGS, gross profit from `sale_items`), valorización de inventario (sum of `remaining_quantity * unit_cost` per product).

## What must not break
- `consume_inventory_fifo` RPC — do not alter the function signature or body; migration 002 only changes `SECURITY DEFINER` and `SET search_path`.
- `useProducts` stock computation — Phase 5 will reuse the `stock` field for inventory valuation.
- `transactions_insert` RLS policy — requires `created_by = auth.uid()`. `useSales` always passes `user.id`.
- `sale_items` rows are immutable (`Update: never` in database.ts) — never expose an edit UI for them.

## Validation commands
```bash
npm run build   # must exit 0
npm run dev     # smoke test: /inventory must show product table with stock + "Nueva venta" button
```

## Risks / tech debt
- Multi-product sale is non-atomic: if the RPC fails for product N, prior products are already consumed and the transaction is recorded. Wrap in a DB function in Phase 7.
- Migration 002 must be run in Supabase SQL editor before testing in production.
- `inventory_movements` INSERT policy (`admin_movements`) blocks direct employee inserts, but SECURITY DEFINER bypasses this cleanly.
