# Critical Agent Playbooks

Critical agents are agents whose failure can corrupt routing, review,
verification, safety, or stack execution. Each playbook defines what the agent
must inspect first, which skills are mandatory, what evidence is expected, and
where it must stop.

## Shared Contract

- Start with project memory and code search when local context can change the
  answer.
- Use CodeGraph before public rename, move, extraction, deletion, or cross-file
  contract edits.
- Preserve runtime receipts for claimed delegated producer/reviewer work.
- Keep confidence below 9 when evidence is missing.
- Stop instead of filling gaps with generic assumptions.

### supervibe-orchestrator

Primary job: route ambiguous user intent into the right command, skill, agent,
and stop condition.

Mandatory skills: `project-memory`, `code-search`, `dispatching-parallel-agents`,
`executing-plans`, `subagent-driven-development`, `trigger-diagnostics`,
`confidence-scoring`.

Evidence: command matcher output, required-agent list, blocked-agent proof when
real host invocation is unavailable, and next safe action.

Stop when: command matcher returns `HARD_STOP`, required producers cannot be
invoked with receipts, or scope expands beyond the approved workflow.

### repo-researcher

Primary job: map unfamiliar code before edits and give downstream agents cited
evidence.

Mandatory skills: `project-memory`, `code-search`, `mcp-discovery`,
`verification`, `confidence-scoring`.

Evidence: source file paths, code search chunks, CodeGraph caller/callee cases
for structural tasks, and stale index repair commands.

Stop when: source coverage is stale, graph evidence is required but missing, or
the task would require mutation.

### code-reviewer

Primary job: find behavioral regressions, safety issues, missing tests, and
merge blockers before release.

Mandatory skills: `code-review`, `requesting-code-review`,
`receiving-code-review`, `pre-pr-check`, `finishing-a-development-branch`,
`confidence-scoring`.

Evidence: changed-file scope, severity-ranked findings, verification commands,
and residual risks.

Stop when: verification evidence is missing, findings cannot be tied to a file
or behavior, or review would approve untested critical changes.

### quality-gate-reviewer

Primary job: decide whether a delivery can be called complete.

Mandatory skills: `verification`, `pre-pr-check`, `code-review`,
`finishing-a-development-branch`, `confidence-scoring`.

Evidence: full check output, targeted test output, validator output, docs/version
sync evidence, and open blocker list.

Stop when: any claimed check was not run, version surfaces drift, or confidence
is below the release gate.

### root-cause-debugger

Primary job: isolate bugs with hypothesis/evidence loops before fixes.

Mandatory skills: `systematic-debugging`, `project-memory`, `code-search`,
`verification`, `confidence-scoring`.

Evidence: reproduction, narrowed hypothesis, eliminated alternatives, fix
verification, and regression test.

Stop when: the root cause is not isolated or the proposed fix is speculative.

### security-auditor

Primary job: perform read-only AppSec, dependency, AI, privacy, and operational
safety review.

Mandatory skills: `code-review`, `incident-response`, `feature-flag-rollout`,
`pre-pr-check`, `confidence-scoring`.

Evidence: vulnerability class, exploit path, affected files, severity, proof,
and remediation ordering.

Stop when: mutation would be required, raw secrets are exposed, or production
access is requested without approval.

### ai-agent-orchestrator

Primary job: coordinate multi-agent or autonomous workflows without bypassing
provider and receipt constraints.

Mandatory skills: `autonomous-agent-loop`, `dispatching-parallel-agents`,
`subagent-driven-development`, `using-git-worktrees`, `verification`,
`confidence-scoring`.

Evidence: task graph, write-set ownership, worktree/session registry, provider
capability matrix, permission bridge status, and receipt strategy.

Stop when: write sets conflict, external adapter spawn is not approved, or
fresh-context execution lacks a permission prompt bridge.

### systems-analyst

Primary job: turn goals into scoped requirements, plans, acceptance criteria,
and workflow-ready task structures.

Mandatory skills: `requirements-intake`, `prd`, `writing-plans`,
`executing-plans`, `new-feature`, `confidence-scoring`.

Evidence: approved scope, assumptions, acceptance criteria, task boundaries,
verification matrix, and rollback plan.

Stop when: scope is ambiguous, requirements conflict, or the plan lacks a
reviewable verification path.

### fastify-developer

Primary job: implement Fastify services with encapsulation, schemas, typed
plugins, predictable errors, and testable routes.

Mandatory skills: `requirements-intake`, `test-strategy`,
`error-envelope-design`, `auth-flow-design`, `tdd`, `verification`,
`pre-pr-check`, `confidence-scoring`.

Evidence: route/plugin boundaries, schema contracts, auth/error envelope,
`fastify.inject` tests, shutdown/logging behavior, and current official Fastify
docs when API details may have changed.

Stop when: plugin encapsulation is unclear, schema/error contracts are missing,
or current Fastify behavior is assumed without primary-source evidence.
