# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (Vite HMR)
npm run build     # tsc -b && vite build  — use this to validate before finishing any task
npm run lint      # eslint on all .ts/.tsx files
```

There are no tests. `npm run build` is the primary validation gate — it must exit 0 before any task is considered done.

## Architecture

### Data layer — Supabase + TanStack Query
All DB access goes through `src/lib/supabaseClient.ts`, a typed `createClient<Database>` instance. The `Database` type lives in `src/types/database.ts` and must be kept in sync with `supabase/migrations/001_initial_schema.sql`.

**Critical quirk with `@supabase/supabase-js` 2.99 + TypeScript 5.9**: every table in `database.ts` must include `Relationships: []` or TypeScript infers the insert/update parameter type as `never`. Join queries (e.g. `select('*, category:categories(*)')`) return a `SelectQueryError` type instead of the joined shape — use `as unknown as TargetType` to cast them.

Each data domain gets its own hook file in `src/hooks/`. Hooks call Supabase directly (no service layer). Mutations call `queryClient.invalidateQueries` on success. The hook files follow the pattern: one `useX` query + one hook per mutation (`useCreateX`, `useUpdateX`, `useDeleteX`).

### Auth
`useAuth` (`src/hooks/useAuth.ts`) manages session + profile state via `supabase.auth.onAuthStateChange`. It is called directly in components that need it — there is no React context wrapper. `AuthGuard` (`src/components/layout/AuthGuard.tsx`) wraps protected routes and accepts a `requireAdmin` prop that redirects employees to `/dashboard`.

### Routing
All routes are defined in `src/App.tsx`. Protected routes are nested inside an `AuthGuard > AppShell` element. Admin-only routes (`/import`, `/settings`) have their own `<AuthGuard requireAdmin>` wrapper.

### UI primitives
`src/components/ui/` contains `Button`, `Input`, `Select`, `Modal`, `Badge`, `Table`. These are the only components to use for forms and tables — do not introduce third-party form/table libraries. All styling uses CSS custom properties (`var(--color-*)`) defined as design tokens; do not use raw Tailwind color classes like `bg-green-500`.

### Business logic
**FIFO inventory**: implemented as a Postgres RPC `consume_inventory_fifo` in the migration. Call it via `supabase.rpc('consume_inventory_fifo', { ... })` — do not replicate this logic in the frontend.

**Stock calculation**: `useProducts` computes current stock client-side by summing `inventory_lots.remaining_quantity` per product. There is no `stock` column on the `products` table — `stock` is a computed field added in the hook.

**Purchase order receive flow**: `useReceivePurchaseOrder` loops per item: insert `inventory_lots` → update `purchase_order_items.lot_id` → insert `inventory_movements`. This is not atomic (no DB transaction). If it fails mid-loop the PO status stays `draft` and the user can retry.

### Development phases
The project is built in phases tracked in `PLAN.md`. Each completed phase has a `PHASE_N_SUMMARY.md` at the root with technical decisions, risks, and what must not break. **Read the most recent phase summary before starting work on the next phase.**

Current state: Phases 1–3 complete. Phase 4 is next (sale of products via FIFO RPC + `sale_items`).
