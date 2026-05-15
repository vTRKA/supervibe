# Supervibe Workflow Hardening

This document holds detailed guidance that should not live in host root files.
Host instruction files should stay concise and point here for deeper policy.

## Workflow Anatomy

A durable Supervibe workflow has these parts:

1. Intake: identify the user outcome, active command, write scope, constraints,
   and stop conditions.
2. Source-of-truth preflight: check project memory, Code RAG, Code Graph,
   existing artifacts, host rules, and command state before recommendations or
   edits.
3. Contract: define acceptance criteria, non-goals, risk, owner roles,
   verification commands, and residual-risk handling.
4. Execution: write only inside the accepted scope, bind delegated producer or
   reviewer work to runtime evidence, and keep work item state current.
5. Self-review: compare the result against the contract before asking a user or
   final reviewer to accept it.
6. Final acceptance: report changed artifacts, verification evidence, open
   findings, and residual risks.
7. Memory and status: record durable decisions or handoff state under
   `.supervibe/memory/` when the workflow requires it.

Command-owned workflows own state transitions and receipts. Direct agent work
owns only its documented specialist output and must not claim command lifecycle
progress unless the command runtime supplied that proof.

## Product Surface Contract

Audience: maintainers, agents, and local operators who need to understand what
Supervibe should do next. The goal is not to expose every script or create a
new platform surface. The goal is to turn a request or workflow state into one
safe local next action backed by source evidence.

A Supervibe recommendation is actionable only when it names:

- the authoritative source, such as command metadata, active graph state,
  project memory, Code RAG, CodeGraph, receipts, host readiness, or release
  evidence;
- the exact command, file, artifact, or user decision that should happen next;
- whether the action is read-only, dry-run, guarded mutation, or blocked;
- whether current user approval is required;
- which evidence was missing, stale, degraded, or deferred to the final release
  gate.

Do not present a list of interesting possibilities as the default answer. The
default product contract is: one primary next action, one reason, one safety
classification, and compact evidence. Details and secondary blockers belong in
explicit diagnostic modes such as `--blocked-only`, `--json`, `--all-blockers`,
or the relevant artifact appendix.

### Difference Positioning

Supervibe is the local evidence workflow layer for AI coding hosts. Its useful
surface is:

```text
local host -> command route -> next action -> memory/RAG/graph evidence -> specialists -> receipts/gates -> verified handoff
```

When comparing Supervibe with external orchestration products or Ruflo-style
ideas, keep the distinction internal and concrete:

- Borrow: clearer command routing, a small operation-level facade, generated
  command and agent maps, explicit degraded mode, benchmark scenarios, and
  release evidence.
- Keep: local Node/npm execution, host-neutral wording, provider privacy
  boundaries, project memory, Code RAG, CodeGraph, scoped receipts, and final
  release gates.
- Avoid: hosted dashboards, self-host dashboards, marketplace packaging,
  third-party plugin ecosystems, broad tool launchers, persistent swarm runtimes,
  arbitrary script passthrough, provider-config mutation, and opaque learning.

The difference is evidence, locality, and decision safety, not feature count.

### Small Mental Model

Use this path for durable work:

1. Route command-like user text with
   `node scripts/supervibe-commands.mjs --match "<request>" --json`.
2. Read the current workflow action with
   `node scripts/supervibe-status.mjs --next-only --no-color`.
3. If blocked, inspect only blockers with
   `node scripts/supervibe-status.mjs --blocked-only --no-color`.
4. Gather evidence using project memory and local code search, for example
   `node scripts/search-memory.mjs --query "<topic>" --include-history --graph`
   and `node scripts/search-code.mjs --context "<topic>" --limit 8`.
5. Continue, repair by dry-run preview, or ask for current user approval. Do
   not apply a mutating repair because a diagnostic command named it.
6. At handoff, map goals to evidence and defer plan/graph/task validators to
   the final release gate unless the active workflow explicitly enters
   verify/review/ship.

The current facade CLI is a local contract catalog, not an operation executor:

