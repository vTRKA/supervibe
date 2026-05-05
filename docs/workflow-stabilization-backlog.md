# Workflow Stabilization Backlog

User feedback from the `/supervibe-design` session is tracked here because the
same failure modes affect every agent-heavy Supervibe command.

## Fixed In 2.0.64

- Receipt ledger parallelism: `workflow-receipt.mjs issue` now serializes
  receipt writes, `artifact-links.json` updates, and ledger appends through the
  runtime lock `.supervibe/memory/workflow-invocation-ledger.lock`.
- Receipt CLI help: `node scripts/workflow-receipt.mjs issue --help` exits `0`
  and prints usage before routing to issue.
- Wizard state machine: `design-wizard-catalog.mjs` exposes
  `transitionDesignWizardState`, `runtimeStatus`, `resumeToken`, and
  `formatDesignWizardStatus` so agents do not patch coverage/gates by hand.
- Prewrite diff: `design-agent-plan.mjs --plan-writes --slug <slug>` prints a
  durable-write manifest with file status and gate reasons before candidate
  design-system or prototype writes.
- Structured agent output: `agent-invocation.mjs log` writes
  `.supervibe/artifacts/_agent-outputs/<invocation-id>/agent-output.json` and
  `summary.md` with `changedFiles`, `risks`, and `recommendations`.
- Host invocation proof: workflow receipts now surface the stable typed
  `agent-output.json` evidence path when it exists for the host invocation id.
- Skill source conflicts: `skill-source-report.mjs` reports project, Codex-home,
  and marketplace skill roots, active source selection, duplicate skill IDs, and
  repairable mojibake in installed `SKILL.md` files.
- Encoding audit scope: the skill source resolver checks external skill roots
  for repairable mojibake in addition to the repo's `validate:text-encoding`.
- Wizard UX visibility: design plan output now prints the stage ladder
  `intake -> candidate DS -> review styleboard -> approval -> prototype unlock`
  plus optional wizard status.
- Canonical run timestamp: workflow receipts use one runtime timestamp for
  `issuedAt`, default `startedAt`, default `completedAt`, and
  `runtime.runTimestamp`; `SUPERVIBE_RUN_TIMESTAMP` or `--run-timestamp`
  can pin a whole workflow run.
- Unified validation: `supervibe-workflow-validate.mjs --workflow
  /supervibe-design --slug <slug>` aggregates workflow receipts, producer
  receipts, design-agent receipts, design wizard, text encoding, and skill source
  checks.
- Design-system approval continuation: `design-workflow-status.mjs` and
  `supervibe-design status --slug <slug>` now distinguish `approved DS`,
  `prototype missing`, and `handoff blocked`; `promote-design-approval` keeps
  prototype approval/handoff blocked unless a prototype artifact exists.
- Prototype phase transition: after DS approval, prototype stages are recomputed
  as `ready` for full-pipeline runs or `available` for `design-system-only`,
  and the next action is `Build prototype / revise DS / stop`.

## Fixed In 2.0.66

- Agent dispatch timing: `/supervibe-design` command plans now separate
  immediate owner dispatch (`supervibe-orchestrator`) from staged specialist
  dispatch (`creative-director`, `ux-ui-designer`, `copywriter`,
  `prototype-builder`, `ui-polish-reviewer`, `accessibility-reviewer`,
  `quality-gate-reviewer`). The CLI no longer implies that every specialist
  should spawn before the wizard gate closes.
- Wizard-gated design agents: `design-agent-plan` now lists
  `stage-0-orchestrator`, prints an explicit `AGENT_GATE`, and keeps specialist
  stages deferred until mode, viewport, and preference coverage unlock the
  relevant durable output stage.
- Resume/state loop: `design-agent-plan.mjs --slug <slug>` now reads the
  saved prototype `config.json` for `mode`, `executionMode`, `target`,
  `flowType`, `designWizard.decisions`, and configured viewports before
  rebuilding the executable wizard state.
- Project-root validation: `validate-design-wizard.mjs` defaults to the plugin
  root when launched from a user project, while still supporting explicit
  `--root` / `--plugin-root`.
- Receipt validator UX: workflow, agent-producer, and design-agent receipt
  validators now print `COVERAGE_STATUS` so `PASS: true` with zero receipts is
  visibly `not-started`, not evidence that agents ran.
- Russian intent replay: the exact functional-only old-artifact answer from
  user feedback is covered as `functional-only` old-artifact scope.

## Fixed In 2.0.69

- Low-risk adapt fast path: `/supervibe-adapt` plans now compute
  `FAST_PATH_ELIGIBLE` for `adds=0`, `updates<=1`, `projectOnly=0`, and
  `conflicts=0`, and `command-agent-plan.mjs` selects only
  `supervibe-orchestrator` plus `quality-gate-reviewer` for that case.
