---
description: >-
  Use WHEN cleaning stale completed epics, archived work-item graphs, superseded
  memory, low-confidence old learnings, stale receipt archives, runtime logs, or
  .supervibe clutter TO run the reversible Supervibe garbage-collection preview
  or apply flow.
last-verified: "2026-05-17"
---

# /supervibe-gc

Runs local, reversible cleanup for Supervibe work items, project memory, and
runtime/artifact noise under `.supervibe`.
Default mode is dry-run. Applying cleanup requires an explicit `--apply`.
Session start also has a detached auto-GC lane: when retention is due, it queues
`node scripts/supervibe-auto-gc-maintenance.mjs --run-once` in the background,
applies only auto-safe memory/artifact/snapshot cleanup, uses lock/throttle state,
and never archives active work graphs or the latest artifact snapshot. Disable with
`SUPERVIBE_AUTO_GC=off`.

## Invocation

```bash
/supervibe-gc --work-items
/supervibe-gc --memory
/supervibe-gc --artifacts
/supervibe-gc --all
/supervibe-gc --work-items --apply
/supervibe-gc --memory --category learnings --apply
/supervibe-gc --artifacts --scheduled --auto --apply
/supervibe-gc --artifacts --workflow-artifact-retention-days 90
/supervibe-gc --snapshots --dry-run
/supervibe-gc --snapshots --apply
/supervibe-gc --lifecycle --mode dry-run
/supervibe-gc --lifecycle --mode review
/supervibe-gc --lifecycle --mode auto-safe
/supervibe-gc --memory --restore <memory-id>
/supervibe-gc --work-items --restore <graph-id>
```

Equivalent local commands:

```bash
npm run supervibe:gc -- --all --dry-run
npm run supervibe:gc -- --artifacts --scheduled --dry-run
npm run supervibe:gc -- --artifacts --scheduled --auto --apply
npm run supervibe:gc -- --artifacts --dry-run --workflow-artifact-retention-days 90
npm run supervibe:gc -- --snapshots --dry-run --snapshot-max-bytes 52428800
npm run supervibe:gc -- --snapshots --apply
npm run supervibe:gc -- --lifecycle --mode dry-run
npm run supervibe:gc -- --artifacts --dry-run --archive-keep-last 5
npm run supervibe:gc -- --memory --restore <memory-id>
npm run supervibe:gc -- --work-items --restore <graph-id>
npm run supervibe:work-items-gc -- --dry-run
npm run supervibe:memory-gc -- --dry-run
npm run supervibe:memory-gc -- --restore <memory-id>
node scripts/supervibe-auto-gc-maintenance.mjs --status
node scripts/supervibe-auto-gc-maintenance.mjs --run-once --dry-run
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

Artifact GC archives stale or noisy runtime outputs that should not be active
agent context:

- stale workflow receipt archives under `.supervibe/memory/workflow-receipts-stale/`
- preview/server logs and preview runtime state
- backup files such as `.bak`
- old unreferenced `.supervibe/artifacts/_agent-outputs/*` folders
- old untrusted `.supervibe/artifacts/_workflow-invocations/**` receipt files after workflow-artifact retention
- old temporary workflow invocation folders that are not active roots and do not contain trusted receipts

Trusted receipt-linked agent outputs, code DBs, memory DBs, ledgers, invocation logs, and
the receipt runtime key are reported as active runtime/cache noise and are not
auto-archived by artifact GC. Untrusted workflow receipts are retained while recent, then become
auto-safe archive candidates after `--workflow-artifact-retention-days` unless an active root still protects them.

Artifact snapshot retention removes old manual/safety snapshot directories under
`.supervibe/memory/artifact-snapshots/` when count, age, or byte budgets are
exceeded. The canonical latest snapshot from `latest.json` is protected.

Archives are moved under `.supervibe/memory/**/.archive/` and recorded in JSONL
archive logs for memory/work-items, or under `.supervibe/.archive/` for artifact
noise. Archived entries are excluded from active memory and work-item views by
default.


Cleanup lifecycle adds a reachability-first layer above low-level GC:

- active roots stay hot and remain in current workflow context
- trusted receipts, receipt-linked outputs, compact manifests, compact blobs, ledgers, and runtime keys are protected
- completed work graphs can leave hot context after a configurable 0-24 hour grace period
- archivable, cold, trash, and unclassified lifecycle classes are excluded from default context unless history mode is explicit
- archive budgets support retention age, max bytes, keep-last-N, and protected provenance exceptions
- manual apply is two-phase only: dry-run evidence first, then an exact action manifest and explicit apply approval
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

SUPERVIBE_ARTIFACT_GC
SCANNED: <n>
CANDIDATES: <n>
AUTO_SAFE: <true|false>
AUTO_SAFE_CANDIDATES: <n>
ACTIVE_NOISE: <n>

SUPERVIBE_ARTIFACT_GC_POLICY
DUE: <true|false>
INTERVAL_DAYS: <n>
CANDIDATES: <n>
AUTO_SAFE_CANDIDATES: <n>

SUPERVIBE_ARTIFACT_SNAPSHOT_RETENTION
SNAPSHOTS: <n>
BYTES: <n>
CANDIDATES: <n>
PROJECTED_BYTES: <n>
```

Confidence: N/A    Rubric: read-only-research

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-gc` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, `AGENT_SELECTION_MODE`, required agents, `REQUIRED_AGENT_SOURCES`, `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, `MISSING_CALLABLE_AGENTS`, and durable-write permission before any agent-owned artifact is produced. Role sources must distinguish definition availability from host-callable availability: `REQUIRED_AGENT_SOURCES` may include `plugin-only`, but `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, and `MISSING_CALLABLE_AGENTS` decide whether the selected host can actually invoke the role. Plugin-only definitions are not enough for a real-agent completion claim.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. For active workflows, build the plan with `--active --slug <slug> --handoff-id <handoff-id>`; `SCOPED_RECEIPT_GATE` must be trusted for the current run before durable agent-owned outputs are allowed. Old global receipts are diagnostic only and do not unlock a new command/handoff. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Scoped current-run receipts are required for active command/handoff claims; old global receipts are diagnostic only and cannot authorize a new agent-owned output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
