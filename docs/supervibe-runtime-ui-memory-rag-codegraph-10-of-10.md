# Supervibe Runtime UI, Memory, RAG, and CodeGraph Hardening

This document records execution contracts for the active 10/10 hardening plan:

`.supervibe/artifacts/plans/2026-05-12-supervibe-runtime-ui-memory-rag-codegraph-10-of-10.md`

Related design handoff: [Supervibe UI Redesign Brief](supervibe-ui-redesign-brief.md).

## Command Router Preflight Contract

Every future execution wave for a command-like user request must start with command router evidence before project retrieval or source inspection:

```bash
node scripts/supervibe-commands.mjs --match "<user request>"
```

The controller must preserve the matcher output in the task evidence. At minimum, evidence records these fields when present:

- `INTENT`
- `HARD_STOP`
- `DO_NOT_SEARCH_PROJECT`
- `COMMAND`
- `NEXT`

If the matcher emits `INTENT: missing_slash_command` or `HARD_STOP: true`, that result blocks project memory, Code RAG, CodeGraph, and source search. The only allowed next action is to report the missing command or hard stop to the user and stop.

If the matcher emits `DO_NOT_SEARCH_PROJECT: true`, broad source search is blocked. The controller may only perform memory, RAG, or CodeGraph lookup when the resolved command contract or printed `NEXT` action explicitly asks for bounded readiness, verification, or command-specific evidence.

If the matcher emits `MATCH: none`, the controller may continue with normal workflow routing, but the no-match output still becomes part of the execution evidence so later reviewers can prove command routing was attempted first.

Task `T00` owns this contract. Later user-gate tasks may add stronger runtime state and UI receipts, but they must not weaken this preflight order.

## Current Audit Evidence Baseline

Task `T01` owns this baseline. It records the current problem set before later tasks mutate workflow state, UI projections, memory, RAG, CodeGraph, receipts, provider config, or release proof.

### Reproduced Contradictions

- **doc-only NEXT_STEP_HANDOFF baseline:** questions written only into Markdown are not enough. A handoff block can name choices while the user receives truncated or contextless questions, and no active workflow state proves the pending user decision exists.
- **strict-readiness contradiction baseline:** maturity score can diverge from strict readiness when docs, receipts, Code RAG, CodeGraph, UI status, or task graph evidence drift after a plan review or atomization repair.

### Required Evidence Commands

Run these commands before any 10/10 readiness claim for this plan:

```bash
node scripts/search-memory.mjs --query "NEXT_STEP_HANDOFF loop UI memory RAG CodeGraph receipts provider config 10 of 10" --limit 10
node scripts/search-code.mjs --context "NEXT_STEP_HANDOFF active workflow question choices loop UI RAG memory CodeGraph blocked by provider config doctor receipt drift" --limit 20
node scripts/search-code.mjs --impact "active workflow user question handoff persistence" --depth 2
node scripts/search-code.mjs --impact "supervibe ui kanban work items rag memory codegraph maps" --depth 2
node scripts/search-code.mjs --impact "loop atomization scheduler receipts provider config" --depth 2
node scripts/supervibe-status.mjs
node scripts/workflow-receipt.mjs recovery-status
npm run validate:workflow-receipts
node scripts/supervibe-loop.mjs --status --file .supervibe/memory/work-items/epic-supervibe-runtime-ui-memory-rag-codegraph-10-of-10-implementation-plan-fc69f6/graph.json --no-auto-ui
node scripts/supervibe-loop.mjs --readiness --plan .supervibe/artifacts/plans/2026-05-12-supervibe-runtime-ui-memory-rag-codegraph-10-of-10.md --no-auto-ui
```

The baseline is valid only when command routing, memory, Code RAG, CodeGraph, receipt recovery, workflow status, and readiness evidence are all current for the same active plan and graph.

## Final Runtime 10/10 Proof Contract

Task `T56` owns the final proof entrypoints. Child tasks and epic workers run only targeted commands from their work-item verification policy. The full repository check is a release gate and must not run inside every child task.