- Adapt output modes: `supervibe-adapt` supports `--summary-json`,
  `--changed-only`, `--evidence-summary`, and `--quiet-identical` so dry-runs
  can show only changed evidence instead of every identical artifact.
- Adapt lifecycle state: apply writes `.supervibe/memory/adapt/state.json`
  with approved/applied/verified history, updated artifacts, evidence, and
  validator outcomes.
- Receipt hardening: the shared receipt runtime rejects mutable/log-like output
  artifacts before writing receipts, recommends stable per-agent output JSON or
  summaries, and makes repeated receipt issue for the same receipt path
  idempotent by replacing the ledger entry and rebuilding the chain.
- Receipt validator recovery UX: failed validation reports
  `NEXT_SAFE_ACTION`, including `workflow-receipt.mjs rebuild-ledger
  --prune-stale`, instead of repeating signature mismatch lines without repair
  guidance.
- Read-only memory search: `search-memory.mjs` now curates in memory without
  rewriting `.supervibe/memory/index.json`; explicit mutation remains confined
  to commands that ask for a refresh.
- Stage runner contract: `supervibe-stage run` is the global path for supported
  agent/skill stages to bind producer output, host invocation evidence,
  receipts, validation, and continuation actions in one runtime operation.
- Specialist question provenance: design wizard questions now carry
  `SpecialistQuestionContract` proposals with stage owner, artifact impact,
  blocked artifacts, skip/default behavior, and evidence-answerability checks;
  the dynamic question validator rejects catalog-copy questions.
- Post-stage continuation: gated stages now expose `NEXT_USER_ACTIONS` through
  the shared stage-state helper. Candidate design systems must end with
  approve / revise / compare / stop choices and explain what unlocks prototype
  work.
- Agent role source visibility: command agent plans report each required role
  source as `project artifact`, `plugin-only`, or `logical role`.

## Fixed In 2.0.77

- Dynamic question architecture: visible command and design questions now route
  through `SpecialistQuestionContract` proposals. Static route/catalog data is
  treated as schema and fallback seed only, not as the final user-facing
  question source.
- Pre-gate specialist questions: `/supervibe-design` can dispatch
  `creative-director` and `ux-ui-designer` for scratch question proposals while
  durable design artifacts remain blocked by the wizard/write gate.
- Wizard answer API: `node scripts/design-wizard-answer.mjs --slug <slug>
  --axis <axis> --choice <choice> --source user` records answers without manual
  `config.json` edits. `--accept-recommended-remaining --source
  delegated-to-agent` records delegated specialist defaults and keeps tokens
  locked behind a review gate.
- Question quality guardrails: command surfaces now expose owner agent,
  `whyNow`, evidence, artifact impact, structured options, recommendation, and
  skip/default policy. Validators reject missing proposals, catalog-copy,
  context-free questions, weak option risk/unlocks, and static template
  rewrites.
- Encoding guardrail: the static question scanner now rejects mojibake in
  visible question text so broken Russian such as incorrectly decoded Cyrillic
  cannot ship through runtime question surfaces.

## Fixed In 2.0.81

- Wizard command mutex: `design-wizard-answer.mjs` now uses a slug-level
  command lock under `.supervibe/memory/locks/design-wizard/` and rejects
  concurrent writes by default. `--wait-for-lock` is explicit opt-in for callers
  that intentionally serialize behind another writer.
- Runtime state split: prototype `config.json` keeps compact decisions, gates,
  progress, and a runtime pointer; heavy `questionQueue`, proposal, and wizard
  runtime state moves to `.supervibe/memory/design-wizard/<slug>.runtime.json`.
- Natural continuation: wizard answer output prints a concrete
  `design-agent-plan --continue --dispatch --status --plan-writes` command, and
  `design-agent-plan` accepts `--dispatch` as an alias. User-facing prompt copy
  says "run required specialists" instead of exposing receipt/protocol jargon.
- Resume checkpoint: design workflow status prints the last trusted
  `/supervibe-design` stage plus the continuation command, so interrupts have a
  deterministic recovery point.
- Approval action gating: `NEXT_USER_ACTIONS` no longer offers
  `approve_design_system` while the design-system review packet is missing
  `tokens.css`, `manifest.json`, `design-flow-state.json`, or
  `styleboard.html`.
- Brandbook promotion: executable brandbook producer promotion prepares all
  staged outputs, backs up existing durable outputs, promotes as one transaction
  with rollback on failure, then issues the producer receipt.
