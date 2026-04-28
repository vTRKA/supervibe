---
description: >-
  Promote approved prototype handoff bundle to production stack. Reads
  prototypes/<slug>/handoff/, dispatches stack-developer to wire up tokens +
  components into the chosen framework. Includes pre-deploy validation +
  rollback. Triggers: 'deploy prototype', 'промоут в прод', 'wire to stack',
  'production handoff', '/evolve-deploy'.
---

# /evolve-deploy

Promote an approved prototype's handoff bundle into the project's production stack. Closes the design-pipeline loop: `/evolve-design` → approval → handoff/ → **`/evolve-deploy`** → production code in your framework.

This command does NOT replace the stack-developer's work — it dispatches the right developer with the right context (tokens, components, viewport spec, adapter hints). The developer integrates into the actual codebase.

## Pre-deploy invariants (HARD GATES)

These MUST hold before deployment proceeds:

1. **Approval marker exists**: `prototypes/<slug>/.approval.json` with `status: "approved"`.
2. **Handoff bundle complete**: `prototypes/<slug>/handoff/` contains README.md + components-used.json + tokens-used.json + viewport-spec.json + stack-agnostic.md + (target-specific adapter file if non-web).
3. **Design system approved**: `prototypes/_design-system/manifest.json` with `status: "approved"` AND its `versionSha` matches the prototype's `designSystemVersion`.
4. **No drift**: handoff bundle's tokens/components match current `_design-system/` (no design-system edits after approval that haven't propagated).
5. **Target stack has a developer agent**: e.g., `target: "web"` + project is Next.js → `nextjs-developer` exists.
6. **Target codebase clean** (no uncommitted changes that would mix with deployment).

If any invariant fails → command stops with explicit reason + suggested fix.

## Invocation forms

### `/evolve-deploy <prototype-slug>` — explicit

Examples:
- `/evolve-deploy landing-fintech-2026`
- `/evolve-deploy onboarding-flow`

### `/evolve-deploy` — auto-detect

Lists approved-but-not-deployed prototypes (those with `.approval.json` but no `.deployed.json`). User picks.

### `/evolve-deploy --dry-run <slug>` — invariants check only

Runs the 6 hard gates without dispatching deployment. Reports pass/fail per invariant. Use to verify "is this ready to deploy?" before committing.

### `/evolve-deploy --plan <slug>` — produce deployment plan

Generates an implementation plan (uses `evolve:writing-plans` skill) for the deployment work — what files in production will change, what tokens will be added, what components will be created. User reviews the plan before actual deployment via `/evolve-execute-plan <plan-path>`.

### `/evolve-deploy --rollback <slug>` — revert deployment

Reads `.deployed.json` for the slug. Reverts the deployment commit(s). Used if production code post-deploy fails review.

## Procedure

### 1. Resolve slug

a. If `<slug>` given → use it.
b. If no args → glob `prototypes/*/.approval.json` where status="approved" AND `prototypes/<slug>/.deployed.json` does NOT exist. List them; user picks.
c. If none → "No approved-but-not-deployed prototypes. Run `/evolve-design` first."

### 2. Run pre-deploy invariants (the 6 HARD GATES)

```
=== Pre-deploy invariants check ===
[1/6] Approval marker exists                      ✓
[2/6] Handoff bundle complete                     ✓
      - README.md           ✓
      - components-used.json ✓
      - tokens-used.json    ✓
      - viewport-spec.json  ✓
      - stack-agnostic.md   ✓
      - extension-adapter.md ✓ (target=chrome-extension)
[3/6] Design system approved + version match      ✓
[4/6] No design-system drift since approval       ✓
[5/6] Target stack developer available            ✓ (chrome-extension-developer)
[6/6] Target codebase clean                       ✓ (git status empty)

All invariants pass — ready to deploy.
```

If any FAIL → print specific issue + suggested fix:
- Approval missing → `/evolve-design` Stage 7-8
- Handoff incomplete → re-run `evolve:prototype-handoff` skill
- DS drift → re-run handoff bundle generation
- Target stack missing → run `/evolve-genesis` or install relevant stack-pack
- Codebase dirty → commit/stash production changes first

### 3. Determine target stack

Read `prototypes/<slug>/config.json` for `target` field:
- `web` → infer production framework from project (Next.js / Vue / vanilla / etc.) via `evolve:stack-discovery`
- `chrome-extension` → dispatch `chrome-extension-developer`
- `electron` → dispatch electron-developer (currently delegated; may need to create)
- `tauri` → similar
- `mobile-native` → dispatch RN/Flutter/iOS/Android developer based on production stack

### 4. Generate deployment plan (if `--plan` or interactive default)

Use `evolve:writing-plans` skill with input:
- Handoff bundle as source-of-truth
- Production codebase paths from `evolve:stack-discovery`
- Tokens to add → which file in production (e.g., `tokens.css` → `app/styles/tokens.css`)
- Components to create/extend → directory structure
- Viewport spec → responsive breakpoints in production
- Stack-specific adapter hints → which library APIs to use

