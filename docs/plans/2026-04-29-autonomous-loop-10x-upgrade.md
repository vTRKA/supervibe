# Autonomous Loop 10/10 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `supervibe:subagent-driven-development` for implementation batches and `supervibe:verification` before each review gate.

**Goal:** Upgrade `/supervibe-loop` from a bounded control-plane and dry-run artifact generator into a durable, contract-driven, resumable autonomous execution engine with task graph coordination, verification evidence, real tool adapters, and safe stop behavior.

**Audit basis:** Durable task-graph systems, contract-driven execution systems, fresh-context autonomous story loops, skill-chaining workflow systems, and current Supervibe HEAD `74a9558 add loop`.

**Architecture:** Keep Supervibe's current Node-only, no-Docker, no-native-build positioning. Add proven product mechanisms without copying external storage/runtime assumptions directly: durable graph coordination, contract and verification governance, small-story fresh-context execution, explicit workflow chaining, and isolated worktree sessions. The final loop should be observable, cancellable, policy-gated, resumable after compaction, and useful both for one-shot plans and multi-day autonomous runs.

**Tech Stack:** Node.js 22+, JSONL artifacts, JSON Schema + Ajv, existing Supervibe agents/skills/rubrics, existing CodeGraph/RAG/memory subsystems, optional CLI adapters for Codex/Claude/Gemini/OpenCode.

**Constraints:**
- No required external versioned database, Docker, database server, Python, or native compilation.
- No production mutation, destructive migration, credential mutation, remote server mutation, billing, DNS, account, or access-control change without exact approval lease.
- No raw secret storage in state, logs, memory, reports, task notes, or side-effect ledger.
- No hidden background automation: every spawned process must be visible in the side-effect ledger and cancellable through loop-owned tracking.
- No task can be complete below the 9/10 confidence gate unless the user explicitly accepts a partial result.
- UI stories require browser or preview evidence.

---

## Trigger Root-Cause Audit

The current trigger failure is architectural, not a single missing phrase.

| Finding | Current impact | Required fix |
| --- | --- | --- |
| Skill auto-selection reads frontmatter `description` before skill body | Trigger phrases hidden inside body text do not help activation | Put concise English and Russian trigger phrases in every relevant skill and command frontmatter |
| Main dispatcher still uses project-state checks as the dominant entry point | User intents like "I finished brainstorming" or "run this plan in a worktree" do not route to the chain | Add intent routing that combines user phrase, current artifacts, previous phase, and safety state |
| Existing dispatcher stops at one proposed command | The workflow stalls after brainstorm or plan instead of offering the next phase | Replace single-stop output with mandatory chain handoff questions after producer phases |
| Brainstorm and plan skills can finish without a hard next-step contract | User has to manually infer that the next step is planning, review, atomization, or execution | Add chain handoff enforcer and tests for every producer phase |
| Plan review is not enforced before atomization and execution | Bad plans can become durable work items and long autonomous runs | Make post-plan review a required gate before work-item creation or execution |
| Russian continuation phrases are underrepresented | Natural Russian requests miss the correct skill or command | Add bilingual trigger corpus with exact real phrases and golden expected routes |
| Command, skill, README, manifest, and registry metadata can drift independently | Users see one behavior in docs and different behavior in auto-routing | Add metadata linter and README command-doc sync tests |
| There is no "why did this trigger" tool | Trigger bugs are hard to debug and fix | Add trigger diagnostics with confidence, alternatives, prerequisites, and safety blockers |

Golden trigger fixtures must include:
- "я сделал брейншторм" -> planning handoff.
- "следующий шаг написание плана - переходим?" -> planning confirmation.
- "после плана сделай ревью" -> mandatory plan-review gate.
- "разбей план на атомарные задачи" -> atomization preflight.
- "создай эпик" -> epic and child work-item creation.
- "запусти эпик автономно" -> autonomous execution preflight.
- "в отдельном worktree" -> isolated worktree session preflight.
- "пусть идет 3 часа" -> bounded timebox proposal with stop controls.
- "что дальше?" -> next safe action from current artifacts.

---

## Trigger Golden Route Matrix

These routes are mandatory acceptance fixtures for the trigger router, command frontmatter, skill frontmatter, README examples, and replay evals.

| User phrase | Expected intent | Route | Required output |
| --- | --- | --- | --- |
| "я сделал брейншторм" | Continue from brainstorm to plan | `/supervibe-plan` plus planning skill | Show latest brainstorm/spec artifact and ask "Следующий шаг - написать план. Переходим?" |
| "брейншторм готов, что дальше?" | Continue from brainstorm to next safe action | `/supervibe` intent router | Explain that planning is next, show artifact path, ask for confirmation |
| "после брейншторма напиши план" | Plan from approved spec | `/supervibe-plan` plus planning skill | Validate spec exists and produce implementation plan, not execution |
| "сделал план, проверь его" | Plan review gate | review skill plus plan validator | Produce review report and block atomization until review passes |
| "после плана сделай ревью луп" | Mandatory post-plan review | review skill plus chain handoff enforcer | Run plan review loop and ask whether to atomize after pass |
| "план готов, разбей на атомарные задачи" | Atomize plan | plan-to-work-items module | Create dry-run epic and child work-item preview, ask before writing |
| "создай эпик из плана" | Create durable epic | work-item bridge | Create epic only after plan review pass and exact confirmation |
| "создай эпик и child tasks" | Create epic plus child work items | work-item bridge plus graph validator | Write parent/child/dependency graph and show ready queue |
| "запусти эпик автономно" | Autonomous execution preflight | loop command plus provider-safe guard | Show policy, budget, permission, evidence, and stop controls before run |
| "пусть идет 3 часа" | Bounded autonomous timebox | loop command plus budget guard | Treat 3 hours as maximum timebox, not hidden permission bypass |
| "запусти в отдельном worktree" | Isolated worktree execution | worktree skill plus loop preflight | Create or preview isolated session with branch, path, owner, and cleanup plan |
| "запусти эпик автономно в отдельном worktree" | Worktree-backed autonomous execution | worktree manager plus loop runner | Require clean workspace, active session registry, side-effect ledger, and stop command |
| "продолжай после плана" | Next safe action from plan | `/supervibe` intent router | Route to plan review, not direct execution |
| "что готово к работе?" | Ready queue query | status/query command | Show unblocked ready work and explain priority score |
| "что заблокировано?" | Blocked work query | status/query command | Show blockers, owner, required approval, or missing artifact |
| "почему не сработал триггер?" | Trigger diagnostics | `/supervibe --diagnose-trigger` | Show matched intent, confidence, alternatives, missing metadata, and fix hints |
| "почему выбрал этот skill?" | Trigger explanation | `/supervibe --why-trigger` | Show selected command, selected skill, frontmatter match, and competing routes |
| "не останавливайся после brainstorm" | Chain handoff enforcement | chain handoff enforcer | Continue only to next confirmation question, not implementation |
| "сделай по плану" | Execution request | execution preflight | Check plan review, atomization state, worktree option, permissions, and evidence gates |
| "обнови README под это" | Public docs sync | docs sync task | Update README only after command behavior and safety labels are accurate |

---

## Trigger Anti-Regression Requirements

The trigger upgrade must remove or override the current conflicting behavior, not merely add new phrases.

| Current behavior to eliminate | Why it fails | Required replacement |
| --- | --- | --- |
| `/supervibe` only advertises legacy project-state phases | New workflow intents cannot be selected reliably | `/supervibe` becomes an intent router for workflow continuation, work graph, worktree, loop, status, and diagnostics |
| `/supervibe` stops at first triggered check | A valid producer phase cannot naturally continue to the next phase | Router can propose the next safe chained phase while still asking before mutation |
| Command text says not to chain phases automatically | This contradicts the required brainstorm to plan to review to atomize path | Producer phases must chain by handoff contract and ask a concrete yes/no question |
| Brainstorm output allows direct implementation for small work | User feedback requires planning handoff after brainstorm | Brainstorm output defaults to planning handoff unless the user explicitly cancels planning |
| Plan output offers execution before mandatory review | Bad plans can enter atomization or execution | Plan output routes to plan review first, then atomization after review pass |
| Autonomous loop trigger omits epic, worktree, duration, stop, and resume wording | Long-run requests miss the loop path or skip safety preflight | Loop metadata and router support bounded epic execution, isolated sessions, status, stop, and resume |
| Worktree skill is only an isolation helper | Multi-session autonomous work needs first-class session management | Worktree route includes active session registry, heartbeat, branch/path ownership, status, and cleanup |
| Trigger diagnostics do not exist | Wrong routing is hard to explain or fix | Diagnostics show selected route, confidence, alternatives, missing metadata, artifacts, and blockers |
| README can drift from command metadata | Users see examples that auto-trigger cannot route | README examples are validated against command and skill metadata |
| Package manifests can drift from shipped commands | Different plugin surfaces advertise different behavior | Package audit checks manifest, registry, package, README, and command metadata together |

Acceptance:
- Tests fail if the legacy "stop at first triggered check" behavior prevents a required chain handoff.
- Tests fail if plan execution can start before plan review passes.
- Tests fail if brainstorm completion does not route to planning handoff.
- Tests fail if worktree autonomous execution lacks stop, status, and cleanup metadata.

---

## Trigger Frontmatter Patch Targets

Skill and command bodies are not enough. These files must expose their routeable intent in frontmatter so auto-trigger has enough signal before loading the full body.

| File | Current failure | Required frontmatter coverage |
| --- | --- | --- |
| `commands/supervibe.md` | Describes only legacy project-state phases and blocks automatic chaining | Add intent-router coverage for brainstorm, plan, review, atomization, epic/work-items, worktree, autonomous run, status, stop, resume, and diagnostics |
| `commands/supervibe-brainstorm.md` | Describes brainstorm entry but not continuation after saved output | Add phrases for "я сделал брейншторм", "брейншторм готов", "что дальше", and mandatory planning handoff |
| `commands/supervibe-plan.md` | Describes plan creation but not post-plan review or atomization | Add phrases for "напиши план", "план готов", "проверь план", "ревью после плана", "разбей на атомарные задачи", and "создай эпик" |
| `commands/supervibe-loop.md` | Describes bounded loop but misses epic, worktree, duration, and provider-safe preflight phrases | Add phrases for "запусти эпик автономно", "в отдельном worktree", "пусть идет 3 часа", "resume", "stop", and "show run status" |
| `commands/supervibe-execute-plan.md` | Execution route can be confused with plan review and atomization | Add phrases that require plan review pass, work-item readiness, execution mode choice, and evidence gate before execution |
| `skills/brainstorming/SKILL.md` | Body mentions handoff, but output still allows direct implementation for small work | Add frontmatter and body language that brainstorm output always asks for planning handoff unless user explicitly cancels |
| `skills/writing-plans/SKILL.md` | Trigger phrases cover "plan" but not review loop, atomization, or epic creation | Add frontmatter phrases for post-plan review, plan review loop, atomic tasks, epic, child work items, and next-step confirmation |
| `skills/requesting-code-review/SKILL.md` | Review skill is not clearly routeable for plan-review and wave-review modes | Add phrases for "проверь план", "ревью луп", "review before execution", "wave audit", and "final review" |
| `skills/autonomous-agent-loop/SKILL.md` | Autonomous loop description misses duration, epic, worktree, stop/resume, and permission preflight wording | Add frontmatter phrases for bounded timebox, epic execution, isolated session, provider-safe preflight, status, stop, and resume |
| `skills/subagent-driven-development/SKILL.md` | Mentions subagents but not epic-driven execution or worktree-backed autonomous batches | Add phrases for "запусти эпик через subagents", "3 часа автономно", "fresh worker per task", "two-stage review", and "worktree session" |
| `skills/using-git-worktrees/SKILL.md` | Worktree helper is not connected strongly enough to long autonomous sessions | Add phrases for "отдельный worktree", "изолированная сессия", "multi-session", "active session registry", and "cleanup" |
| Plugin manifests and registry metadata | Package descriptions can advertise stale or incomplete workflow capabilities | Add the same high-level route language as command frontmatter without promising unsafe background execution |

Acceptance:
- Every route in the golden matrix has at least one command frontmatter match and one skill frontmatter match.
- No trigger phrase exists only in body text.
- Metadata linter fails if README examples, command descriptions, skill descriptions, manifests, and registry metadata disagree.
- Diagnostics can explain both the selected route and the closest rejected alternatives.

---

## README Update Acceptance Matrix

README must be updated as part of this upgrade, not treated as optional release polish.

| README section | Required content | Covered by |
| --- | --- | --- |
| Quick start | Show the default path from brainstorm to plan to review to atomization to safe execution | T21, T32 |
| Trigger examples | Include English and Russian examples for continuation prompts, next-step prompts, worktree execution, and diagnostics | T21, T32 |
| End-to-end workflow | Explain brainstorm -> approved spec -> plan -> plan review -> epic/work-items -> execution mode | T15, T16, T21, T32 |
| Work-item graph | Explain epic, child tasks, blockers, ready queue, claim, close, comments, and status | T16, T19, T20, T21 |
| Worktree sessions | Explain isolated branch/path/session registry, heartbeat, status, stop, resume, and cleanup | T17, T21, T31 |
| Provider-safe automation | Explain read-only default, scoped approvals, deny rules, permission prompt bridge, dangerous flag denylist, and visible side effects | T18, T21, T29 |
| Diagnostics | Document why-trigger, diagnose-trigger, doctor, metadata linter, and common wrong-route fixes | T10, T21, T32 |
| Blocked states | Explain missing credentials, missing approval, failed verification, policy stop, stale claim, dirty worktree, and sync conflict | T4, T6, T10, T18, T19, T21 |
| Status and reports | Show status, ready work, blocked work, dashboard, saved views, and quality scorecard examples | T20, T25, T26, T28 |
| Release labels | Clearly mark unreleased, experimental, opt-in, and provider-dependent behavior | T21, T22, T24 |

Acceptance:
- README examples use the same flags and paths as command docs.
- README does not mention a command that command metadata cannot route.
- README does not promise autonomous execution as default.
- README documents how to stop, inspect, and clean up a long run.

---

## Policy-Safe Autonomy Guardrails

Autonomous execution must strengthen provider safety instead of copying unsafe convenience shortcuts.

| Guardrail | Implementation requirement |
| --- | --- |
| No permission bypass defaults | Real execution adapters must not default to bypassing provider prompts, sandboxing, or approval checks |
| Dangerous flag denylist | Adapter launchers must detect and block known skip-permission, bypass-permission, unsafe-shell, and all-tools flags unless an explicit policy profile permits a narrow test-only dry run |
| Read-only baseline | Planning, status, diagnostics, import preview, and trigger evaluation run read-only unless a later phase asks for a scoped write approval |
| Allow, ask, deny parity | Provider adapters normalize tool permission rules into local allow, ask, and deny decisions before execution |
| Permission prompt bridge | Non-interactive execution must route permission prompts to an approved local gate instead of silently approving them |
| Managed policy compatibility | User, project, and organization policies can make automation stricter; local profiles must not weaken higher-priority policies |
| Permission audit command | Status and doctor output must show active permission mode, denied tools, allowed tools, prompt-required tools, and bypass-disabled state when available |
| Hook decision safety | Tool hooks can deny or ask for approval, but hook-based allow decisions are treated as high-risk and must be visible in the side-effect ledger |
| Visible side effects | Every spawned process, tool call, worktree, file mutation, network/MCP request, and external sync attempt is recorded in the side-effect ledger |
| Exact approval leases | Destructive, production, credential, billing, DNS, deployment, remote mutation, and external tracker mutation actions require exact scoped approval |
| Bounded autonomous runs | A user-approved duration such as 3 hours is a max timebox, not permission to run hidden or unbounded automation |
| Provider rate and budget respect | Rate limits, budget caps, provider denial, and policy uncertainty stop cleanly with a blocked-state report |
| Secret exclusion | Raw secrets must not be stored in run state, work items, comments, reports, memory, or logs |
| Worktree isolation | Long autonomous runs default to isolated worktrees with active session registry, heartbeat, and safe cleanup |
| Human-readable stop controls | Status output must always show how to stop, resume, inspect, or clean up a run |
| No remote mutation during import | External sync import is read-only until the user approves a concrete write operation |
| No docs overpromise | README, command docs, manifests, and registry metadata must label unreleased or opt-in execution behavior accurately |

---

## 10/10 Upgrade Priority Stack

This is the execution order that turns the audit backlog into a reliable product rather than a broad feature dump.

| Priority | Upgrade | Why it is first-class | Covered by |
| --- | --- | --- | --- |
| P0 | Trigger reliability and bilingual intent routing | If users must name commands manually, the workflow feels broken no matter how strong the backend is | T15, T21, T28, T32 |
| P0 | Mandatory chain handoff after every producer phase | Brainstorm, plan, review, atomization, and execution must connect naturally with a concrete next-step question | T15, T16, T21, T32 |
| P0 | Post-plan review before atomization or execution | Bad plans should not become durable work items or long autonomous runs | T6, T15, T16, T31, T32 |
| P0 | Provider-safe autonomy guardrails | Long runs must be visible, cancellable, permission-aware, and policy-compatible | T4, T7, T8, T18, T29 |
| P0 | README and command metadata sync | The public docs, manifests, command descriptions, and trigger behavior must describe the same product | T21, T22, T24, T32 |
| P1 | Plan-to-epic and atomic work-item conversion | Approved plans need durable tasks, dependencies, blockers, and reviewable progress | T2, T16, T19, T20 |
| P1 | Worktree-backed autonomous sessions | Multi-session execution must not pollute the user's active workspace | T17, T20, T25, T31 |
| P1 | Durable task graph with ready, claim, lease, and stale repair | Autonomous workers need safe coordination and recovery | T2, T3, T8, T10, T19 |
| P1 | Execution packets and verification matrix | Workers need enough context, exact write scope, stop rules, and evidence requirements | T5, T6, T7, T31 |
| P1 | Trigger diagnostics and metadata linter | Routing failures must be explainable and prevented by tests | T21, T22, T24, T28, T32 |
| P2 | Dashboard, saved views, query language, and reports | Once execution works, users need visibility across long runs and many work items | T25, T26, T27 |
| P2 | External tracker sync and federated bundles | Useful after the native state is reliable and conflict behavior is understood | T19, T20, T25, T29 |
| P2 | Semantic anchors and file-local contracts | Improve navigation and review quality once core loop and work graph are stable | T5, T10, T30 |
| P2 | Release security and install integrity | Required before publishing the upgrade as production-ready | T22, T24 |
| P2 | Replay evals and quality scorecard | Prevents future regressions in triggers, evidence, safety stops, and docs consistency | T14, T28, T32 |

---

## 10/10 Definition of Done

The upgrade is not complete until every gate below passes in one local run.

| Gate | Required proof |
| --- | --- |
| Trigger phrases work without explicit command names | Golden route replay passes for Russian and English continuation, planning, review, atomization, epic, worktree, status, stop, resume, and diagnostics phrases |
| Skill and command frontmatter is sufficient | Metadata linter proves no trigger exists only in body text and every golden route has command and skill metadata coverage |
| Brainstorm never dead-ends | After a brainstorm artifact exists, the system shows the artifact path and asks whether to write the plan |
| Plan never jumps straight to execution | After plan creation, the next route is plan review, not atomization or execution |
| Review loop blocks risky continuation | Atomization and execution are blocked until plan review passes or the user explicitly accepts a documented exception |
| Plan atomizes into durable work | Approved plan creates an epic preview, child work items, dependencies, blockers, ready queue, and exact write confirmation |
| Worktree execution is first-class | Long autonomous execution can run in an isolated worktree with branch, path, active session registry, heartbeat, status, stop, resume, and cleanup |
| Provider-safe preflight blocks unsafe runs | Dangerous flags, permission bypass, missing approvals, missing credentials, dirty worktree, and unknown policy mode stop before execution |
| Side effects are observable | Spawned processes, tool calls, file writes, worktree operations, external sync attempts, and hook decisions appear in the side-effect ledger |
| Verification evidence is mandatory | No task, wave, or final run can complete without mapped commands, evidence, confidence score, and failure packet when blocked |
| README matches behavior | README examples, command docs, skill metadata, manifests, registry, and package metadata describe the same triggers and safety boundaries |
| Replay and quality gates protect regressions | Trigger replay, autonomous replay, plan validator, README docs test, package audit, and release gate pass together |

Minimum end-to-end acceptance script:
1. Start from a vague feature request and confirm brainstorm triggers.
2. Save brainstorm output and confirm the next message proposes planning with a yes/no question.
3. Create a plan and confirm the next message proposes plan review.
4. Pass plan review and confirm atomization into epic and child work items is proposed.
5. Preview work-item writes and confirm exact approval is required before persistence.
6. Start a bounded worktree-backed autonomous dry run and confirm safety preflight, side-effect ledger, status, stop, and cleanup work.
7. Run docs and metadata checks to confirm README, commands, skills, manifests, and registry are synchronized.

---

## User Feedback Traceability Matrix

Every explicit feedback item must map to implementation tasks and proof artifacts.

| Feedback item | Plan response | Proof required |
| --- | --- | --- |
| Triggers are too weak | Trigger root-cause audit, golden route matrix, frontmatter patch targets, trigger router, and replay evals | Golden route replay passes and metadata linter proves frontmatter coverage |
| Natural language should route without naming commands | Intent router combines user phrase, artifacts, prior phase, and safety state | `/supervibe --why-trigger` explains selected route and alternatives for real phrases |
| Skills should chain | Chain handoff enforcer makes every producer phase emit artifact, next step, reason, and confirmation question | Replay verifies brainstorm -> plan -> review -> atomize -> execution handoffs |
| After brainstorm, the next step should be writing a plan | Golden route matrix maps brainstorm completion phrases to planning handoff | Output includes artifact path and "Следующий шаг - написать план. Переходим?" |
| After plan, review loop is mandatory | DoD and Task 32 require plan review before atomization or execution | Tests fail if "plan ready" routes directly to execution |
| Plan should break into atomic work items | Plan-to-work-item bridge creates epic preview, child work items, blockers, dependencies, and ready queue | Atomization dry run shows parent, children, edges, labels, priority, and verification fields |
| Epic should become executable work | Durable task graph, ready queue, claim/lease, worker assignment, and status/query surface | Status shows epic progress, ready work, active claims, blockers, and evidence |
| Subagent-driven execution should run from the epic | Capability registry, wave controller, worker/reviewer presets, and two-stage review | Execution report shows worker assignment, reviewer independence, and per-task review results |
| Long run should support a 3-hour bounded mode | Budget and duration guard treat the duration as a max timebox with stop/resume | Preflight shows timebox, budget, stop command, and blocked-state behavior |
| Long run should use a separate worktree | Worktree session manager with active registry, heartbeat, cleanup, and side-effect ledger | Dry run creates or previews branch/path/session and status can inspect it |
| Multi-session work on one project should be safe | Worktree registry, claims, write-set conflict detection, and workspace fingerprinting | Two sessions cannot claim the same task or write conflicting scopes silently |
| README was missed before | README acceptance matrix, README docs test, package audit, and metadata linter | Release gate fails if README does not document triggers, workflow, worktree, status, stop, and safety |
| Provider policy must not be violated | Policy-safe guardrails, dangerous flag denylist, permission bridge, managed policy precedence, and approval leases | Provider-safe preflight blocks unsafe adapter commands and records permission mode in status |
| Plan should not mention source repo names | Vendor-neutral plan wording and external-name scan | Scan remains clean for source repo names and organization names |
| Token usage should stay controlled | Progressive disclosure, compact frontmatter, deterministic scripts, and diagnostics instead of verbose prompt text | Skill bodies stay concise and repeated checks run through scripts/tests |

---

## External Audit Coverage Checklist

This checklist verifies that the audited mechanisms are represented in the plan without naming source repositories in implementation instructions.

