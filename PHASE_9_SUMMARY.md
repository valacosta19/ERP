# Phase 9 Summary — Inline Editing, Import Extension & Generalization

## What was implemented

### 1. Inline cell editing (`InlineEditCell`)
`src/components/ui/InlineEditCell.tsx` — reusable component. Shows value as text; on click renders an input. Enter/blur saves, Escape cancels.

Added `useUpdateCategory` to `src/hooks/useCategories.ts`.

| View | Fields with inline editing |
|------|---------------------------|
| `SuppliersPage` | name, phone, email |
| `InventoryPage` | product name, sale_price |
| `SettingsPage` — Profesionales | professional name |
| `SettingsPage` — Categories | category name (income + expense) |

### 2. Inline row creation (no modals)
All create flows replaced with a highlighted inline row at the top of the table/list. No modals anywhere.

- `SuppliersPage` — "Nuevo proveedor" prepends a draft row aligned to table columns
- `SettingsPage` — each section has a "+" button that appends an inline draft row

`DraftInput` pattern: transparent input, underline border transitions to accent on focus. Draft row: `var(--color-accent-light)` bg, 3px accent left border, "NUEVO" badge, ✓/✗ buttons, `animate-slide-in`.

`Table` extended with `prependRow` and `appendRow` props.

### 3. Import wizard — Excel Entrada/Salida support
Extended `src/pages/import/importLogic.ts` and `StepImport.tsx` to handle the user's Excel column structure:

| New field key | Maps to | Logic |
|---------------|---------|-------|
| `entrada` | income amount | value > 0 → type = 'income' |
| `salida` | expense amount | value > 0 → type = 'expense' |
| `payment_method` | `transaction_payments` row | inserted after transaction |
| `instrument` | `transaction_payments.instrument` | |
| `is_seña` | `is_seña` + `seña_amount` | any non-falsy value → true |
| `professional` | `transaction_professionals` row | name lookup, skip if not found |

`amount` + `type` fields kept as fallback for simpler formats. Auto-suggest aliases added for all new fields.

### 4. Frontend generalization: hairdresser → professional
All frontend code renamed from `hairdresser` to `professional`. DB table names (`hairdressers`, `transaction_hairdressers`) unchanged — no migration required.

- `Hairdresser` type → `Professional`
- `useHairdressers.ts` → `useProfessionals.ts`
- UI labels: "Peluquera/s" → "Profesional/es" across Settings, Transactions, Reports
- `CommissionRow`: `hairdresser_id/name` → `professional_id/name`

### 5. Dynamic business name
- Migration `005_add_business_name.sql`: `ALTER TABLE profiles ADD COLUMN business_name text`
- `useUpdateProfile` mutation added to `src/hooks/useAuth.ts`
- Sidebar subtitle now shows `profile.business_name` (empty if not set)
- Settings: new "Negocio" section with inline-editable business name field

## Build
`npm run build` exits 0.

## Manual validation required
- Run migration `005_add_business_name.sql` in Supabase SQL editor
- `/settings` — edit business name, verify it appears in sidebar
- `/import` — upload Excel with Entrada/Salida columns, verify auto-mapping works
- `/transactions` — verify "Profesionales" label, commission report updated