Output: `docs/plans/2026-XX-XX-deploy-<slug>.md` with phased TDD tasks.

### 5. Execute via `/evolve-execute-plan`

Pass the deploy plan path:
```
/evolve-execute-plan docs/plans/2026-XX-XX-deploy-<slug>.md
```

This invokes the full Stage A (readiness) + execution + Stage B (completion) flow with 10/10 gates.

### 6. Persist deployment record

`.claude/memory/decisions/deployments.md` (append):
```markdown
## <slug> deployed
Date: <ISO>
Approved at: <approval-date>
Production stack: <stack>
Plan: docs/plans/<plan>.md
Stack-developer: <agent>
Commit(s): <SHAs>
Tokens added: <count>
Components created: <count>
Status: success | partial | reverted
```

`prototypes/<slug>/.deployed.json` (mark as shipped):
```json
{
  "deployedAt": "<ISO>",
  "deployedBy": "<user>",
  "productionStack": "<stack>",
  "planPath": "docs/plans/<plan>.md",
  "commits": [ "<sha>", ... ],
  "rollbackProcedure": "/evolve-deploy --rollback <slug>"
}
```

### 7. Suggest follow-ups

- Run `/evolve-test` to verify production tests still pass.
- Run `/evolve-evaluate` on the deployed work for telemetry.
- Schedule a post-deploy review via `/schedule` (e.g., "in 1 week, audit if production matches design").

## Rollback procedure

When user runs `/evolve-deploy --rollback <slug>`:

1. Read `prototypes/<slug>/.deployed.json` for the commit SHAs.
2. Verify SHAs are still in git history (not garbage-collected).
3. Run: `git revert <sha-1> <sha-2> ...` (in reverse order, each as separate commit).
4. Verify production tests still pass: `/evolve-test`.
5. Update `.deployed.json`:
   ```json
   { "rolledBackAt": "<ISO>", "rollbackReason": "<text>", "originalDeploy": { ... } }
   ```
6. Update `.claude/memory/decisions/deployments.md`: status → reverted.

## Error recovery

| Failure | Recovery action |
|---|---|
| Slug not approved | Print: "Run `/evolve-design <brief>` to get prototype approved first." |
| Handoff bundle incomplete | Print missing files; re-run `evolve:prototype-handoff` skill |
| DS drift detected | Re-generate handoff: `evolve:prototype-handoff --slug <slug>`; verify; re-attempt |
| Target stack-developer missing | List available developers; suggest `/evolve-genesis` to add stack-pack |
| Production codebase dirty | Print dirty files; suggest stash/commit |
| Plan execution fails (Stage A < 10) | Plan-quality issue; report gaps; user iterates plan or overrides |
| Plan execution fails (Stage B < 10) | Partial deployment; offer rollback OR forward-fix |
| Rollback git revert conflicts | Print conflict files; manual resolution required (no auto-merge) |

## Output contract

```
=== Evolve Deploy ===
Prototype:    landing-fintech-2026
Approval:     2026-04-25 (3 days ago)
Target:       web (production: Next.js detected)
Stack-developer: nextjs-developer

Pre-deploy invariants: 6 / 6 ✓

Deployment plan: docs/plans/2026-04-28-deploy-landing-fintech-2026.md
  Phases: 4
  Tasks: 23
  Files affected: 17 created, 4 modified

Execution: /evolve-execute-plan docs/plans/2026-04-28-deploy-landing-fintech-2026.md

Stage A (readiness): 10/10 ✓
[execution log]
Stage B (completion): 10/10 ✓

Deployment record: prototypes/landing-fintech-2026/.deployed.json
Memory: .claude/memory/decisions/deployments.md (appended)

Follow-ups:
  • /evolve-test (production tests)
  • /evolve-evaluate (telemetry)
  • /schedule "audit deploy match in 1 week"
  • /evolve-deploy --rollback landing-fintech-2026 (if needed)
```

## When NOT to invoke

- Prototype not yet approved (status ≠ "approved" in `.approval.json`).
- Production codebase doesn't yet exist (use `/evolve-genesis` to scaffold first).
- For one-off mockups not intended for production.
- For brand exploration / mood-boards — those don't need deployment.
- When project is in a freeze period (read `.claude/memory/decisions/` for freeze announcements).

## Related

- `/evolve-design` — produces what this consumes
- `evolve:prototype-handoff` skill — produces the handoff bundle
- `evolve:writing-plans` skill — generates deployment plan
- `/evolve-execute-plan` — runs the deployment with 10/10 gates
- `/evolve-evaluate` — telemetry after deploy
- `/evolve-genesis` — if production codebase missing
- `agents/stacks/<stack>/<stack>-developer.md` — the developer dispatched
- `prototypes/<slug>/.deployed.json` — deployment record (this command writes)