| Audited mechanism class | Included product capability | Proof required |
| --- | --- | --- |
| Durable local work tracking | Native work graph, epic hierarchy, child tasks, dependencies, ready queue, claims, and close flow | Work-item graph tests and status/query examples pass |
| Multi-agent coordination | Atomic claims, leases, stale repair, write-scope conflicts, wave controller, worker/reviewer presets | Parallel wave tests prove no duplicate claims or conflicting write sets |
| Worktree-aware execution | Isolated session manager, branch/path registry, heartbeat, status, resume, stop, and cleanup | Worktree dry-run and cleanup tests pass on clean and dirty workspace fixtures |
| Long-horizon memory | Progress log, run archive, compact learnings, guidance update review, and continuation packets | Archived run replay can resume from compact state |
| Contract-first planning | Module contracts, public/private context split, file-local contracts, semantic anchors, and change summaries | Contract and anchor validators pass on touched-file fixtures |
| Verification-first execution | Verification matrix, evidence levels, browser checks for UI, failure packets, and quality scorecard | Final acceptance fails on missing evidence and passes with complete mapped evidence |
| Scoped and wave review | Plan review, scoped review, wave audit, final review, reviewer independence | Review-loop tests block atomization/execution until review gate passes |
| Fresh-context workers | Execution packets, fresh worker per task, two-stage review, bounded retry, and final integration review | Subagent execution harness proves packet completeness and retry stop behavior |
| PRD and story conversion | PRD intake, story-size validation, acceptance criteria normalization, priority ordering, passes-state compatibility | Oversized story fixtures split or fail before execution |
| Status and next action | Health status, ready work, blocked work, recent changes, next safe action, and why-trigger explanations | Status snapshots include actionable next step for every blocked state |
| Trigger-chained workflow | Bilingual frontmatter, intent router, golden route matrix, chain handoff enforcer, metadata linter | Trigger replay passes all golden user phrases |
| External sync and interoperability | Adapter boundary, field mapping, dry-run sync, pull-only, push-only, conflict strategy, sync doctor | Sync tests prove dry-run is non-mutating and conflicts fail closed |
| Release and install trust | Package audit, manifest sync, checksums, provenance, license inventory, install smoke tests | Release gate blocks version drift or missing README/manifest coverage |
| Provider-safe automation | Read-only baseline, permission bridge, dangerous flag denylist, managed policy precedence, side-effect ledger | Unsafe adapter fixtures are blocked before execution and reported clearly |
| Documentation as product surface | README quick start, workflow examples, diagnostics, blocked states, safety boundaries, status and cleanup | README docs test fails when commands or metadata drift |
| Regression protection | Trigger replay, archived-run replay, benchmark corpus, quality scorecard, golden outcome diffs | Quality gate fails on trigger, evidence, docs, or safety regression |

---

## File Structure

### Created
```text
docs/plans/2026-04-29-autonomous-loop-10x-upgrade.md
schemas/autonomous-loop-graph.schema.json
schemas/autonomous-loop-contract.schema.json
schemas/autonomous-loop-verification.schema.json
schemas/autonomous-loop-failure-packet.schema.json
confidence-rubrics/autonomy-readiness.yaml
scripts/lib/autonomous-loop-task-graph.mjs
scripts/lib/autonomous-loop-ready-front.mjs
scripts/lib/autonomous-loop-claims.mjs
scripts/lib/autonomous-loop-async-gates.mjs
scripts/lib/autonomous-loop-doctor.mjs
scripts/lib/autonomous-loop-progress-log.mjs
scripts/lib/autonomous-loop-contracts.mjs
scripts/lib/autonomous-loop-verification-matrix.mjs
scripts/lib/autonomous-loop-failure-packet.mjs
scripts/lib/autonomous-loop-fresh-context-executor.mjs
scripts/lib/autonomous-loop-tool-adapters.mjs
scripts/lib/autonomous-loop-archive.mjs
scripts/lib/autonomous-loop-graph-export.mjs
scripts/lib/supervibe-workflow-router.mjs
scripts/lib/supervibe-skill-chain.mjs
scripts/lib/supervibe-plan-to-work-items.mjs
scripts/lib/supervibe-worktree-session-manager.mjs
scripts/lib/supervibe-trigger-evaluator.mjs
scripts/lib/supervibe-trigger-intent-corpus.mjs
scripts/lib/supervibe-trigger-router.mjs
scripts/lib/supervibe-chain-handoff-enforcer.mjs
scripts/lib/supervibe-trigger-diagnostics.mjs
scripts/lib/supervibe-trigger-metadata-linter.mjs
scripts/lib/autonomous-loop-provider-policy-guard.mjs
scripts/lib/autonomous-loop-permission-audit.mjs
scripts/lib/supervibe-durable-task-tracker-adapter.mjs
scripts/lib/supervibe-task-tracker-mcp-bridge.mjs
scripts/lib/supervibe-task-tracker-sync.mjs
scripts/lib/supervibe-task-tracker-doctor.mjs
scripts/lib/supervibe-work-item-template-catalog.mjs
scripts/lib/supervibe-work-item-query.mjs
scripts/lib/supervibe-work-item-comments.mjs
scripts/lib/autonomous-loop-learning-extractor.mjs
scripts/lib/autonomous-loop-guidance-updater.mjs
scripts/lib/supervibe-plugin-package-audit.mjs
scripts/lib/autonomous-loop-context-budget.mjs
scripts/lib/supervibe-work-item-daemon.mjs
scripts/lib/supervibe-work-item-priority-formula.mjs
scripts/lib/supervibe-work-item-migration-importer.mjs
scripts/lib/supervibe-work-item-message-delegation.mjs
scripts/lib/supervibe-shell-completions.mjs
scripts/lib/supervibe-release-security-audit.mjs
scripts/lib/supervibe-install-integrity.mjs
scripts/lib/supervibe-dependency-provenance.mjs
scripts/lib/supervibe-run-dashboard.mjs
scripts/lib/supervibe-external-integration-catalog.mjs
scripts/lib/supervibe-notification-router.mjs
scripts/lib/supervibe-federated-sync-bundle.mjs
scripts/lib/supervibe-work-item-query-language.mjs
scripts/lib/supervibe-work-item-saved-views.mjs
scripts/lib/supervibe-work-item-scheduler.mjs
scripts/lib/supervibe-work-item-sla-reports.mjs
scripts/lib/supervibe-interactive-cli.mjs
scripts/lib/supervibe-command-palette.mjs
scripts/lib/supervibe-terminal-renderer.mjs
scripts/lib/supervibe-guided-work-item-forms.mjs
scripts/lib/autonomous-loop-eval-harness.mjs
scripts/lib/autonomous-loop-replay-runner.mjs
scripts/lib/autonomous-loop-benchmark-corpus.mjs
scripts/lib/autonomous-loop-quality-scorecard.mjs
scripts/lib/supervibe-policy-profile-manager.mjs
scripts/lib/supervibe-approval-receipt-ledger.mjs
scripts/lib/supervibe-config-drift-detector.mjs
scripts/lib/supervibe-team-governance.mjs
scripts/lib/supervibe-semantic-anchor-index.mjs
scripts/lib/supervibe-file-local-contracts.mjs
scripts/lib/supervibe-change-summary-index.mjs
scripts/lib/supervibe-anchor-drift-detector.mjs
scripts/lib/supervibe-agent-capability-registry.mjs
scripts/lib/supervibe-wave-controller.mjs
scripts/lib/supervibe-assignment-explainer.mjs
scripts/lib/supervibe-worker-reviewer-presets.mjs
schemas/supervibe-policy-profile.schema.json
schemas/supervibe-semantic-anchor.schema.json
schemas/supervibe-agent-capability.schema.json
schemas/supervibe-trigger-intent.schema.json
tests/autonomous-loop-task-graph.test.mjs
tests/autonomous-loop-ready-front.test.mjs
tests/autonomous-loop-claims.test.mjs
tests/autonomous-loop-async-gates.test.mjs
tests/autonomous-loop-doctor.test.mjs
tests/autonomous-loop-contracts.test.mjs
tests/autonomous-loop-verification-matrix.test.mjs
tests/autonomous-loop-failure-packet.test.mjs
tests/autonomous-loop-fresh-context-executor.test.mjs
tests/autonomous-loop-tool-adapters.test.mjs
tests/autonomous-loop-archive.test.mjs
tests/autonomous-loop-graph-export.test.mjs
tests/supervibe-workflow-router.test.mjs
tests/supervibe-skill-chain.test.mjs
tests/supervibe-plan-to-work-items.test.mjs
tests/supervibe-worktree-session-manager.test.mjs
tests/supervibe-trigger-evaluator.test.mjs
tests/supervibe-trigger-intent-corpus.test.mjs
tests/supervibe-trigger-router.test.mjs
tests/supervibe-chain-handoff-enforcer.test.mjs
tests/supervibe-trigger-diagnostics.test.mjs
tests/supervibe-trigger-metadata-linter.test.mjs
tests/autonomous-loop-provider-policy-guard.test.mjs
tests/autonomous-loop-permission-audit.test.mjs
tests/supervibe-durable-task-tracker-adapter.test.mjs
tests/supervibe-task-tracker-mcp-bridge.test.mjs
tests/supervibe-task-tracker-sync.test.mjs
tests/supervibe-task-tracker-doctor.test.mjs
tests/supervibe-work-item-template-catalog.test.mjs
tests/supervibe-work-item-query.test.mjs
tests/supervibe-work-item-comments.test.mjs
tests/readme-autonomous-loop-docs.test.mjs
tests/autonomous-loop-learning-extractor.test.mjs
tests/autonomous-loop-guidance-updater.test.mjs
tests/supervibe-plugin-package-audit.test.mjs
tests/autonomous-loop-context-budget.test.mjs
tests/supervibe-work-item-daemon.test.mjs
tests/supervibe-work-item-priority-formula.test.mjs
tests/supervibe-work-item-migration-importer.test.mjs
tests/supervibe-work-item-message-delegation.test.mjs
tests/supervibe-shell-completions.test.mjs
tests/supervibe-release-security-audit.test.mjs
tests/supervibe-install-integrity.test.mjs
tests/supervibe-dependency-provenance.test.mjs
tests/supervibe-run-dashboard.test.mjs
tests/supervibe-external-integration-catalog.test.mjs
tests/supervibe-notification-router.test.mjs
tests/supervibe-federated-sync-bundle.test.mjs
tests/supervibe-work-item-query-language.test.mjs
tests/supervibe-work-item-saved-views.test.mjs
tests/supervibe-work-item-scheduler.test.mjs
tests/supervibe-work-item-sla-reports.test.mjs
tests/supervibe-interactive-cli.test.mjs
tests/supervibe-command-palette.test.mjs
tests/supervibe-terminal-renderer.test.mjs
tests/supervibe-guided-work-item-forms.test.mjs
tests/autonomous-loop-eval-harness.test.mjs
tests/autonomous-loop-replay-runner.test.mjs
tests/autonomous-loop-benchmark-corpus.test.mjs
tests/autonomous-loop-quality-scorecard.test.mjs
tests/supervibe-policy-profile-manager.test.mjs
tests/supervibe-approval-receipt-ledger.test.mjs
tests/supervibe-config-drift-detector.test.mjs
tests/supervibe-team-governance.test.mjs
tests/supervibe-semantic-anchor-index.test.mjs
tests/supervibe-file-local-contracts.test.mjs
tests/supervibe-change-summary-index.test.mjs
tests/supervibe-anchor-drift-detector.test.mjs
tests/supervibe-agent-capability-registry.test.mjs
tests/supervibe-wave-controller.test.mjs
tests/supervibe-assignment-explainer.test.mjs
tests/supervibe-worker-reviewer-presets.test.mjs
```

### Modified
- `README.md` - document the upgraded autonomous loop, review loop, work-item epic flow, worktree sessions, status/resume/stop examples, and provider-safe boundaries.
- `CHANGELOG.md` - add release notes for the autonomous loop upgrade once implementation lands.
- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and CLI-specific plugin docs - receive reviewed, scoped learnings from autonomous runs without duplicating stale guidance.
- `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.opencode/plugin.json`, `registry.yaml`, `install.sh`, `install.ps1`, `update.sh`, and `update.ps1` - validate marketplace/package metadata, versions, command exposure, and install/update paths.
- `LICENSE`, `package-lock.json`, and generated release-security docs - track third-party license inventory, dependency provenance, install integrity, and vulnerability gate expectations.
- `scripts/lib/autonomous-loop-runner.mjs` - use task graph, ready fronts, claims, contracts, real execution attempts, failure packets, and archives.
- `scripts/lib/autonomous-loop-task-source.mjs` - parse PRD, plan markdown, task JSON, checked stories, dependencies, acceptance criteria, and verification commands into graph tasks.
- `scripts/lib/autonomous-loop-dispatcher.mjs` - route by module taxonomy, risk, stack, file impact, prior performance, and reviewer independence.
- `scripts/lib/autonomous-loop-preflight-intake.mjs` - add autonomy readiness, async gates, execution mode, contract coverage, and required evidence checks.
- `scripts/lib/autonomous-loop-status.mjs` - show ready front, active claims, blocked gates, progress, iteration budget, and next safe action.
- `scripts/lib/autonomous-loop-final-acceptance.mjs` - require graph closure, evidence coverage, side-effect reconciliation, contract satisfaction, and reviewer independence.
- `scripts/lib/autonomous-loop-policy-guard.mjs` - add provider-safe permission, automation, network, MCP, rate-limit, and bypass-mode checks.
- `scripts/supervibe-loop.mjs` - add `graph`, `doctor`, `prime`, `export`, `import`, `readiness`, `archive`, and `--from-prd` modes.
- `commands/supervibe-loop.md` - document new modes, safety boundaries, task graph format, real execution modes, worktree sessions, and stop behavior.
- `commands/supervibe-brainstorm.md` - strengthen trigger language and mandatory next-step handoff to planning.
- `commands/supervibe-plan.md` - add plan review loop, work-item atomization, and execution handoff.
- `commands/supervibe-execute-plan.md` - add worktree-backed autonomous run and work-item epic execution modes.
- `commands/supervibe-status.md` or `scripts/supervibe-status.mjs` - show durable task tracker availability, active epic, ready work, claims, and sync health.
- `commands/supervibe.md` - route "what is ready?", "what is blocked?", "ask about this epic", and "resume work" to the work-item query surface, then add trigger diagnostics and bilingual intent routing for chain continuation.
- `scripts/supervibe-status.mjs` - add watch mode, context-budget warnings, priority formula output, delegated-message inbox, and onboarding hints.
- `scripts/supervibe-loop.mjs` - add context-budget handoff, migration import, daemon lifecycle, and message delegation commands.
- `scripts/supervibe-status.mjs` and `scripts/supervibe-loop.mjs` - add dashboard export, integration discovery, notification routing, and federated sync bundle commands.
- `scripts/supervibe-status.mjs` and `scripts/supervibe-loop.mjs` - add saved views, structured query filters, deferred work, scheduled checks, and recurring local reports.
- `scripts/supervibe-status.mjs`, `scripts/supervibe-loop.mjs`, and `commands/supervibe.md` - add interactive terminal picker, guided forms, command palette, pager-safe output, and write previews.
- `scripts/supervibe-loop.mjs`, `scripts/supervibe-status.mjs`, and `package.json` - add eval, replay, benchmark, and quality scorecard commands.
- `scripts/supervibe-loop.mjs`, `scripts/supervibe-status.mjs`, `commands/supervibe-loop.md`, and provider-safety rules - add policy profiles, approval receipts, config drift checks, team roles, and CI-safe governance modes.
- `scripts/supervibe-loop.mjs`, CodeGraph/RAG modules, and refactor rules - add optional semantic anchors, file-local contracts, change summaries, and anchor drift checks.
- `scripts/lib/autonomous-loop-dispatcher.mjs`, `skills/subagent-driven-development/SKILL.md`, and agent docs - add capability registry, worker/reviewer presets, wave controller, and assignment explanations.
- `docs/autonomous-loop-scenarios.md` - expand every required scenario with intake, graph, dispatch, evidence, resume, and stop expectations.
- `docs/autonomous-loop-production-readiness.md` - add approval leases, async gates, rollback evidence, CI/PR gates, and production-prep report requirements.
- `rules/anti-hallucination.md` or a new provider-safety rule - document provider-compliance boundaries for autonomous loops.
- `skills/autonomous-agent-loop/SKILL.md` - update the procedure for graph execution, contracts, readiness gate, fresh-context attempts, and failure handoffs.
- `skills/brainstorming/SKILL.md` - add explicit trigger matrix, mandatory chain transition, and no-silent-stop behavior.
- `skills/writing-plans/SKILL.md` - add plan review loop, work-item epic emission, and explicit execution options.
- `skills/subagent-driven-development/SKILL.md` - require isolated worktree option and per-work-item review loop for long runs.
- `skills/using-git-worktrees/SKILL.md` - upgrade from optional isolation helper to first-class multi-session execution support.
- `skills/requesting-code-review/SKILL.md` - make post-plan and per-wave review package generation part of the chain.
- `schemas/autonomous-loop-task.schema.json` - add claim, attempt, graph, contract, verification, evidence, and progress fields.
- `schemas/autonomous-loop-state.schema.json` - add graph, gates, claims, attempts, archives, readiness, progress, and failure packet fields.
- `package.json` - add scripts for loop readiness, doctor, graph export, and focused loop tests.

---

## Critical Path

`T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T-FINAL`

Off-path parallel work:
- `T9` graph visualization/export can run after `T2`.
- `T10` docs/command surface can run after `T4`.
- `T11` scenario expansion can run after `T5`.
- `T12` archive/export/import can run after `T2`.
- `T15` workflow trigger/chaining can run after `T1`.
- `T16` plan-to-work-item atomization can run after `T2`.
- `T17` worktree autonomous session management can run after `T3`.
- `T18` provider-compliance guard can run after `T4`.
- `T19` durable task tracker integration can run after `T16` and before worktree autonomous execution.
- `T20` work-item UX/query/templates can run after `T16` and T19 adapter contracts.
- `T21` README/public docs sync can run after `T13`, `T16`, `T17`, `T18`, `T19`, and `T20`.
- `T22` operational memory and package audit can run after `T7`, `T10`, `T13`, and `T21`.
- `T23` advanced work-item operations can run after `T16`, `T19`, `T20`, and `T22`.
- `T24` release security and provenance can run after `T14`, `T21`, and `T22`.
- `T25` ecosystem integrations and dashboard can run after `T9`, `T19`, `T20`, and `T23`.
- `T26` saved views, scheduling, and reports can run after `T20`, `T23`, and `T25`.
- `T27` interactive CLI ergonomics can run after `T13`, `T20`, `T23`, and `T26`.
- `T28` autonomous quality evals can run after `T6`, `T8`, `T14`, `T21`, and `T25`.
- `T29` policy profiles and team governance can run after `T18`, `T20`, `T22`, `T24`, and `T27`.
- `T30` semantic anchors and file-local contracts can run after `T5`, `T6`, `T9`, `T10`, and `T28`.
- `T31` multi-agent orchestration presets can run after `T5`, `T6`, `T8`, `T17`, `T20`, `T29`, and `T30`.
- `T32` trigger reliability hardening can run after `T15`, `T16`, `T21`, `T28`, and `T31`.

---

## Task 1: Baseline And Compatibility Lock

**Files:**
- Modify: `docs/autonomous-loop-scenarios.md`
- Modify: `tests/autonomous-loop-runner.test.mjs`
- Modify: `tests/autonomous-loop-final-acceptance.test.mjs`
- Test: `npm test -- tests/autonomous-loop-runner.test.mjs tests/autonomous-loop-final-acceptance.test.mjs`

**Estimated time:** 45min, confidence: high
**Rollback:** revert changed docs/tests
**Risks:** existing tests may be too shallow; mitigation: add assertions around current state artifacts before changing behavior.

- [x] **Step 0: Write failing test / red phase**
  - Add or update the listed tests first and verify they fail because the compatibility assertions are not implemented yet.

- [x] **Step 1: Capture the current `/supervibe-loop` artifact contract**
  - Record expected `preflight.json`, `state.json`, `tasks.jsonl`, `scores.jsonl`, `handoffs.jsonl`, `events.jsonl`, `side-effects.jsonl`, and `final-report.md`.
  - Define compatibility fields that cannot be removed without migration.
  - Add a fixture run for `--dry-run --request "validate integrations"`.

- [x] **Step 2: Add regression expectations for existing loop status**
  - Assert `SUPERVIBE_LOOP_STATUS` still reports status, exit signal, confidence, next agent, next action, stop reason, and policy risk.
  - Assert old state files remain readable after future migrations.

- [x] **Step 3: Add a migration policy note**
  - State schema upgrades must write `.pre-migration` backups.
  - State readers must tolerate unknown future fields.

- [x] **Step 4: Run verification**
```bash
npm test -- tests/autonomous-loop-runner.test.mjs tests/autonomous-loop-final-acceptance.test.mjs
```

- [x] **Step 5: No commits until review gate**
  - Commit is suppressed until Review Gate 1 passes locally.

**Acceptance Criteria:**
- Current loop behavior is pinned before refactor.
- New fields can be added without breaking old status/resume flows.
- Tests fail if final report, status, or state compatibility is accidentally removed.

---

## Task 2: Durable Task Graph Model

**Files:**
- Create: `schemas/autonomous-loop-graph.schema.json`
- Create: `scripts/lib/autonomous-loop-task-graph.mjs`
- Create: `scripts/lib/autonomous-loop-ready-front.mjs`
- Modify: `scripts/lib/autonomous-loop-task-source.mjs`
- Modify: `schemas/autonomous-loop-task.schema.json`
- Test: `tests/autonomous-loop-task-graph.test.mjs`
- Test: `tests/autonomous-loop-ready-front.test.mjs`

**Estimated time:** 2h, confidence: high
**Rollback:** remove new graph modules and restore task-source parser
**Risks:** dependency direction mistakes; mitigation: use "dependent needs prerequisite" language in tests.

- [x] **Step 0: Write failing test / red phase**
  - Add graph and ready-front tests first and verify they fail because the graph model does not exist yet.

- [x] **Step 1: Define graph task schema**
  - Fields: `id`, `title`, `goal`, `category`, `status`, `priority`, `dependencies`, `dependents`, `relations`, `parentId`, `epicId`, `source`, `acceptanceCriteria`, `verificationCommands`, `policyRiskLevel`, `stopConditions`.
  - Relation types: `blocks`, `related`, `duplicates`, `supersedes`, `replies_to`, `discovered_from`, `parent_child`.
  - Statuses: `open`, `ready`, `claimed`, `in_progress`, `blocked`, `deferred`, `failed`, `complete`, `cancelled`, `policy_stopped`, `budget_stopped`.

- [x] **Step 2: Implement dependency validation**
  - Detect unknown dependency IDs.
  - Detect cycles and report the shortest cycle path.
  - Detect duplicate IDs.
  - Detect tasks that depend on themselves.
  - Detect impossible ready fronts.

- [x] **Step 3: Implement ready-front calculation**
  - Ready front = open tasks where all blockers are complete.
  - Blocked front = open tasks with open blockers.
  - Parallel front must respect `max_concurrent_agents`, risk level, and reviewer availability.
  - Preserve deterministic ordering by priority, dependency depth, and source order.

- [x] **Step 4: Extend task source parsing**
  - Parse existing markdown checklist plans.
  - Parse story-loop `prd.json` records with `passes: false`.
  - Parse explicit JSON task graph.
  - Infer dependency order from PRD/story priority when no explicit deps exist.
  - Preserve current request-generated default tasks as a fallback graph.

- [x] **Step 5: Run verification**
```bash
npm test -- tests/autonomous-loop-task-graph.test.mjs tests/autonomous-loop-ready-front.test.mjs tests/autonomous-loop-task-source.test.mjs
```

- [x] **Step 6: No commits until review gate**
  - Commit is suppressed until graph compatibility and ready-front tests pass.

**Acceptance Criteria:**
- `/supervibe-loop --plan` can produce a graph instead of a flat list.
- Existing plan parsing remains compatible.
- Ready-front tests cover linear tasks, parallel tasks, blockers, duplicate relations, cycles, and empty graphs.

---

## Task 3: Claims, Leases, Progress Notes, And Compaction Survival

**Files:**
- Create: `scripts/lib/autonomous-loop-claims.mjs`
- Create: `scripts/lib/autonomous-loop-progress-log.mjs`
- Modify: `scripts/lib/autonomous-loop-status.mjs`
- Modify: `scripts/lib/autonomous-loop-runner.mjs`
- Modify: `schemas/autonomous-loop-state.schema.json`
- Test: `tests/autonomous-loop-claims.test.mjs`

**Estimated time:** 2h, confidence: high
**Rollback:** revert claim/progress integration and keep flat execution
**Risks:** stale claims can block work forever; mitigation: claim expiry, doctor repair, and explicit stale-claim status.

- [x] **Step 0: Write failing test / red phase**
  - Add claim expiry and progress-log tests first and verify they fail before implementation.

- [x] **Step 1: Add atomic claim records**
  - Fields: `taskId`, `agentId`, `claimId`, `claimedAt`, `expiresAt`, `status`, `attemptId`.
  - Claim must fail if a task is already actively claimed.
  - Expired claims must be visible and repairable.

