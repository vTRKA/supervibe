# Full Flow Task Graph Plan

Critical path: T1 -> T2

## Task 1: Build task graph source of truth

**Files:**
- Test: `tests/task-graph-full-flow.test.mjs`

**Rollback:** revert task graph source-of-truth changes.

**Acceptance Criteria:**
- A reviewed plan creates a durable work-item graph.
- The loop can execute from the graph without flat-plan fallback.

```bash
node --test tests/task-graph-full-flow.test.mjs
```

## Task 2: Validate production completion

**Files:**
- Test: `tests/task-graph-full-flow.test.mjs`

**Rollback:** revert completion validation changes.

**Acceptance Criteria:**
- Dry-run evidence cannot close production completion.
- Production evidence allows the epic close gate to pass.

```bash
node --test tests/task-graph-full-flow.test.mjs
```
