# Phase 3 — Continuity Summary

## What was completed
- `src/hooks/useSuppliers.ts` — full CRUD: `useSuppliers`, `useCreateSupplier`, `useUpdateSupplier`, `useDeleteSupplier`
- `src/hooks/useProducts.ts` — read products with computed `stock` field (sum of `remaining_quantity` across lots); `useCreateProduct`, `useUpdateProduct`, `useDeleteProduct` (soft-delete via `deleted_at`)
- `src/hooks/usePurchaseOrders.ts` — `usePurchaseOrders`, `useCreatePurchaseOrder`, `useCancelPurchaseOrder`, `useReceivePurchaseOrder`
- `src/pages/suppliers/SuppliersPage.tsx` — table + create/edit modal, full CRUD
- `src/pages/purchase-orders/PurchaseOrdersPage.tsx` — table with expandable rows, create PO modal, receive PO modal
- `src/types/database.ts` — added `Relationships: []` to all table definitions (required by `@supabase/postgrest-js`)
- `src/hooks/useTransactions.ts` — fixed pre-existing type errors (join queries now use `as unknown as`)

## Technical decisions
- **Stock computation in `useProducts`**: done client-side by summing `inventory_lots.remaining_quantity`. Kept simple for now; can be moved to a DB view in a later phase if performance becomes an issue.
- **Receive PO logic**: sequential per-item loop (insert lot → update POI.lot_id → insert movement), not a DB transaction. If a mid-loop failure happens, the PO status won't be updated to `received`, so the user can retry. Acceptable for MVP scope.
- **`Relationships: []`**: Supabase JS 2.99 + postgrest-js requires this field on every table definition or the generic type inference falls back to `never`. This is a structural requirement of the new `GenericTable` type — not a business decision.
- **`as unknown as` for join queries**: Supabase can't infer joined types without `Relationships` FK declarations. Using `as unknown as` is the correct escape hatch when the actual shape is known and the type mismatch is cosmetic.
- **PO expandable rows**: implemented with inline `<table>` instead of the shared `Table` component because expandable rows require custom `<tr>` siblings.

## What is pending (next phase)
- Phase 4: `InventoryPage` (show stock per product + lot drawer), sale form that calls `consume_inventory_fifo` RPC, `sale_items` insertion.

## What must not break
- `useTransactions` / `useCategories` — already working in production, the `as unknown as` cast must stay.
- `database.ts` `Relationships: []` — removing this will break all insert/update operations across all hooks.
- `consume_inventory_fifo` RPC is already in the DB migration — do not re-run or duplicate.
- `purchase_order_items.lot_id` is set when a PO is received — Phase 4 can rely on this to trace sale back to purchase.

## Validation commands
```bash
npm run build          # must exit 0, zero errors
npm run dev            # smoke test: /suppliers and /purchase-orders must load
```

## Risks / tech debt
- The receive-PO loop is not atomic. A Supabase DB function (RPC) would make this transactional — consider adding in Phase 7 polish.
- `useProducts` fires two sequential queries (products + lots). A Postgres view `products_with_stock` would reduce this to one call and be reusable in Phase 4/5.
- No optimistic updates on mutations — UI shows stale data until query invalidation refetches. Acceptable for now.
