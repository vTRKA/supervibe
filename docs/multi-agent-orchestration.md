# Multi-Agent Orchestration

Supervibe can plan bounded execution waves from ready work while keeping worker
and reviewer assignments explainable.

## Capability Registry

Agent matching uses capability profiles instead of hard-coded names. Profiles
describe stack, module type, risk level, test type, UI/browser ability,
integration ability, refactor scope, docs/release-prep support, reviewer
suitability, and worktree support. Local overrides can add project-specific
profiles. Prior outcome signals store task IDs, scores, and outcomes, never raw
prompts.

When matching confidence is low, assignment degrades to manual selection.

## Worker And Reviewer Presets

Built-in worker presets cover implementation, integration, UI, refactor,
documentation, and release-prep work. Reviewer presets cover security,
architecture, verification, and product review. Presets define context packet
shape, allowed write scope, required evidence, forbidden behavior, and review
handoff format.

Reviewer presets cannot review their own worker output. If the best reviewer
would match the worker, the selector falls back to an independent reviewer.

## Wave Controller

Execution waves are built from ready tasks, dependencies, write-set overlap,
risk, reviewer availability, and worktree availability. A wave records max
concurrency, target worktrees, reviewers, verification plan, stop conditions,
and merge/reconcile strategy.

The controller pauses on missing reviewers, stale worktree sessions, blocked
worker claims, policy stops, and write-set conflicts. Serialized tasks include
the reason they were not parallelized.

## Multi-Session Worktrees

One epic can be split across many active worktree sessions when each session has
a declared task/work-item scope and a non-overlapping write set. The session
registry blocks overlap by work item, assigned task, or assigned file path; it
also blocks unscoped sessions on the same epic because they cannot be safely
coordinated. This supports users running one session or ten sessions against the
same plan without agents overwriting each other's zone.

Worktree status output includes each active session's wave, task IDs,
write-set, active agents, and path. Agents use that registry as the shared
ownership map before claiming work, so parallel sessions can see which files and
tasks are already owned.

Registry updates are protected by a local lock and atomic replace write, so
separate CLI processes do not lose each other's session claims. Scope parallel
sessions explicitly:

```bash
/supervibe-loop --epic example-epic --worktree --assigned-task T1 --assigned-write-set src/auth.ts
/supervibe-loop --epic example-epic --worktree --assigned-task T2 --assigned-write-set src/billing.ts
```

`--allow-session-conflict` exists only for maintainer-reviewed overlap. Normal
multi-session work should use disjoint task IDs and write-sets.

## Commands

```bash
/supervibe-loop --plan-waves docs/plans/example.md
/supervibe-loop --assign-ready --explain --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop --setup-worker-presets
/supervibe-status --waves --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-status --assignment task-123 --file .supervibe/memory/loops/<run-id>/state.json
```

Assignment explanations include task type, touched files, module contracts,
semantic anchors, risk, availability, prior outcomes, and policy constraints.
