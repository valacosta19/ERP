# CLAUDE.md

ERP for a hair salon. Replaces Excel. Core value: FIFO inventory costing so each sale reflects the real lot cost.

This is an MVP. `npm run build` is the validation gate; `npm run test` (Vitest) covers the pure logic of Carga Rápida and transaction groups.

---

## Commands

```bash
npm run dev       # dev server with HMR
npm run build     # tsc + vite build — must exit 0 before any task is done
npm run lint      # eslint on all .ts/.tsx
npm run test      # vitest — unit tests in src/**/*.test.ts, component tests in *.test.tsx (jsdom + Testing Library)
```

---

## Working by phases

- Check `PROJECT_STATE.md` for the current phase scope.
- **Before touching a feature**: read its section in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — it lists the files, tables/RPCs and invariants for that module.
- Work only within the current phase's scope. Document out-of-scope items — do not implement them.
- If a task is too large, propose how to split it first.
- When a phase closes: `npm run build` passes, user validates manually, then update `PROJECT_STATE.md` (add a one-line entry to the "Fases completadas" table) and update the affected module section in `docs/ARCHITECTURE.md` (new invariants, new files, changed tables). Do NOT create `PHASE_N_SUMMARY.md` — git log is the change history.
- After every commit: review whether `PROJECT_STATE.md` or `docs/ARCHITECTURE.md` need to reflect new changes.

**Current phase: 28** — See `PROJECT_STATE.md` for current scope.

---

## Architecture

### Data layer
All DB access via `src/lib/supabaseClient.ts` (`createClient<Database>`). Types in `src/types/database.ts` — must stay in sync with migrations.

Hooks in `src/hooks/`: one `useX` query + one hook per mutation (`useCreateX`, `useUpdateX`, `useDeleteX`). Mutations call `queryClient.invalidateQueries` on success. No service layer.

**Known quirk — `@supabase/supabase-js` 2.99 + TS 5.9**: every table in `database.ts` must include `Relationships: []` or insert/update types infer as `never`. Join queries return `SelectQueryError` — cast with `as unknown as TargetType`.

### Auth
`useAuth` manages session + profile via `onAuthStateChange`. No React context. `AuthGuard` wraps protected routes; `<AuthGuard requireAdmin>` for admin-only routes.

### Routing
All routes in `src/App.tsx`. Protected routes nested inside `AuthGuard > AppShell`.

### UI primitives
`src/components/ui/`: Button, Input, Select, Modal, Badge, Table, Toaster, ConfirmHost. Do not introduce third-party form or table libraries. Never use native `alert()`/`confirm()`: use `showToast()` (`src/lib/toast.ts`) and `confirmDialog()` (`src/lib/confirm.ts`); mutation errors already surface globally via the `MutationCache` in `App.tsx`. Style with `var(--color-*)` CSS custom properties — never raw Tailwind color classes like `bg-green-500`.