- [x] **Step 2: Add approval-style leases for claims**
  - Respect `max_runtime_minutes`, `approval_lease.expires_after_loops`, and task risk.
  - High-risk tasks require exact approval lease before claim can execute mutation.

- [x] **Step 3: Add append-only `progress.md`**
  - Maintain human-readable sections: `COMPLETED`, `IN_PROGRESS`, `NEXT`, `DECISIONS`, `BLOCKERS`, `EVIDENCE`.
  - Write one entry per attempt.
  - Link entries to task IDs, attempt IDs, score IDs, and evidence paths.

- [x] **Step 4: Add resumability notes per task**
  - Each task stores `resumeNotes` with enough context for a fresh agent.
  - Require concrete next action on incomplete tasks.
  - Add redaction and no-raw-secret checks before memory writes.

- [x] **Step 5: Run verification**
```bash
npm test -- tests/autonomous-loop-claims.test.mjs tests/autonomous-loop-status.test.mjs
```

- [x] **Step 6: No commits until review gate**
  - Commit is suppressed until claim, resume, and status behavior are verified.

**Acceptance Criteria:**
- A resumed loop can reconstruct active task, blocker, next action, and evidence without conversation history.
- Stale claims do not permanently block ready-front progress.
- `progress.md` is compact enough for humans and structured enough for agents.

---

## Task 4: Async Gates And Policy-Aware Blocking

**Files:**
- Create: `scripts/lib/autonomous-loop-async-gates.mjs`
- Modify: `scripts/lib/autonomous-loop-policy-guard.mjs`
- Modify: `scripts/lib/autonomous-loop-preflight-intake.mjs`
- Modify: `scripts/lib/autonomous-loop-runner.mjs`
- Test: `tests/autonomous-loop-async-gates.test.mjs`

**Estimated time:** 2h, confidence: medium
**Rollback:** remove gate module and keep existing policy stop behavior
**Risks:** external gate polling can become flaky; mitigation: make all external checks optional adapters with dry-run-friendly status.

- [x] **Step 0: Write failing test / red phase**
  - Add gate lifecycle and policy-block tests first and verify they fail before the gate module exists.

- [x] **Step 1: Define gate schema**
  - Gate types: `human`, `ci`, `pr`, `timer`, `manual`, `custom`.
  - Fields: `gateId`, `taskId`, `awaitSpec`, `title`, `createdAt`, `timeoutAt`, `status`, `approvedBy`, `result`, `evidence`.

- [x] **Step 2: Implement gate lifecycle**
  - `createGate`, `listGates`, `evaluateGate`, `approveGate`, `closeGate`, `expireGate`.
  - Timer gates must close deterministically.
  - Human gates must never auto-approve.
  - CI/PR gates must be adapter-backed and safe when `gh` is unavailable.

- [x] **Step 3: Connect gates to policy guard**
  - Production/deploy/destructive/credential/DNS/billing/account actions create blocked gates unless approval lease already covers the exact action.
  - Gate status must appear in `state.json`, `progress.md`, and `/supervibe-loop --status`.

- [x] **Step 4: Add cancellation semantics**
  - Stopping a loop must not approve or close gates silently.
  - Stop command can only terminate loop-owned processes from side-effect ledger.

- [x] **Step 5: Run verification**
```bash
npm test -- tests/autonomous-loop-async-gates.test.mjs tests/autonomous-loop-policy-guard.test.mjs tests/autonomous-loop-cancellation.test.mjs
```

- [x] **Step 6: No commits until review gate**
  - Commit is suppressed until gate, policy, and cancellation tests pass.

**Acceptance Criteria:**
- A production-intent task stops at a human approval gate.
- Timer gates can be evaluated without network.
- Missing `gh` or remote access produces a blocked gate, not a hidden failure.

---

## Task 5: Contract Packets And Autonomy Readiness

**Files:**
- Create: `schemas/autonomous-loop-contract.schema.json`
- Create: `confidence-rubrics/autonomy-readiness.yaml`
- Create: `scripts/lib/autonomous-loop-contracts.mjs`
- Modify: `scripts/lib/autonomous-loop-preflight-intake.mjs`
- Modify: `skills/autonomous-agent-loop/SKILL.md`
- Test: `tests/autonomous-loop-contracts.test.mjs`

**Estimated time:** 3h, confidence: medium
**Rollback:** disable readiness gate and keep contracts as optional metadata
**Risks:** too much contract ceremony for small tasks; mitigation: apply full contract only for non-trivial, high-risk, multi-file, or autonomous execution tasks.

- [x] **Step 0: Write failing test / red phase**
  - Add contract generation and readiness scoring tests first and verify they fail before implementation.

- [x] **Step 1: Define execution contract packet**
  - Fields: `purpose`, `scopeIn`, `scopeOut`, `inputs`, `outputs`, `sideEffects`, `forbiddenBehavior`, `dependencies`, `targetFiles`, `moduleType`, `publicInterfaces`, `observability`, `verificationRefs`.
  - Module taxonomy: `ENTRY_POINT`, `CORE_LOGIC`, `DATA_LAYER`, `UI_COMPONENT`, `UTILITY`, `INTEGRATION`, `DOCUMENTATION`, `INFRASTRUCTURE`.

- [x] **Step 2: Generate contracts from tasks**
  - For PRD stories, derive contract from acceptance criteria.
  - For plan tasks, derive contract from section, goal, source line, and verification commands.
  - For request-generated tasks, create minimal contracts and flag missing specifics.

- [x] **Step 3: Add autonomy readiness scoring**
  - Check: graph validity, contract coverage, verification coverage, policy readiness, evidence expectations, rollback expectations, tool access, reviewer independence, progress/resume paths.
  - Gate long autonomous runs below 9/10.
  - Provide exact remediation steps instead of a vague score.

- [x] **Step 4: Add `supervibe-loop readiness` command**
  - Print score, pass/fail, missing contracts, missing verification, unresolved gates, and next safe action.
  - Support JSON output for tests and future UI.

- [x] **Step 5: Run verification**
```bash
npm test -- tests/autonomous-loop-contracts.test.mjs tests/autonomous-loop-preflight-intake.test.mjs tests/rubric-schema.test.mjs
```

- [x] **Step 6: No commits until review gate**
  - Commit is suppressed until contract and autonomy-readiness tests pass.

**Acceptance Criteria:**
- Long runs cannot start with missing contracts, no verification, or unclear stop conditions unless `--dry-run` or explicit user override.
- Small local validation requests can still use minimal quick preflight.
- Readiness output gives concrete fixes.

---

## Task 6: Verification Matrix, Evidence Model, And Failure Packets

**Files:**
- Create: `schemas/autonomous-loop-verification.schema.json`
- Create: `schemas/autonomous-loop-failure-packet.schema.json`
- Create: `scripts/lib/autonomous-loop-verification-matrix.mjs`
- Create: `scripts/lib/autonomous-loop-failure-packet.mjs`
- Modify: `scripts/lib/autonomous-loop-evaluator.mjs`
- Modify: `scripts/lib/autonomous-loop-final-acceptance.mjs`
- Test: `tests/autonomous-loop-verification-matrix.test.mjs`
- Test: `tests/autonomous-loop-failure-packet.test.mjs`

**Estimated time:** 3h, confidence: medium
**Rollback:** keep old score-only evaluator
**Risks:** evidence requirements can become noisy; mitigation: distinguish module, wave, and phase evidence levels.

- [x] **Step 0: Write failing test / red phase**
  - Add verification matrix, evidence coverage, and failure-packet tests first and verify they fail before implementation.

- [x] **Step 1: Define verification matrix**
  - Scenario fields: `scenarioId`, `contractRef`, `taskId`, `evidenceType`, `command`, `expectedOutcome`, `requiredMarkers`, `forbiddenMarkers`, `level`.
  - Evidence types: deterministic assertion, trace assertion, integration check, browser check, semantic evaluation with rubric.
  - Levels: module, wave, phase, production-prep.

- [x] **Step 2: Require evidence per task**
  - Every task needs at least one verification entry or an explicit test gap.
  - UI tasks require browser/preview evidence.
  - Integration tasks require environment/access evidence or blocked gate.
  - Refactor tasks require CodeGraph/caller/callee/blast-radius evidence.

- [x] **Step 3: Add stable trace/log marker expectations**
  - Recommended marker shape: `[Module][Function][BLOCK]`.
  - Never require logging chain-of-thought or hidden reasoning.
  - Prefer stable structured fields over prose assertions.

- [x] **Step 4: Implement failure packets**
  - Fields: `taskId`, `attemptId`, `contractRef`, `failedScenario`, `expectedEvidence`, `observedEvidence`, `firstDivergentModule`, `firstDivergentMarker`, `suggestedNextAction`, `requeueReason`, `confidenceCap`.
  - Failure packets drive requeue, fix, or user-blocked state.

- [x] **Step 5: Add no-progress circuit breaker**
  - Stop or ask user when repeated attempts produce the same failure packet.
  - Distinguish flaky check, missing access, contract drift, implementation bug, and policy block.

- [x] **Step 6: Run verification**
```bash
npm test -- tests/autonomous-loop-verification-matrix.test.mjs tests/autonomous-loop-failure-packet.test.mjs tests/autonomous-loop-evaluator.test.mjs tests/autonomous-loop-final-acceptance.test.mjs
```

- [x] **Step 7: No commits until review gate**
  - Commit is suppressed until evidence, scoring, and failure-packet behavior are verified.

**Acceptance Criteria:**
- A task cannot score 9+ without evidence matching its verification matrix.
- Failed attempts leave enough structured context for a different agent to continue.
- Final acceptance fails if graph closure or required evidence is missing.

---

## Task 7: Real Execution Adapter Layer And Fresh-Context Mode

**Files:**
- Create: `scripts/lib/autonomous-loop-fresh-context-executor.mjs`
- Create: `scripts/lib/autonomous-loop-tool-adapters.mjs`
- Modify: `scripts/lib/autonomous-loop-runner.mjs`
- Modify: `scripts/lib/autonomous-loop-side-effect-ledger.mjs`
- Test: `tests/autonomous-loop-fresh-context-executor.test.mjs`
- Test: `tests/autonomous-loop-tool-adapters.test.mjs`

**Estimated time:** 4h, confidence: medium
**Rollback:** keep execution mode disabled behind `--dry-run` and feature flag
**Risks:** shell/tool adapters can run unsafe commands; mitigation: explicit execution modes, allowlists by tool class, side-effect ledger, and policy guard before mutation.

- [x] **Step 0: Write failing test / red phase**
  - Add fresh-context stub adapter tests first and verify they fail before the adapter interface exists.

- [x] **Step 1: Define execution modes**
  - `dry-run`: current safe artifact generation.
  - `guided`: create handoff prompts and wait for the current agent/user to execute.
  - `fresh-context`: spawn a configured AI CLI with a compact task packet.
  - `manual`: produce exact commands and acceptance checklist only.

- [x] **Step 2: Add tool adapter interface**
  - Methods: `detect`, `renderPrompt`, `run`, `collectOutput`, `extractCompletionSignal`, `extractChangedFiles`, `stop`.
  - Adapters: Codex, Claude, Gemini, OpenCode, generic shell stub.
  - Adapter availability must appear in readiness and status.

- [x] **Step 3: Build fresh-context task packet**
  - Include only: task contract, acceptance criteria, verification matrix, context pack, progress notes, policy boundaries, side-effect rules, output contract.
  - Exclude unrelated conversation history.
  - Require explicit completion signal and evidence summary.

- [x] **Step 4: Add attempt lifecycle**
  - Attempt statuses: `started`, `tool_failed`, `verification_failed`, `requeued`, `completed`, `blocked`, `cancelled`.
  - Every attempt writes output path, changed file list, verification evidence, score, and failure packet if any.

- [x] **Step 5: Optional commit-per-task mode**
  - `--commit-per-task` commits only after checks pass and user policy allows git mutation.
  - Commit message references task ID and score.
  - Default remains no auto-commit unless configured.

- [x] **Step 6: Run verification**
```bash
npm test -- tests/autonomous-loop-fresh-context-executor.test.mjs tests/autonomous-loop-tool-adapters.test.mjs tests/autonomous-loop-side-effect-ledger.test.mjs
```

- [x] **Step 7: No commits until review gate**
  - Commit is suppressed by default; `--commit-per-task` is tested but remains opt-in.

**Acceptance Criteria:**
- Default behavior remains safe and does not spawn external AI tools unexpectedly.
- Fresh-context mode can run against a stub adapter in tests.
- All spawned processes are represented in the side-effect ledger and stoppable.

---

## Task 8: Runner Integration, Requeue, And Final Acceptance

**Files:**
- Modify: `scripts/lib/autonomous-loop-runner.mjs`
- Modify: `scripts/lib/autonomous-loop-evaluator.mjs`
- Modify: `scripts/lib/autonomous-loop-final-acceptance.mjs`
- Modify: `scripts/lib/autonomous-loop-status.mjs`
- Test: `tests/autonomous-loop-runner.test.mjs`
- Test: `tests/autonomous-loop-final-acceptance.test.mjs`
- Test: `tests/autonomous-loop-status.test.mjs`

**Estimated time:** 4h, confidence: medium
**Rollback:** retain graph modules but switch runner to flat compatibility mode
**Risks:** runner complexity can obscure stop reasons; mitigation: one explicit state transition per attempt and strong status tests.

- [x] **Step 0: Write failing test / red phase**
  - Add scheduler, requeue, final-acceptance, and status tests first and verify they fail before runner integration.

- [x] **Step 1: Replace flat for-loop with ready-front scheduler**
  - Load graph.
  - Evaluate gates and stale claims.
  - Claim ready tasks up to concurrency budget.
  - Execute attempts according to execution mode.
  - Verify evidence.
  - Complete, requeue, block, or stop each task.

- [x] **Step 2: Add requeue taxonomy**
  - Reasons: `verification_failed`, `contract_drift`, `missing_access`, `flaky_check`, `policy_gate`, `tool_failed`, `no_progress`, `review_failed`.
  - Confidence cap depends on reason.

- [x] **Step 3: Enforce reviewer independence**
  - High-risk, shared-contract, security, production-prep, and broad refactor tasks require independent reviewer.
  - Reviewer evidence must be linked in handoff.

- [x] **Step 4: Strengthen final acceptance**
  - Require graph closed or explicitly blocked with stop reason.
  - Require all complete tasks score at least 9.
  - Require side-effect reconciliation.
  - Require evidence matrix coverage.
  - Require unresolved gates listed.
  - Require progress and report artifacts.

- [x] **Step 5: Improve status output**
  - Show ready count, blocked count, claimed count, complete count.
  - Show active gates.
  - Show last progress and repeated failure signatures.
  - Show next safe action.

- [x] **Step 6: Run verification**
```bash
npm test -- tests/autonomous-loop-runner.test.mjs tests/autonomous-loop-final-acceptance.test.mjs tests/autonomous-loop-status.test.mjs
```

- [x] **Step 7: No commits until review gate**
  - Commit is suppressed until runner integration and final acceptance pass together.

**Acceptance Criteria:**
- Runner can complete a graph with parallel-ready tasks in deterministic order.
- Failed tasks requeue or block with structured reason.
- Final report explains what is complete, blocked, pending, and why.

---

## Task 9: Graph Export, Visualization, And Human Inspection

**Files:**
- Create: `scripts/lib/autonomous-loop-graph-export.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `commands/supervibe-loop.md`
- Test: `tests/autonomous-loop-graph-export.test.mjs`

**Estimated time:** 90min, confidence: high
**Rollback:** remove graph export mode
**Risks:** visual output can drift from scheduler logic; mitigation: export from the same normalized graph object.

- [x] **Step 0: Write failing test / red phase**
  - Add graph export tests first and verify they fail before export formats exist.

- [x] **Step 1: Add graph export formats**
  - JSON normalized graph.
  - Mermaid flowchart.
  - DOT graph.
  - Compact text tree.

- [x] **Step 2: Add status overlays**
  - Include status, score, claim, gate, and requeue reason.
  - Mark ready-front tasks distinctly in text output.

- [x] **Step 3: Add command surface**
  - `npm run supervibe:loop -- graph --file .claude/memory/loops/example-run/state.json`
  - `/supervibe-loop --graph --file .claude/memory/loops/example-run/state.json`
  - Optional `--format json|mermaid|dot|text`.

- [x] **Step 4: Run verification**
```bash
npm test -- tests/autonomous-loop-graph-export.test.mjs tests/command-surface.test.mjs
```

- [x] **Step 5: No commits until review gate**
  - Commit is suppressed until graph export output is deterministic.

**Acceptance Criteria:**
- Humans can inspect task dependencies without reading JSON by hand.
- Graph export works for incomplete, complete, blocked, and failed runs.

---

## Task 10: Doctor, Repair, Prime, Archive, Export, Import

**Files:**
- Create: `scripts/lib/autonomous-loop-doctor.mjs`
- Create: `scripts/lib/autonomous-loop-archive.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `commands/supervibe-loop.md`
- Test: `tests/autonomous-loop-doctor.test.mjs`
- Test: `tests/autonomous-loop-archive.test.mjs`

**Estimated time:** 3h, confidence: high
**Rollback:** remove command modes and keep state artifacts untouched
**Risks:** repair commands can mutate state incorrectly; mitigation: dry-run first, backup before write, explicit `--fix`.

- [x] **Step 0: Write failing test / red phase**
  - Add doctor, repair backup, prime, archive, export, and import tests first and verify they fail before implementation.

- [x] **Step 1: Implement doctor checks**
  - Missing artifacts.
  - Invalid JSON/JSONL.
  - Schema version mismatch.
  - Unknown task dependencies.
  - Cycles.
  - Orphan attempts.
  - Stale claims.
  - Unresolved side effects.
  - Missing final report.
  - Evidence references pointing to missing files.

- [x] **Step 2: Implement safe repair**
  - Always write `.pre-doctor-fix` backup.
  - Repair stale claims, missing derived fields, orphan status, and report regeneration.
  - Never mark tasks complete automatically.

- [x] **Step 3: Implement prime summary**
  - Print AI-optimized run context: objective, ready front, blockers, active claims, gates, latest decisions, next action.
  - Keep it compact enough to paste into a fresh context.

- [x] **Step 4: Implement archive/export/import**
  - Archive previous runs by feature/branch/run ID.
  - Export run bundle with state, graph, progress, reports, evidence index, and checksums.
  - Import validates bundle before writing.
  - Do not archive raw secrets.

- [x] **Step 5: Run verification**
```bash
npm test -- tests/autonomous-loop-doctor.test.mjs tests/autonomous-loop-archive.test.mjs tests/autonomous-loop-artifact-retention.test.mjs
```

- [x] **Step 6: No commits until review gate**
  - Commit is suppressed until repair mode is backed up and deterministic.

**Acceptance Criteria:**
- Broken loop state can be diagnosed without manual JSON inspection.
- Repair mode is opt-in and backed up.
- A fresh agent can run prime and resume safely.

---

## Task 11: PRD And Story Conversion