- Choice UX: visible wizard questions now always leave custom answer, more
  alternatives, and stop paths visible in addition to the ordered alternatives
  and recommendation rationale.

## Fixed In 2.0.84

Genesis + Adapt lifecycle hardening from combined command feedback.

- [x] Made Adapt dry-run-first explicit: `--summary-json --changed-only`
  returns counts and the exact `command-agent-plan` command with `adds`,
  `updates`, `projectOnly`, `conflicts`, and `memoryWrites`.
- [x] Extended low-risk Adapt fast path to require `memoryWrites=false`; memory
  writes, adds, conflicts, project-only drift, or multiple updates use the
  standard curator path.
- [x] Added layered verification state for Genesis/Adapt:
  `artifactVerified`, `agentReceiptsVerified`, `appVerified`, and
  `deployVerified`.
- [x] Stopped using framework skeleton wording for empty app directories;
  backend/frontend are placeholders until the approved `generate-apps` step runs
  real Laravel/Next/Vite scaffolders.
- [x] Made CI optional through `github-actions`, `gitlab-ci`, and `ci-ready`
  add-ons; base scaffold no longer creates empty `.github/workflows/`.
- [x] Added a managed `.gitignore` block that preserves user entries, ignores
  runtime state, and keeps source-of-truth artifacts trackable.
- [x] Sanitized Genesis state so tracked artifacts do not persist absolute
  local target paths.
- [x] Added Dokploy deploy add-on through
  `supervibe-adapt --scope deploy --target dokploy`, with compose, Dockerfiles,
  env example, healthchecks, Postgres volume, queue/scheduler services, and
  explicit migration notes.
- [x] Added targeted regression coverage for fast path counts, memory-write
  blocking, CI add-on, managed `.gitignore`, truthful placeholders, layered
  state, and Dokploy artifacts.
- [ ] Add the broader 10/10 e2e matrix across dirty/no-git/multi-host/monorepo
  and missing dependency scenarios.
- [ ] Add full apply rollback commands for project-only keep/archive/skip/abort
  beyond the current recoverable state notes.

## Fixed In 2.0.85

Genesis + Adapt feedback on generated apps, root policy, state accuracy, and
dependency repair guardrails.

- [x] Add `--disable-git` to the Next.js generate-apps command and execute
  known scaffolders through structured executable/args instead of a raw shell
  command string.
- [x] Normalize generated app metadata after approved scaffolders: remove a
  nested app `.git` created from an empty placeholder and archive generated
  app-local host files under `.supervibe/memory/genesis/`.
- [x] Persist accurate Genesis generation state:
  `generateAppsStep.status=completed`, `appGenerated=true`, and
  `appVerified=false` unless explicit `--verify-apps` lint/build commands pass.
- [x] Resolve canonical project root from nested app directories by walking up
  to `.supervibe/`, workspace manifest, or root `.git` before host detection.
- [x] Make base Genesis scaffold produce `.editorconfig`, `.gitattributes`,
  `.gitignore`, `.nvmrc`, docs/prototype placeholders, and stack app
  placeholders even when no exact stack-pack exists.
- [x] Make terminal/file policy validation host-adapter-aware for installed
  projects, while keeping plugin checkout validation strict for root
  `rules/terminal-file-io.md` and source generator contracts.
- [x] Block `npm audit fix --force` as a normal repair path when it proposes a
  framework major/minor downgrade; report `blocked_downgrade` with
  current/proposed/latest versions and safe alternatives.
- [x] Treat config-only zero-symbol JS/TS graph extraction as healthy in normal
  status output so config-only projects do not look broken.
- [x] Add regression coverage for Next command generation, generated app
  normalization, nested-root host detection, host-aware terminal policy,
  config-only graph health, and audit-force downgrade blocking.
- [ ] Add network-enabled CI e2e for real `create-next-app`, Composer Laravel,
  app lint/build, source+graph index, status, and idempotent Genesis/Adapt
  reruns across Codex-only, Claude-only, mixed-host, no-git, dirty, and monorepo
  roots.

## Fixed In 2.0.83

Genesis empty-project hardening from `/supervibe-genesis` feedback.

- [x] Added an executable `supervibe-genesis` runner with `--dry-run`,
  `--apply`, `--profile`, `--addons`, `--host`, `--stack-tags`, `--request`,
  and `--json`.
- [x] Made dry-run state resume-safe: `.supervibe/memory/genesis/state.json` is
  allowed during dry-run; scaffold writes still require explicit `--apply`.
- [x] Added bootstrap-pre-agent command-agent planning so Genesis can install
  base agents/rules/context before project agents exist, without claiming
  specialist-owned output.