### Business logic
- **FIFO**: Postgres RPC `consume_inventory_fifo` (SECURITY DEFINER). Call via `supabase.rpc(...)`. Never replicate in frontend.
- **Stock**: computed via `products_with_stock` view (sum of `inventory_lots.remaining_quantity`). No `stock` column on `products`. View must be recreated (DROP + CREATE) when adding columns — `CREATE OR REPLACE` doesn't reorder columns.
- **sale_items** rows are immutable — no edit UI, no update policy.
- **Reorder suggestion**: RPC `suggest_reorder_quantity(product_id, month, year)` — average of same-month historical sales × company growth rate, with fallback to previous month.
- **Purchase orders**: support partial receiving (checklist per product) and proportional shipping cost distribution by item value. Shipping cost is editable inline while PO is in draft.
- **Multicurrency**: transactions carry `currency` (ARS/USD/EUR). Reports convert USD→ARS using dólar blue (cached 30 min from `dolarapi.com`).
- **Service costs**: `service_recipes` link `catalog_items` to `products` with `quantity_grams`. Material cost = Σ(quantity_grams × unit_cost / unit_size). Gross margin in Costos tab = price − materials − commission. Fixed costs deducted at period level in Utilidad tab, not per service. **Registrar un servicio NO descuenta inventario físico** — `service_recipes` solo sirve para calcular el costo teórico del material. El descuento de inventario por producto usado en un servicio se hace manualmente registrando un "Consumo" (subcategoría "Consumos y cortesías", `deducts_inventory=true`), que sí llama `consume_inventory_fifo`. No implementar descuento automático por receta al registrar servicios.
- **Fixed cost history**: `fixed_cost_rates (fixed_cost_id, monthly_amount, effective_from)` — each month's profit report uses the rate with the latest `effective_from ≤ month`. Editing a fixed cost inserts a new rate, never overwrites.
- **Catalog prices**: each `catalog_items` row has `price` (cash), `price_transfer`, `price_card`. Transaction description combobox suggests prices per method.
- **Accounts payable/receivable**: `supplier_debts` (linked to PO with `payment_option: immediate|deferred|none`) and `receivables` (standalone). Payments/collections may optionally link to a transaction.
- **Cortesías y consumos físicos**: la categoría `'Consumos y cortesías'` (`deducts_inventory=true`) es el único mecanismo para descontar físicamente inventario cuando un producto se usa (en un servicio, como regalo, o para el staff). Genera `transactions` expense + llama `consume_inventory_fifo`. **Es la única forma correcta de registrar el uso real de productos** — ni las ventas de servicio ni la edición manual de lotes son el camino. Subcategoría obligatoria: seleccionar el producto del listado (la UI valida esto).
- **Retiros de staff a cuenta de comisión**: empleados pueden retirar producto cuyo costo se les descuenta al liquidar comisión. Se modela como `receivables` con `hairdresser_id + product_id`, disparando FIFO al crear vía RPC `create_staff_receivable` (registra `inventory_movements` con `reference_type='receivable'`, **no** crea `transactions`). La comisión bruta sigue siendo el devengado contable; al liquidar período, la RPC `settle_commission_payout` inserta `receivable_collections` por los retiros aplicados, registra una fila en `commission_payouts` (auditoría: gross/offset/net) y la UI crea un único `transactions` expense por el **neto** (cero impacto en caja/banco/utilidad hasta el pago).
- **AI widget**: floating chat (bottom-right) fed by a cached business snapshot (5 min, 9 parallel queries). Model: Gemini 2.5 Flash via `VITE_GEMINI_API_KEY`. Files: `src/lib/gemini.ts`, `src/lib/buildSystemPrompt.ts`, `src/hooks/useBusinessSnapshot.ts`, `src/components/AIWidget/`.

---

## How to validate manually (no automated tests)

```bash
npm run build   # zero errors
npm run dev     # then verify in browser:
```

- `/login` — auth works, redirects correctly
- `/transactions` — list loads, create/edit inline, balance cards by method+currency
- `/suppliers` — CRUD works
- `/purchase-orders` — create PO (with shipping + reorder suggestion), partial receive, stock increases on `/inventory`
- `/inventory` — stock correct, lot drawer opens inline-editable, sale decrements stock
- `/cuentas` — tabs "Por pagar" y "Por cobrar" (admin only)
- `/reportes` — tabs Financiero, Comisiones (quincenal/detalle), Utilidad, Costos, Valoración

For each phase, verify only the new screens/flows added in that phase.

---

## Subagents

Specialized agents live in `.claude/agents/`. Use them for non-trivial or multi-file work:

| Agent | Use for |
|-------|---------|
| `coordinator` | Phase kickoffs, multi-layer features |
| `backend-agent` | Schema, migrations, hooks, RLS, RPCs |
| `frontend-agent` | Pages, components, routing, forms |
| `reviewer-agent` | Quality review after implementing a feature |
| `bug-agent` | Diagnosing a specific bug with reproduction steps |

