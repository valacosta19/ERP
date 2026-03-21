# Phase 6 Summary — Excel Import Wizard

## What was built

**Types: `importTypes.ts`**
- `EntityType`: `'categories' | 'suppliers' | 'products' | 'transactions' | 'lots'`
- `ParsedSheet`, `SheetAssignments`, `ColumnMappings`, `ImportResult`

**Logic: `importLogic.ts`**
- `parseWorkbook(file)`: reads `.xlsx` / `.xls` via `xlsx` library, converts all sheets to `ParsedSheet[]` with headers and rows.
- `autoSuggestMapping(headers, entityType)`: fuzzy-matches Spanish/English column header aliases to entity fields.
- `ENTITY_FIELDS`: field definitions (key, label, required) per entity type.
- `ENTITY_LABELS`: display names per entity type.

**Wizard: `ImportPage.tsx`** — 5-step flow with progress indicator

| Step | Component | Responsibility |
|------|-----------|----------------|
| 1 | `StepUpload` | Drag-and-drop or file-picker; calls `parseWorkbook`, advances to step 2 |
| 2 | `StepSheets` | Assign each sheet to an entity type (or skip) |
| 3 | `StepMapping` | Map Excel columns to entity fields per sheet; auto-suggest pre-populated |
| 4 | `StepPreview` | Show first N rows per sheet with mapped fields before committing |
| 5 | `StepImport` | Runs import in entity order: categories → suppliers → products → transactions → lots; deduplicates by `name.toLowerCase()` (categories, suppliers) and `sku` (products); shows per-entity result (inserted / skipped / errors) |

**Import order & deduplication**
- Pre-fetches existing categories, suppliers, and products before processing to build in-memory lookup maps.
- Skips rows that already exist (no upsert — pure idempotent insert with skip).
- Lots resolve product by SKU; missing SKU is recorded as an error, not a fatal abort.

## Validation
- `npm run build` exits 0.
- No new migrations required.
- Route `/import` is admin-only (`<AuthGuard requireAdmin>`).

## Notes
- Import is sequential (row by row), not batched. Acceptable for MVP dataset sizes.
- No rollback on partial failure — if 50 of 100 rows insert before an error, the 50 stay. Acceptable for MVP; atomic import is out of scope.