**Files:**
- Modify: `scripts/lib/autonomous-loop-task-source.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `commands/supervibe-loop.md`
- Test: `tests/autonomous-loop-task-source.test.mjs`

**Estimated time:** 2h, confidence: high
**Rollback:** disable `--from-prd`
**Risks:** oversized stories reduce quality; mitigation: add story-size validator and split suggestions.

- [x] **Step 0: Write failing test / red phase**
  - Add PRD extraction, story JSON, and oversized-story tests first and verify they fail before parser changes.

- [x] **Step 1: Add PRD markdown extraction**
  - Extract title, goals, requirements, user stories, acceptance criteria, risks, non-goals.
  - Derive branch/feature slug.
  - Preserve source line references when possible.

- [x] **Step 2: Add story-loop JSON support**
  - Accept `project`, `branchName`, `description`, `userStories`.
  - Treat `passes: true` as complete and `passes: false` as open.
  - Convert priority to graph ordering.

- [x] **Step 3: Enforce story-size rules**
  - One story should fit one context window.
  - Flag broad stories like "build dashboard", "add authentication", "refactor API".
  - Suggest splits: schema, backend, UI, integration, verification.

- [x] **Step 4: Add required acceptance criteria**
  - Every story: typecheck or equivalent.
  - Logic story: tests.
  - UI story: browser/preview evidence.
  - Integration story: access/env evidence or blocked gate.

- [x] **Step 5: Run verification**
```bash
npm test -- tests/autonomous-loop-task-source.test.mjs
```

- [x] **Step 6: No commits until review gate**
  - Commit is suppressed until PRD conversion and story-size validation are stable.

**Acceptance Criteria:**
- `/supervibe-loop --from-prd docs/specs/x.md --dry-run` produces a graph with small, verifiable stories.
- Oversized stories block readiness with split suggestions.

---

## Task 12: Scenario Coverage And Production Readiness Docs

**Files:**
- Modify: `docs/autonomous-loop-scenarios.md`
- Modify: `docs/autonomous-loop-production-readiness.md`
- Modify: `skills/autonomous-agent-loop/SKILL.md`
- Modify: `README.md`
- Test: `npm run validate:spec-artifacts`
- Test: `npm run validate:plan-artifacts`

**Estimated time:** 2h, confidence: high
**Rollback:** revert docs only
**Risks:** docs can overpromise before implementation; mitigation: clearly label planned vs implemented until release.

- [x] **Step 0: Write failing test / red phase**
  - Add or update docs validation fixtures first and verify they fail for missing scenario detail.

- [x] **Step 1: Expand required scenarios**
  - Plan execution.
  - Open validation request.
  - Integration repair.
  - Design to development.
  - Refactor.
  - Documentation.
  - Monorepo.
  - Flaky tests.
  - Missing credentials.
  - Policy stop.
  - Server, Docker, and deploy preparation.
  - MCP validation.

- [x] **Step 2: Define each scenario contract**
  - Intake.
  - Graph shape.
  - Dispatch chain.
  - Required contract fields.
  - Required evidence.
  - Confidence gate.
  - Resume behavior.
  - Stop behavior.
  - Rollback/cleanup expectation.

- [x] **Step 3: Update production readiness**
  - Require supply-chain checks.
  - Require CI/local equivalent.
  - Require rollback plan.
  - Require smoke checks.
  - Require observability plan.
  - Require approval boundary statement.
  - Require unresolved gate list.

- [x] **Step 4: Run verification**
```bash
npm run validate:spec-artifacts
npm run validate:plan-artifacts
```

- [x] **Step 5: No commits until review gate**
  - Commit is suppressed until docs validation passes.

**Acceptance Criteria:**
- Every required scenario has intake, graph, dispatch, evidence, confidence, resume, and stop behavior.
- Production-prep can complete autonomously, but production mutation remains approval-gated.

---

## Task 13: Command Surface And User Experience

**Files:**
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `commands/supervibe-loop.md`
- Modify: `docs/internal-commands/supervibe-loop.md`
- Modify: `README.md`
- Test: `tests/command-surface.test.mjs`

**Estimated time:** 2h, confidence: high
**Rollback:** restore previous command docs and CLI parser
**Risks:** command surface can become noisy; mitigation: primary path stays short, diagnostics remain advanced.

- [x] **Step 0: Write failing test / red phase**
  - Add command-surface tests first and verify they fail before new modes are documented and parsed.

- [x] **Step 1: Keep primary invocation simple**
  - `/supervibe-loop --request "validate integrations"`
  - `/supervibe-loop --plan docs/plans/2026-04-29-autonomous-loop-10x-upgrade.md`
  - `/supervibe-loop --from-prd docs/specs/example-feature.md`
  - `/supervibe-loop --resume .claude/memory/loops/example-run/state.json`
  - `/supervibe-loop --status --file .claude/memory/loops/example-run/state.json`
  - `/supervibe-loop --stop example-run`

- [x] **Step 2: Add advanced diagnostics**
  - `--readiness`.
  - `--graph --format text|json|mermaid|dot`.
  - `--doctor [--fix]`.
  - `--prime`.
  - `--archive`.
  - `--export`.
  - `--import`.

- [x] **Step 3: Add clear execution mode flags**
  - `--dry-run`.
  - `--guided`.
  - `--fresh-context --tool codex|claude|gemini|opencode`.
  - `--manual`.
  - `--commit-per-task`.

- [x] **Step 4: Update user-facing status text**
  - Show exact stop reason.
  - Show blocked gate.
  - Show readiness gaps.
  - Show next safe action.

- [x] **Step 5: Run verification**
```bash
npm test -- tests/command-surface.test.mjs
```

- [x] **Step 6: No commits until review gate**
  - Commit is suppressed until primary and advanced command examples are covered.

**Acceptance Criteria:**
- Users can run the safe path without understanding internals.
- Advanced users can diagnose, export, inspect, and resume without editing JSON manually.

---

## Task 14: Regression Suite And Release Gates

**Files:**
- Modify: `package.json`
- Modify: `docs/audits/regression-suite/canonical-tasks.json`
- Add or modify focused tests from all previous tasks.

**Estimated time:** 3h, confidence: high
**Rollback:** revert test script changes
**Risks:** full suite can become slow; mitigation: keep focused loop tests fast and reserve broad suite for release gate.

- [x] **Step 0: Write failing test / red phase**
  - Add regression fixtures first and verify the release gate fails until the new coverage is implemented.

- [x] **Step 1: Add canonical autonomous-loop fixtures**
  - Linear graph.
  - Parallel ready front.
  - Cycle failure.
  - Human gate.
  - Timer gate.
  - UI story requiring browser evidence.
  - Missing credential block.
  - Repeated failure circuit breaker.
  - Production-prep stop.
  - Fresh-context stub success.

- [x] **Step 2: Add schema validation tests**
  - Graph schema.
  - Contract schema.
  - Verification schema.
  - Failure packet schema.
  - Migrated state schema.

- [x] **Step 3: Add release gate**
  - `npm run check` must include new tests and schema validations.
  - Add focused `npm run test:loop` only if needed.

- [x] **Step 4: Add docs validation**
  - Plan artifacts.
  - Spec artifacts.
  - Command surface.
  - Plugin manifest remains valid.

- [x] **Step 5: Run verification**
```bash
npm run check
```

- [x] **Step 6: No commits until review gate**
  - Commit is suppressed until the full release gate passes.

**Acceptance Criteria:**
- The upgrade is covered by deterministic tests.
- Release gate catches graph, contract, readiness, evidence, status, and doctor regressions.

---

## Task 15: Workflow Trigger Router And Skill Chaining

**Files:**
- Create: `scripts/lib/supervibe-workflow-router.mjs`
- Create: `scripts/lib/supervibe-skill-chain.mjs`
- Create: `scripts/lib/supervibe-trigger-evaluator.mjs`
- Modify: `skills/brainstorming/SKILL.md`
- Modify: `skills/writing-plans/SKILL.md`
- Modify: `skills/requesting-code-review/SKILL.md`
- Modify: `commands/supervibe-brainstorm.md`
- Modify: `commands/supervibe-plan.md`
- Modify: `commands/supervibe-execute-plan.md`
- Test: `tests/supervibe-workflow-router.test.mjs`
- Test: `tests/supervibe-skill-chain.test.mjs`
- Test: `tests/supervibe-trigger-evaluator.test.mjs`

**Estimated time:** 3h, confidence: high
**Rollback:** revert router modules and restore command/skill descriptions
**Risks:** over-triggering can annoy users; mitigation: use explicit confidence levels and ask a single transition question before moving into a new phase.

- [x] **Step 0: Write failing test / red phase**
  - Add trigger tests for ambiguous Russian and English prompts first and verify they fail because no workflow router exists yet.

- [x] **Step 1: Define workflow phases and next-step graph**
  - Phases: `intake`, `brainstorm`, `spec-review`, `plan`, `plan-review`, `work-item-atomization`, `worktree-setup`, `execute`, `review`, `finish`.
  - Next-step edges:
    - brainstorm complete -> ask "Next step is writing the implementation plan. Proceed?"
    - plan complete -> run plan review loop, then ask "Atomize into work items and create an epic?"
    - work items created -> ask "Run autonomous execution in an isolated worktree?"
    - execution wave complete -> run review package before next wave.

- [x] **Step 2: Add trigger matrix**
  - Inputs: command name, user phrase, current artifacts, recent assistant output, last completed phase, dirty git state, plan/spec existence.
  - Outputs: recommended skill/command, confidence, reason, next prompt text, stop condition.
  - Include Russian trigger forms for "сделай фичу", "распиши", "переходим?", "запусти по плану", "разбей на задачи", "в отдельном worktree".

- [x] **Step 3: Add no-silent-stop handoff contract**
  - Every producer skill must print a deterministic next-step block.
  - Handoff block includes artifact path, recommended next phase, why, and a yes/no question.
  - The assistant must not end after writing a spec or plan without offering the next phase.

- [x] **Step 4: Add plan review loop after planning**
  - After plan validation, generate a review package before execution handoff.
  - Review dimensions: spec coverage, dependency graph, task size, verification coverage, rollback, parallel safety, worktree suitability.
  - Any review failure sends the plan back for repair instead of execution.

- [x] **Step 5: Run verification**
```bash
npm test -- tests/supervibe-workflow-router.test.mjs tests/supervibe-skill-chain.test.mjs tests/supervibe-trigger-evaluator.test.mjs tests/command-surface.test.mjs
```

- [x] **Step 6: No commits until review gate**
  - Commit is suppressed until trigger routing, chain handoffs, and post-plan review loop are deterministic.

**Acceptance Criteria:**
- Vague feature requests route to brainstorm instead of implementation.
- Completed brainstorm always offers plan transition.
- Completed plan always runs or offers plan review, then work-item atomization.
- Trigger tests cover Russian and English prompts plus mid-conversation continuation.

---

## Task 16: Plan-To-Work-Item Atomization And Epic Bridge

**Files:**
- Create: `scripts/lib/supervibe-plan-to-work-items.mjs`
- Modify: `scripts/lib/autonomous-loop-task-source.mjs`
- Modify: `scripts/lib/autonomous-loop-task-graph.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `commands/supervibe-plan.md`
- Modify: `commands/supervibe-loop.md`
- Test: `tests/supervibe-plan-to-work-items.test.mjs`
- Test: `tests/autonomous-loop-task-source.test.mjs`
- Test: `tests/autonomous-loop-task-graph.test.mjs`

**Estimated time:** 3h, confidence: high
**Rollback:** disable atomization command and keep plan-only execution
**Risks:** bad atomization creates noisy task graphs; mitigation: enforce one work item per independently verifiable change and run graph validation before saving.

- [x] **Step 0: Write failing test / red phase**
  - Add tests that convert a validated implementation plan into an epic, child tasks, hard blockers, soft links, and discovered follow-ups.

- [x] **Step 1: Define work-item schema**
  - Fields: `epicId`, `itemId`, `title`, `type`, `priority`, `parentId`, `blocks`, `related`, `discoveredFrom`, `acceptanceCriteria`, `verificationCommands`, `writeScope`, `estimatedSize`, `parallelGroup`, `executionHints`.
  - Types: `epic`, `task`, `bug`, `chore`, `review`, `gate`, `followup`.

- [x] **Step 2: Convert plan tasks into an epic graph**
  - One plan becomes one epic.
  - Each task becomes a child work item.
  - Critical path becomes hard blocker edges.
  - Parallel batches become parallel groups.
  - Review gates become gate items.
  - Follow-ups discovered during planning use `discoveredFrom`.

- [x] **Step 3: Add optional external task tracker adapter boundary**
  - Keep the native JSONL graph as the default.
  - If an external issue/task CLI is available, provide an adapter interface to create epic/task/dependency records.
  - Adapter failures must leave the native graph intact and report remediation steps.

- [x] **Step 4: Add command flow**
  - `/supervibe-plan` output includes: "Atomize this plan into work items?"
  - `/supervibe-loop --atomize-plan docs/plans/example.md` writes graph artifacts.
  - `/supervibe-loop --epic epic-loop-upgrade` executes ready work from the epic graph.

- [x] **Step 5: Run verification**
```bash
npm test -- tests/supervibe-plan-to-work-items.test.mjs tests/autonomous-loop-task-source.test.mjs tests/autonomous-loop-task-graph.test.mjs
```

- [x] **Step 6: No commits until review gate**
  - Commit is suppressed until plan-to-work-item conversion is deterministic and reversible.

**Acceptance Criteria:**
- A plan can be converted into one epic with child work items and blocker edges.
- The atomized graph can drive `/supervibe-loop` execution.
- Generated work items preserve acceptance criteria, verification commands, write scopes, and rollback notes.

---

## Task 17: Worktree Autonomous Session Manager

**Files:**
- Create: `scripts/lib/supervibe-worktree-session-manager.mjs`
- Modify: `scripts/lib/autonomous-loop-workspace-isolation.mjs`
- Modify: `scripts/lib/autonomous-loop-side-effect-ledger.mjs`
- Modify: `scripts/lib/autonomous-loop-status.mjs`
- Modify: `skills/using-git-worktrees/SKILL.md`
- Modify: `skills/subagent-driven-development/SKILL.md`
- Modify: `commands/supervibe-execute-plan.md`
- Modify: `commands/supervibe-loop.md`
- Test: `tests/supervibe-worktree-session-manager.test.mjs`
- Test: `tests/autonomous-loop-workspace-isolation.test.mjs`
- Test: `tests/autonomous-loop-side-effect-ledger.test.mjs`

**Estimated time:** 4h, confidence: medium
**Rollback:** disable worktree execution mode and keep current workspace execution
**Risks:** worktrees can pollute repo state or conflict with existing local changes; mitigation: verify ignore rules, baseline tests, clean source workspace, and loop-owned cleanup records.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for worktree directory selection, dirty-workspace refusal, baseline verification, status reporting, and cleanup safeguards.

- [x] **Step 1: Add worktree directory policy**
  - Preferred order: existing `.worktrees/`, existing `worktrees/`, project config, global cache, then ask user.
  - Project-local worktree directories must be ignored before creation.
  - Never create a worktree inside a tracked directory.

- [x] **Step 2: Add session record**
  - Fields: `sessionId`, `epicId`, `branchName`, `worktreePath`, `createdAt`, `baselineCommit`, `baselineChecks`, `activeAgentIds`, `status`, `cleanupPolicy`.
  - Session record is linked from state, side-effect ledger, progress log, and final report.

- [x] **Step 3: Add autonomous run modes**
  - `--worktree`: create or reuse isolated worktree for execution.
  - `--worktree-existing .worktrees/loop-upgrade`: use an existing isolated workspace after validation.
  - `--max-runtime-minutes 180`: support long bounded runs.
  - `--resume-session session-loop-upgrade`: continue from a prior worktree session.

- [x] **Step 4: Add multi-session coordination**
  - Status lists all active sessions for the project.
  - Detect if another session owns the same epic/work item.
  - Heartbeat active agents and mark stale sessions.
  - Prevent two sessions from claiming the same work item unless explicitly allowed.

- [x] **Step 5: Add finish/cleanup flow**
  - At completion, produce merge/PR/keep/discard options.
  - Never remove a worktree with uncommitted changes.
  - Archive session artifacts before cleanup.

- [x] **Step 6: Run verification**
```bash
npm test -- tests/supervibe-worktree-session-manager.test.mjs tests/autonomous-loop-workspace-isolation.test.mjs tests/autonomous-loop-side-effect-ledger.test.mjs tests/autonomous-loop-status.test.mjs
```

- [x] **Step 7: No commits until review gate**
  - Commit is suppressed until worktree sessions are isolated, resumable, and cleanup-safe.

**Acceptance Criteria:**
- Long autonomous execution can run in a separate worktree without polluting the user's current workspace.
- Multiple sessions on one project are visible and claim-safe.
- Worktree setup verifies baseline state before execution starts.

---

## Task 18: Provider-Safe Automation And Permission Guard

**Files:**
- Create: `scripts/lib/autonomous-loop-provider-policy-guard.mjs`
- Create: `scripts/lib/autonomous-loop-permission-audit.mjs`
- Modify: `scripts/lib/autonomous-loop-policy-guard.mjs`
- Modify: `scripts/lib/autonomous-loop-preflight-intake.mjs`
- Modify: `scripts/lib/autonomous-loop-tool-adapters.mjs`
- Modify: `scripts/lib/autonomous-loop-side-effect-ledger.mjs`
- Modify: `commands/supervibe-loop.md`
- Modify: `docs/autonomous-loop-production-readiness.md`
- Modify: `skills/autonomous-agent-loop/SKILL.md`
- Test: `tests/autonomous-loop-provider-policy-guard.test.mjs`
- Test: `tests/autonomous-loop-permission-audit.test.mjs`
- Test: `tests/autonomous-loop-policy-guard.test.mjs`

**Estimated time:** 3h, confidence: high
**Rollback:** disable provider-safe execution modes and fall back to dry-run/manual modes
**Risks:** autonomous execution can be mistaken for permission bypass or rate-limit abuse; mitigation: explicit permission audit, no bypass defaults, rate-limit backoff, and user-visible approval gates.

- [x] **Step 0: Write failing test / red phase**
  - Add tests that reject bypass-permission defaults, hidden unattended execution, raw secret capture, unapproved network access, unapproved MCP access, and no-backoff retry loops.

- [x] **Step 1: Define provider-safe execution policy**
  - Default mode must preserve permission prompts and user approval semantics.
  - `bypassPermissions`, `--dangerously-skip-permissions`, and equivalent modes are forbidden by default.
  - Any bypass-style mode requires an explicitly declared safe sandbox, exact user approval, and a written risk notice.
  - Provider managed settings, project settings, and deny rules must be respected and never rewritten by the loop.

- [x] **Step 2: Add permission audit before autonomous run**
  - Inspect configured execution mode, tool adapter, MCP plan, network needs, write scope, command classes, and worktree path.
  - Produce a pass/fail report with remediation steps.
  - Fail closed if permission state cannot be determined.

- [x] **Step 3: Add rate-limit and budget compliance**
  - Track requests, tool invocations, loop count, runtime, and retry-after/backoff state where adapters expose it.
  - Never spin on provider 429/rate-limit errors.
  - Stop or pause on budget exhaustion, acceleration limits, or repeated transient provider errors.

- [x] **Step 4: Add trust and network boundaries**
  - First-time project, new MCP server, network-fetch, remote server, and external web access require explicit approval or a configured allow rule.
  - Network tools must not fetch arbitrary untrusted scripts for execution.
  - Remote mutation remains blocked unless the approval lease covers the exact target and action.

- [x] **Step 5: Add secret and sensitive-file protections**
  - Deny reading `.env`, `secrets`, credential stores, tokens, and provider config unless user explicitly passes a reference.
  - Logs, reports, progress notes, memory, and exported bundles must redact secret-like values.
  - Side-effect ledger records references and scopes, not raw credentials.

- [x] **Step 6: Add provider-safe status output**
  - Status shows permission mode, sandbox/worktree isolation, approved tools, blocked tool classes, rate-limit state, and next safe action.
  - Final report includes a compliance section with approvals, denied actions, and any user overrides.

- [x] **Step 7: Run verification**
```bash
npm test -- tests/autonomous-loop-provider-policy-guard.test.mjs tests/autonomous-loop-permission-audit.test.mjs tests/autonomous-loop-policy-guard.test.mjs tests/autonomous-loop-tool-adapters.test.mjs
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until provider-safe automation behavior is fail-closed and covered by tests.

**Acceptance Criteria:**
- Autonomous execution never relies on provider permission bypass by default.
- Unsafe modes are blocked unless the user gives exact approval and a safe sandbox is declared.
- Rate-limit, network, MCP, and secret-handling failures stop safely with clear remediation.

---

## Task 19: Durable Task Tracker Adapter And Sync

**Files:**
- Create: `scripts/lib/supervibe-durable-task-tracker-adapter.mjs`
- Create: `scripts/lib/supervibe-task-tracker-mcp-bridge.mjs`
- Create: `scripts/lib/supervibe-task-tracker-sync.mjs`
- Create: `scripts/lib/supervibe-task-tracker-doctor.mjs`
- Modify: `scripts/lib/supervibe-plan-to-work-items.mjs`
- Modify: `scripts/lib/autonomous-loop-task-graph.mjs`
- Modify: `scripts/lib/autonomous-loop-claims.mjs`
- Modify: `scripts/lib/supervibe-worktree-session-manager.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `commands/supervibe-plan.md`
- Modify: `commands/supervibe-loop.md`
- Test: `tests/supervibe-durable-task-tracker-adapter.test.mjs`
- Test: `tests/supervibe-task-tracker-mcp-bridge.test.mjs`
- Test: `tests/supervibe-task-tracker-sync.test.mjs`
- Test: `tests/supervibe-task-tracker-doctor.test.mjs`

**Estimated time:** 4h, confidence: medium
**Rollback:** disable durable tracker adapter and keep native JSONL task graph as the source of truth
**Risks:** external tracker state can drift from native loop state; mitigation: native graph remains canonical unless sync is explicitly enabled, and every sync writes a reversible mapping file.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for adapter detection, unavailable adapter fallback, epic creation, child task creation, blocker sync, ready query, claim, close, status import, worktree redirect handling, and sync drift repair.

- [x] **Step 1: Define adapter interface**
  - Methods: `detect`, `version`, `init`, `createEpic`, `createTask`, `addDependency`, `ready`, `claim`, `update`, `close`, `show`, `export`, `import`, `doctor`, `syncPush`, `syncPull`.
  - Transport options: CLI, MCP, and native graph fallback.
  - All adapter calls must support JSON output or a typed parse result.

- [x] **Step 2: Add capability detection**
  - Detect CLI availability, MCP server availability, project initialization, worktree support, dependency support, and sync support.
  - Status output shows: unavailable, available-uninitialized, available-ready, degraded, or blocked.
  - If unavailable, continue with native JSONL graph without failing planning.

- [x] **Step 3: Add epic and task materialization**
  - Convert one validated plan into one external epic plus child tasks.
  - Preserve acceptance criteria, verification commands, write scope, priority, source plan path, and task hash.
  - Store mapping in `.claude/memory/loops/task-tracker-map.json`.
  - Never create duplicate external tasks if mapping already exists.

- [x] **Step 4: Add dependency and ready-front sync**
  - Hard blockers map to external blocking dependencies.
  - Soft links map to related edges.
  - Follow-up discoveries map to discovered-from edges.
  - External `ready` results are reconciled with the native ready-front scheduler.

- [x] **Step 5: Add claim and ownership sync**
  - A native claim must claim the external task when sync is enabled.
  - Failed external claim blocks native execution instead of double-assigning work.
  - Claims include agent/session/worktree identity.
  - Closing a task requires verification evidence and a completion reason.

- [x] **Step 6: Add worktree-aware storage behavior**
  - Worktree sessions must resolve the shared tracker state consistently.
  - If an external tracker uses redirect files or shared metadata, the worktree manager validates them before execution.
  - Session status shows whether the worktree sees the same epic and ready-front as the source workspace.

- [x] **Step 7: Add sync and doctor commands**
  - `--tracker-sync-push`: push native graph state to external tracker.
  - `--tracker-sync-pull`: import external tracker status into native state.
  - `--tracker-doctor`: detect missing mappings, duplicate tasks, stale claims, orphan external tasks, dependency drift, and worktree visibility problems.
  - `--tracker-doctor --fix`: repairs only mappings, stale local claims, and derived status after writing a backup.

- [x] **Step 8: Add provider-safe boundaries**
  - External tracker commands are local project tooling, not a permission bypass.
  - Network-backed sync requires approval through provider-safe permission guard.
  - Secrets are never passed to tracker commands except as named environment references.

- [x] **Step 9: Run verification**
```bash
npm test -- tests/supervibe-durable-task-tracker-adapter.test.mjs tests/supervibe-task-tracker-mcp-bridge.test.mjs tests/supervibe-task-tracker-sync.test.mjs tests/supervibe-task-tracker-doctor.test.mjs
```

- [x] **Step 10: No commits until review gate**
  - Commit is suppressed until adapter fallback, mapping, sync, and doctor behavior are deterministic.

**Acceptance Criteria:**
- A validated plan can create an external epic with atomic child tasks and dependency edges.
- Native JSONL graph remains usable when the external tracker is unavailable.
- Ready, claim, close, sync, and doctor flows are tested across normal workspace and worktree sessions.

---

## Task 20: Work-Item UX, Templates, Comments, And Query Surface

**Files:**
- Create: `scripts/lib/supervibe-work-item-template-catalog.mjs`
- Create: `scripts/lib/supervibe-work-item-query.mjs`
- Create: `scripts/lib/supervibe-work-item-comments.mjs`
- Modify: `scripts/lib/supervibe-plan-to-work-items.mjs`
- Modify: `scripts/lib/supervibe-durable-task-tracker-adapter.mjs`
- Modify: `scripts/lib/supervibe-task-tracker-doctor.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `commands/supervibe.md`
- Modify: `commands/supervibe-plan.md`
- Modify: `commands/supervibe-loop.md`
- Test: `tests/supervibe-work-item-template-catalog.test.mjs`
- Test: `tests/supervibe-work-item-query.test.mjs`
- Test: `tests/supervibe-work-item-comments.test.mjs`

**Estimated time:** 3h, confidence: medium
**Rollback:** disable work-item UX helpers while preserving the native task graph and adapter mappings
**Risks:** richer UX can add command noise; mitigation: keep `/supervibe` auto-router as the simple entry and keep advanced commands discoverable through status output.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for template selection, labels/priorities, comments, ready/blocked queries, duplicate/stale/orphan UX, and multi-repo routing prompts.

- [x] **Step 1: Add reusable work-item templates**
  - Templates: feature, bugfix, refactor, UI story, integration, migration, documentation, release-prep, production-prep, research spike.
  - Each template defines default task types, acceptance criteria, verification hints, labels, risk level, and required gates.
  - `/supervibe-plan` can choose a template during atomization or infer one from plan sections.

- [x] **Step 2: Add labels, priorities, and custom status mapping**
  - Native graph supports labels, priority, severity, owner, component, stack, and status.
  - External tracker adapters map only supported fields and preserve unmapped fields in native metadata.
  - Status output groups by ready, blocked, claimed, stale, deferred, review, and done.

- [x] **Step 3: Add comments and threaded handoff notes**
  - Work items support comments for implementation notes, reviewer feedback, blocker explanations, and user decisions.
  - Comments can link to evidence files, commits, progress entries, and failure packets.
  - Long autonomous runs append concise comments instead of bloating task titles/descriptions.

- [x] **Step 4: Add query and ask surface**
  - Supported questions: "what is ready?", "what is blocked?", "who owns this?", "what changed?", "why is this blocked?", "what should I run next?", "summarize epic progress".
  - Query reads native graph, adapter state, progress log, comments, claims, gates, and final reports.
  - `/supervibe` routes common natural-language status questions to this query layer.

- [x] **Step 5: Add duplicate, stale, orphan, and drift UX**
  - Duplicate detection reports likely same-scope tasks before creating new work items.
  - Stale detection reports claimed tasks with expired heartbeat or no progress.
  - Orphan detection reports commits/evidence not linked to a task.
  - Drift detection reports native/external tracker mismatch and offers doctor repair.

- [x] **Step 6: Add protected and contributor workflow modes**
  - Protected mode keeps task metadata and execution state off protected branches unless explicitly allowed.
  - Contributor mode keeps experimental planning state local or in a separate metadata branch/location.
  - Status output tells the user where task state is stored and what sync action is safe.

- [x] **Step 7: Add multi-repo and monorepo routing**
  - Work items can carry `repo`, `package`, `workspace`, and `subproject` fields.
  - Ready-front calculation can filter by repo/package/worktree.
  - Cross-repo dependencies are visible but require explicit sync and approval before remote mutation.

- [x] **Step 8: Run verification**
```bash
npm test -- tests/supervibe-work-item-template-catalog.test.mjs tests/supervibe-work-item-query.test.mjs tests/supervibe-work-item-comments.test.mjs tests/supervibe-task-tracker-doctor.test.mjs
```

- [x] **Step 9: No commits until review gate**
  - Commit is suppressed until templates, query UX, comments, protected modes, and multi-repo routing are tested.

**Acceptance Criteria:**
- Users can ask natural-language questions about ready, blocked, claimed, stale, and orphan work.
- Atomization can use reusable templates instead of inventing every task graph from scratch.
- Comments preserve review and blocker context without polluting task titles.
- Protected/contributor and multi-repo modes have visible, safe defaults.

---

## Task 21: README And Public Docs Release Sync

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `commands/supervibe.md`
- Modify: `commands/supervibe-loop.md`
- Modify: `commands/supervibe-plan.md`
- Modify: `commands/supervibe-brainstorm.md`
- Modify: `commands/supervibe-execute-plan.md`
- Modify: `docs/autonomous-loop-scenarios.md`
- Modify: `docs/autonomous-loop-production-readiness.md`
- Test: `tests/readme-autonomous-loop-docs.test.mjs`

**Estimated time:** 1h 30min, confidence: high
**Rollback:** revert public documentation and changelog changes only
**Risks:** README can overpromise before the implementation is released; mitigation: label unreleased capabilities clearly until the release gate passes.

- [x] **Step 0: Write failing test / red phase**
  - Add a docs test that fails until README covers autonomous loop basics, review loop, work-item atomization, worktree sessions, status/resume/stop, and provider-safe limits.

- [x] **Step 1: Update feature table and headline positioning**
  - Add the durable autonomous loop as a first-class feature, not a hidden advanced mode.
  - Keep the local-first, no-Docker, no-native-build positioning.
  - Mark planned or unreleased items explicitly until implementation is complete.

- [x] **Step 2: Add the end-to-end user path**
  - Brainstorm request produces a next-step handoff to planning.
  - Plan output requires review before execution.
  - Reviewed plan can be atomized into an epic with atomic work items.
  - Epic execution can run in guided, dry-run, fresh-context, or worktree-backed modes.

- [x] **Step 3: Add copy-paste command examples**
  - `/supervibe-brainstorm "idea"`
  - `/supervibe-plan --from-brainstorm docs/specs/example.md`
  - `/supervibe-loop --atomize-plan docs/plans/example.md`
  - `/supervibe-loop --epic example-epic --worktree`
  - `/supervibe-loop --status --epic example-epic`
  - `/supervibe-loop --resume .claude/memory/loops/example-run/state.json`
  - `/supervibe-loop --stop example-run`

- [x] **Step 4: Document safety and provider boundaries**
  - Explain that autonomous execution is visible, cancellable, permission-gated, and ledgered.
  - State that provider prompts, rate limits, network/MCP approvals, secrets, billing, deploys, production mutations, and credential changes are never bypassed.
  - Link README sections to production-readiness docs for exact gates.

- [x] **Step 5: Add troubleshooting and status interpretation**
  - Explain ready, blocked, claimed, stale, orphan, drift, review, and done states.
  - Explain what to do when credentials, provider permissions, CI, external access, or worktree conflicts block progress.
  - Explain where run state, archives, evidence, and task tracker mappings live.

- [x] **Step 6: Sync command docs and changelog**
  - Command docs and README examples must use the same flags and paths.
  - Changelog must mention the autonomous-loop upgrade only after implementation is verified.
  - Internal docs must not expose behavior that README does not explain at a user level.

- [x] **Step 7: Run verification**
```bash
npm test -- tests/readme-autonomous-loop-docs.test.mjs
npm run validate:spec-artifacts
npm run validate:plan-artifacts
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until README, command docs, scenario docs, production-readiness docs, and changelog are synchronized.