For small single-file changes, act directly — do not delegate unnecessarily.

---

## Execution mode

- Agents may make changes without step-by-step confirmation.
- Prioritize flow over micro-validations.
- Ask for confirmation only for:
  - Destructive changes
  - Ambiguous decisions
  - Changes outside the current phase scope

Expected flow: plan → execute → report → validate

---

## Design

Use the `frontend-design` skill whenever adjusting page layout/styling or adding a new UI component.

---

## Commits

Format: `<type>: <description in English, one line, imperative mood>`

Types:
- `feat` — new feature
- `fix` — bug fix
- `refactor` — code change with no behavior change
- `chore` — migrations, config, deps, docs

Examples:
```
feat: add shipping cost to purchase orders with proportional distribution on receive
fix: format sale price with currency symbol and locale in inventory table
chore: add skip_restock column to products table
```

Rules:
- Always in English
- One line, no period at the end
- No multi-line body unless strictly necessary
- `npm run build` must pass before committing
- A versioned pre-commit hook (`.githooks/pre-commit`, wired by the `prepare` script via `core.hooksPath`) runs `npm run test`; a failing suite aborts the commit

---

## Business Rules — Accounting Integrity

- **Soft-delete only.** Transactions must never be hard-deleted. Use a `voided_at` column. Voided transactions remain visible in the list with "Anulada" badge, can be filtered, and are excluded from all reports and balances. Any user can void. Every void is logged in `user_action_logs`.
- **User action log.** A `user_action_logs` table records auditable events (void transaction, unlock period, etc.) with columns: `id, user_id, action, entity, entity_id, metadata jsonb, created_at`.
- **Inventory movements always.** Any change to `inventory_lots.remaining_quantity` (e.g., via LotDrawer) must insert an `adjustment` row in `inventory_movements` with the delta and an optional reason.
- **Lock `unit_cost` when sold.** If a lot has `sale_items` rows referencing it, its `unit_cost` is read-only.
- **Period locking.** A `locked_periods (year, month, locked_at, locked_by)` table prevents creating/editing/voiding transactions in closed months. Enforced at DB level (trigger or RPC check). Lock/unlock is admin-only UI in Settings.
- **Expense category required.** `subcategory_id` is required when `type = 'expense'` in the transaction form (not yet implemented — deferred). Categories are two-level: fixed top-level (Ingresos, Costos, Gastos, Movimientos) + user-defined subcategories managed from Settings. Schema: `transaction_categories (id, name, parent_id nullable)`.
- **Seña exclusion from reports.** Transactions with `is_seña = true` are pure advances and must be excluded from `service_income`, revenue, profit and cost reports. The seña enters the result only when the final service transaction references it via `seña_amount`.
- **Fixed cost history is append-only.** Never overwrite `fixed_costs.monthly_amount` directly for historical integrity — insert a new row in `fixed_cost_rates` with `effective_from`. The column on `fixed_costs` is kept in sync only when the rate applies to today or earlier.
- **Retiros de staff no son gastos.** Un retiro de producto a cuenta de comisión nunca debe registrarse como `transactions` expense; se modela como `receivables` con `hairdresser_id` y se compensa al pagar la comisión. Sólo cortesías puras (sin recupero) van como expense en categoría `'Consumos y cortesías'`. La comisión devengada se registra siempre en bruto; el pago efectivo es por el neto.

---

## Rules

- **No over-engineering.** Build the minimum that satisfies the current phase. No abstractions for hypothetical future needs.
- **Respect scope.** If it's not in the current phase, document it and stop.
- **Prefer small, verifiable changes.** One concern per commit. Validate with `npm run build` after every non-trivial change.
- **No empty catch blocks.** Throw or surface every error.
- **No dead code.** Remove unused variables, functions, and imports after every change.
