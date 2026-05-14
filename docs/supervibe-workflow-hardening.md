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