**Acceptance Criteria:**
- README has a clear end-to-end path from brainstorm to reviewed plan to atomized epic to safe execution.
- README documents worktree-backed sessions, status/resume/stop, and common blocked states.
- README and command docs describe the same flags and safety guarantees.
- Public docs do not promise unreleased behavior as already shipped.

---

## Task 22: Operational Memory And Plugin Package Audit

**Files:**
- Create: `scripts/lib/autonomous-loop-learning-extractor.mjs`
- Create: `scripts/lib/autonomous-loop-guidance-updater.mjs`
- Create: `scripts/lib/supervibe-plugin-package-audit.mjs`
- Modify: `scripts/lib/autonomous-loop-progress-log.mjs`
- Modify: `scripts/lib/autonomous-loop-archive.mjs`
- Modify: `scripts/lib/autonomous-loop-final-acceptance.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `package.json`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `GEMINI.md`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.codex-plugin/plugin.json`
- Modify: `.cursor-plugin/plugin.json`
- Modify: `.opencode/plugin.json`
- Modify: `registry.yaml`
- Modify: `install.sh`
- Modify: `install.ps1`
- Modify: `update.sh`
- Modify: `update.ps1`
- Test: `tests/autonomous-loop-learning-extractor.test.mjs`
- Test: `tests/autonomous-loop-guidance-updater.test.mjs`
- Test: `tests/supervibe-plugin-package-audit.test.mjs`

**Estimated time:** 2h 30min, confidence: medium
**Rollback:** disable guidance updates and package-audit release gate while keeping loop artifacts intact
**Risks:** auto-written guidance can become stale or noisy; mitigation: require scoped diffs, duplicate detection, and review approval before updating agent guidance files.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for learning extraction, duplicate/stale guidance detection, manifest/version mismatch, missing command exposure, and install/update path drift.

- [x] **Step 1: Extract durable learnings from autonomous runs**
  - Read progress logs, failure packets, final reports, review comments, and evidence summaries.
  - Extract only reusable project conventions, gotchas, verified commands, and recurring blockers.
  - Exclude secrets, provider tokens, private credentials, raw prompts, one-off stack traces, and unresolved speculation.

- [x] **Step 2: Add reviewed guidance update flow**
  - Generate proposed diffs for root and CLI-specific guidance files.
  - Group updates by scope: repo convention, command convention, test convention, UI verification, integration gotcha, rollback note.
  - Require explicit review approval before writing guidance updates.
  - Store rejected learning candidates in the run archive, not in public guidance files.

- [x] **Step 3: Add memory compaction for closed work**
  - Summarize closed work items after final acceptance while preserving links to evidence and commits.
  - Keep open blockers, active decisions, and rollback notes uncompressed.
  - Add a doctor check for stale summaries that reference missing files or closed-over assumptions.

- [x] **Step 4: Add package and marketplace metadata audit**
  - Verify every plugin manifest has matching name, description, version, commands, skills, agents, hooks, and supported CLI metadata.
  - Verify marketplace entries point to in-repo plugin paths and do not reference files outside the plugin package boundary.
  - Verify release version appears consistently in README, changelog, manifests, registry, installer output, and update scripts.
  - Verify command docs match actual command files exposed by each plugin package.

- [x] **Step 5: Add install/update smoke checks**
  - Validate local install path without network mutation.
  - Validate update scripts refuse dirty plugin checkouts before pulling.
  - Validate package audit reports next action instead of silently changing user config.
  - Validate Windows and POSIX paths in examples and scripts.

- [x] **Step 6: Add release gate integration**
  - Add `npm run audit:plugin-package`.
  - Include package audit in `npm run check`.
  - Final acceptance must fail if public docs, manifests, registry, and installers disagree.

- [x] **Step 7: Run verification**
```bash
npm test -- tests/autonomous-loop-learning-extractor.test.mjs tests/autonomous-loop-guidance-updater.test.mjs tests/supervibe-plugin-package-audit.test.mjs
npm run audit:plugin-package
npm run check
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until guidance diffs are reviewed and package metadata is synchronized.

**Acceptance Criteria:**
- Autonomous runs produce reviewed guidance updates instead of losing useful learnings in logs.
- Closed work can be compacted without losing evidence, rollback, or blocker context.
- Plugin manifests, marketplace metadata, registry, installers, README, command docs, and changelog stay version-synchronized.
- Release checks catch missing command exposure or stale package paths before publishing.

---

## Task 23: Advanced Work-Item Operations And Agent Ergonomics

**Files:**
- Create: `scripts/lib/autonomous-loop-context-budget.mjs`
- Create: `scripts/lib/supervibe-work-item-daemon.mjs`
- Create: `scripts/lib/supervibe-work-item-priority-formula.mjs`
- Create: `scripts/lib/supervibe-work-item-migration-importer.mjs`
- Create: `scripts/lib/supervibe-work-item-message-delegation.mjs`
- Create: `scripts/lib/supervibe-shell-completions.mjs`
- Modify: `scripts/lib/autonomous-loop-fresh-context-executor.mjs`
- Modify: `scripts/lib/autonomous-loop-progress-log.mjs`
- Modify: `scripts/lib/supervibe-work-item-query.mjs`
- Modify: `scripts/lib/supervibe-task-tracker-doctor.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `commands/supervibe.md`
- Modify: `commands/supervibe-loop.md`
- Modify: `commands/supervibe-status.md`
- Modify: `package.json`
- Test: `tests/autonomous-loop-context-budget.test.mjs`
- Test: `tests/supervibe-work-item-daemon.test.mjs`
- Test: `tests/supervibe-work-item-priority-formula.test.mjs`
- Test: `tests/supervibe-work-item-migration-importer.test.mjs`
- Test: `tests/supervibe-work-item-message-delegation.test.mjs`
- Test: `tests/supervibe-shell-completions.test.mjs`

**Estimated time:** 3h, confidence: medium
**Rollback:** disable daemon, migration import, delegation, and completion helpers while keeping core graph execution unchanged
**Risks:** ergonomic helpers can create hidden background behavior; mitigation: daemon is opt-in, status-visible, loop-owned, and stoppable through the normal stop command.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for context-budget warnings, opt-in daemon lifecycle, priority formula ordering, markdown/task import, delegated messages, completions, and onboarding hints.

- [x] **Step 1: Add context-budget and handoff thresholds**
  - Track approximate context pressure per fresh-context attempt.
  - Warn before a task exceeds the one-story-per-context budget.
  - Emit handoff packets before context exhaustion instead of waiting for low-quality completion.
  - Status output shows whether the next task is small enough for autonomous execution.

- [x] **Step 2: Add opt-in local watch daemon**
  - `--watch` shows live ready, blocked, claimed, stale, delegated, and review states.
  - Daemon records heartbeat, PID, run ID, worktree, start time, and stop command.
  - Daemon never mutates tasks unless an explicit command is issued.
  - Doctor detects orphan daemon processes and stale watch state.

- [x] **Step 3: Add priority formula and critical-path scoring**
  - Ready-front ordering can combine priority, severity, blocker count, dependency depth, age, owner availability, worktree fit, and risk.
  - Formula is explainable in status output.
  - Users can override priority with a visible audit entry.
  - Critical-path tasks are flagged before low-impact work.

- [x] **Step 4: Add migration/import from existing task sources**
  - Import markdown checklists, old plan task sections, JSON task lists, and existing loop state into the native graph.
  - Detect duplicates before import.
  - Preserve original source path and line reference where possible.
  - Dry-run import shows what would become epics, tasks, blockers, notes, labels, and review gates.

- [x] **Step 5: Add message delegation and lightweight inbox**
  - Work items can carry delegated questions, blocker requests, review requests, and handoff notes.
  - Delegated messages can target user, reviewer, worker, or future session.
  - Inbox appears in `/supervibe-status` and never hides blocking questions inside logs.
  - Closing a delegated blocker requires a resolution comment or linked decision.

- [x] **Step 6: Add shell completions and onboarding helpers**
  - Generate completions for common commands, modes, run IDs, epics, worktrees, and statuses.
  - Add `/supervibe-loop --quickstart` to initialize safe local defaults and show next action.
  - Add `/supervibe-loop --onboard` to explain current project readiness, missing gates, and safest first run.
  - Completion generation must be read-only and cross-platform.

- [x] **Step 7: Run verification**
```bash
npm test -- tests/autonomous-loop-context-budget.test.mjs tests/supervibe-work-item-daemon.test.mjs tests/supervibe-work-item-priority-formula.test.mjs tests/supervibe-work-item-migration-importer.test.mjs tests/supervibe-work-item-message-delegation.test.mjs tests/supervibe-shell-completions.test.mjs
npm run check
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until opt-in daemon behavior, import dry-run, priority explanations, delegation inbox, and completion generation are tested.

**Acceptance Criteria:**
- The loop warns and hands off before context exhaustion harms quality.
- Users can watch long runs without hidden mutation or orphan background state.
- Ready work is ordered by an explainable priority formula and critical path.
- Existing plans/checklists can migrate into graph work items with duplicate detection.
- Delegated questions and blockers are visible in status, not buried in logs.
- Shell completions and onboarding commands make the advanced system discoverable.

---

## Task 24: Release Security, Provenance, And Install Integrity

**Files:**
- Create: `scripts/lib/supervibe-release-security-audit.mjs`
- Create: `scripts/lib/supervibe-install-integrity.mjs`
- Create: `scripts/lib/supervibe-dependency-provenance.mjs`
- Create: `docs/release-security.md`
- Create: `docs/third-party-licenses.md`
- Create: `docs/install-integrity.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `install.sh`
- Modify: `install.ps1`
- Modify: `update.sh`
- Modify: `update.ps1`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `.github/workflows` if release workflows exist
- Test: `tests/supervibe-release-security-audit.test.mjs`
- Test: `tests/supervibe-install-integrity.test.mjs`
- Test: `tests/supervibe-dependency-provenance.test.mjs`

**Estimated time:** 2h, confidence: medium
**Rollback:** remove release-security gate from `npm run check` while preserving generated reports for manual review
**Risks:** security gates can block releases on noisy advisories; mitigation: allow explicit documented exceptions with expiry, owner, severity, and review evidence.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for missing checksum verification, missing license inventory, dependency drift, unsigned release artifact metadata, and stale install instructions.

- [x] **Step 1: Add dependency provenance audit**
  - Verify lockfile is present and matches `package.json`.
  - Report direct dependency versions, transitive high-risk packages, and unsupported engines.
  - Flag unpinned executable download URLs in install/update scripts.
  - Record dependency source and package integrity where available.

- [x] **Step 2: Add third-party license inventory**
  - Generate a concise inventory for runtime and bundled assets.
  - Flag unknown, missing, or incompatible licenses before release.
  - Keep generated inventory deterministic so diffs are reviewable.
  - Link license inventory from README and release notes.

- [x] **Step 3: Add install integrity checks**
  - Install/update scripts verify downloaded script or package integrity when a checksum is available.
  - Installer output explains what will be modified before modification.
  - Installer refuses unsafe paths, path traversal, and unexpected package roots.
  - Windows and POSIX installers share the same security expectations.

- [x] **Step 4: Add release artifact provenance**
  - Release notes include commit SHA, package version, generated timestamp, manifest paths, and verification commands.
  - Generated release-security report lists checksums or integrity fields for packaged artifacts.
  - Package audit fails if manifest version, registry version, README version, changelog version, and package version disagree.

- [x] **Step 5: Add vulnerability and exception policy**
  - `npm audit` or equivalent runs in release gate where practical.
  - Known vulnerability exceptions require severity, rationale, owner, expiry date, and mitigation.
  - Expired exceptions fail the gate.
  - Security report redacts secrets and local usernames before writing artifacts.

- [x] **Step 6: Add release gate integration**
  - Add `npm run audit:release-security`.
  - Include release-security audit in `npm run check`.
  - Final acceptance must fail on missing provenance, missing install-integrity docs, or stale license inventory.

- [x] **Step 7: Run verification**
```bash
npm test -- tests/supervibe-release-security-audit.test.mjs tests/supervibe-install-integrity.test.mjs tests/supervibe-dependency-provenance.test.mjs
npm run audit:release-security
npm run check
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until provenance, installer integrity, license inventory, vulnerability handling, and release docs are synchronized.

**Acceptance Criteria:**
- Release candidates produce a deterministic security/provenance report.
- Install/update scripts have explicit integrity and path-safety checks.
- License inventory and dependency provenance are reviewable before release.
- Version drift across package, manifests, registry, README, changelog, and release notes blocks publishing.
- Vulnerability exceptions are explicit, expiring, and visible in release evidence.

---

## Task 25: Ecosystem Integrations, Notifications, And Interactive Run Dashboard

**Files:**
- Create: `scripts/lib/supervibe-run-dashboard.mjs`
- Create: `scripts/lib/supervibe-external-integration-catalog.mjs`
- Create: `scripts/lib/supervibe-notification-router.mjs`
- Create: `scripts/lib/supervibe-federated-sync-bundle.mjs`
- Modify: `scripts/lib/autonomous-loop-graph-export.mjs`
- Modify: `scripts/lib/autonomous-loop-status.mjs`
- Modify: `scripts/lib/supervibe-work-item-query.mjs`
- Modify: `scripts/lib/supervibe-task-tracker-sync.mjs`
- Modify: `scripts/lib/autonomous-loop-provider-policy-guard.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `commands/supervibe.md`
- Modify: `commands/supervibe-status.md`
- Modify: `commands/supervibe-loop.md`
- Test: `tests/supervibe-run-dashboard.test.mjs`
- Test: `tests/supervibe-external-integration-catalog.test.mjs`
- Test: `tests/supervibe-notification-router.test.mjs`
- Test: `tests/supervibe-federated-sync-bundle.test.mjs`

**Estimated time:** 3h, confidence: medium
**Rollback:** keep CLI/status output as source of truth and disable dashboard, notification, and external integration commands
**Risks:** network-backed integrations can create accidental remote mutation; mitigation: discovery is read-only by default and every outbound sync or webhook requires provider-safe approval.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for dashboard export, integration discovery, read-only capability detection, notification gating, sync bundle round-trip, and dashboard redaction.

- [x] **Step 1: Add interactive run dashboard export**
  - Generate a static HTML dashboard from graph, progress log, claims, gates, comments, evidence index, and final report.
  - Views: graph, timeline, ready front, blockers, worktree sessions, delegated inbox, verification coverage, risk register, and release gates.
  - Dashboard must work offline without a server.
  - Dashboard redacts secrets, local usernames, tokens, raw prompts, and sensitive paths before writing.

- [x] **Step 2: Add integration capability catalog**
  - Detect available local CLIs, MCP bridges, git hosting helpers, project-management helpers, note-taking helpers, and CI helpers without mutating remote state.
  - Show capability levels: unavailable, local-read, local-write, network-read, network-write, degraded, blocked.
  - Status output recommends the safest available adapter and the exact approval needed for network-backed sync.
  - Integration catalog must preserve native graph fallback as the default.

- [x] **Step 3: Add notification routing**
  - Route important events to terminal status, delegated inbox, optional local dashboard, and optional webhook target.
  - Event classes: approval needed, blocker opened, task claimed, stale claim, review needed, run completed, run failed, policy stop, release gate failed.
  - Webhook delivery is disabled by default and requires explicit URL allowlisting.
  - Notifications include task/run IDs and next safe action, not raw secrets or full prompts.

- [x] **Step 4: Add federated sync bundle**
  - Export a portable bundle for sharing work-item graph, status, comments, evidence pointers, and sync mapping across worktrees or machines.
  - Import validates checksums, schema version, package version, source root, and sensitive-data redaction before writing.
  - Conflict report explains local-only, remote-only, both-changed, duplicate, and stale states.
  - Sync bundle never performs remote mutation during import.

- [x] **Step 5: Add dashboard and integration commands**
  - `/supervibe-status --dashboard --file .claude/memory/loops/example-run/state.json`
  - `/supervibe-status --integrations`
  - `/supervibe-loop --notify terminal,inbox`
  - `/supervibe-loop --export-sync-bundle .claude/memory/loops/example-run`
  - `/supervibe-loop --import-sync-bundle path/to/bundle.zip --dry-run`

- [x] **Step 6: Add observability summary**
  - Status and dashboard show run duration, time blocked, attempts per task, verification pass/fail count, requeue count, stale claim count, and confidence trend.
  - Metrics are local artifact summaries, not remote telemetry.
  - Users can attach the summary to review packages and final reports.

- [x] **Step 7: Run verification**
```bash
npm test -- tests/supervibe-run-dashboard.test.mjs tests/supervibe-external-integration-catalog.test.mjs tests/supervibe-notification-router.test.mjs tests/supervibe-federated-sync-bundle.test.mjs
npm run check
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until dashboard redaction, integration discovery, notification gating, and sync bundle import/export are tested.

**Acceptance Criteria:**
- A user can inspect a long autonomous run from a static dashboard without reading JSONL manually.
- Integration discovery is read-only by default and reports exact approval needed for any network-backed action.
- Important blockers, reviews, policy stops, and completions surface through status/inbox notifications.
- Federated sync bundles let work move across worktrees or machines without hidden remote mutation.
- Observability summaries are local, redacted, and useful for review/final reports.

---

## Task 26: Saved Views, Scheduling, Query DSL, And Work Reports

**Files:**
- Create: `scripts/lib/supervibe-work-item-query-language.mjs`
- Create: `scripts/lib/supervibe-work-item-saved-views.mjs`
- Create: `scripts/lib/supervibe-work-item-scheduler.mjs`
- Create: `scripts/lib/supervibe-work-item-sla-reports.mjs`
- Modify: `scripts/lib/supervibe-work-item-query.mjs`
- Modify: `scripts/lib/supervibe-work-item-priority-formula.mjs`
- Modify: `scripts/lib/supervibe-run-dashboard.mjs`
- Modify: `scripts/lib/supervibe-notification-router.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `commands/supervibe.md`
- Modify: `commands/supervibe-status.md`
- Modify: `commands/supervibe-loop.md`
- Test: `tests/supervibe-work-item-query-language.test.mjs`
- Test: `tests/supervibe-work-item-saved-views.test.mjs`
- Test: `tests/supervibe-work-item-scheduler.test.mjs`
- Test: `tests/supervibe-work-item-sla-reports.test.mjs`

**Estimated time:** 2h 30min, confidence: medium
**Rollback:** disable saved views, scheduling, and reports while preserving the native graph and natural-language query surface
**Risks:** query and report features can become a second product surface; mitigation: keep default views built in and make custom DSL optional.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for query parsing, saved view persistence, deferred tasks, scheduled checks, due/overdue reports, SLA aging, and redacted report export.

- [x] **Step 1: Add structured query language**
  - Support filters for status, label, priority, owner, package, worktree, repo, due date, stale age, blocked reason, verification state, and risk.
  - Support sort by priority, critical path, age, due date, blocker count, confidence, and last activity.
  - Query language must be local-only and must not execute arbitrary code.
  - Natural-language queries can compile to safe structured filters when confidence is high.

- [x] **Step 2: Add saved views**
  - Built-in views: ready now, blocked, review needed, stale claims, due soon, overdue, high risk, release gates, my work, unowned work, cross-repo blockers.
  - Custom views store name, filter, sort, display columns, owner, and scope.
  - Views are portable across worktrees through sync bundles.
  - Status output suggests useful views when the user asks broad questions.

- [x] **Step 3: Add scheduled and deferred work**
  - Tasks can be deferred until a local timestamp, CI event, manual approval, dependency close, or retry window.
  - Scheduled checks can re-open or re-evaluate blocked tasks without mutating code.
  - Deferred tasks remain visible in status and dashboard.
  - Scheduler must be deterministic and safe without a background daemon.

- [x] **Step 4: Add SLA, aging, and due-state reports**
  - Report time open, time blocked, time claimed, time stale, missed due dates, repeated blocker reasons, and oldest ready work.
  - Age and SLA calculations must use stored timestamps and tolerate timezone differences.
  - Reports separate human waiting time from agent execution time.
  - Policy-stopped and approval-waiting tasks are not treated as agent failures.

- [x] **Step 5: Add recurring local reports**
  - Generate daily/weekly local markdown summaries without remote telemetry.
  - Summaries include done, blocked, next ready work, risk changes, stale claims, review requests, and release gate status.
  - Reports can be attached to final acceptance and dashboard.
  - Report export redacts secrets, local usernames, sensitive paths, and raw prompts.

- [x] **Step 6: Add commands**
  - `/supervibe-status --view ready-now`
  - `/supervibe-status --query "status:blocked label:integration sort:age"`
  - `/supervibe-status --save-view release-risk --query "risk:high status:not-done"`
  - `/supervibe-loop --defer task-123 --until 2026-05-01T09:00:00Z`
  - `/supervibe-status --report daily`
  - `/supervibe-status --report sla`

- [x] **Step 7: Run verification**
```bash
npm test -- tests/supervibe-work-item-query-language.test.mjs tests/supervibe-work-item-saved-views.test.mjs tests/supervibe-work-item-scheduler.test.mjs tests/supervibe-work-item-sla-reports.test.mjs
npm run check
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until query parsing, saved views, scheduling, deferred work, SLA reports, and redaction are tested.

**Acceptance Criteria:**
- Users can filter and sort large work-item graphs without reading raw artifacts.
- Common saved views make status useful immediately.
- Deferred and scheduled work remains visible and deterministic.
- SLA and aging reports separate human blockers from agent execution failures.
- Daily/weekly reports are local, redacted, and attachable to reviews or final reports.

---

## Task 27: Interactive CLI, Guided Forms, And Command Palette

**Files:**
- Create: `scripts/lib/supervibe-interactive-cli.mjs`
- Create: `scripts/lib/supervibe-command-palette.mjs`
- Create: `scripts/lib/supervibe-terminal-renderer.mjs`
- Create: `scripts/lib/supervibe-guided-work-item-forms.mjs`
- Modify: `scripts/lib/supervibe-work-item-query.mjs`
- Modify: `scripts/lib/supervibe-work-item-template-catalog.mjs`
- Modify: `scripts/lib/supervibe-work-item-saved-views.mjs`
- Modify: `scripts/lib/supervibe-run-dashboard.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `commands/supervibe.md`
- Modify: `commands/supervibe-status.md`
- Modify: `commands/supervibe-loop.md`
- Test: `tests/supervibe-interactive-cli.test.mjs`
- Test: `tests/supervibe-command-palette.test.mjs`
- Test: `tests/supervibe-terminal-renderer.test.mjs`
- Test: `tests/supervibe-guided-work-item-forms.test.mjs`