- [x] Fixed slash command parsing so command id is the first token and free-form
  context is retained separately.
- [x] Routed natural-language English/Russian Genesis setup phrases. Trigger phrases: "сделай genesis scaffold под next laravel postgres".
- [x] Passed explicit stack tags/request text into the fingerprint so empty
  folders do not report `STACK: unknown` when the user already named the stack.
- [x] Split `laravel-nextjs-postgres` from the Redis pack; Redis is an explicit
  add-on unless the stack evidence names Redis.
- [x] Treated empty source projects as `READY_EMPTY` for Code RAG status instead
  of implying an initialization failure after a valid empty bootstrap.
- [x] Covered empty folder, no-git, existing `AGENTS.md`, existing `.codex`,
  existing `package.json`, partial apply, interrupted dry-run state, and UTF-8
  CLI output scenarios in tests.

## Feedback TODO Closed In 2.0.81

- [x] Prevent parallel wizard/config writes per slug.
- [x] Continue automatically after an explicit user choice with
  `--continue --dispatch`.
- [x] Hide receipt/protocol wording from default design planner output while
  keeping machine output available.
- [x] Add deterministic resume checkpoint after interrupts.
- [x] Split heavy wizard runtime state out of `config.json`.
- [x] Promote brandbook outputs transactionally after scratch validation.
- [x] Avoid misleading approval actions before styleboard/tokens exist.
- [x] Keep custom / more alternatives / stop visible for design choices.

## 10/10 Agent System Hardening

Status: passed by `node scripts/supervibe-agent-maturity.mjs` on 2026-05-04.
Source of truth for keeping the whole plugin at an evidence-backed 10/10
agent system, not only a strong scripted workflow.

- [x] Add a machine-readable maturity audit:
  `node scripts/supervibe-agent-maturity.mjs`. The report scores roster
  coverage, command orchestration, specialist questions, continuation gates,
  receipt reliability, host-agent telemetry, Code Graph readiness, eval
  coverage, and backlog/docs.
- [x] Add strict host-agent receipt mode:
  `node scripts/validate-agent-producer-receipts.mjs --strict-host-agents
  --min-agent-invocations 10`. This makes "no real agent telemetry" visible as
  a blocker instead of a soft status line.
- [x] Promote `SpecialistQuestionContract` to a shared module, not only a
  design-wizard convention. Negative specialist-question evals must reject
  catalog-copy, context-free, no-impact, and silently-defaulted questions.
- [x] Accumulate at least 10 real host-agent invocation records across command
  stages and bind them with host-agent receipts. Synthetic receipts do not
  count.
- [x] Count only trusted receipt-bound host invocation IDs in strict producer
  validation. Unbound JSONL rows must not satisfy 10/10 maturity telemetry.
- [x] Keep Code Graph graph-ready for structural/refactor workflows:
  `node scripts/build-code-index.mjs --root . --resume --graph --max-files 200
  --health`.
- [x] Make `SpecialistQuestionContract` Unicode-safe for non-English questions
  and context-aware in both validation and scoring.
- [x] Add an audit receipt-writing mode contract. Read-only audits stay no-write;
  trusted 10/10 audit mode must print `MUTATED:` receipt/log paths.
- [x] Add semantic trigger fallback to `supervibe-commands --match` so implicit
  agent/tool/RAG/CodeGraph complaints route before broad repo search.
- [x] Tighten agent retrieval health so thin samples and missing evidence
  ledgers cannot print a false `10/10`.
- [ ] Extend specialist-generated question proposals to additional multi-stage
  workflows beyond the shared contract fixtures: plan review, autonomous loop,
  audit/strengthen, feature intake, and pre-PR review.
- [ ] Add more bad/good agent-output eval fixtures for stage ownership, recovery
  UX, receipt repair, and continuation prompts.

The plugin cannot honestly report `10/10` unless the maturity audit has no
blockers. Code can enforce the gates, but operational telemetry requires real
host-agent runs.

## Still Design Principles

- Command receipts never substitute for specialist agent, worker, or reviewer
  output.
- Real-agent command plans must distinguish agents to spawn now from staged
  agents that are blocked behind workflow gates.
- Every gated lifecycle stop must produce explicit user choices, not just
  `NEXT_ACTION` or "done".
- Low-risk fast paths may reduce required roles, but they do not remove receipt,
  validator, approval, or evidence obligations.
- Candidate design-system artifacts never set `approved` and never unlock
  prototype work without explicit approval.
- Approved design-system artifacts alone do not equal a final UI prototype or
  handoff; final handoff stays blocked until an approved prototype exists.
- Conflicts between installed skill sources are informational unless they also
  show encoding issues; the report must still make the active source visible.
