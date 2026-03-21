# Agents — ERP-BO

Project-level subagents for Claude Code. Loaded automatically from `.claude/agents/`.

## Shared conventions

| File | Purpose |
|------|---------|
| `DEFINITION_OF_DONE.md` | Phase completion criteria and task output template. All agents apply this. |

## Active Agents

| Agent | When to use |
|-------|-------------|
| `coordinator` | Starting any non-trivial feature or phase. Multi-area changes. |
| `backend-agent` | Schema migrations, RLS, RPC, hooks, database types. |
| `frontend-agent` | Pages, components, routing, styling. |
| `reviewer-agent` | Code review after implementing a feature or fixing a bug. |
| `bug-agent` | Diagnosing and fixing a specific bug with reproduction steps. |

## Stub Agents (not yet active)

| Agent | When to activate |
|-------|-----------------|
| `devops-agent` | Phase 7 — production polish, CI/CD, env management. |

## How to invoke

In any Claude Code conversation, use the `Agent` tool or reference an agent by name:

```
Use the backend-agent to add the sale_items hook.
Use the reviewer-agent to review the changes in src/hooks/useSales.ts.
Use the bug-agent to fix: TypeError: Cannot read properties of undefined (reading 'id') at SalePage.tsx:42
```

Or let the `coordinator` decompose the task for you:

```
Use the coordinator to implement Phase 5 (Reports page).
```

## Dependency order

When tasks span layers, always follow this order:

1. `backend-agent` — schema + hooks
2. `frontend-agent` — UI that consumes those hooks
3. `reviewer-agent` — review the combined result

Never run `frontend-agent` before `backend-agent` when the UI depends on a hook that does not yet exist.