**Estimated time:** 2h, confidence: medium
**Rollback:** keep non-interactive commands as the stable interface and disable interactive mode by feature flag
**Risks:** interactive flows can break automation and CI; mitigation: interactive mode is opt-in, never required, and every flow has an equivalent non-interactive command.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for command palette choices, guided form validation, non-interactive fallback, terminal-width rendering, dry-run previews, and no-tty behavior.

- [x] **Step 1: Add terminal renderer**
  - Support compact tables, expanded details, markdown summaries, pager-safe output, narrow terminal wrapping, and JSON passthrough.
  - Keep color optional and disabled when output is redirected.
  - Long fields are truncated with explicit detail commands, not silently dropped.
  - Renderer must preserve machine-readable output when `--json` is requested.

- [x] **Step 2: Add command palette**
  - Palette options: view ready work, view blockers, atomize plan, create work item, claim next task, defer task, export dashboard, run doctor, open review package, stop run.
  - Palette uses current project state to hide impossible actions and explain blocked actions.
  - Every palette action prints the exact non-interactive command it maps to before executing.
  - Palette exits without mutation unless the user confirms the selected action.

- [x] **Step 3: Add guided work-item forms**
  - Forms for epic, task, bug, integration, UI story, review request, blocker, research spike, release-prep, and production-prep.
  - Forms validate title, template, owner, priority, labels, acceptance criteria, verification hints, dependencies, due date, and risk level.
  - Forms can import from clipboard/text input but must preview normalized work items before write.
  - Forms can save drafts without creating tasks.

- [x] **Step 4: Add dry-run previews before writes**
  - Preview create/update/defer/claim/close/import actions with before/after state.
  - Show affected tasks, dependency changes, comments, labels, claims, scheduled checks, and sync mappings.
  - Risky actions require explicit typed confirmation.
  - Previews redact secrets and local sensitive paths.

- [x] **Step 5: Add no-tty and automation-safe fallback**
  - If no interactive terminal is available, print the equivalent non-interactive command and exit with a clear code.
  - CI and agent subprocesses default to non-interactive mode.
  - `--yes` is allowed only for safe local actions and never for provider/network/production approval.
  - Tests cover Windows and POSIX terminal assumptions.

- [x] **Step 6: Add commands**
  - `/supervibe --interactive`
  - `/supervibe-status --interactive`
  - `/supervibe-loop --create-work-item --interactive`
  - `/supervibe-loop --atomize-plan docs/plans/example.md --preview`
  - `/supervibe-loop --import-tasks tasks.md --interactive`

- [x] **Step 7: Run verification**
```bash
npm test -- tests/supervibe-interactive-cli.test.mjs tests/supervibe-command-palette.test.mjs tests/supervibe-terminal-renderer.test.mjs tests/supervibe-guided-work-item-forms.test.mjs
npm run check
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until interactive flows, no-tty fallback, write previews, confirmation rules, and non-interactive equivalents are tested.

**Acceptance Criteria:**
- Users can operate the advanced work-item system through guided terminal flows without memorizing every flag.
- Interactive mode is optional and never breaks scripts or CI.
- Every mutation has a preview and a non-interactive equivalent.
- Terminal output remains readable on narrow terminals and machine-readable with `--json`.
- Provider/network/production approvals cannot be bypassed by interactive confirmations or `--yes`.

---

## Task 28: Autonomous Quality Evals, Replay Harness, And Benchmark Corpus

**Files:**
- Create: `scripts/lib/autonomous-loop-eval-harness.mjs`
- Create: `scripts/lib/autonomous-loop-replay-runner.mjs`
- Create: `scripts/lib/autonomous-loop-benchmark-corpus.mjs`
- Create: `scripts/lib/autonomous-loop-quality-scorecard.mjs`
- Create: `docs/audits/autonomous-loop-evals/benchmark-corpus.json`
- Create: `docs/audits/autonomous-loop-evals/golden-outcomes.json`
- Modify: `scripts/lib/autonomous-loop-evaluator.mjs`
- Modify: `scripts/lib/autonomous-loop-final-acceptance.mjs`
- Modify: `scripts/lib/autonomous-loop-archive.mjs`
- Modify: `scripts/lib/supervibe-run-dashboard.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `package.json`
- Test: `tests/autonomous-loop-eval-harness.test.mjs`
- Test: `tests/autonomous-loop-replay-runner.test.mjs`
- Test: `tests/autonomous-loop-benchmark-corpus.test.mjs`
- Test: `tests/autonomous-loop-quality-scorecard.test.mjs`

**Estimated time:** 3h, confidence: medium
**Rollback:** remove eval commands from release gate while keeping deterministic unit tests and archived run artifacts
**Risks:** evals can become brittle or expensive; mitigation: default evals replay local artifacts only, live tool runs are opt-in, budget-capped, and never required for normal development.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for replay determinism, golden outcome comparison, scorecard calculation, redaction, and budget-capped live eval mode.

- [x] **Step 1: Add benchmark corpus**
  - Corpus covers plan execution, brainstorm-to-plan transition, plan review loop, atomization, worktree run, blocked credentials, flaky tests, UI verification, integration repair, refactor, docs-only change, release-prep, policy stop, and resume after compaction.
  - Each case defines input artifacts, expected graph shape, expected next action, required evidence, forbidden behavior, and expected stop conditions.
  - Cases must avoid real credentials, live remote mutation, production systems, and provider bypass modes.

- [x] **Step 2: Add replay runner**
  - Replay archived runs from state, graph, progress log, claims, gates, side-effect ledger, and final report.
  - Compare replayed status, ready front, blocked states, final acceptance, and reports against golden outcomes.
  - Replays must not call external tools or mutate the workspace.
  - Replay output includes exact artifact diffs when behavior changes.

- [x] **Step 3: Add quality scorecard**
  - Score dimensions: trigger selection, graph validity, task size, dependency correctness, evidence coverage, safety stops, review loop, resumability, user next-action clarity, worktree isolation, dashboard/report quality, README/docs consistency.
  - Scorecard records latency/runtime, loop count, requeue count, budget stops, and manual intervention count where available.
  - Scorecard distinguishes product regression from expected behavior changes with approved golden updates.

- [x] **Step 4: Add live eval mode behind explicit opt-in**
  - `--eval-live` can run selected cases against configured local tools only after readiness and permission checks.
  - Live evals require max runtime, max iterations, and provider budget cap.
  - Live evals write separate artifacts and never update golden outcomes automatically.
  - Live evals stop cleanly on provider rate limits, permission prompts, missing credentials, or policy gates.

- [x] **Step 5: Add dashboard and report integration**
  - Dashboard shows eval pass/fail, scorecard trends, golden diffs, and top regressions.
  - README and release notes can link to latest local eval summary when publishing.
  - Release gate blocks if replay evals fail or golden outcomes are stale.

- [x] **Step 6: Add commands**
  - `/supervibe-loop --eval`
  - `/supervibe-loop --eval --case plan-review-loop`
  - `/supervibe-loop --eval --replay .claude/memory/loops/example-run`
  - `/supervibe-loop --eval-live --case worktree-run --max-runtime-minutes 30`
  - `/supervibe-status --eval-report`

- [x] **Step 7: Run verification**
```bash
npm test -- tests/autonomous-loop-eval-harness.test.mjs tests/autonomous-loop-replay-runner.test.mjs tests/autonomous-loop-benchmark-corpus.test.mjs tests/autonomous-loop-quality-scorecard.test.mjs
npm run check
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until replay evals, golden outcomes, scorecards, live-eval safeguards, and dashboard/report integration are tested.

**Acceptance Criteria:**
- Core autonomous behaviors can be replayed deterministically from archived artifacts.
- Benchmark cases cover workflow chaining, review loop, atomization, worktree execution, safety stops, and resume behavior.
- Quality scorecards expose regressions before release.
- Live evals are opt-in, budget-capped, policy-gated, and never update golden outcomes automatically.
- Release gates can fail on replay regression without requiring live provider calls.

---

## Task 29: Policy Profiles, Approval Receipts, And Team Governance

**Files:**
- Create: `scripts/lib/supervibe-policy-profile-manager.mjs`
- Create: `scripts/lib/supervibe-approval-receipt-ledger.mjs`
- Create: `scripts/lib/supervibe-config-drift-detector.mjs`
- Create: `scripts/lib/supervibe-team-governance.mjs`
- Create: `schemas/supervibe-policy-profile.schema.json`
- Create: `docs/policy-profiles.md`
- Modify: `scripts/lib/autonomous-loop-provider-policy-guard.mjs`
- Modify: `scripts/lib/autonomous-loop-async-gates.mjs`
- Modify: `scripts/lib/autonomous-loop-side-effect-ledger.mjs`
- Modify: `scripts/lib/autonomous-loop-final-acceptance.mjs`
- Modify: `scripts/lib/supervibe-work-item-query.mjs`
- Modify: `scripts/lib/supervibe-interactive-cli.mjs`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `commands/supervibe-loop.md`
- Modify: `commands/supervibe-status.md`
- Modify: `README.md`
- Test: `tests/supervibe-policy-profile-manager.test.mjs`
- Test: `tests/supervibe-approval-receipt-ledger.test.mjs`
- Test: `tests/supervibe-config-drift-detector.test.mjs`
- Test: `tests/supervibe-team-governance.test.mjs`

**Estimated time:** 2h 30min, confidence: medium
**Rollback:** keep hard-coded provider-safe defaults and ignore optional policy profile files
**Risks:** configurable policy can weaken safety if misused; mitigation: built-in deny rules win over user profiles unless an explicit reviewed override is allowed by schema.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for profile loading, invalid profile rejection, deny-rule precedence, approval receipt expiry, config drift, CI/no-tty mode, and team role visibility.

- [x] **Step 1: Add policy profile schema**
  - Profiles: solo-local, guided, contributor, maintainer, CI-readonly, CI-verify, release-prep, enterprise-restricted.
  - Fields: allowed tools, denied tools, network policy, MCP policy, write policy, git policy, worktree policy, approval lease duration, max runtime, max spend hint, review requirements, evidence requirements.
  - Profiles are local project config, not provider bypass settings.
  - Schema forbids storing secrets or raw tokens.

- [x] **Step 2: Add approval receipt ledger**
  - Receipts record action, exact target, scope, approver label, created time, expiry, related task/run, and allowed side effects.
  - Receipts never store credentials or private tokens.
  - Expired receipts fail closed and produce a next-action prompt.
  - Final reports include approval receipt summaries for any risky action.

- [x] **Step 3: Add role-aware governance**
  - Roles: owner, maintainer, contributor, reviewer, worker, CI, read-only observer.
  - Role determines default storage location, branch policy, allowed sync, review requirement, and metadata visibility.
  - Protected/contributor modes reuse this governance layer instead of one-off flags.
  - Status output explains current role and why an action is allowed or blocked.

- [x] **Step 4: Add config drift detection**
  - Doctor detects profile drift across README examples, command docs, package manifests, local config, worktree sessions, and active runs.
  - Drift report distinguishes dangerous drift, stale docs, missing defaults, and harmless local overrides.
  - Fix mode can update derived local defaults after backup, but cannot loosen safety policy automatically.

- [x] **Step 5: Add CI and automation-safe modes**
  - CI-readonly can run status, lint, replay evals, docs validation, and release-security audit without mutation.
  - CI-verify can write only local artifacts in a configured output directory.
  - Any approval-dependent action exits with a blocked state and exact required approval.
  - No interactive prompt is emitted in no-tty mode.

- [x] **Step 6: Add commands**
  - `/supervibe-status --policy`
  - `/supervibe-loop --policy-profile guided`
  - `/supervibe-loop --approval-receipts`
  - `/supervibe-loop --policy-doctor`
  - `/supervibe-loop --policy-doctor --fix-derived`
  - `/supervibe-status --role`

- [x] **Step 7: Run verification**
```bash
npm test -- tests/supervibe-policy-profile-manager.test.mjs tests/supervibe-approval-receipt-ledger.test.mjs tests/supervibe-config-drift-detector.test.mjs tests/supervibe-team-governance.test.mjs
npm run check
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until profile schema, receipt expiry, role defaults, drift detection, CI modes, and deny-rule precedence are tested.

**Acceptance Criteria:**
- Autonomous behavior is governed by explicit local policy profiles with safe defaults.
- Approval receipts are scoped, expiring, reportable, and never contain secrets.
- Team roles explain storage, sync, review, and mutation permissions.
- Config drift is visible and cannot silently weaken safety.
- CI/no-tty modes never prompt and never mutate outside configured local outputs.

---

## Task 30: Semantic Anchors, File-Local Contracts, And Change Summaries

**Files:**
- Create: `scripts/lib/supervibe-semantic-anchor-index.mjs`
- Create: `scripts/lib/supervibe-file-local-contracts.mjs`
- Create: `scripts/lib/supervibe-change-summary-index.mjs`
- Create: `scripts/lib/supervibe-anchor-drift-detector.mjs`
- Create: `schemas/supervibe-semantic-anchor.schema.json`
- Create: `docs/semantic-anchors.md`
- Modify: `scripts/lib/autonomous-loop-contracts.mjs`
- Modify: `scripts/lib/autonomous-loop-verification-matrix.mjs`
- Modify: `scripts/lib/autonomous-loop-task-source.mjs`
- Modify: `scripts/lib/autonomous-loop-dispatcher.mjs`
- Modify: `scripts/lib/autonomous-loop-graph-export.mjs`
- Modify: CodeGraph/RAG indexing modules if present
- Modify: `rules/use-codegraph-before-refactor.md`
- Modify: `rules/anti-hallucination.md`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Test: `tests/supervibe-semantic-anchor-index.test.mjs`
- Test: `tests/supervibe-file-local-contracts.test.mjs`
- Test: `tests/supervibe-change-summary-index.test.mjs`
- Test: `tests/supervibe-anchor-drift-detector.test.mjs`

**Estimated time:** 3h, confidence: medium
**Rollback:** disable semantic-anchor parsing and fall back to existing CodeGraph/RAG context
**Risks:** markup can become noisy or mandatory; mitigation: anchors are optional, generated only for high-value files, and never required for small tasks.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for anchor parsing, file-local contract extraction, change summary indexing, stale anchor drift, renamed symbol handling, and fallback when no anchors exist.

- [x] **Step 1: Add optional semantic anchor format**
  - Anchors name stable code regions, module responsibilities, public/private context, invariants, and verification refs.
  - Anchors can live in comments, sidecar JSON, or generated index entries depending on language support.
  - Anchor IDs are stable across formatting and small edits where possible.
  - Anchors must not store secrets, raw prompts, credentials, or private user data.

- [x] **Step 2: Add file-local contracts**
  - Contracts define local purpose, inputs, outputs, side effects, invariants, known dependencies, and forbidden changes.
  - File-local contracts are private implementation context and must not override shared project contracts.
  - Fresh-context task packets include only relevant local contracts for touched files.
  - Contract drift appears in doctor/status when code changes invalidate local assumptions.

- [x] **Step 3: Add change summaries**
  - Each successful task can append concise per-file change summaries linked to task ID, commit, evidence, and verification refs.
  - Summaries explain what changed, why, and what future agents must preserve.
  - Summaries are deduplicated and compacted with closed work.
  - Rejected or speculative summaries stay in run archive, not in active file-local context.

- [x] **Step 4: Integrate with graph, dispatch, and verification**
  - Dispatcher can choose agents using anchor/module ownership and local contracts.
  - Verification matrix can require evidence for changed anchored regions.
  - Graph export can show anchor-to-task and anchor-to-evidence links.
  - Refactor tasks must check anchor drift before and after changes.

- [x] **Step 5: Add anchor doctor and repair**
  - Detect anchors pointing to missing files, renamed symbols, duplicated IDs, stale local contracts, missing verification refs, and summaries for deleted code.
  - `--anchor-doctor` reports safe fixes and risky fixes separately.
  - `--anchor-doctor --fix` can only update derived indexes after backup.
  - Manual review is required before changing source comments or contracts.

- [x] **Step 6: Add commands**
  - `/supervibe-loop --anchors`
  - `/supervibe-loop --anchor-doctor`
  - `/supervibe-loop --anchor-doctor --fix-derived`
  - `/supervibe-status --anchors --file src/example.ts`
  - `/supervibe-loop --summarize-changes --task task-123`

- [x] **Step 7: Run verification**
```bash
npm test -- tests/supervibe-semantic-anchor-index.test.mjs tests/supervibe-file-local-contracts.test.mjs tests/supervibe-change-summary-index.test.mjs tests/supervibe-anchor-drift-detector.test.mjs
npm run check
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until anchor parsing, fallback behavior, drift detection, summary dedupe, and source-comment safety are tested.

**Acceptance Criteria:**
- Agents can navigate large files using stable semantic anchors without requiring heavy markup everywhere.
- File-local contracts improve task packets while preserving shared project contracts as the source of truth.
- Change summaries preserve useful implementation knowledge without polluting active guidance.
- Refactors and anchored edits surface drift before final acceptance.
- Anchor tooling is optional, safe by default, and never stores secrets or raw prompts.

---

## Task 31: Multi-Agent Orchestration Presets, Wave Controller, And Assignment Explainability

**Files:**
- Create: `scripts/lib/supervibe-agent-capability-registry.mjs`
- Create: `scripts/lib/supervibe-wave-controller.mjs`
- Create: `scripts/lib/supervibe-assignment-explainer.mjs`
- Create: `scripts/lib/supervibe-worker-reviewer-presets.mjs`
- Create: `schemas/supervibe-agent-capability.schema.json`
- Create: `docs/multi-agent-orchestration.md`
- Modify: `scripts/lib/autonomous-loop-dispatcher.mjs`
- Modify: `scripts/lib/autonomous-loop-ready-front.mjs`
- Modify: `scripts/lib/autonomous-loop-claims.mjs`
- Modify: `scripts/lib/autonomous-loop-verification-matrix.mjs`
- Modify: `scripts/lib/autonomous-loop-final-acceptance.mjs`
- Modify: `scripts/lib/supervibe-worktree-session-manager.mjs`
- Modify: `scripts/lib/supervibe-team-governance.mjs`
- Modify: `skills/subagent-driven-development/SKILL.md`
- Modify: `skills/requesting-code-review/SKILL.md`
- Modify: `agents` where worker/reviewer profiles are defined
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Test: `tests/supervibe-agent-capability-registry.test.mjs`
- Test: `tests/supervibe-wave-controller.test.mjs`
- Test: `tests/supervibe-assignment-explainer.test.mjs`
- Test: `tests/supervibe-worker-reviewer-presets.test.mjs`

**Estimated time:** 3h, confidence: medium
**Rollback:** fall back to existing dispatcher and manual subagent assignment
**Risks:** orchestration can overfit to agent names instead of task needs; mitigation: assignment is based on capabilities, evidence requirements, scope boundaries, and prior run outcomes.

- [x] **Step 0: Write failing test / red phase**
  - Add tests for capability matching, reviewer independence, wave safety, worktree assignment, conflicting write sets, blocked worker handling, and assignment explanation output.

- [x] **Step 1: Add agent capability registry**
  - Capabilities: stack, module type, risk level, test type, UI/browser ability, integration ability, refactor scope, docs, release-prep, reviewer suitability, and worktree support.
  - Registry supports built-in agent profiles and local project overrides.
  - Registry records previous outcome signals from evals and completed runs without storing raw prompts.
  - Capability matching must degrade to manual assignment when uncertain.

- [x] **Step 2: Add worker and reviewer presets**
  - Presets: implementation worker, integration worker, UI worker, refactor worker, docs worker, release-prep worker, security reviewer, architecture reviewer, verification reviewer, product reviewer.
  - Presets define required context packet shape, allowed write scope, required evidence, forbidden behavior, and review handoff format.
  - Reviewer presets cannot be assigned to review their own worker output.
  - Presets are portable across supported CLI environments.

- [x] **Step 3: Add wave controller**
  - Build execution waves from ready-front tasks, dependency graph, write-set overlap, risk, reviewer availability, and worktree availability.
  - Each wave has a max concurrency, target worktrees, reviewers, verification plan, stop condition, and merge/reconcile strategy.
  - Wave controller pauses on conflicting file claims, missing reviewers, failed gates, stale worker sessions, or policy stops.
  - Status output shows current wave, next wave, and why tasks are not in the current wave.

- [x] **Step 4: Add assignment explainability**
  - Every assignment records why a worker/reviewer was chosen, which alternatives were rejected, and what evidence is required.
  - Explanations include task type, touched files, module contracts, semantic anchors, risk, availability, prior outcomes, and policy constraints.
  - Users can ask "why this agent?" and "why not parallelize this?" through the query surface.
  - Assignment explanations are included in review packages and final reports.

- [x] **Step 5: Add conflict and recovery behavior**
  - Detect overlapping write sets before launching workers.
  - Reassign blocked or failed tasks only after failure packet review.
  - Prefer fresh worktree/session for retries when context or local state is suspect.
  - Reconciliation requires verification and independent review before closing a wave.

- [x] **Step 6: Add commands**
  - `/supervibe-loop --plan-waves docs/plans/example.md`
  - `/supervibe-loop --assign-ready --explain`
  - `/supervibe-status --waves`
  - `/supervibe-status --assignment task-123`
  - `/supervibe-loop --setup-worker-presets`

- [x] **Step 7: Run verification**
```bash
npm test -- tests/supervibe-agent-capability-registry.test.mjs tests/supervibe-wave-controller.test.mjs tests/supervibe-assignment-explainer.test.mjs tests/supervibe-worker-reviewer-presets.test.mjs
npm run check
```

- [x] **Step 8: No commits until review gate**
  - Commit is suppressed until capability matching, wave safety, reviewer independence, worktree assignment, and explanation output are tested.

**Acceptance Criteria:**
- Ready work can be grouped into safe execution waves with bounded parallelism.
- Worker and reviewer assignments are based on capabilities and risk, not hard-coded names.
- Users can inspect why a task was assigned, blocked, serialized, or not parallelized.
- Reviewer independence is enforced across waves and retries.
- Failed workers produce recovery paths without corrupting active worktrees or claims.

---

## Task 32: Trigger Reliability, Intent Router, And Chain Handoff Hardening

**Files:**
- Create: `scripts/lib/supervibe-trigger-intent-corpus.mjs`
- Create: `scripts/lib/supervibe-trigger-router.mjs`
- Create: `scripts/lib/supervibe-chain-handoff-enforcer.mjs`
- Create: `scripts/lib/supervibe-trigger-diagnostics.mjs`
- Create: `scripts/lib/supervibe-trigger-metadata-linter.mjs`
- Create: `schemas/supervibe-trigger-intent.schema.json`
- Modify: `commands/supervibe.md`
- Modify: `commands/supervibe-brainstorm.md`
- Modify: `commands/supervibe-plan.md`
- Modify: `commands/supervibe-loop.md`
- Modify: `commands/supervibe-execute-plan.md`
- Modify: `skills/brainstorming/SKILL.md`
- Modify: `skills/writing-plans/SKILL.md`
- Modify: `skills/autonomous-agent-loop/SKILL.md`
- Modify: `skills/subagent-driven-development/SKILL.md`
- Modify: `skills/using-git-worktrees/SKILL.md`
- Modify: `skills/requesting-code-review/SKILL.md`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.codex-plugin/plugin.json`
- Modify: `.cursor-plugin/plugin.json`
- Modify: `.opencode/plugins/supervibe.js` (actual OpenCode entry point; `.opencode/plugin.json` is not present in this repo)
- Modify: `registry.yaml`
- Modify: `README.md`
- Modify: `package.json`
- Create: `scripts/validate-trigger-metadata.mjs`
- Create: `scripts/validate-trigger-replay.mjs`
- Test: `tests/supervibe-trigger-intent-corpus.test.mjs`
- Test: `tests/supervibe-trigger-router.test.mjs`
- Test: `tests/supervibe-chain-handoff-enforcer.test.mjs`
- Test: `tests/supervibe-trigger-diagnostics.test.mjs`
- Test: `tests/supervibe-trigger-metadata-linter.test.mjs`