```bash
node scripts/supervibe-facade.mjs --list --json
node scripts/supervibe-facade.mjs --operation status --json
```

It may describe operations with guarded mutation risk, such as `receipts` or
`repair`, but `surface.executesOperations` is false. Executing, applying, or
publishing remains owned by the underlying command, host workflow, approval
gate, and receipt tooling.

### Evidence Glossary

| Term | Product meaning | Typical source |
| --- | --- | --- |
| Command route | How natural language or a slash command maps to a Supervibe workflow. | `scripts/supervibe-commands.mjs`, `commands/*.md` |
| Next action | The one primary command or operator action selected from current workflow state. | `scripts/supervibe-status.mjs --next-only` |
| Project memory | Prior decisions, patterns, incidents, learnings, and solutions. | `.supervibe/memory/`, `scripts/search-memory.mjs` |
| Code RAG | Local source retrieval for relevant files, snippets, and context packs. | `.supervibe/memory/code.db`, `scripts/search-code.mjs` |
| CodeGraph | Local symbol and relationship graph for callers, callees, impact, and caveats. | `scripts/search-code.mjs --callers`, `--callees`, `--neighbors` |
| Facade | A small local operation contract over existing capabilities. | `scripts/supervibe-facade.mjs`, `scripts/lib/supervibe-facade-contract.mjs` |
| Privacy boundary | What can be shown in local or publishable output. | P2.3 privacy artifact and facade redaction metadata |
| Routing evidence | Why agents were selected or rejected. | `scripts/command-agent-plan.mjs`, command orchestration contract |
| Host readiness | Whether the selected host can run required agents and trust receipts. | host readiness matrix, command-agent plan output |
| Receipt | Runtime-issued proof that a real command, agent, worker, reviewer, validator, or tool produced evidence. | `scripts/workflow-receipt.mjs` |
| Confidence | Evidence-backed maturity score with explicit caps for missing, stale, or deferred proof. | confidence rubrics, score logs, validator output |
| Release witness/evidence | Current verify/review/ship packet, validator rows, receipt trust, rollback, support, residual risk, and any local witness summary generated from those facts. | `/supervibe-verify`, `/supervibe-review`, `/supervibe-ship` |

### Generated Command Catalog

Do not maintain a hand-written command catalog in prose. Generate or inspect it
from local metadata:

```bash
node scripts/supervibe-commands.mjs --json
node scripts/supervibe-commands.mjs --match "<request>" --json
npm run supervibe:commands -- --json
```

The catalog is built from command shortcuts, `commands/*.md`, and `package.json`
scripts by `scripts/lib/supervibe-command-catalog.mjs`. It also exposes the
command-agent contract, required real-agent fan-out policy, and command matching
reason. If the command matcher returns a hard stop or missing slash-command
diagnostic, report that diagnostic and stop instead of searching source files to
emulate the command.

Docs may show the commands above and describe how to read the generated output.
Avoid copying the full current command count into long-lived prose; counts drift
as commands and npm scripts change.

### Generated Agent Capability Map

Agent capability guidance comes from real agent metadata, not a manually ranked
list. Use these generated surfaces:

```bash
node scripts/agent-capability-heatmap.mjs --json
npm run supervibe:agent-heatmap
```

Use `docs/agent-roster.md` as the human-readable generated roster. It is built
from `agents/**/*.md` frontmatter through `scripts/lib/supervibe-agent-roster.mjs`
and should be treated as a responsibility map, not a menu to run every agent.

Capability rows should preserve agent id, path, namespace, stacks,
capabilities, tools, skill counts, freshness, score, grade, and risks. If an
agent, skill, host callable path, or receipt proof is missing, state the missing
capability and degraded mode rather than substituting a generic worker.

### Top Blocker Troubleshooting

