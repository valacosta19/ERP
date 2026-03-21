# Phase 9 Summary — Inline Editing

## Goal
Excel-style cell-by-cell inline editing across main views, replacing modal-based editing where applicable.

## What was implemented

### New component: `InlineEditCell`
`src/components/ui/InlineEditCell.tsx`

Reusable inline edit cell. Shows value as text; on click renders an input. Enter/blur saves, Escape cancels. Accepts `type` (`text` | `email` | `number`) and `onSave: (value: string) => Promise<void>`.

### New hook: `useUpdateCategory`
Added to `src/hooks/useCategories.ts`. Updates a category's `name` by id.

### Views updated

| View | Fields with inline editing | Edit button removed? |
|------|---------------------------|----------------------|
| `SuppliersPage` | name, phone, email | Yes |
| `InventoryPage` | product name, sale_price | N/A (no edit button existed) |
| `SettingsPage` — Peluqueras | hairdresser name | Yes |
| `SettingsPage` — Categories | category name (income + expense) | N/A (no edit button existed) |

### Views NOT changed (by design)
- Transactions — multi-step logic, payment rows
- Purchase Orders — multi-step receive flow
- sale_items — immutable

### Inline row creation (no modals)
All create flows replaced with an inline row that appears at the top of the table/list when clicking "Nuevo X":
- `SuppliersPage` — modal removed; "Nuevo proveedor" prepends a highlighted row with `DraftInput` fields (Nombre, Contacto, Teléfono, Email)
- `SettingsPage` — both modals removed; each section (Peluqueras, Categorías de ingresos, Categorías de gastos) has a "+" button that appends an inline draft row

`DraftInput`: local component in each page — transparent input with underline border that transitions to accent color on focus.

Visual design of draft rows:
- `var(--color-accent-light)` background
- 3px left border in `var(--color-accent)`
- "NUEVO" badge in accent
- Solid accent ✓ button (disabled until name is filled), ghost ✗ button
- Slides in with `animate-slide-in`
- Enter saves, Escape cancels

`Table` component extended with `prependRow?: React.ReactNode` (renders before data rows, inside `<tbody>`) for perfect column alignment.

## Build
`npm run build` exits 0.