**Estimated time:** 2h 30min, confidence: high
**Rollback:** restore previous command descriptions and dispatcher behavior; keep the corpus as non-blocking docs if needed
**Risks:** intent routing can over-match vague requests; mitigation: confidence thresholds, top alternative reporting, and confirmation before mutation.

- [x] **Step 0: Write failing test / red phase**
  - Add bilingual trigger fixtures for these exact user intents: "я сделал брейншторм", "после плана сделай ревью", "разбей план на атомарные задачи", "создай эпик", "запусти эпик автономно", "в отдельном worktree", "пусть идет 3 часа", "что дальше?", "переходим?", "сделай по плану", "продолжай после плана", "не останавливайся после brainstorm".
  - Golden outcomes must include matched phase, command, skill, confidence, prerequisites, mutation risk, and next handoff.
  - Tests must fail against the current first-triggered dispatcher because it does not recognize brainstorm-to-plan-to-review-to-epic-to-worktree flow.

- [x] **Step 1: Add trigger intent corpus**
  - Define intent classes: brainstorm, requirements review, plan, plan review, atomize, create epic, create child work items, execute plan, autonomous run, isolated worktree run, status/query, stop, resume, docs update, README update, and policy-safe blocked state.
  - Store representative English and Russian phrases, ambiguity notes, prerequisite expectations, and expected next-step question.
  - Keep corpus local, deterministic, and free of raw user secrets.

- [x] **Step 2: Replace command-first detection with intent routing**
  - Upgrade `/supervibe` from old project-state-only routing to an intent router that combines explicit command, current artifacts, latest producer phase, and user wording.
  - Preserve project-state checks as one signal, not the only router.
  - Route "I finished brainstorming" to planning handoff, "plan is ready" to plan review, "break it into atomic tasks" to atomization, and "run autonomously in a worktree" to worktree session preflight.
  - Never mutate files or start execution on a low-confidence route; show alternatives and ask.

- [x] **Step 3: Enforce chain handoff contracts**
  - After brainstorm output: print artifact path, recommended next step, and ask "Следующий шаг - написать план. Переходим?"
  - After plan output: produce a review package and ask for plan review before execution.
  - After review passes: ask whether to atomize into an epic and child work items.
  - After atomization: ask execution mode: guided, inline, subagent-driven, worktree-isolated, or autonomous bounded run.
  - Every producer phase must emit artifact path, reason for next step, command to run, and a yes/no confirmation question.

- [x] **Step 4: Strengthen command and skill frontmatter**
  - Update frontmatter descriptions because auto-trigger selection reads metadata before skill bodies.
  - Add concise Russian and English intent phrases to command and skill descriptions for brainstorm, plan, review loop, atomization, epic creation, autonomous loop, subagent execution, worktree isolation, status, stop, and resume.
  - Remove body-only trigger claims that are not represented in frontmatter.
  - Make package metadata and registry descriptions advertise the same core workflow without promising unsafe background execution.

- [x] **Step 5: Add trigger diagnostics**
  - Add `/supervibe --why-trigger "я сделал брейншторм"` and `/supervibe --diagnose-trigger "запусти эпик автономно в отдельном worktree"`.
  - Output matched intent, confidence, selected command, selected skill, prerequisites, alternatives, missing artifacts, safety blockers, and next question.
  - Add diagnostics for "why did this not trigger" when frontmatter lacks the required trigger phrases.

- [x] **Step 6: Add trigger metadata linter**
  - Validate command frontmatter, skill frontmatter, README command examples, plugin manifests, registry metadata, and package version references.
  - Fail when a chained workflow is only documented inside the body and absent from frontmatter.
  - Fail when README mentions a trigger or command path that command metadata does not expose.
  - Fail when command descriptions promise autonomous execution without provider-safe boundaries, visible stop controls, and approval gates.

- [x] **Step 7: Add replay eval for trigger reliability**
  - Include corpus replay in the local quality eval harness.
  - Compare actual route against golden route, confidence floor, and required next-step question.
  - Track false positives, false negatives, and "manual command required" regressions.

- [x] **Step 8: Run verification**
```bash
npm test -- tests/supervibe-trigger-intent-corpus.test.mjs tests/supervibe-trigger-router.test.mjs tests/supervibe-chain-handoff-enforcer.test.mjs tests/supervibe-trigger-diagnostics.test.mjs tests/supervibe-trigger-metadata-linter.test.mjs
npm run check
```

- [x] **Step 9: No commits until review gate**
  - Commit is suppressed until bilingual trigger routing, post-plan review, atomization handoff, worktree handoff, metadata linting, and README synchronization are tested.

**Acceptance Criteria:**
- The required Russian and English trigger phrases route to the correct phase without needing the user to name a command.
- `/supervibe` recognizes brainstorm, plan, review, atomization, epic/work-item creation, autonomous execution, worktree execution, status, stop, and resume intents.
- Producer phases cannot silently stop after brainstorm or plan; they must ask a concrete next-step confirmation question.
- Post-plan review is mandatory before atomization or execution.
- Frontmatter, command docs, manifests, registry metadata, README, and tests agree on supported triggers.
- Trigger diagnostics explain wrong matches, low-confidence matches, missing prerequisites, and safety blockers.

---

## REVIEW GATE 1: Graph Foundation

Before contracts and execution adapters:
- [x] Task graph schema exists and validates.
- [x] Ready-front scheduler is tested.
- [x] Claims and progress log are tested.
- [x] Status shows graph progress.
- [x] Existing `/supervibe-loop --dry-run` remains compatible.
- [x] Workflow trigger router has regression coverage for common phase transitions.

---

## REVIEW GATE 2: Governance Foundation

Before real execution adapters:
- [x] Contract packets exist.
- [x] Autonomy readiness gate exists.
- [x] Verification matrix exists.
- [x] Failure packets exist.
- [x] Policy gates and async gates are integrated.
- [x] Provider-safe permission audit blocks unsafe automation by default.
- [x] Final acceptance fails on missing evidence.

---

## REVIEW GATE 3: Execution Foundation

Before documenting as production-ready:
- [x] Fresh-context stub adapter passes tests.
- [x] Real tool adapter detection is safe and opt-in.
- [x] Side-effect ledger tracks every spawned process.
- [x] Stop command cancels only loop-owned processes.
- [x] Requeue and no-progress circuit breaker work.
- [x] Rate-limit/backoff and permission-denied paths stop cleanly.

---

## REVIEW GATE 4: Productization

Before release:
- [x] Doctor/prime/export/import/archive work.
- [x] Graph export works.
- [x] PRD/story conversion works.
- [x] Workflow trigger router and chain handoffs work.
- [x] Plan-to-work-item atomization works.
- [x] Durable task tracker adapter and sync works.
- [x] Work-item UX, templates, comments, and query surface works.
- [x] Worktree autonomous session manager works.
- [x] Provider-safe automation and permission guard works.
- [x] Required scenarios are documented and tested.
- [x] README, command docs, production-readiness docs, and changelog are synchronized.
- [x] Operational memory extraction and plugin package audit work.
- [x] Advanced work-item operations and agent ergonomics work.
- [x] Release security, provenance, and install integrity work.
- [x] Ecosystem integrations, notifications, dashboard, and federated sync work.
- [x] Saved views, scheduling, query DSL, and work reports work.
- [x] Interactive CLI, guided forms, and command palette work.
- [x] Autonomous quality evals, replay harness, and benchmark corpus work.
- [x] Policy profiles, approval receipts, and team governance work.
- [x] Semantic anchors, file-local contracts, and change summaries work.
- [x] Multi-agent orchestration presets, wave controller, and assignment explainability work.
- [x] Trigger reliability diagnostics, metadata linting, and chain handoff hardening work.
- [x] `npm run check` passes.

---

## Coverage Matrix

| Capability Area | Feature | Covered by |
| --- | --- | --- |
| Durable task graph | Durable task graph | T2 |
| Durable task graph | Ready-front execution | T2, T8 |
| Durable task graph | Atomic task claim | T3 |
| Durable task graph | Claim/lease expiry | T3 |
| Durable task graph | Persistent resumability notes | T3 |
| Durable task graph | Compaction survival | T3, T10 |
| Durable task graph | Async human gate | T4 |
| Durable task graph | Async CI/PR/timer gates | T4 |
| Durable task graph | Doctor diagnostics | T10 |
| Durable task graph | Safe repair mode | T10 |
| Durable task graph | Backup/export/import | T10 |
| Durable task graph | Stale/orphan detection | T10 |
| Durable task graph | Duplicate/cycle detection | T2, T10 |
| Durable task graph | Prime context summary | T10 |
| Durable task graph | Graph visualization/export | T9 |
| Contract-driven execution | Contract-first execution | T5 |
| Contract-driven execution | Module taxonomy | T5, T13 |
| Contract-driven execution | Knowledge-graph style refs | T5, T9 |
| Contract-driven execution | Verification matrix | T6 |
| Contract-driven execution | Trace/log marker evidence | T6 |
| Contract-driven execution | Failure packet | T6 |
| Contract-driven execution | Autonomy readiness lint | T5 |
| Contract-driven execution | Public/private context split | T5, T6 |
| Contract-driven execution | Refresh/drift detection | T10, T14 |
| Contract-driven execution | Module/wave/phase verification levels | T6, T8 |
| Fresh-context story loop | PRD to executable stories | T11 |
| Fresh-context story loop | One story per context window | T11 |
| Fresh-context story loop | Fresh-context execution | T7 |
| Fresh-context story loop | Commit-after-green optional mode | T7 |
| Fresh-context story loop | `passes: true` compatibility | T11 |
| Fresh-context story loop | Append-only progress log | T3 |
| Fresh-context story loop | Archive previous runs | T10 |
| Fresh-context story loop | Browser verification for UI stories | T6, T11 |
| Fresh-context story loop | Hard max iteration stop | T8, T13 |
| Fresh-context story loop | Tool adapter layer | T7 |
| Workflow chaining | Skill trigger router | T15 |
| Workflow chaining | Mandatory next-step handoff after brainstorm | T15 |
| Workflow chaining | Mandatory review loop after plan | T15 |
| Workflow chaining | Mid-conversation continuation triggers | T15 |
| Workflow chaining | Regression tests for skill triggering | T15 |
| Workflow chaining | Bilingual trigger intent corpus | T32 |
| Workflow chaining | Intent router for brainstorm, plan, review, atomization, work items, worktrees, and autonomous execution | T32 |
| Workflow chaining | Chain handoff enforcer with mandatory next-step question | T32 |
| Workflow chaining | Trigger diagnostics and why-trigger output | T32 |
| Workflow chaining | Trigger metadata linter for command, skill, manifest, registry, and README drift | T32 |
| Work-item bridge | Plan-to-epic atomization | T16 |
| Work-item bridge | Child task creation from plan tasks | T16 |
| Work-item bridge | Blocker, related, discovered-from edges | T16 |
| Work-item bridge | External task tracker adapter boundary | T16 |
| Durable task tracker sync | CLI/MCP/native adapter interface | T19 |
| Durable task tracker sync | External epic materialization | T19 |
| Durable task tracker sync | External child task materialization | T19 |
| Durable task tracker sync | Dependency and ready-front reconciliation | T19 |
| Durable task tracker sync | External claim and close sync | T19 |
| Durable task tracker sync | Worktree-aware tracker state | T19 |
| Durable task tracker sync | Tracker sync push/pull and doctor | T19 |
| Work-item UX | Reusable atomization templates | T20 |
| Work-item UX | Labels, priorities, and custom status mapping | T20 |
| Work-item UX | Comments and threaded handoff notes | T20 |
| Work-item UX | Natural-language ready/blocked/owner queries | T20 |
| Work-item UX | Duplicate, stale, orphan, and drift UX | T20 |
| Work-item UX | Protected and contributor workflow modes | T20 |
| Work-item UX | Multi-repo and monorepo routing | T20 |
| Public documentation | README first-class autonomous loop positioning | T21 |
| Public documentation | Brainstorm to plan to review to epic to execution path | T21 |
| Public documentation | Worktree session examples and blocked-state troubleshooting | T21 |
| Public documentation | Provider-safe boundaries and unreleased-capability labeling | T21 |
| Public documentation | README, command docs, scenario docs, production-readiness docs, and changelog sync | T21 |
| Operational memory | Learning extraction from progress, failures, reviews, and evidence | T22 |
| Operational memory | Reviewed guidance updates for reusable project conventions | T22 |
| Operational memory | Closed-work compaction with evidence links | T22 |
| Plugin packaging | Manifest, marketplace, registry, installer, README, and changelog version sync | T22 |
| Plugin packaging | Local install/update smoke checks and package boundary validation | T22 |
| Advanced work-item operations | Context-budget warnings and handoff packets | T23 |
| Advanced work-item operations | Opt-in local watch daemon and heartbeat status | T23 |
| Advanced work-item operations | Explainable priority formula and critical-path scoring | T23 |
| Advanced work-item operations | Migration/import from markdown, plans, JSON tasks, and old loop state | T23 |
| Advanced work-item operations | Delegated-message inbox for blockers and review requests | T23 |
| Advanced work-item operations | Shell completions, quickstart, and onboarding helpers | T23 |
| Release security | Dependency provenance and lockfile drift audit | T24 |
| Release security | Third-party license inventory | T24 |
| Release security | Install/update integrity and path-safety checks | T24 |
| Release security | Release artifact provenance and version drift gate | T24 |
| Release security | Vulnerability exception policy with expiry | T24 |
| Ecosystem integrations | Static interactive run dashboard | T25 |
| Ecosystem integrations | Read-only integration capability catalog | T25 |
| Ecosystem integrations | Notification routing to terminal, inbox, dashboard, and optional webhook | T25 |
| Ecosystem integrations | Federated sync bundle import/export | T25 |
| Ecosystem integrations | Local observability summaries for review and final reports | T25 |
| Work management | Structured query language for work items | T26 |
| Work management | Saved views and portable view definitions | T26 |
| Work management | Scheduled and deferred work | T26 |
| Work management | SLA, aging, due-state, and blocker reports | T26 |
| Work management | Daily and weekly redacted local reports | T26 |
| CLI ergonomics | Interactive command palette | T27 |
| CLI ergonomics | Guided work-item creation forms | T27 |
| CLI ergonomics | Dry-run write previews and typed confirmation | T27 |
| CLI ergonomics | Pager-safe terminal renderer and no-tty fallback | T27 |
| CLI ergonomics | Non-interactive equivalents for every interactive action | T27 |
| Quality evals | Benchmark corpus for core autonomous scenarios | T28 |
| Quality evals | Deterministic replay runner for archived runs | T28 |
| Quality evals | Golden outcome comparison and artifact diffs | T28 |
| Quality evals | Quality scorecard with runtime, budget, and intervention metrics | T28 |
| Quality evals | Opt-in live eval mode with budget and policy gates | T28 |
| Team governance | Policy profile schema and safe profile presets | T29 |
| Team governance | Scoped approval receipt ledger with expiry | T29 |
| Team governance | Role-aware storage, sync, review, and mutation defaults | T29 |
| Team governance | Config drift detection without automatic safety weakening | T29 |
| Team governance | CI/no-tty read-only and verify modes | T29 |
| Semantic navigation | Optional semantic anchor index | T30 |
| Semantic navigation | File-local contracts for touched files | T30 |
| Semantic navigation | Per-file change summaries linked to tasks and evidence | T30 |
| Semantic navigation | Anchor drift doctor and derived-index repair | T30 |
| Semantic navigation | Graph, dispatch, refactor, and verification integration | T30 |
| Multi-agent orchestration | Agent capability registry | T31 |
| Multi-agent orchestration | Worker and reviewer presets | T31 |
| Multi-agent orchestration | Safe execution wave controller | T31 |
| Multi-agent orchestration | Assignment explainability | T31 |
| Multi-agent orchestration | Conflict recovery across workers, reviewers, and worktrees | T31 |
| Worktree sessions | Isolated worktree execution | T17 |
| Worktree sessions | Multi-session active run status | T17 |
| Worktree sessions | Agent heartbeat and stale session handling | T17 |
| Worktree sessions | Finish and cleanup workflow | T17 |
| Provider-safe automation | Permission audit before autonomous run | T18 |
| Provider-safe automation | No bypass-permission default | T18 |
| Provider-safe automation | Rate-limit and budget backoff | T18 |
| Provider-safe automation | Network and MCP approval boundaries | T18 |
| Provider-safe automation | Secret and sensitive-file redaction | T18 |
| Provider-safe automation | Compliance evidence in status and report | T18 |
| Supervibe current loop | Preflight | T4, T5 |
| Supervibe current loop | Policy guard | T4, T8 |
| Supervibe current loop | Side-effect ledger | T7, T8 |
| Supervibe current loop | Confidence scoring | T6, T8 |
| Supervibe current loop | Final report | T8, T10 |
| Supervibe current loop | Resume/status | T1, T3, T8 |
| Supervibe current loop | MCP planning | T5, T12 |
| Supervibe current loop | Rule context | T5, T12 |
| Supervibe current loop | Artifact retention | T10, T14 |

---

## Audit-Derived Feature Backlog

