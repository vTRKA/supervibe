---
description: >-
  Use WHEN the user asks what to do next, has a brainstorm or plan ready, asks
  for review, atomic task split, epic creation, autonomous run, security audit,
  router/network diagnostics, design/UI/deck requests, worktree isolation,
  status, stop/resume, or diagnose/why-trigger TO route to the next safe
  Supervibe workflow command without mutating first. Triggers: 'what next',
  'brainstorm', 'plan', 'review', 'security audit', 'брейншторм', 'план',
  'ревью', 'эпик', 'уязвимости'.
last-verified: "2026-05-08"
---

# /supervibe

Trigger router for the full workflow chain: brainstorm -> plan -> review -> atomic work items -> epic -> provider-safe worktree run. It also handles work-item questions, status, dashboard output, integration readiness, saved views, structured queries, local reports, autonomous replay evals, deferred work, guided forms, interactive command palette, sync bundle export/import, notifications, stop/resume, and trigger diagnostics (`--diagnose-trigger`, `--why-trigger`) before any mutating action.

Specialized routes now include `/supervibe-security-audit` for security audit
loops, `prompt-ai-engineer` for prompt/system-prompt/agent-instruction and
intent-router hardening, `network-router-engineer` for read-only router/network
diagnostics, and `/supervibe-ui` for Kanban task/epic/agent visibility.

## Invocation

```bash
/supervibe
/supervibe --diagnose-trigger "<user request>"
/supervibe --why-trigger "<user request>"
/supervibe --interactive
```

The router has three layers: exact trigger corpus, deterministic keyword rules,
and semantic intent profiles for implicit needs. Semantic profiles catch pain
statements such as "users cannot see epics/tasks", "old tasks are cluttering
memory", "agents do not use tools", "RAG/codegraph wastes tokens", "docs has
internal TODO garbage", "Figma tokens drift from code", and "the UI looks
amateur" without requiring the user to name the command. Security statements
Security examples such as "is this safe to ship?" or "security audit" route
to `/supervibe-security-audit`. Network examples such as router crashes,
router configuration, VPN failures, and Wi-Fi stability route to
`network-router-engineer` in fresh context for troubleshooting.
read-only diagnostics mode first.

Command-like requests use the deterministic command catalog before any broad
project search. This includes explicit slash commands, explicit `npm run ...`
phrases, bare `supervibe:<script>` names, and English/Russian natural-language
requests for primary workflows. Run:

```bash
node <resolved-supervibe-plugin-root>/scripts/supervibe-commands.mjs --match "<user request>"
```

Example: an explicit request to refresh the Supervibe code index routes to the
same source-first flow used by genesis:

```bash
node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress
```

If the catalog prints `SUPERVIBE_COMMAND_MATCH`, run the exact command from the
project root or invoke the printed slash command in the active AI CLI instead
of searching the whole repository for command docs. If it prints
`PROJECT_SCRIPT: missing` for a known Supervibe command, do not retry the missing
project package script; use the printed portable plugin command.

Design requests route to existing commands only:
- new UI, prototype, mockup, professional polish request -> `/supervibe-design`
- design review, UI polish, token drift, accessibility review -> `/supervibe-audit --design`
- mobile UI -> `/supervibe-design --target mobile-native`
- chart UX -> `/supervibe-design --chart-ux`
- presentation/deck design -> `/supervibe-design --presentation`
- brand/collateral asset work -> `/supervibe-design --brand-collateral`
- stack-aware UI handoff -> `/supervibe-design --handoff`
- Figma variables/components/tokens drift -> `/supervibe-design --figma-source-of-truth`

The internal design intelligence lookup never appears as its own slash command.

