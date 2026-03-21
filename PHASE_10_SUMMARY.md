# Phase 10 Summary

## Goal
Polish and extend the Transactions module with catalog autocomplete, inline creation, payment method management, and visual improvements to the transaction list.

## What was built

### Inline transaction form (prependRow)
- Transaction creation replaced the modal with an inline `prependRow` inside the table (same pattern as Suppliers).
- Modal retained for editing only.

### Catalog of services/products
- New `catalog_items` table (migration 008) with `name`, `category_id`, and `price`.
- CRUD section in Settings under "Catálogo" for categories named "Servicio" and "Producto".
- `DescriptionCombobox`: when creating a transaction, typing in the description field shows suggestions from the catalog filtered by category; selecting one autocompletes description and amount.

### Conditional professional selector
- Professional pills only appear in the create/edit form when the selected category is "Servicio".

### Import wizard extensions
- Import wizard extended: "Servicio/Producto" column maps to `catalog_items`, autocompleting category and description.
- New `brand` column on `products` (migration 009), supported in the import wizard.

### 10.x2 — Visual type indicator
- Removed the "Tipo" column from the transaction list.
- Amount already colored green (income) / red (expense) — now the only type indicator.

### 10.x — Balance by payment method
- Balance panel above the transaction table showing Σ entradas − Σ salidas per payment method.
- Respects the existing `from`/`to` date filters.
- New `usePaymentMethodBalances` hook in `useTransactions.ts`.

### 10.z — Configurable payment methods
- New `payment_methods` table (migration 010) with `name` and `active` columns; seeded with Efectivo, MP, PPY, Santander.
- New `usePaymentMethods`, `useCreatePaymentMethod`, `useUpdatePaymentMethod`, `useDeletePaymentMethod` hooks.
- `PaymentMethod` type widened from union to `string` — methods are now DB-driven.
- CRUD section "Métodos de pago" added to SettingsPage (same pattern as Profesionales).
- `TransactionsPage` loads payment method options from DB instead of hardcoded constant.

### 10.y — Seña as a separate concept
- "Seña" and "Total cobrado" columns added to the transaction list.
- "Total cobrado" = `amount + seña_amount` for each row.
- Commission calculation in `useCommissionsReport` updated to include `seña_amount` in the base amount.

### Lint fixes (pre-existing)
- `ErrorBoundary.tsx`: removed unused `_error`/`_info` params and `ErrorInfo` import from `componentDidCatch`.
- `Table.tsx`: replaced `useEffect(() => setPage(1))` with a derived `safePage` clamped to valid range.
- `useAuth.ts`: hoisted `fetchProfile` above the `useEffect` that references it.

## Validation
- `npm run build`: EXIT 0
- `npm run lint`: EXIT 0

## Files changed
- `src/pages/transactions/TransactionsPage.tsx`
- `src/hooks/useTransactions.ts`
- `src/hooks/usePaymentMethods.ts` (new)
- `src/hooks/useCommissionsReport.ts`
- `src/pages/settings/SettingsPage.tsx`
- `src/types/index.ts`
- `src/types/database.ts`
- `src/components/layout/ErrorBoundary.tsx`
- `src/components/ui/Table.tsx`
- `src/hooks/useAuth.ts`
- `supabase/migrations/010_payment_methods.sql` (new)
