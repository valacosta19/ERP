# Phase 1 — Continuity Summary

## What was completed
- Project scaffolded with **Vite + React + TypeScript + TailwindCSS + React Router**
- **Supabase** client configured (`src/lib/supabaseClient.ts`) with typed `Database` generic
- DB migration created: `supabase/migrations/001_initial_schema.sql` — all tables, indexes, RLS, FIFO RPC, and `handle_new_user` trigger
- **Auth flow**: `useAuth` hook manages session state + profile fetch via `onAuthStateChange`; `signIn` / `signOut` exposed
- **AuthGuard**: redirects unauthenticated users to `/login`; supports `requireAdmin` prop that redirects employees to `/dashboard`
- **AppShell**: fixed sidebar + scrollable main `<Outlet>`
- **Sidebar**: NavLink-based navigation with active state; admin-only items hidden from employees; user name/role + logout at bottom
- **TopBar**: reusable header component with title, optional subtitle, and optional actions slot
- **UI primitives**: `Button`, `Input` (with label/prefix/suffix/error/hint), `Select`, `Modal` (with Escape key + backdrop), `Badge` (5 variants), `Table` (generic typed columns, loading spinner, empty state)
- **LoginPage**: email/password form using `useAuth().signIn`
- All 8 routes wired in `App.tsx` (phases 3–7 pages render placeholder text)
- CSS design tokens via CSS variables (`--color-bg`, `--color-surface`, `--color-accent`, etc.)

## Technical decisions
- **`createClient<Database>`**: typed Supabase client — all `from()` calls are type-safe when the DB schema matches
- **`useAuth` is a hook, not context**: avoids a global provider; each component that needs auth calls it. Works because Supabase's auth listener is a singleton — multiple subscribers get the same event
- **`handle_new_user` trigger**: auto-creates a `profiles` row on `auth.users` INSERT — no manual profile creation needed after sign-up
- **RLS from day one**: all tables have RLS enabled with policies; admin vs employee distinction enforced at DB level
- **FIFO RPC in initial migration**: `consume_inventory_fifo` is deployed from day one even though it's used in Phase 4 — avoids a separate migration later

## What is pending (next phase at the time)
- Phase 2: TransactionsPage, categories management (SettingsPage), DashboardPage KPIs and chart

## What must not break
- `handle_new_user` trigger must not be re-run or duplicated — it's idempotent on re-deploy but duplicating the trigger creates double profile inserts
- `consume_inventory_fifo` RPC is in place — do not alter its signature without updating Phase 4 callers
- RLS policies cover all tables — any new table added in future phases must also have RLS enabled + policies
- `AuthGuard` with `requireAdmin` is used on `/import` and `/settings` — adding new admin routes must follow the same pattern

## Validation commands
```bash
npm run build    # must exit 0
npm run dev      # /login must load; authenticated users redirect to /dashboard
```

## Risks / tech debt
- `useAuth` calls `supabase.from('profiles').select()` on every auth state change — no caching. Fine for MVP, but could be replaced with TanStack Query in a later phase
- No sign-up flow implemented — users must be created manually in Supabase Auth dashboard or via invite
- CSS design tokens are defined inline in `index.css` (or equivalent) — no Tailwind theme extension, so custom colors like `--color-success-light` must be manually kept in sync if the palette changes