Security and network requests route through explicit safety boundaries:
- vulnerability/security audit -> `/supervibe-security-audit`
- audit findings need fixes -> `/supervibe-security-audit --plan` then `/supervibe-execute-plan`
- security remediation loop -> `/supervibe-security-audit --execute` with re-audit to 10/10
- prompt/system prompt/agent instruction/intent router -> `prompt-ai-engineer`
- prompt changes -> require eval or regression evidence before claiming improvement
- router/switch/firewall/VPN/Wi-Fi diagnostics -> `network-router-engineer`
- router/server/network mutation -> ask for scoped approval; read-only until approved

For workflow handoffs, ask the concrete next-step question instead of stopping at the previous phase:
- Brainstorm ready: `Step N/M: write the plan?`
- Plan ready: `Step N/M: run the plan review loop?`
- Review passed: `Step N/M: split the plan into atomic work items and an epic?`
- Epic run requested: `Step N/M: run provider-safe preflight before worktree/autonomous run?`
- Work status question: route "what is ready?", "what is blocked?", "who owns this?", "what changed?", and "what should I run next?" to the work-item query layer.

Every producer result must also expose `NEXT_USER_ACTIONS[]` before progressing: approve/continue, revise, exclude/defer, run or rerun specialist review, inspect readiness, or stop and keep the artifact. Natural-language plan review and review-loop requests route to `/supervibe-plan --review`, not audit, execution, or atomization.

Dispatcher. Reads project + plugin state via a deterministic detector and proposes the right next command. Never modifies anything itself — always defers to the phase-specific command after user confirmation.

## How it works

The detector lives at `scripts/lib/supervibe-state-detector.mjs` and runs **7 checks in priority order** (first-triggered wins). Each check is independent code, NOT an AI heuristic — failures are surfaced explicitly, false-positives are testable.

| Priority | Check | Signal source | Proposes |
|----------|-------|---------------|----------|
| 1 | `upstream-behind` | `.claude-plugin/.upgrade-check.json` shows `behind > 0` | `/supervibe-update` |
| 2 | `version-bump-unacked` | `.supervibe/memory/.supervibe-version` < installed plugin version | `/supervibe-adapt` |
| 3 | `project-not-scaffolded` | No Supervibe host adapter folders or managed instruction block | `/supervibe-genesis` |
| 4 | `underperformers` | `auto-strengthen-trigger` returns ≥1 flagged agent (needs ≥10 invocations to trigger) | `/supervibe-strengthen` |
| 5 | `stale-artifacts` | ≥3 files in `agents/` `rules/` `skills/` with `last-verified` >30 days old | `/supervibe-audit` |
| 6 | `override-rate-high` | `.supervibe/confidence-log.jsonl` shows >5% overrides over last 100 entries | `/supervibe-audit` |
| 7 | `pending-evaluation` | Latest invocation in `agent-invocations.jsonl` has no `outcome` field | `/supervibe-score --record` |
| (none) | — | All 7 checks pass | "System healthy. No action needed." |

## Procedure

1. **Run the detector.** Execute `node <resolved-supervibe-plugin-root>/scripts/supervibe-detect.mjs` from the project root. It prints a human-readable banner + the proposed next command. Failure-tolerant — individual check errors do not break the run.

2. **Show the user the report.** Print every check's status (✓ pass / ⚠ triggered) with one-line evidence. Do not paraphrase — the detector's wording is precise.

3. **Return the next safe route.** Producer phases must include the chain handoff question; status questions should use the work-item query layer for ready, blocked, claimed, stale, orphan, delegated inbox, duplicate, drift, and integration views. Ask before mutation.