Targeted proof command:

```bash
npm run supervibe:runtime-10of10-targeted
```

Release proof command:

```bash
npm run supervibe:runtime-10of10-proof
```

The targeted proof runs user-gate, UI, memory, RAG, CodeGraph, loop scheduler, provider config, plan lifecycle, receipt bridge, active plan-review, command-agent enforcement, command-agent strict readiness, and explicit maturity gates. The release proof runs the targeted proof first and only then runs:

```bash
npm run check:release
```

`check:release` is intentionally mapped to the stricter release gate (`check:release-strict`) so final proof includes strict release validation, token budget, full `npm run check`, trusted epic completion, and task-graph runtime maturity. This strict chain is release-only and must not be used by ordinary child task workers.

`node scripts/supervibe-agent-maturity.mjs --runtime-10of10-proof` must print `SUPERVIBE_RUNTIME_10_OF_10_PROOF`, `REFUSES_10_OF_10_WHEN_MISSING: true`, the required evidence categories, and the release check command. A 10/10 claim is invalid while strict readiness, receipts, memory, RAG, CodeGraph, UI evidence, command-agent readiness, or maturity evidence is missing.

## Final Missed-Item Audit Matrix

Task `T57` owns this final audit matrix. It maps every original user-reported issue, provider-docs reviewer blocker, and current-session regression to task ownership, prevention rule, and targeted verification. Full `npm run check` stays reserved for the release gate after all work items are closed.

### Original User-Reported Bugs

| User-reported issue | Owning tasks | Prevention rule | Targeted verification |
| --- | --- | --- | --- |
| doc-only user handoff questions created truncated, contextless prompts instead of real runtime questions. | T02, T03, T04, T05, T06 | Next-step handoffs must persist as active workflow state with title, reason, choices, answer receipt, and validator rejection for Markdown-only gates. | `node --test tests/supervibe-active-workflow-user-gates.test.mjs` |
| Loop run tab empty. | T09, T10, T11, T19 | Loop run UI must autoload active state, show empty/loading/error states, and have browser smoke coverage. | `node --test tests/supervibe-ui-loop-run.test.mjs tests/supervibe-ui-browser-smoke.test.mjs` |
| Memory, RAG, and CodeGraph sparse or misleading, making agents weak. | T21-T39, T45A, T56 | Knowledge surfaces must expose source-backed health, golden queries, evidence packets, query-centered graph maps, and strict retrieval telemetry. | `node --test tests/supervibe-memory-quality.test.mjs tests/supervibe-rag-quality.test.mjs tests/supervibe-codegraph-quality.test.mjs`; `npm run supervibe:agent-retrieval-health -- --strict` |
| Work Items and Kanban overloaded with diagnostic text instead of compact epic/task titles. | T12, T13, T14, T15 | Default board payloads show compact epic/task identity; diagnostics move to detail drawer and history. | `node --test tests/supervibe-ui-compact-work-items.test.mjs` |
| Kanban showed blocked by done dependency after the blocker was already Done. | T16 | Resolved dependencies are hidden from active blockers and retained only as detail history. | `node --test tests/supervibe-ui-compact-work-items.test.mjs` |
| Supervibe UI needed designer-level redesign for comfortable daily work. | T20 | Design brief must define a cozy workbench, compact board, diagnostics separation, and no framework rewrite. | `node --test tests/supervibe-docs-links.test.mjs` |
| Agents must not run full tests per epic or task; full checks only after all epics finish. | T45, T46, T56 | Assignment payloads carry task-local verification only; release proof alone may call `npm run check:release`. | `node --test tests/supervibe-loop-scheduler.test.mjs`; `node scripts/supervibe-agent-maturity.mjs --runtime-10of10-proof --skip-release-check` |
| Atomization must group related tasks into real epics instead of turning every task into an epic. | T40, T41 | Semantic epic grouping and task-budget policy must preserve task ids, collapse checklist steps, and reject oversized graphs. | `node --test tests/supervibe-loop-scheduler.test.mjs tests/supervibe-plan-to-work-items.test.mjs` |
| Loop should use maximum safe agents but prevent stalls and write conflicts. | T42, T43, T44, T48 | Scheduler respects provider limits, write-set locks, heartbeat, stale recovery, and session ownership. | `node --test tests/supervibe-loop-scheduler.test.mjs` |
| Before loop execution, users need counts of epics and tasks. | T17 | Pre-loop summary reports epic/task counts without mutation or execution. | `node --test tests/supervibe-loop-scheduler.test.mjs` |
| Receipt drift left artifacts red after legitimate edits. | T47, T55C, T56 | Receipts are repaired only through runtime `reissue`, `prune-stale --apply`, `rebuild-ledger`, recovery status, and Codex spawn-id registration. | `npm run validate:workflow-receipts`; `node scripts/workflow-receipt.mjs recovery-status` |
| provider config power should use official docs and safe per-provider config templates. | T49, T49A, T50, T51, T52, T53, T54, T55, T55A | Provider configs are manifest-driven, source-dated, preview-only, redacted, and risk-labeled across Codex, Claude Code, Gemini CLI, Cursor, and OpenCode. | `node --test tests/supervibe-provider-config-doctor.test.mjs` |

