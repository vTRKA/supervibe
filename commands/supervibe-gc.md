---
description: >-
  Use WHEN cleaning stale completed epics, archived work-item graphs, superseded
  memory, low-confidence old learnings, or project-memory clutter TO run the
  reversible Supervibe garbage-collection preview or apply flow.
---

# /supervibe-gc

Runs local, reversible cleanup for Supervibe work items and project memory.
Default mode is dry-run. Applying cleanup requires an explicit `--apply`.

## Invocation

```bash
/supervibe-gc --work-items
/supervibe-gc --memory
/supervibe-gc --all
/supervibe-gc --work-items --apply
/supervibe-gc --memory --category learnings --apply
/supervibe-gc --memory --restore <memory-id>
/supervibe-gc --work-items --restore <graph-id>
```

Equivalent local commands:

```bash
npm run supervibe:gc -- --all --dry-run
npm run supervibe:gc -- --memory --restore <memory-id>
npm run supervibe:gc -- --work-items --restore <graph-id>
npm run supervibe:work-items-gc -- --dry-run
npm run supervibe:memory-gc -- --dry-run
npm run supervibe:memory-gc -- --restore <memory-id>
```

## Policy

Work-item GC archives completed or closed epics after the retention window.
Open stale epics are reported separately and only become candidates with
`--include-stale-open`.

Memory GC archives:

- decisions/solutions only when superseded by an existing memory entry
- patterns when superseded or when all `applies-to` paths are gone
- incidents after retention
- low-confidence learnings after retention

Archives are moved under `.supervibe/memory/**/.archive/` and recorded in JSONL
archive logs. Archived entries are excluded from active memory and work-item
views by default.

## Output Contract

```text
SUPERVIBE_WORK_ITEM_GC
SCANNED: <n>
CANDIDATES: <n>
ACTIVE: <n>

SUPERVIBE_MEMORY_GC
SCANNED: <n>
CANDIDATES: <n>
ACTIVE: <n>
```

Confidence: N/A    Rubric: read-only-research

## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