| Blocker | First read-only check | Safe next response |
| --- | --- | --- |
| Command-like request may already map to a workflow. | `node scripts/supervibe-commands.mjs --match "<request>" --json` | Follow the route, or stop on hard-stop/missing-slash output. |
| No active graph or ambiguous active graph. | `node scripts/supervibe-status.mjs --next-only --no-color` | Inspect status or plan lifecycle; do not guess the graph. |
| Blocked graph items hide lower-priority work. | `node scripts/supervibe-status.mjs --blocked-only --no-color` | Resolve the primary blocker before claiming ready work. |
| Stale or missing Code RAG/CodeGraph. | `node scripts/supervibe-status.mjs --index-health --strict-index-health --no-gc-hints --no-color` | Report stale rows and the repair command; do not rebuild during plan/graph/task development unless the workflow enters an approved repair gate. |
| No useful memory match. | `node scripts/search-memory.mjs --query "<topic>" --include-history --graph` | State novel territory or weak prior evidence; cap confidence if memory was required. |
| Missing or untrusted receipt proof. | `node scripts/workflow-receipt.mjs recovery-status` | Use receipt tooling repair paths only; never edit receipt JSON or ledgers by hand. |
| Required agents are not callable in the current host. | `node scripts/command-agent-plan.mjs --command <slash-command> --host <host> --strict` | Block durable work or provision through the approved host path; do not emulate specialists. |
| Current approval is missing. | Inspect the active plan, graph, or command handoff. | Ask for the exact current approval; prior broad consent is not enough for new mutation. |
| Privacy boundary is unclear. | `node scripts/supervibe-facade.mjs --list --json` | Default to local-private, bounded summaries, and redacted publishable output. |
| Release witness/evidence is incomplete. | Use `/supervibe-verify`, `/supervibe-review`, then `/supervibe-ship` when the workflow reaches those gates. | Keep validators and `npm run check` deferred until the final release/merge gate for plan/graph/task work; do not publish a witness from stale evidence. |

## Validator Gates

Validator gates are evidence checks, not formatting rituals. The active
workflow should name targeted validators before work starts, run only the
commands required by the user request and changed surface, and report any
skipped gate with a reason.

Plan, graph, and task development is the exception: tests and validators are
named as deferred release-gate commands, not run during development. Readiness
models, status output, and handoffs should mark those commands as deferred until
the final release gate.

Common gate classes:

- Link and artifact gates: prove docs point to existing files and durable
  artifacts.
- Agent and skill gates: prove anatomy, skill coverage, content quality, and
  section order.
- Plan and workflow gates: prove acceptance criteria, task graph readiness,
  receipt state, and command-owned invocation proof.
- Runtime gates: prove preview, browser, index, memory, Code RAG, Code Graph,
  or server behavior when the changed surface depends on them.

Do not replace a failed validator with a manual claim. Fix the scoped problem,
rerun the targeted gate, or record the failure and residual risk. For
plan/graph/task development, record the validator as deferred release-gate work
instead of running it before the final gate.

## Progressive Disclosure

Load context by need:

1. Always read the task contract, current command state, and active host rules.
2. Read only the owned files, artifacts, or plans needed for the current step.
3. Pull project memory, Code RAG, and Code Graph evidence when risk or scope
   justifies it.
4. Load reference material only for the active branch of the decision tree.
5. Record omitted context when leaving broader history or references unread.

Reference-pack policy lives in [reference-packs.md](reference-packs.md). The
short version is: cite compact evidence, not bulk prose; keep acceptance
criteria and verification commands even when trimming; reduce broad history
before removing current source evidence.

## Self-Review Loop

Before final review or completion, run a local self-review against the contract:

- Did the change stay within the accepted write set and ownership boundary?
- Did it preserve user-owned sections and unrelated work?
- Are command, agent, producer, reviewer, validator, and receipt claims backed
  by runtime evidence?
- Are memory, Code RAG, Code Graph, or domain-evidence gaps called out when
  they affect confidence?
- Did targeted verification run, or for plan/graph/task development was it
  explicitly deferred to the release gate?
- Is the final answer limited to changed files, verification, and residual
  risks that matter to the user?

If self-review finds a gap, repair it before external review unless the gap is
blocked by missing access, missing approval, or user-owned scope.

## Final Acceptance

