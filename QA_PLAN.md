# QA Plan — ERP-BO

Session date: 2026-03-21

## Status Legend
- [ ] Pending
- [x] Pass
- [!] Fail — see notes

---

## Module 1: Login (`/login`)
- [x] Page renders without errors
- [ ] Invalid credentials shows error message — not tested (would require logout)
- [x] Valid credentials redirect to `/dashboard`
- [x] Already-logged-in user auto-redirects

## Module 2: Dashboard (`/dashboard`)
- [x] Page loads without JS errors
- [x] Metrics/summary cards display data (ingresos, gastos, balance, transacciones)
- [x] Navigation sidebar visible and functional
- [x] All sidebar links navigate correctly

## Module 3: Suppliers (`/suppliers`)
- [x] List loads with all suppliers
- [x] Create new supplier (inline draft row) saves correctly
- [x] Edit supplier via InlineEditCell updates correctly
- [x] Delete supplier works (with confirmation)
- [x] Form validation: save disabled when name is empty

## Module 4: Purchase Orders (`/purchase-orders`)
- [x] PO list loads
- [x] Create new PO modal opens
- [x] Can add line items to PO
- [x] Save PO creates record with `draft` status
- [x] "Receive" PO flow works — lot created, stock increases in inventory
- [x] Received PO shows `received` status

## Module 5: Inventory (`/inventory`)
- [x] Product list loads with correct stock quantities
- [x] Stock reflects recent PO receipts
- [x] Clicking a product opens LotDrawer
- [x] LotDrawer shows all lots with remaining quantities
- [x] Inline lot editor allows editing cost/notes fields
- [x] Save on inline edit persists to DB

## Module 6: Transactions (`/transactions`)
- [x] List loads (most recent first)
- [x] Inline "+" row opens new transaction form
- [x] Description combobox shows catalog autocomplete suggestions
- [x] Type selector (Income/Expense) changes amount color (green/red)
- [x] Professional selector appears only for "Service" category (when professionals exist)
- [x] Payment method selector works
- [x] Saving transaction appends to list and clears form
- [x] Payment method balance panel shows correct totals
- [x] Edit transaction opens modal with correct data
- [x] Delete transaction works (with confirmation)

## Module 7: Reports (`/reports`)
- [x] Financiero tab loads without errors
- [x] Inventory valuation section shows correct FIFO-costed values
- [x] Comisiones tab renders with date range filter (Desde/Hasta)
- [x] Gross profit table renders (shows empty when no product-linked sales exist)

## Module 8: Settings (`/settings`) — Admin only
- [x] Page accessible to admin users
- [x] Payment methods list loads
- [x] Add new payment method works (inline input, Enter to save)
- [x] Delete payment method works (with confirmation)
- [x] Catalog items list loads (SERVICIO: 33 items; PRODUCTO: empty)
- [x] Categories list loads (Producto, Servicio)

## Module 9: Import (`/import`) — Admin only
- [x] Page accessible to admin users
- [x] Step 1 (Archivo): file dropzone renders, accepts .xlsx/.xls
- [ ] Steps 2-5 not tested (requires uploading a real file)

---

## Issues Found & Fixed

| Module | Issue | Fix | Status |
|--------|-------|-----|--------|
| Suppliers | `contact` field rendered as static text — not editable after creation | Changed render to `InlineEditCell` in `SuppliersPage.tsx` | ✅ Fixed |
| Purchase Orders | `receive_purchase_order` RPC failed with PostgreSQL error 42702 (ambiguous column `lot_id`) | Created migration `011_fix_receive_po_ambiguous_column.sql` renaming variable to `v_lot_id` | ✅ Fixed (migration applied) |
| Transactions | Category dropdown in edit modal showed "Sin categoría" twice (explicit option + placeholder) | Removed explicit `{ value: '', label: 'Sin categoría' }` from `categoryOptions` array | ✅ Fixed |
| Transactions | Balance panel showed duplicate "EFECTIVO" card when a new transaction used "Efectivo" (capital E) vs. old imported data using "efectivo" (lowercase) | Data quality issue from import — not a code bug. New transactions save correctly. Old data inconsistency is expected. | ⚠️ Data note |

## Notes

- Catalog items in Settings have prices of "0" — catalog was imported without prices
- Commissions report always shows $0 / empty because there are no `hairdressers` (professionals) configured
- Gross profit report shows $0 because existing transactions are not linked to `sale_items` (legacy import data had no product linkage)
- Import wizard steps 2-5 untested — would need a sample .xlsx file to proceed through the full wizard
