# CLAUDE.md

ERP for a hair salon. Replaces Excel. Core value: FIFO inventory costing so each sale reflects the real lot cost.

This is an MVP. No automated tests. `npm run build` is the validation gate.

---

## Commands

```bash
npm run dev       # dev server with HMR
npm run build     # tsc + vite build — must exit 0 before any task is done
npm run lint      # eslint on all .ts/.tsx
```

---

## Working by phases

- Check `PROJECT_STATE.md` and the most recent `PHASE_N_SUMMARY.md` before starting anything.
- Work only within the current phase's scope. Document out-of-scope items — do not implement them.
- If a task is too large, propose how to split it first.
- When a phase closes: `npm run build` passes, user validates manually, then write `PHASE_N_SUMMARY.md` and update `PROJECT_STATE.md`.

**Current phase: 5** — Reports (gross profit per product, inventory valuation).

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
`src/components/ui/`: Button, Input, Select, Modal, Badge, Table. Do not introduce third-party form or table libraries. Style with `var(--color-*)` CSS custom properties — never raw Tailwind color classes like `bg-green-500`.

### Business logic
- **FIFO**: Postgres RPC `consume_inventory_fifo` (SECURITY DEFINER). Call via `supabase.rpc(...)`. Never replicate in frontend.
- **Stock**: computed in `useProducts` by summing `inventory_lots.remaining_quantity`. No `stock` column on `products`.
- **sale_items** rows are immutable — no edit UI, no update policy.

---

## How to validate manually (no automated tests)

```bash
npm run build   # zero errors
npm run dev     # then verify in browser:
```

- `/login` — auth works, redirects correctly
- `/transactions` — list loads, create/edit modal works
- `/suppliers` — CRUD works
- `/purchase-orders` — create PO, receive it, stock increases on `/inventory`
- `/inventory` — stock correct, lot drawer opens, sale decrements stock

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

## Rules

- **No over-engineering.** Build the minimum that satisfies the current phase. No abstractions for hypothetical future needs.
- **Respect scope.** If it's not in the current phase, document it and stop.
- **Prefer small, verifiable changes.** One concern per commit. Validate with `npm run build` after every non-trivial change.
- **No empty catch blocks.** Throw or surface every error.
- **No dead code.** Remove unused variables, functions, and imports after every change.