A workflow is acceptable only when the requested artifacts exist, scoped edits
are complete, validators or targeted checks have run, and residual risks are
explicit. Development handoff for plan, graph, and task workflows may satisfy
this by listing tests and validators as deferred release-gate commands; release
acceptance still requires those gates to run. Final summaries should not claim
10/10 maturity unless project memory, Code RAG, and Code Graph readiness were
checked or the output states why those surfaces were unavailable and why the
missing evidence does not lower confidence.

Final acceptance output should include:

- changed files or durable artifacts;
- verification commands and pass/fail status;
- receipts or invocation proof when the workflow required delegated work;
- unresolved findings, skipped checks, or follow-up risk.


## Post-Workflow Cleanup Hygiene

After durable workflow completion, run cleanup hygiene in dry-run mode only after runtime receipts are issued, plan state is closed or intentionally active, the work graph has terminal markers where applicable, and host-managed subagent sessions are closed or recorded as still active. The lifecycle orchestrator reports blockers instead of applying cleanup when those terminal signals are missing.

Default agent context should exclude cold archives, trash, stale backups, closed workflow outputs, and unclassified cleanup targets. Physical deletion is a separate release-safe operation; context filtering must reduce noise even when no files are deleted.

Release cleanup checks should include `npm run validate:supervibe-cleanup-lifecycle`, receipt validators, branch/diff review, version bump review, and rollback wording before commit or push.

## Parallel Execution Policy

Parallel work is allowed only when dependencies, task ownership, and write sets
are disjoint. A workflow may parallelize read-only exploration, independent
validators, or independent worktree sessions. It must serialize work that
touches the same file, shared generated artifact, receipt ledger, task graph,
host instruction block, or command state.

For multi-session work, use explicit assigned task IDs and assigned write sets
so the registry can prevent overlap. A task that is not parallelized should
record the reason: dependency wait, write-set conflict, missing reviewer,
shared state mutation, or unsafe provider/runtime boundary.

## Token Economy

`npm run measure:tokens:strict` is the release-facing token gate. It reports all
host, skill, and agent token budget violations, then separates them into
blocking violations and planned repairs. A strict run passes only when every
current violation has a concrete repair strategy.

Current hard budgets:

- Host root instructions: 5,000 chars.
- Skill body: 500 lines or 5,000 approximate tokens.
- Skill description: 1,024 chars.
- Agent body: 500 lines or 8,000 approximate tokens.
- Per-agent context packet: 8,000 approximate tokens.

## Prompt Slicing

Agent handoffs should be assembled by relevance instead of dumping every
available artifact. Use this order:

1. Task contract.
2. Current work item.
3. Direct dependencies.
4. Retrieval evidence from memory, Code RAG, and CodeGraph.
5. Write-scope contracts and semantic anchors.
6. Recent blockers.
7. Omitted-context summary.

If the packet exceeds budget, reduce broad history first, then lower memory and
evidence limits. Do not remove acceptance criteria, verification commands, or
receipt requirements.

## Skill Anatomy And Progressive Disclosure

Canonical skill structure lives in `docs/skill-anatomy.md`; the authoring
template lives in `references/templates/skill-template.md`; reusable output and
handoff shapes are indexed in `references/templates/template-index.md`. New and
normalized skills should use that anatomy instead of inventing local section
order.

Keep `SKILL.md` files as operating contracts: trigger, boundaries, Step 0
evidence, decision tree, procedure, failure modes, output contract, guard rails,
verification, and related artifacts. Move long examples, checklists, comparison
tables, and reusable templates to one-hop references under `references/`,
`references/templates/`, or skill-local `references/`, then load them only when
the active decision branch needs them.

`npm run validate:skill-content-quality` remains the hard skill content gate.
When local skill requirements change, update the skill-baseline fixture and
anatomy docs together so validators, templates, and author guidance do not
drift.

## Host Guidance Split

Keep `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and other host roots focused on
runtime-critical rules and command entry points. Move long explanations,
examples, and rationale here or into skill/reference documents. Host roots
should name the required command or validator, not duplicate the implementation
manual.