| Feature | Why it matters | Covered by |
| --- | --- | --- |
| Local durable work graph | Keeps long-running work out of chat memory and markdown-only plans | T2, T16, T19 |
| Epic to child work-item hierarchy | Lets one approved plan become a trackable tree of atomic work | T16, T19, T20 |
| Collision-resistant IDs | Avoids multi-agent merge collisions and duplicate task IDs | T16, T19, T20 |
| Parent, blocker, related, duplicate, superseded, and reply links | Turns task state into a useful knowledge graph | T2, T16, T19, T20 |
| Ready queue from dependency graph | Agents can always ask what is safe to do next | T2, T8, T19, T20 |
| Atomic claim and lease model | Prevents two workers from taking the same task | T3, T17, T19, T31 |
| Claim expiry and stale claim repair | Recovers from dead sessions without manual archaeology | T3, T10, T17 |
| Priority and critical-path scoring | Makes autonomous runs spend budget on the right work first | T2, T20, T23, T26 |
| Labels, types, custom statuses, and workflow modes | Supports bugs, tasks, epics, messages, protected branches, and contributor mode | T20, T23, T29 |
| Threaded comments and delegation messages | Gives agents a durable blocker and review inbox | T20, T23, T25 |
| Message-type work items | Lets agents delegate questions without polluting implementation tasks | T20, T23 |
| Natural-language task queries | Lets users ask "what is blocked" or "what is ready" without remembering flags | T20, T26, T27 |
| Structured query language | Enables saved views, dashboards, reports, and deterministic filtering | T26 |
| Saved views | Makes repeated status scans fast and consistent | T26, T25 |
| Deferred and scheduled work | Supports follow-ups, due dates, aging, and recurring local reports | T26 |
| Stale, orphan, duplicate, and drift diagnostics | Keeps the graph trustworthy over long sessions | T10, T19, T20, T22, T23 |
| Backup, export, import, and archive | Makes autonomous state portable, recoverable, and reviewable | T10, T12, T19, T23 |
| Semantic compaction of closed work | Saves context while preserving lessons and evidence links | T10, T22, T23 |
| Stealth and contributor modes | Allows local planning without polluting shared repos or PRs | T18, T20, T29 |
| Multi-repo and monorepo routing | Lets one run route work to the correct package or repository slice | T12, T17, T19, T20 |
| External tracker adapter boundary | Keeps native state authoritative while allowing optional sync | T19, T20, T25 |
| Sync doctor and reconciliation | Prevents external tracker drift from corrupting ready state | T19, T22, T25 |
| Interactive create forms | Helps users create high-quality tasks without memorizing schema | T20, T27 |
| Shell completions | Reduces command friction for status, query, claim, and close flows | T23, T27 |
| Static run dashboard | Makes long autonomous runs observable without a server dependency | T9, T25 |
| Terminal notification router | Surfaces blocked, review-needed, and done states without hidden background work | T23, T25 |
| Opt-in local watch daemon | Watches ready work and blockers while remaining visible and stoppable | T23, T25, T29 |
| Federated sync bundles | Moves work state across machines or repos without requiring a hosted service | T19, T25 |
| Install integrity checks | Prevents unsafe or stale plugin installs | T22, T24 |
| Release provenance report | Makes package contents, versions, licenses, and checksums auditable | T22, T24 |
| Dependency and lockfile drift audit | Catches supply-chain and packaging regressions before release | T24 |
| Manifest and registry version sync | Prevents one CLI package from advertising stale behavior | T22, T24, T32 |
| README and command-doc sync test | Prevents public docs from missing critical workflows | T21, T22, T24, T32 |
| Contract-first module planning | Gives workers stable public boundaries before implementation | T5, T30 |
| Module taxonomy | Helps dispatch, review, and verification choose the right depth | T5, T13, T31 |
| Shared public artifacts | Gives all agents a common source of architectural truth | T5, T9, T30 |
| File-local private contracts | Keeps implementation details near code without polluting shared plans | T30 |
| Semantic anchors and block names | Lets agents navigate large files by meaning, not fuzzy search alone | T5, T30 |
| Change summaries per touched file | Preserves why a file changed for future sessions | T22, T30 |
| Anchor drift doctor | Detects stale contracts, summaries, and navigation markers | T10, T30 |
| Verification plan as first-class artifact | Stops agents from inventing tests late in execution | T6, T28, T30 |
| Module-local, wave-level, phase-level verification | Avoids under-testing and wasteful full-suite repetition | T6, T8, T14, T31 |
| Required log and trace markers | Makes critical flows observable and reviewable | T6, T30 |
| Operational packets | Carries assumptions, stop conditions, retry budget, and evidence needs into execution | T5, T6, T7, T31 |
| Autonomy readiness lint | Blocks long runs before contracts, evidence, or stop rules are strong enough | T5, T18, T28, T29 |
| Status with next safe action | Makes the system say what to do next instead of stopping silently | T10, T13, T15, T20, T32 |
| Scoped review mode | Reviews only the current slice when broader audit is unnecessary | T6, T15, T31 |
| Wave audit mode | Reviews merged parallel work before the next wave | T6, T8, T31 |
| Full integrity audit mode | Re-certifies the whole graph after major changes | T10, T14, T30 |
| Controller-owned shared artifacts | Prevents workers from racing on plans and graph files | T8, T19, T31 |
| Worker-owned write scopes | Keeps parallel workers inside explicit boundaries | T3, T17, T31 |
| Reviewer independence | Stops the same context from implementing and approving risky work | T6, T8, T31 |
| Capability-based worker assignment | Routes tasks by stack, module type, risk, and evidence requirements | T7, T31 |
| Assignment explainability | Lets users see why work was parallelized, serialized, or blocked | T20, T31 |
| Parallel wave controller | Runs independent tasks together while preserving dependency safety | T2, T8, T17, T31 |
| Conflict detection across write sets | Prevents parallel agents from editing the same surface blindly | T3, T17, T31 |
| Fresh worker per task | Reduces context contamination and stale assumptions | T7, T11, T31 |
| Two-stage review per task | Checks spec compliance before code quality | T6, T8, T15, T31 |
| Final review after all tasks | Catches integration regressions after local approvals | T8, T14, T31 |
| Bounded retry loops | Prevents autonomous runs from spinning on the same failure | T6, T8, T13 |
| Failure packets | Gives the user exact blockers, evidence, and next actions | T6, T8, T10 |
| Stop and resume controls | Makes long runs cancellable and recoverable | T1, T3, T8, T13, T17 |
| Side-effect ledger | Makes every spawned process and mutation visible | T7, T8, T18, T29 |
| Approval leases | Prevents stale consent from authorizing new side effects | T4, T18, T29 |
| Policy profiles | Allows safe presets without weakening hard deny rules | T18, T29 |
| Provider-safe permission guard | Avoids bypass defaults, hidden automation, and unsafe network or MCP use | T18, T29 |
| Rate-limit and budget backoff | Stops expensive or blocked runs cleanly | T4, T8, T18, T28 |
| Secret redaction in state and reports | Prevents sensitive data from entering artifacts | T6, T18, T25, T29 |
| Worktree session manager | Enables multiple isolated autonomous sessions on one project | T17, T31 |
| Active worktree registry | Shows branch, path, owner, heartbeat, and task linkage | T17, T20, T25 |
| Worktree cleanup workflow | Prevents abandoned branches and unsafe deletion | T17, T24, T31 |
| Branch naming and setup policy | Makes spawned sessions predictable and reviewable | T17, T23, T29 |
| PRD to story conversion | Converts product intent into execution-sized units | T11, T16 |
| Story-size validator | Prevents oversized tasks from entering autonomous execution | T11, T16, T28 |
| Acceptance criteria normalizer | Makes every story verifiable before execution | T6, T11, T16 |
| Browser evidence for UI stories | Stops frontend tasks from being marked done without visual proof | T6, T11, T14 |
| Progress log across iterations | Gives fresh contexts durable lessons and warnings | T3, T7, T22 |
| Run archive per branch or feature | Separates previous run state from new feature work | T10, T12, T22 |
| Completion signal and max-iteration stop | Gives autonomous loops deterministic exit behavior | T8, T13, T28 |
| Prompt or packet templates per execution mode | Reduces drift between guided, inline, subagent, and worktree modes | T5, T7, T13, T31 |
| Mandatory brainstorm before creative work | Prevents premature coding when requirements are vague | T15, T21, T32 |
| Mandatory spec approval gate | Keeps implementation blocked until design is approved | T15, T21, T32 |
| Plan self-review | Catches missing tasks, placeholders, and type drift before execution | T15, T21, T32 |
| Post-plan review loop | Forces review before atomization or execution | T15, T16, T32 |
| Plan-to-epic atomization | Turns approved plans into durable work graph entries | T16, T19, T20 |
| Explicit execution choice after atomization | Lets user choose guided, inline, subagent-driven, worktree, or autonomous run | T15, T17, T31, T32 |
| Mandatory next-step questions | Makes every producer phase propose the next action and ask confirmation | T15, T21, T32 |
| Skill trigger frontmatter hardening | Fixes auto-trigger failures before the skill body is loaded | T15, T32 |
| Bilingual trigger corpus | Covers real English and Russian user phrasing | T15, T28, T32 |
| Intent router diagnostics | Explains chosen command, skill, confidence, alternatives, and blockers | T13, T15, T32 |
| Trigger metadata linter | Prevents command, skill, manifest, registry, and README drift | T21, T22, T24, T32 |
| Trigger replay evals | Keeps auto-routing from regressing after future edits | T28, T32 |
| Command palette | Gives users an interactive fallback when natural-language routing is ambiguous | T27, T32 |
| No-tty fallback | Keeps automation from hanging on interactive prompts | T27, T29 |
| Quality scorecard | Tracks trigger quality, evidence, runtime, budget, intervention, and docs consistency | T28 |
| Golden outcome replay | Turns archived good runs into regression tests | T14, T28, T32 |
| Live eval mode with budget cap | Allows realistic checks without making release gates provider-dependent | T18, T28, T29 |
| Repository context binding | Binds work state to the correct repo, package, branch, and workspace root | T12, T17, T19, T20 |
| Workspace fingerprinting | Detects when copied work state is opened in the wrong project or stale checkout | T10, T17, T22, T29 |
| Production database pollution guard | Blocks tests and experiments from writing into real project state | T14, T18, T20, T29 |
| Hook-based consistency checks | Runs lightweight graph and metadata checks during local workflow transitions | T10, T19, T22, T24 |
| Hook installation and uninstall UX | Lets users opt into local consistency checks without manual setup | T23, T24, T27 |
| Config validation and apply preview | Shows safe config changes before writing plugin or automation settings | T22, T27, T29 |
| Config drift doctor | Detects drift between README examples, manifests, local config, worktrees, and active runs | T22, T24, T29, T32 |
| Central config with local overrides | Supports team defaults while preserving per-user safety choices | T22, T29 |
| Credential reference validation | Validates credential references without storing raw credentials | T18, T24, T29 |
| Lockfile and exclusive writer diagnostics | Explains when state is locked, stale, or unsafe to mutate | T3, T10, T17, T19 |
| Formula-based priority scoring | Lets teams define explainable local ranking rules for ready work | T20, T23, T26 |
| Priority formula explain output | Shows score components so users can override routing confidently | T20, T23, T26 |
| Time parsing for defer and due commands | Makes natural due dates and scheduled work ergonomic | T26, T27 |
| Direct SQL or structured storage inspection mode | Gives advanced users a local read-only escape hatch for debugging state | T10, T19, T25 |
| CLI coverage and command-surface tests | Ensures every advertised command has tested help, JSON, and failure paths | T13, T14, T21, T24 |
| JSON output for every automation-facing command | Makes status, query, claim, sync, and diagnostics scriptable | T13, T19, T20, T25, T27 |
| Text and JSON output parity | Prevents machine output from missing fields shown to humans | T13, T14, T25, T27 |
| Lint explain command | Turns integrity failures into actionable remediation guidance | T10, T14, T27, T32 |
| Module or artifact find command | Resolves user words, changed files, and errors to the relevant contract or work item | T5, T10, T20, T30 |
| Module or artifact show command | Prints the shared public truth plus linked verification excerpts | T5, T10, T20, T30 |
| File-local context show command | Prints local contracts, anchors, and change summaries for a touched file | T10, T27, T30 |
| Health status with autonomy gate | Reports whether the project is ready for long execution or needs refresh, planning, or verification first | T10, T18, T28, T29 |
| Recent-change summary in status | Helps agents understand what changed since the previous run | T22, T25, T30 |
| Lint profile for autonomous readiness | Provides a cheap preflight before expensive long-running execution | T5, T18, T28, T29 |
| Remediation guidance per lint code | Makes blocked states actionable without guessing | T10, T14, T27 |
| External tracker field mapping | Maps local work items to remote types, states, priorities, labels, and links | T19, T20, T25 |
| External tracker dry-run sync | Previews remote create, update, close, and link operations before mutation | T19, T25, T29 |
| Pull-only and push-only sync modes | Allows safe reconciliation without forcing bidirectional mutation | T19, T25, T29 |
| Bootstrap matching for first sync | Matches existing remote work items before creating duplicates | T19, T20, T25 |
| Multi-project external sync filters | Routes external sync across several remote projects safely | T19, T20, T25 |
| Field-level conflict strategy | Handles concurrent edits with newest, union, max, manual, or fail-closed behavior | T19, T25, T29 |
| Sovereignty tiers for sync peers | Separates trusted, read-only, contributor, and local-only sync relationships | T18, T19, T25, T29 |
| Peer ahead-behind status | Shows whether local work state is ahead, behind, divergent, or clean | T19, T25 |
| Conflict resolution report | Explains sync conflicts and required manual decisions | T19, T25, T29 |
| MCP adapter as thin facade | Exposes work graph operations to agents without duplicating storage logic | T12, T18, T19, T25 |
| Workspace routing for MCP calls | Finds the correct local state from an agent's working directory | T12, T17, T19 |
| Editor integration hooks | Makes ready work, blockers, comments, and diagnostics available in coding tools | T23, T25, T27 |
| Package install smoke test matrix | Validates plugin installation across supported agent shells before release | T22, T24 |
| Marketplace metadata audit | Ensures package cards, manifests, registries, and docs expose the same workflows | T21, T22, T24, T32 |
| Version bump consistency check | Blocks release when changelog, package, manifests, registry, and README disagree | T22, T24 |
| Third-party license inventory in release notes | Makes redistributable package contents auditable | T24 |
| Antivirus and binary trust guidance | Gives Windows users a safe verification path for downloaded tools | T21, T24 |
| Devcontainer and reproducible setup notes | Lets agents and users reproduce checks in a known environment | T21, T24, T28 |
| Multi-platform installer parity | Keeps install and update behavior consistent across shells and operating systems | T22, T24 |
| Release stability gate | Blocks publishing until tests, docs, package audit, and install checks pass | T14, T21, T24, T28 |
| PR preflight for existing work | Checks whether similar work already exists before creating duplicate tasks | T20, T23, T29 |
| Contributor attribution workflow | Preserves external contributions when agents adapt or finish existing work | T20, T23, T29 |
| Branch landing checklist | Ensures autonomous work is committed, pushed, documented, and linked to follow-up work | T17, T21, T23, T24 |
| Agent guidance updater with review | Promotes durable lessons into project guidance only after human-readable review | T22, T30 |
| Scoped AGENTS or local guidance updates | Updates only relevant guidance files instead of polluting global instructions | T22, T30 |
| Auto-handoff threshold awareness | Warns when current context is nearing handoff and writes a compact continuation packet | T7, T23, T28 |
| Continuation packet validation | Ensures handoff packets contain artifacts, current task, blockers, evidence, and next action | T3, T7, T23 |
| Branch-change archive trigger | Archives previous run artifacts when the active feature branch changes | T10, T17, T22 |
| Promise-style completion marker | Gives loop runners a deterministic completion signal independent of prose | T8, T13, T28 |
| Passes-state compatibility | Supports story lists where each story exposes explicit done or not-done state | T11, T16, T28 |
| Max iteration and max duration guards | Stops loops by iteration count, timebox, or budget, whichever comes first | T8, T13, T18, T28 |
| Tool adapter selection flag | Lets users choose an execution provider while keeping the same safety envelope | T7, T13, T18 |
| Provider adapter capability detection | Reports which providers support print mode, JSON mode, worktree mode, or browser verification | T7, T13, T18 |
| Dangerous provider flag scanner | Blocks adapter commands that request permission bypass or unrestricted tool execution by default | T7, T18, T29 |
| Tool allow, ask, deny normalization | Converts provider-specific permission rules into a shared local safety model | T18, T29 |
| Non-interactive permission prompt bridge | Routes unattended approval requests to a local policy gate instead of silent approval | T4, T18, T29 |
| Managed policy precedence check | Ensures local project config cannot weaken higher-priority provider or team policy | T18, T29 |
| Permission-mode status panel | Shows effective permissions, denied tools, prompt-required tools, and bypass-disabled state | T10, T18, T25, T29 |
| Hook decision audit trail | Records hook allow, ask, and deny decisions as first-class side-effect evidence | T7, T18, T25, T29 |
| Browser verification acceptance normalizer | Adds explicit visual verification requirements to UI stories during atomization | T6, T11, T16 |
| Multiple-choice requirement intake | Reduces ambiguity and speeds up brainstorm or PRD creation | T11, T15, T27 |
| Numbered requirement IDs | Makes requirements, stories, work items, tests, and evidence cross-referenceable | T5, T6, T11, T16 |
| Non-goals and scope boundaries in intake | Prevents autonomous agents from overbuilding | T5, T11, T15, T16 |
| Success metrics capture | Preserves how the user will judge completion beyond code passing tests | T5, T11, T21 |
| Open questions surfacing | Keeps unresolved product decisions out of autonomous execution | T4, T5, T11, T15 |

---

## Required Scenario Coverage

| Scenario | Required Plan Coverage |
| --- | --- |
| Plan execution | T2, T5, T6, T8, T15, T16, T19, T20, T21, T23 |
| Triggered workflow continuation | T15, T16, T21, T28, T32 |
| Open validation request | T1, T2, T8 |
| Integration repair | T4, T6, T8, T12, T17 |
| Design to development | T6, T11, T12, T15 |
| Refactor | T5, T6, T8, T12 |
| Documentation | T2, T5, T12, T21, T22, T23 |
| Monorepo | T2, T5, T10, T12, T17, T19, T20 |
| Flaky tests | T6, T8, T14 |
| Missing credentials | T4, T6, T12 |
| Policy stop | T4, T8, T12, T18 |
| Server/Docker/deploy preparation | T4, T6, T12, T17, T18 |
| MCP validation | T5, T12, T14, T18 |

---

## Non-Goals

- Do not require any external database to use Supervibe.
- Do not auto-bypass provider permissions or CLI safety prompts.
- Do not make markup-heavy contracts mandatory for every project.
- Do not silently commit, push, deploy, rotate credentials, or mutate production.
- Do not replace existing Supervibe agents, rubrics, CodeGraph, RAG, memory, or preview server.

---

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Graph scheduler introduces dependency direction bugs | Agents execute tasks in unsafe order | Use "X needs Y" tests, cycle tests, ready-front fixtures |
| Contract layer becomes too heavy | Users avoid loop for small tasks | Quick preflight for simple local requests; full contracts only for serious autonomy |
| Real tool adapters create unsafe automation | Security and ToS risk | Opt-in execution modes, policy guard, side-effect ledger, no dangerous defaults |
| Evidence model becomes noisy | Reports become unreadable | Evidence levels: module, wave, phase; compact final report with linked artifacts |
| Stale claims block progress | Loop appears stuck | Claim expiry, doctor, status warnings |
| External gates are flaky | False blocked states | Timer/manual gates deterministic; CI/PR adapters degrade to blocked with next action |
| Fresh-context agents lose too much context | Low-quality attempts | Task packet includes contract, evidence matrix, progress notes, CodeGraph/RAG context |
| Requeue loops forever | Budget waste | No-progress circuit breaker and repeated failure signature detection |
| New state fields break old runs | Resume regression | T1 compatibility lock and state migrations |
| Skill triggers stay too weak | User has to manually name every command | Trigger router, bilingual matrix, and trigger regression tests |
| Workflow stops after spec or plan | User does not know the next action | Mandatory next-step handoff block after each producer phase |
| Intent router misroutes user request | Wrong phase runs or user has to recover manually | Bilingual replay corpus, confidence floor, top alternatives, mutation-risk labels, and confirmation before writes |
| Skill body says a trigger exists but frontmatter cannot expose it | Auto-trigger fails before the skill body is loaded | Metadata linter checks command, skill, manifest, registry, and README trigger claims |
| Atomized work items become noisy | Autonomous run wastes time on bad tasks | Story-size validation, graph validation, and plan review before atomization |
| Worktree runs conflict with user work | Local workspace pollution or duplicate sessions | Worktree policy, active session registry, claims, and cleanup safeguards |
| Provider policy violation | Account or product access risk | Permission audit, no bypass defaults, rate-limit backoff, network/MCP approvals, and fail-closed guard |
| External tracker state drifts from native state | Wrong task appears ready or claimed | Mapping file, sync doctor, native graph fallback, and explicit reconciliation |
| Rich work-item UX becomes noisy | Users cannot find the simple path | Keep `/supervibe` as auto-router and expose advanced views through status/query |
| README drifts from implemented behavior | Users follow unsupported commands or unsafe assumptions | Add README docs test, command-doc sync, changelog gate, and unreleased-capability labels |
| Autonomous run learnings get lost or pollute guidance | Future runs repeat mistakes or read stale advice | Extract scoped candidates, dedupe, require review approval, and compact only closed work |
| Plugin package metadata drifts across CLIs | Users install stale commands or broken manifests | Package audit, manifest/version sync, local install/update smoke checks, and release gate |
| Watch daemon becomes hidden automation | User cannot tell what is running | Opt-in daemon only, visible heartbeat, loop-owned PID registry, and normal stop command |
| Imported old plans create duplicate work | Agents execute stale or repeated tasks | Dry-run import, source references, duplicate detection, and review before write |
| Priority formula feels opaque | Users distrust ready-front ordering | Explain score components in status and record overrides in audit history |
| Release artifact cannot be trusted | Users install tampered or undocumented package contents | Integrity checks, provenance report, lockfile audit, license inventory, and version drift gate |
| Vulnerability gate blocks urgent patch indefinitely | Release stalls without clear owner | Expiring documented exceptions with owner, severity, rationale, mitigation, and review evidence |
| Dashboard leaks sensitive local context | Secrets or private paths appear in generated HTML | Redaction pass, dashboard tests, and raw prompt exclusion before write |
| Notification integration spams or mutates remote systems | Users lose trust in automation | Terminal/inbox default, webhook allowlist, provider-safe approval, and no remote mutation during sync import |
| Query DSL becomes unsafe or confusing | Users execute unintended filters or arbitrary code | Parse a strict local-only grammar, provide built-in views, and show compiled filters before save |
| Scheduling hides work | Deferred tasks are forgotten | Deferred tasks stay visible in status/dashboard and reports show due/overdue work |
| Interactive CLI breaks automation | CI or agents hang on prompts | Interactive mode is opt-in, detects no-tty, exits clearly, and documents non-interactive equivalents |
| Guided form writes bad tasks | Users create noisy work items faster | Validate fields, preview normalized writes, support drafts, and require explicit confirmation |
| Evals become expensive or flaky | Release gate slows down or depends on providers | Replay local artifacts by default; live evals are opt-in, budget-capped, and excluded from normal check |
| Golden outcomes hide regressions | Bad behavior becomes accepted baseline | Golden updates require review evidence and artifact diffs |
| Policy profiles weaken safety | User config accidentally permits unsafe automation | Built-in deny rules take precedence, profiles validate by schema, and dangerous overrides require review evidence |
| Approval receipts become hidden consent | Old approval is reused outside intended scope | Receipts include exact target, side effects, expiry, task/run link, and fail closed when mismatched |
| Semantic anchors become noisy or stale | Agents trust outdated local context | Anchors are optional, drift-checked, linked to evidence, and source-comment fixes require review |
| File-local contracts conflict with shared contracts | Agents follow private detail over public truth | Shared contracts remain authoritative and drift appears in status/doctor |
| Agent assignment overfits names instead of work | Wrong worker handles high-risk tasks | Capability registry, assignment explanations, prior outcome signals, and manual fallback |
| Parallel waves corrupt overlapping files | Multiple workers edit same surface | Write-set conflict detection, claims, worktree isolation, wave stop conditions, and review before reconcile |

---

## Execution Handoff

**Subagent-driven batches:**
- Batch A: T1, T2, T3 can be implemented together if write sets are kept separate.
- Batch B: T4, T5, T6 after graph foundation.
- Batch C: T7, T8 after governance foundation.
- Batch D: T9, T10, T11, T12, T13 after runner integration.
- Batch E: T15, T16, T19 after graph foundation and before worktree productization.
- Batch F: T20 after atomization and tracker adapter contracts exist.
- Batch G: T17 after durable task tracker sync exists.
- Batch H: T18 after policy gates and before real execution adapters.
- Batch I: T14 as final verification hardening.
- Batch J: T21 after public command behavior and safety gates are stable.
- Batch K: T22 after archives, docs, command surface, and package metadata are stable.
- Batch L: T23 after work-item bridge, tracker sync, UX query layer, and package audit are stable.
- Batch M: T24 after release gates, public docs, and package audit are stable.
- Batch N: T25 after graph export, tracker sync, work-item UX, and advanced operations are stable.
- Batch O: T26 after work-item query UX, dashboard, and advanced operations are stable.
- Batch P: T27 after command surface, work-item UX, advanced operations, and saved views are stable.
- Batch Q: T28 after evidence model, runner integration, release gates, README docs, and dashboard are stable.
- Batch R: T29 after provider-safe guard, work-item UX, package audit, release security, and interactive CLI are stable.
- Batch S: T30 after contracts, evidence, graph export, doctor, and eval replay are stable.
- Batch T: T31 after dispatcher, verification, runner integration, worktrees, work-item UX, governance, and semantic anchors are stable.
- Batch U: T32 after workflow chaining, atomization, public docs, eval replay, and orchestration presets are stable.

**Inline batches:**
- Do T1-T3 inline if only one engineer/agent is available.
- Do T5-T6 inline if contract and evidence design need tight coordination.
- Do T8 inline because it is the integration point and should be reviewed carefully.

**Recommended path:** Subagent-driven for modules, inline for runner integration and final acceptance.

---

## Self-Review

### Spec coverage
| Requirement | Task |
| --- | --- |
| Preserve current loop compatibility | T1 |
| Add durable task graph and ready-front scheduling | T2, T8 |
| Add claims, leases, resumability, and progress notes | T3 |
| Add async approval and external-condition gates | T4 |
| Add contract packets and autonomy readiness | T5 |
| Add verification matrix, evidence model, and failure packets | T6 |
| Add real execution adapters and fresh-context mode | T7 |
| Integrate scheduler, requeue, and final acceptance | T8 |
| Add graph export and human inspection | T9 |
| Add doctor, repair, prime, archive, export, and import | T10 |
| Add PRD and story conversion | T11 |
| Expand scenario and production-readiness docs | T12 |
| Productize the command surface | T13 |
| Add regression suite and release gates | T14 |
| Add workflow trigger router and skill chaining | T15 |
| Add plan-to-work-item atomization and epic bridge | T16 |
| Add worktree autonomous session manager | T17 |
| Add provider-safe automation and permission guard | T18 |
| Add durable task tracker adapter and sync | T19 |
| Add work-item UX, templates, comments, and query surface | T20 |
| Add README and public docs release sync | T21 |
| Add operational memory and plugin package audit | T22 |
| Add advanced work-item operations and agent ergonomics | T23 |
| Add release security, provenance, and install integrity | T24 |
| Add ecosystem integrations, notifications, dashboard, and federated sync | T25 |
| Add saved views, scheduling, query DSL, and work reports | T26 |
| Add interactive CLI, guided forms, and command palette | T27 |
| Add autonomous quality evals, replay harness, and benchmark corpus | T28 |
| Add policy profiles, approval receipts, and team governance | T29 |
| Add semantic anchors, file-local contracts, and change summaries | T30 |
| Add multi-agent orchestration presets, wave controller, and assignment explainability | T31 |
| Add trigger reliability, intent router, diagnostics, and chain handoff hardening | T32 |

### Source Coverage
- [x] Durable task graph, ready-front, claims, async gates, doctor, recovery, export/import, prime, graph export are included.
- [x] Contract packets, module taxonomy, verification matrix, trace evidence, failure packets, autonomy readiness, drift checks are included.
- [x] PRD conversion, small stories, fresh-context mode, commit-after-green option, progress log, archive, browser checks, tool adapters are included.
- [x] Workflow chaining, trigger clarity, post-plan review loop, work-item atomization, and isolated worktree sessions are included.
- [x] Durable task tracker adapter, epic/task/dependency sync, ready/claim/close, and sync doctor are included.
- [x] Work-item templates, labels/priorities, comments, query UX, protected/contributor modes, and multi-repo routing are included.
- [x] README, changelog, command docs, public examples, blocked-state troubleshooting, and unreleased-capability labels are included.
- [x] Operational learning extraction, reviewed guidance updates, memory compaction, and plugin package release audit are included.
- [x] Context-budget handoff, opt-in watch daemon, priority formula, migration/import, delegated-message inbox, shell completions, quickstart, and onboarding are included.
- [x] Release security, dependency provenance, license inventory, install integrity, artifact provenance, version drift, and vulnerability exceptions are included.
- [x] Static run dashboard, integration catalog, notification routing, federated sync bundles, and local observability summaries are included.
- [x] Structured query language, saved views, scheduled/deferred work, SLA/aging reports, and recurring local summaries are included.
- [x] Interactive command palette, guided forms, terminal renderer, write previews, and no-tty fallback are included.
- [x] Benchmark corpus, deterministic replay, golden outcomes, quality scorecards, and opt-in live evals are included.
- [x] Policy profiles, approval receipts, team roles, config drift detection, and CI/no-tty governance modes are included.
- [x] Semantic anchors, file-local contracts, change summaries, anchor drift detection, and graph/verification integration are included.
- [x] Agent capability registry, worker/reviewer presets, safe execution waves, assignment explainability, and conflict recovery are included.
- [x] Trigger intent corpus, improved intent router, chain handoff enforcer, diagnostics, and metadata linter are included.
- [x] Provider-safe permission, rate-limit, network, MCP, and secret-handling safeguards are included.
- [x] Current Supervibe loop artifacts, preflight, policy guard, side-effect ledger, scoring, final report, status, resume, MCP/rules, retention are preserved and extended.

### Scenario Coverage
- [x] All scenarios from `docs/autonomous-loop-scenarios.md` are mapped to tasks.
- [x] Production readiness remains approval-gated.
- [x] Missing credentials and external access become blocked states, not silent failures.
- [x] UI work requires browser/preview evidence.
- [x] Refactors require CodeGraph/blast-radius evidence.

### Implementation Coverage
- [x] Schemas are planned.
- [x] Runtime modules are planned.
- [x] Tests are planned.
- [x] Command docs are planned.
- [x] README/docs updates are planned.
- [x] Rollback and risk mitigations are listed.

### Type consistency
- [x] Task status vocabulary is defined before runner integration.
- [x] Gate, claim, attempt, contract, verification, and failure-packet fields have planned schemas.
- [x] Existing task and state schemas are extended rather than replaced.
- [x] JSONL artifacts remain append-only where they represent event history.
- [x] Command examples use concrete paths and run IDs.

### Placeholder Scan
- [x] No unresolved placeholders.
- [x] No unassigned source feature.
- [x] No implementation task without acceptance criteria.

### Final Sanity Check
- [x] The plan does not require new native dependencies.
- [x] The plan does not weaken safety boundaries.
- [x] The plan keeps existing dry-run behavior compatible.
- [x] The plan creates a path from current `/supervibe-loop` to real autonomous execution without making real execution the default.
