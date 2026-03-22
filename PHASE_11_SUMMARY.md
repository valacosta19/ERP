# Phase 11 Summary

## Goal
Tech debt cleanup and UI polish: auto-detect seña from description, fix Total cobrado double-count bug, fix modal overflow.

## Changes

### Auto-detect `is_seña` from description
- Removed `is_seña` checkbox from inline form and edit modal.
- `is_seña` is now computed at submit time: `description.trim().toLowerCase() === 'seña'` → true.
- `seña_amount` input now only appears when category is "Servicio" AND description is not 'seña'.
- For gastos/productos categories, the seña section is hidden entirely.
- Removed `is_seña` from `EMPTY_DRAFT` and editForm state; no longer tracked in component state.

### Fix "Total cobrado" double-count bug
- For `is_seña = true` transactions, `total_cobrado = tx.amount` (no addition of seña_amount, which would double-count).
- For normal transactions with prior seña: `total_cobrado = tx.amount + tx.seña_amount` (unchanged).

### Modal overflow fix
- Added `max-h-[90vh]` and `flex flex-col` to the modal container.
- Modal header is `shrink-0` (always visible).
- Content area is `overflow-y-auto` (scrollable when content is tall).

## Files modified
- `src/pages/transactions/TransactionsPage.tsx`
- `src/components/ui/Modal.tsx`

## Validation
- `npm run build` exits 0, no errors.
- Manual: create a seña transaction (description = "Seña"), verify badge appears and Total cobrado = amount (no double-count).
- Create a service transaction with seña_amount filled, verify Total cobrado = amount + seña.
- Open edit modal with tall content, verify scroll works.
