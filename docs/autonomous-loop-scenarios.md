# Autonomous Loop Scenarios

This document is the implementation contract for `/supervibe-loop`. Every
scenario must produce observable artifacts under `.claude/memory/loops/<run-id>/`
and must stop below the 9/10 confidence gate unless the user explicitly accepts
a partial result.

## Baseline Compatibility Contract

`/supervibe-loop --dry-run --request "validate integrations"` is the pinned
compatibility fixture for future loop refactors. A run must keep writing these
artifacts under `.claude/memory/loops/<run-id>/`:

- `preflight.json`
- `state.json`
- `tasks.jsonl`
- `scores.jsonl`
- `handoffs.jsonl`
- `events.jsonl`
- `side-effects.jsonl`
- `progress.md`
- `final-report.md`

The state file must keep `schema_version`, `command_version`,
`rubric_version`, `plugin_version`, `run_id`, `status`, `tasks`, `scores`,
`handoffs`, `preflight`, `events`, `policy_risk`, `stop_reason`,
`next_action`, and `final_acceptance`. New fields may be added, but existing
fields cannot be removed without a migration.

Status output must keep the `SUPERVIBE_LOOP_STATUS` envelope with `STATUS`,
`EXIT_SIGNAL`, `CONFIDENCE`, `NEXT_AGENT`, `NEXT_ACTION`, `STOP_REASON`, and
`POLICY_RISK`.

Schema upgrades must write `<state-file>.pre-migration` before modifying a
legacy state file. State readers must tolerate unknown future fields so
status/resume flows stay readable across versions.

## Scenario Matrix

