---
name: definition-of-done
description: Shared convention for phase completion. All agents must apply this before declaring any task or phase done.
---

# Definition of Done — per phase

A task or phase is done when **all** of the following hold:

## 1. Scope respected
- Only features listed in the current phase were implemented.
- Nothing was built "by default" or "just in case" for a future phase.
- If a future dependency was identified, it is documented — not implemented.

## 2. Build passes
```
npm run build   # must exit 0
npm run lint    # must exit 0
```

## 3. Changes are clear
Every agent that made changes must produce an output with:
- **What was done** — one sentence per change
- **Files touched** — list with one-line description each
- **Risks** — anything that could break or needs attention
- **Pending / next-phase dependencies** — documented only, not implemented
- **How to validate manually** — concrete steps the user can follow in the running app

## 4. No dead weight
- No unused variables, functions, or imports left behind.
- No empty catch blocks.
- No commented-out code.

## 5. User sign-off
The coordinator must ask the user to validate in the running app before writing `PHASE_N_SUMMARY.md` and before any commit.

---

## Template: task output (all agents)

```
## Done: <task name>

### What was done
- <one sentence per change>

### Files touched
- `path/to/file.ts` — <what changed>

### Risks
- <risk or "none">

### Next-phase dependencies (do not implement)
- <dependency or "none">

### How to validate manually
1. <step>
2. <step>
```
