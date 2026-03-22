# Phase 12 Summary — Tech Debt: products_with_stock view

## Goal
Close the `useProducts` two-query tech debt by consolidating product + stock data into a single Postgres view.

## Changes

### `supabase/migrations/012_products_with_stock_view.sql`
New view `products_with_stock`:
- Joins `products` with `SUM(inventory_lots.remaining_quantity)` grouped by product
- Filters `deleted_at IS NULL` — only active products
- Exposes `stock` as a computed numeric column

### `src/types/database.ts`
- `Views` replaced from `Record<string, never>` to a typed `products_with_stock` entry with all product columns + `stock: number`.

### `src/hooks/useProducts.ts`
- `queryFn` reduced from two sequential fetches + manual Map aggregation to a single `.from('products_with_stock').select('*').order('name')`.
- `Product` type already had `stock?: number` — no change to domain types.

## Validation
`npm run build` exits 0.

Manual check: `/inventory` should show correct stock per product (same values as before).

> **Note**: migration 012 must be run in Supabase SQL editor before deploying.