Advanced loop helpers are direct routes: `/supervibe-loop --quickstart` creates safe local folders, `/supervibe-loop --onboard` reports readiness, `/supervibe-loop --watch` writes a read-only heartbeat snapshot, `/supervibe-loop --defer <item> --until <timestamp>` defers local graph work, `/supervibe-loop --notify terminal,inbox` routes bounded run events, `/supervibe-loop --export-sync-bundle` creates a redacted portable bundle, `/supervibe-loop --import-sync-bundle --dry-run` validates incoming bundles without remote mutation, `/supervibe-loop --eval` runs local replay evals and scorecards, `/supervibe-loop --eval-live` is opt-in and budget-gated, `/supervibe-status --eval-report` prints local eval summaries, `/supervibe-status --dashboard` writes a static run dashboard, `/supervibe-status --integrations` reports optional external integrations, `/supervibe-status --view|--query` filters large work-item graphs, `/supervibe-status --save-view` stores portable local views, `/supervibe-status --report daily|weekly|sla` renders redacted markdown reports, `/supervibe --interactive` and `/supervibe-status --interactive` open the optional command palette when a TTY exists, `/supervibe-loop --create-work-item --interactive` opens guided local forms with no-tty fallback, `/supervibe-loop --atomize-plan <plan> --preview` shows a redacted dry-run preview, and `/supervibe-loop --completion <shell>` prints shell completions.

4. **Ask for confirmation** before running anything destructive. `/supervibe-update` and `/supervibe-adapt` modify files — explicit "yes" required. `/supervibe-audit` and `/supervibe-score --record` are read-only scoring/persistence flows and can run immediately if the user agrees.

Local visual and cleanup routes are explicit: `/supervibe-ui` opens the
localhost control plane for epics, tasks, loop state, waves, reports, context
packs, Kanban status movement, task-to-epic links, agent claims, and safe local
actions; `/supervibe-gc` previews reversible cleanup for completed work-item
graphs and stale/superseded memory before any archive write.

## Output contract

Mirrors what `supervibe-detect.mjs` prints, plus a one-line conclusion:

```
=== Supervibe State ===
Project:  <path>
Plugin:   <path>

  ✓ upstream-behind             → plugin is up to date with upstream
  ✓ version-bump-unacked        → project + plugin both on 2.0.11
  ⚠ project-not-scaffolded      → no Supervibe host adapter folders or managed instruction block — run genesis first
  ✓ underperformers             → 12 invocations, no underperformers
  ✓ stale-artifacts             → 0 stale artifact(s) (under 3-threshold)
  ✓ override-rate-high          → override rate 1.2% (under threshold)
  ✓ pending-evaluation          → latest invocation already has outcome

Proposed: /supervibe-genesis
Why:      no Supervibe host adapter folders or managed instruction block — run genesis first

Confidence: N/A    Rubric: read-only-research
```

## When NOT to invoke

- You already know which phase you want — call it directly. The dispatcher adds a round-trip you can skip.
- You only want a one-off score — `/supervibe-score`.
- You are diagnosing a specific bug — `supervibe:systematic-debugging` skill is more direct.

## Related

- `scripts/lib/supervibe-state-detector.mjs` — the deterministic detector (7 checks, all unit-tested)
- `tests/supervibe-state-detector.test.mjs` — covers each check's triggered + not-triggered paths
- All `/supervibe-*` phase commands — what this dispatcher proposes
- `npm run supervibe:status` — overlapping but more index-focused

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, `AGENT_SELECTION_MODE`, required agents, `REQUIRED_AGENT_SOURCES`, `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, `MISSING_CALLABLE_AGENTS`, and durable-write permission before any agent-owned artifact is produced. Role sources must distinguish definition availability from host-callable availability: `REQUIRED_AGENT_SOURCES` may include `plugin-only`, but `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, and `MISSING_CALLABLE_AGENTS` decide whether the selected host can actually invoke the role. Plugin-only definitions are not enough for a real-agent completion claim.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. For active workflows, build the plan with `--active --slug <slug> --handoff-id <handoff-id>`; `SCOPED_RECEIPT_GATE` must be trusted for the current run before durable agent-owned outputs are allowed. Old global receipts are diagnostic only and do not unlock a new command/handoff. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Scoped current-run receipts are required for active command/handoff claims; old global receipts are diagnostic only and cannot authorize a new agent-owned output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
