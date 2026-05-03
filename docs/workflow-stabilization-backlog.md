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

## Fixed In 2.0.65

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

## Still Design Principles

- Command receipts never substitute for specialist agent, worker, or reviewer
  output.
- Real-agent command plans must distinguish agents to spawn now from staged
  agents that are blocked behind workflow gates.
- Candidate design-system artifacts never set `approved` and never unlock
  prototype work without explicit approval.
- Approved design-system artifacts alone do not equal a final UI prototype or
  handoff; final handoff stays blocked until an approved prototype exists.
- Conflicts between installed skill sources are informational unless they also
  show encoding issues; the report must still make the active source visible.