### Reviewer And Session Regression Closure

| Finding or regression | Owning tasks | Closure evidence | Status |
| --- | --- | --- | --- |
| Provider-docs review major findings: phase task budget, lifecycle gate before atomization, stale review artifact replacement, and atomization ordering before scheduler execution. | T41, T55B, T55C, T56, T57 | Review artifact `2026-05-12-supervibe-runtime-ui-memory-rag-codegraph-10-of-10-zz-provider-docs-review.md`; `node scripts/validate-plan-review-artifacts.mjs --plan .supervibe/artifacts/plans/2026-05-12-supervibe-runtime-ui-memory-rag-codegraph-10-of-10.md --require-active-review`. | Resolved; 0 critical and 0 major open. |
| old plans archived or excluded from default active-source so agents receive only the current plan. | T55B, T57 | `node --test tests/supervibe-plan-lifecycle.test.mjs`; status must expose current active plan and archive action. | Covered by lifecycle guard. |
| Codex spawn id receipt recovery must not require hand-written receipts. | T55C, T56 | `node --test tests/workflow-receipt-runtime.test.mjs`; `agent-invocation.mjs log --issue-receipt` path records host invocation ids. | Covered by receipt bridge. |
| redaction status repair in evidence ledger must not leave old failed entries as permanent blockers. | T56, T57 | `node --test tests/agent-tool-use-gates.test.mjs`; `node scripts/audit-evidence-citations.mjs --repair-redaction-status --apply`; `npm run supervibe:agent-retrieval-health -- --strict`. | Resolved with append-only repair entries. |
| Non-active Codex logical fallback roles blocked strict command-agent proof even when runtime receipts were trusted. | T56, T57 | `node --test tests/agent-only-policy.test.mjs`; `node scripts/command-agent-plan.mjs --strict --command /supervibe-audit`; `npm run validate:command-agent-enforcement`. | Resolved; active scoped flows still require scoped receipts. |
| Code RAG and CodeGraph can become stale after final source edits. | T39, T56, T57 | `node scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health --no-embeddings`. | Resolved before T57 close. |

No open T57 blockers remain before final release verification. The only intentionally pending gate after T57 is the release-only full check: `npm run check:release`.

## Memory Entry Schema Contract

Task `T21` owns the new-entry schema gate. New durable memory entries must include `id`, `type`, `date`, `tags`, `agent`, `confidence`, `sourceArtifact`, `owner`, `freshness`, and `relationships` in frontmatter so retrieval can explain source, ownership, confidence, freshness, tags, and cross-artifact links.

Legacy entries remain readable by search and indexing, but new entries can be checked before promotion with:

```bash
node scripts/search-memory.mjs --validate-entry .supervibe/memory/<type>/<entry>.md
```