| Scenario | Intake | Graph shape | Dispatch chain | Required contract fields | Required evidence | Resume behavior | Stop behavior | Rollback/cleanup |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Plan execution | `--plan docs/plans/x.md` or reviewed plan path | One node per unchecked plan item; dependencies from explicit graph JSON or source order when needed | orchestrator -> implementer -> reviewer | objective, acceptance criteria, verification refs, allowed write scope | plan artifact, task graph, focused tests or recorded test gap, final report | continue from open or requeued nodes; preserve completed nodes | budget, policy, failed verification, invalid graph | restore workspace or document no mutation for dry-run |
| Open validation request | `--request "validate code and fix integration bugs"` | Generated chain: discovery -> dependency -> build -> tests -> integration -> triage -> repair -> review | repo researcher, dependency reviewer, QA, stack developer, quality gate reviewer | objective, generated task IDs, risk level, verification commands | discovery notes, build/typecheck, test output, repair evidence, score | restart at first incomplete dependency-safe node | missing evidence, side-effect reconciliation, no progress | no production mutation; local changes remain inspectable |
| Integration repair | request or PRD story mentioning integration/API/provider | dependency-first graph with access gate before mutation | repo researcher -> stack developer -> QA -> reviewer | integration boundary, access reference, fallback path, contract refs | env/access reference or blocked gate, integration check, rollback note | if access appears later, close gate and resume ready front | missing access, external policy, flaky remote check | disable/revert integration toggle or document blocked state |
| Design to development | design brief, PRD UI story, or plan item with UI surface | design handoff -> prototype/build -> browser evidence -> polish review | designer, prototype builder, stack developer, UI polish reviewer | viewport targets, design tokens, accessibility expectations | preview/browser screenshot or DOM evidence, responsive notes, a11y check | resume from latest approved design/prototype artifact | missing design source, browser evidence absent, accessibility blocker | keep prototype isolated; no production deploy |
| Refactor | request names rename/move/extract/delete or broad code change | graph check -> impact analysis -> implementation -> caller verification -> review | repo researcher, architect reviewer when broad, refactoring specialist, code reviewer | symbol scope, public/private API, file-local contracts | callers/callees, changed files, tests, no missed call sites | resume after impact graph and continue only declared files | undeclared file changes, graph drift, score below gate | revert or isolate changed files; do not delete unknown callers |
| Documentation | docs-only request or README/update plan item | source scan -> doc edit -> command/docs sync -> validation | stack developer -> quality reviewer | docs target, command/version impact, source of truth | docs diff, command docs sync, validation output | resume from changed docs and rerun validators | command drift, version drift, missing README impact | restore docs from backup or leave explicit follow-up |
| Monorepo | request includes packages/apps/workspaces | package graph -> per-package tasks -> integration wave -> review | repo researcher, dependency reviewer, package owner agents, QA | workspace scope, package boundaries, cross-package contracts | package commands, affected graph, integration check | resume package by package; do not repeat complete package tasks | unsupported package manager, dependency conflict, budget | reset only loop-owned package changes with user approval |
| Flaky tests | failures mention timeout/intermittent/flaky | reproduce -> classify -> quarantine/fix -> rerun -> review | QA engineer -> root-cause debugger -> stack developer | flake signature, retry count, deterministic reproduction | repeated runs, timing logs, failure packet if unresolved | retry once with failure packet; block repeated same signature | no-progress circuit, repeated failure signature | leave quarantine note or blocked failure packet |
| Missing credentials | request needs external access, secret, account, server, billing | preflight -> human gate -> blocked dependent tasks | orchestrator -> human gate -> relevant implementer after approval | secret reference requirement, allowed tool list, exact lease | gate ID, access reference, no raw secret in state/logs | after user resolves gate, continue ready front | missing access, credential scope drift, raw secret risk | no mutation; redact any secret-like content before archive |
| Policy stop | high-risk production/destructive/remote action | task blocked before mutation with policy gate | orchestrator -> policy guard -> human gate | action class, environment, approval lease, rollback expectation | policy decision, gate summary, blocked report | resume only with matching exact approval lease | approval expiry, risk escalation, environment mismatch | no side effect unless approved; cleanup recorded |
| Server, Docker, deploy preparation | server/docker/deploy words without exact production approval | production-prep graph; deploy node remains gated | devops/SRE -> QA -> reviewer | target env, access reference, smoke checks, rollback plan | local/CI equivalent, package/build evidence, deploy checklist | resume production-prep artifacts; production mutation still gated | missing server reference, deploy approval absent | documented rollback, no remote mutation by default |
| MCP validation | request names MCP, remote tool, or external service | adapter planning -> read-only validation -> gated write if needed | MCP-aware orchestrator -> integration engineer -> reviewer | tool name, permission mode, allowed calls, fallback path | MCP plan/fallback, read-only result, gate for write | resume from MCP plan; preserve blocked write gate | denied tool, rate limit, provider policy uncertainty | no hidden retry storm; record denied/limited status |

## Confidence Gate

All scenarios share the same completion rule:

- Complete task score must be at least 9/10.
- Verification matrix evidence must map to each completed task.
- Complete work needs a handoff with independent reviewer evidence when risk,
  shared contract, security, production-prep, or broad refactor scope requires it.
- Blocked work must keep `stop_reason`, `next_action`, open gate list, and
  failure packet context.

## Resume And Stop Controls

Every scenario must support:

- `status`: shows graph counts, gates, claims, adapter availability, next action,
  and repeated failure signatures.
- `prime`: prints compact fresh-context resume notes.
- `doctor`: diagnoses missing artifacts, stale claims, unresolved side effects,
  invalid graph, orphan attempts, and missing evidence references.
- `stop`: preserves state, open gates, claims, side-effect ledger, and final
  blocked report.

## Work-Item UX And Tracker Sync

Reviewed plans can be atomized into one epic plus child work items under
`.claude/memory/work-items/<epic-id>/`. Native JSON remains canonical. Optional
external tracker sync writes `.claude/memory/loops/task-tracker-map.json` and
must preserve ready, blocked, claimed, stale, orphan, drift, review, and done
states in local status/query output. Tracker unavailability is a degraded
native-fallback state, not a planning failure.
