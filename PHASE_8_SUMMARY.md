# Phase 8 Summary — Transactions v2

## What was delivered

### Migration 004
`supabase/migrations/004_phase8_transactions_v2.sql`:
- `hairdressers` table (id, name UNIQUE, active, created_at) with RLS: all authenticated can read; only admin can insert/update/delete
- `transaction_payments` table (id, transaction_id FK, payment_method, instrument nullable, amount, type) with RLS: authenticated can read/insert; admin can delete
- `transaction_hairdressers` junction table (transaction_id, hairdresser_id, composite PK) with same RLS
- `ALTER TABLE transactions ADD COLUMN is_seña boolean DEFAULT false, ADD COLUMN seña_amount numeric`

### Types
- `src/types/database.ts`: added `hairdressers`, `transaction_payments`, `transaction_hairdressers` tables (all with `Relationships: []`); updated `transactions` Row/Insert/Update with `is_seña` and `seña_amount`
- `src/types/index.ts`: added `PaymentMethod`, `PaymentInstrument`, `PaymentDirection` union types; added `Hairdresser` and `TransactionPayment` interfaces; updated `Transaction` with `is_seña`, `seña_amount`, `payments?`, `hairdressers?`

### Hooks
- `src/hooks/useHairdressers.ts`: `useHairdressers`, `useCreateHairdresser`, `useUpdateHairdresser`, `useDeleteHairdresser`
- `src/hooks/useTransactionPayments.ts`: `useTransactionPayments(transactionId)`
- `src/hooks/useTransactions.ts`: updated to join `transaction_payments` and `transaction_hairdressers(hairdressers)`; `useCreateTransaction` inserts payment rows and hairdresser rows after the transaction; `useUpdateTransaction` accepts the new fields
- `src/hooks/useCommissionsReport.ts`: computes commissions per hairdresser — 40% if solo, 20% each if 2+; returns `CommissionRow[]` with transaction count, total amount, commission amount, effective rate

### UI
- `src/pages/settings/SettingsPage.tsx`: new "Peluqueras" section — list with active/inactive badge, edit name, activate/deactivate, delete
- `src/pages/transactions/TransactionsPage.tsx`:
  - Form: dynamic payment method rows (method + instrument + direction + amount, add/remove), hairdresser multi-select (chip toggles), `is_seña` checkbox + `seña_amount` field for service transactions
  - `is_seña = true` → saves total as seña_amount automatically; hides the seña_amount input
  - `is_seña = false` → shows optional "Seña cobrada previamente" input for commission calculation
  - List: "Seña" badge when `is_seña`, payment method badges, hairdresser names
- `src/pages/reports/ReportsPage.tsx`: tabbed layout ("Financiero" | "Comisiones"); Comisiones tab has date range filters, total stat card, per-hairdresser table with transaction count, total billed, commission rate, commission amount

## Build
`npm run build` exits 0.

## User sign-off
Validated manually in browser. ✅
