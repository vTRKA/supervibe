# Using Supervibe Skill Chain Map

Source task: `epic-agent-skill-system-normalization-10-of-10-implementation-plan-3b9610-t007`.
Purpose: deepen the `using-supervibe-skills` meta-skill without editing
`skills/using-supervibe-skills/SKILL.md` or `README.md`.

This map is the routing reference for choosing Supervibe skill chains. It is
not a new command catalog and it does not add aliases. Durable workflow work is
owned by `/supervibe-*` commands. Direct skill use is only enough when the
answer or edit does not need command-owned state, specialist producer proof, a
review artifact, loop/task graph mutation, design state, scaffold/adapt state,
or a runtime receipt trail.

## Non-goals and local command boundaries

- Do not introduce, document as available, or recommend legacy short lifecycle
  aliases as Supervibe workflow commands.
- Do not list legacy shortcut spellings in user-facing docs, command catalogs,
  skill maps, templates, or release artifacts.
- Use canonical Supervibe commands such as `/supervibe-brainstorm`,
  `/supervibe-plan`, `/supervibe-execute-plan`, `/supervibe-loop`,
  `/supervibe-design`, `/supervibe-security-audit`, `/supervibe-genesis`,
  `/supervibe-adapt`, `/supervibe-status`, and `/supervibe-score`.
- Do not treat baseline skill taxonomy as a command model. Skill coverage maps
  to local skills through
  `references/skill-baseline/canonical-lifecycle-skill-map.md`.

## Routing preflight

Run this preflight before selecting a chain for non-trivial work.

1. Classify the user intent: read-only answer, direct implementation, durable
   artifact, command workflow, design workflow, security workflow, scaffold or
   adapt, release, audit, or score.
2. If the user request is command-like, run
   `node scripts/supervibe-commands.mjs --match "<user request>"`.
   Stop when the result says `INTENT: missing_slash_command` or
   `HARD_STOP: true`; report the missing command instead of emulating it.
3. Check project memory and retrieval readiness for non-trivial code,
   workflow, agent, skill, design, or maturity claims:
   - `node scripts/search-memory.mjs --query "<topic>" --include-history --graph`
   - `node scripts/search-code.mjs --context "<topic>" --limit 12`
   - `node scripts/supervibe-status.mjs --index-health --strict-index-health --no-gc-hints --no-color`
4. Read source of truth files: `AGENTS.md`, the relevant command file under
   `commands/`, candidate skill files under `skills/`, active plan or work-item
   graph state under `.supervibe/memory/`, and applicable rules.
5. Decide whether a slash command owns durable work. If yes, run the command
   agent plan and use real host-agent invocations and runtime receipts before
   claiming durable command, agent, worker, reviewer, validator, or external
   tool output.
6. If direct skill use is enough, name the skill chain, context evidence,
   stop conditions, verification command, and confidence boundary. Do not create
   command state or claim delegated specialist output.

## Command-owned versus direct-skill work

| Decision question | Command-owned durable work | Direct skill use is enough |
| --- | --- | --- |
| Does the work create or mutate `.supervibe/artifacts/specs`, plans, plan reviews, prototypes, brandbook and design-system artifacts, task graphs, loop state, scaffold/adapt state, or workflow ledgers? | Yes. Use the owning `/supervibe-*` command. | No. Direct skills may guide a small answer or edit. |
| Does the output claim a command, producer, reviewer, worker, validator, external tool, or specialist agent completed work? | Yes. Require runtime-issued receipts and, for agent output, host invocation ids. | No. Explain that the result is controller/direct-skill work only. |
| Does the user ask for brainstorm, plan, plan review, atomization, execution loop, design pipeline, security audit, genesis, adapt, update, score recording, or project health? | Yes. Route to the canonical command. | No, unless the request is a narrow read-only explanation of the method. |
| Is the task a narrow code/doc edit with clear scope and no workflow artifact lifecycle? | Usually no command. Use direct source/retrieval/implementation/verification skills. | Yes. Use direct skills and targeted verification. |
| Is there an active plan, graph, handoff, wizard, or loop state for the same objective? | Usually yes. Resume or repair through the owning command. | Only if the user explicitly pauses the workflow and asks for separate diagnostic help. |
| Are required agents unavailable, receipts stale, index readiness below threshold, or approval gates unanswered? | Stop or repair through command-owned gates. | Direct skill use may diagnose, but must not mark the durable workflow complete. |

## Core chain templates

### Read-only routing answer

- Skills: `supervibe:using-supervibe-skills`, optionally
  `supervibe:project-memory`, `supervibe:code-search`,
  `supervibe:mcp-discovery`, and `supervibe:verification`.
- Command owner: none unless the user explicitly asks to run or continue a
  `/supervibe-*` workflow.
- Receipts: none for an ordinary explanation. If the answer claims an actual
  workflow invocation, issue runtime receipts.
- Stop conditions: missing command, unknown skill id, stale command catalog, or
  ambiguous durable owner.
- Verification: source links or targeted validator when a repository artifact
  changed.

### Durable command workflow

- Skills: command-specific primary skill plus `supervibe:project-memory`,
  `supervibe:code-search`, `supervibe:confidence-scoring`, and
  `supervibe:verification`.
- Command owner: the canonical `/supervibe-*` command.
- Agent plan: run `node scripts/command-agent-plan.mjs --command <command>`.
  For active work, include `--active --slug <slug> --handoff-id <handoff-id>`.
- Receipts: runtime-issued workflow receipts for named command, skill, agent,
  reviewer, worker, validator, or external tool claims. Agent, worker, and
  reviewer receipts require real host invocation ids.
- Stop conditions: `CALLABLE_AGENTS_READY: false`, untrusted scoped receipt
  gate, unanswered user gate, missing approval, stale or missing durable state,
  policy block, or failed validator.
- Verification: command-specific artifact validator, receipt validators when
  delegated output is claimed, and targeted tests before completion.

### Direct implementation

- Skills: `supervibe:source-driven-development`, `supervibe:code-search`,
  `supervibe:project-memory`, optionally `supervibe:tdd`,
  `supervibe:test-strategy`, `supervibe:systematic-debugging`,
  `supervibe:code-review`, and `supervibe:verification`.
- Command owner: none for a small, well-scoped edit that does not need durable
  workflow state.
- Receipts: not required unless delegating to named agents, reviewers, workers,
  validators, or external tools.
- Stop conditions: broad or unclear scope, active graph owns the task,
  unapproved destructive or production side effect, missing access, or
  verification failure.
- Verification: targeted test or validator that covers the touched module.

### Review and hardening

- Skills: `supervibe:requesting-code-review`, `supervibe:code-review`,
  `supervibe:receiving-code-review`, `supervibe:doubt-driven-development`,
  `supervibe:pre-pr-check`, `supervibe:strengthen`,
  `supervibe:rule-audit`, and `supervibe:verification`.
- Command owner: `/supervibe-plan --review <plan-path>` owns formal plan
  review; `/supervibe-security-audit` owns security audit; `/supervibe-score`
  owns on-demand rubric scoring.
- Receipts: required for formal reviewer claims, plan-review artifacts,
  security audit agent output, or recorded scoring telemetry.
- Stop conditions: reviewer output is controller-authored, old global receipt
  is used for current handoff, high severity finding lacks owner/verification,
  or review pass has open critical/major findings.
- Verification: relevant review artifact validator, `npm run validate:*`
  command, security re-audit, or targeted test.

## Intent-to-chain routing table

| User intent | Canonical owner | Skill chain | Agent roles to expect | Receipts and state | Retrieval checks | Stop conditions | Final verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| "What should I do next?", "which skill applies?", or trigger diagnostics | `/supervibe` for command routing; direct `using-supervibe-skills` for read-only advice | `using-supervibe-skills -> project-memory -> code-search -> verification` | `supervibe-orchestrator`, `systems-analyst`, `quality-gate-reviewer` when `/supervibe` runs | Command receipts only when claiming `/supervibe` ran; direct advice emits no durable state | Memory and code search when recommendation depends on current project | Missing command or hard-stop router result; active handoff would be bypassed | Usually none; for docs edits run targeted validators |
| Vague idea, requirements, product scope, or alternatives | `/supervibe-brainstorm` | `brainstorming -> project-memory -> source-driven-development -> mcp-discovery -> confidence-scoring -> verification` | `supervibe-orchestrator`, `product-manager`, `systems-analyst`, `quality-gate-reviewer`, domain specialists | Spec artifact and command/agent receipts when durable spec is claimed | Memory first; RAG/CodeGraph when project-specific or implementation-sensitive | Topic unclear, documentation gate unanswered, approved scope missing, spec validator fails | `node scripts/validate-spec-artifacts.mjs --file <spec>` and rubric score |
| Approved spec to implementation plan | `/supervibe-plan --from-brainstorm <spec>` or `/supervibe-plan <spec>` | `writing-plans -> project-memory -> code-search -> source-driven-development -> confidence-scoring -> verification` | `supervibe-orchestrator`, `systems-analyst`, `architect-reviewer`, `quality-gate-reviewer`, stack/domain specialists | Plan artifact, plan validator, and command/agent receipts for durable planning claims | Memory, Code RAG, CodeGraph, source reads, rules, and related specs | Missing approved spec, plan-scope gate unanswered, required evidence missing, validator failure | `node scripts/validate-plan-artifacts.mjs --file <plan>` |
| Formal plan review before execution | `/supervibe-plan --review <plan>` | `requesting-code-review -> code-review -> receiving-code-review -> confidence-scoring -> verification` | Baseline reviewers plus risk-triggered reviewers; at least orchestrator, systems analyst, architect reviewer, quality gate reviewer | Plan-review artifact and scoped reviewer receipts bound to current handoff | Plan, source evidence, risk-trigger files, memory, CodeGraph as needed | Reviewer coverage missing, scoped receipts untrusted, critical/major findings open | `node scripts/validate-plan-review-artifacts.mjs --plan <plan> --require-active-review` |
| Atomize reviewed plan or manage work graph | `/supervibe-loop --atomize-plan <plan> --plan-review-passed`, then `/supervibe-loop --file <graph>` | `autonomous-agent-loop -> executing-plans -> dispatching-parallel-agents -> subagent-driven-development -> verification` | `supervibe-orchestrator`, `ai-agent-orchestrator`, `repo-researcher`, `quality-gate-reviewer`, task specialists/reviewers | Native work-item graph, loop state, task claims, worker/reviewer receipts, completion evidence | Memory, RAG, CodeGraph, graph status, task context pack | Plan review not trusted, graph invalid, claim/write-set conflict, task score below 9, user acceptance pending | `node scripts/validate-task-graph-runtime.mjs`, `/supervibe-loop --validate-completion`, and receipt validators |
| Execute approved plan | `/supervibe-execute-plan <plan>` for reviewed plans; prefer `/supervibe-loop` for atomized epics and long runs | `executing-plans -> subagent-driven-development -> tdd/test-strategy -> code-review -> verification` | `supervibe-orchestrator`, `repo-researcher`, `root-cause-debugger`, `code-reviewer`, `quality-gate-reviewer`, stack implementers | Execution evidence, worker/reviewer receipts when delegated, updated task or plan state | Plan, memory, RAG, CodeGraph, rules, tests | Plan review missing, readiness below gate, unresolved verification failure, unapproved side effect | Plan/task validators and targeted tests named in the plan |
| Small direct code or docs change | No slash command unless active workflow owns it | `source-driven-development -> code-search -> project-memory -> tdd/test-strategy -> verification` | Current controller, optional reviewer if requested | No workflow state; receipts only for delegated claims | Memory/RAG/CodeGraph for non-trivial changes; source reads always | Owned write set conflict, active graph owns task, missing source evidence, test failure | Targeted `node --test ...`, `npm run validate:*`, or stack command |
| Debug a failing behavior | Direct skills unless the failure is inside an active loop or plan | `systematic-debugging -> code-search -> project-memory -> source-driven-development -> verification` | Optional `root-cause-debugger`, stack specialist, quality gate reviewer when delegated | Receipts only for claimed specialist/worker/debugger output | Repro, logs, source search, CodeGraph caller/sink paths | No reproducible symptom, destructive fix proposed, verification cannot prove cause | Minimal repro test, failing-then-passing test, or diagnostic command |
| UI, landing page, prototype, or design system | `/supervibe-design <brief>` | `brandbook -> design-intelligence -> interaction-design-patterns -> component-library-integration -> prototype/landing-page -> browser-runtime-verification -> prototype-handoff -> verification` | `supervibe-orchestrator`, `creative-director`, `design-system-architect`, `ux-ui-designer`, `copywriter`, `prototype-builder`, `accessibility-reviewer`, `ui-polish-reviewer`, `quality-gate-reviewer` | Design wizard state, design artifacts, prototype state, approval, handoff, stage receipts | Memory, code evidence, design intelligence, domain evidence for regulated/trust briefs | Wizard/write gate locked, target unresolved, missing real agents, no viewport policy, review blocker | Design workflow validators, quality gate, browser/runtime evidence, receipt validators |
| Browser preview or runtime proof for an existing artifact | `/supervibe-preview` for preview-server management; direct skills for local verification inside an implementation | `preview-server -> browser-runtime-verification -> browser-feedback -> verification` | `supervibe-orchestrator`, `prototype-builder`, `ui-polish-reviewer`, `accessibility-reviewer`, `quality-gate-reviewer` when command-owned | Preview daemon state only when command starts/manages it; receipts for claimed agents/reviewers | Source artifact, server status, UI state, screenshots/DOM evidence | Server cannot start, page blank, feedback disabled for design flow, inaccessible viewport | Browser checks, DOM overflow/text overlap/contrast/focus checks as applicable |
| Security review, safe-to-ship decision, or remediation loop | `/supervibe-security-audit` | `security-audit -> incident-response -> rule-audit -> source-driven-development -> verification` | `supervibe-orchestrator`, `security-auditor`, `security-researcher`, `dependency-reviewer`, `quality-gate-reviewer`, stack security specialists | Audit artifact, finding owners, remediation plan, auditor/reviewer receipts | Memory, source, dependency files, security advisories, CodeGraph reachability | No authorization, secret exposure risk, production mutation requested, reachability unproven but severity claimed | Security audit validator/re-audit, dependency checks, targeted security tests |
| First project setup or scaffold | `/supervibe-genesis` | `stack-discovery -> genesis -> confidence-scoring -> verification` | `supervibe-orchestrator`, `repo-researcher`, `rules-curator`, `memory-curator`, `quality-gate-reviewer`, detected stack specialists | Genesis state, scaffold files after approval, optional app/deploy verification state | Host detection, stack manifests, memory/index policy | Host ambiguous, scaffold approval missing, missing artifacts, app generation not approved | Genesis status, index/status checks, app verification only when requested |
| Refresh managed agents/rules/skills after update or project drift | `/supervibe-adapt` | `adapt -> rule-audit -> source-driven-development -> confidence-scoring -> verification` | `supervibe-orchestrator`, `repo-researcher`, `rules-curator`, `memory-curator`, `quality-gate-reviewer`, artifact specialists | Adapt dry-run/apply state, approved diffs, receipts for claimed agent output | Upstream/project diff, host adapter, memory, command-agent plan | Per-file approval missing, conflicts unresolved, unexpected dirty state, index repair confused with adapt | Adapt dry-run/apply output, artifact validators, receipt validators when agent output claimed |
| Score one artifact or record rubric telemetry | `/supervibe-score` for user-facing score; direct `confidence-scoring` inside a command/agent flow | `confidence-scoring -> verification` | `supervibe-orchestrator`, `quality-gate-reviewer`, rubric-owner reviewers | Score log if command records; direct inline score has no command state unless recorded | Artifact source, rubric, related validators | Unknown artifact type, missing rubric, evidence insufficient, score below gate | Rubric-specific score plus remediation; optional `--record` telemetry |
| Project health, maturity, or workflow-chain audit | `/supervibe-audit`, `/supervibe-status` | `audit/status -> project-memory -> code-search -> confidence-scoring -> verification` | `supervibe-orchestrator`, `repo-researcher`, `memory-curator`, `quality-gate-reviewer`, domain specialists | Read-only audit by default; receipts only in trusted receipt-writing audit mode | Index health, memory, RAG, CodeGraph, telemetry, artifacts | 10/10 maturity claim without memory/RAG/CodeGraph/receipt readiness; stale index unreported | `npm run supervibe:status`, maturity gates, targeted audit validators |
| Release readiness and branch finish | Usually direct skills inside active plan/loop; `/supervibe-loop` if release tasks are in graph | `finishing-a-development-branch -> pre-pr-check -> feature-flag-rollout -> using-git-worktrees -> verification` | Release owner, stack implementer, code reviewer, quality gate reviewer when delegated | Receipts for delegated release/reviewer claims; task graph evidence if command-owned | Plan/task state, tests, rollout/rollback evidence, memory decisions | No rollback/support owner, open blockers, unrelated changes, release gate below threshold | Targeted release validators, `npm run check` before release handoff when in scope |
| Memory capture or retrieval | Direct `project-memory` or `add-memory`; command-owned when part of active workflow | `project-memory -> add-memory -> source-driven-development -> verification` | `memory-curator` when delegated or command-owned | Memory entry only when intentionally written; receipt if claimed as delegated curator output | Existing memory first; conflict/supersession checks | Duplicate, low confidence, no source evidence, user-owned private data risk | Memory validator or status check when repository policy requires |

## Command owner and agent role map

All command profiles use `supervibe-orchestrator` as owner. Required agents
come from `scripts/lib/command-agent-orchestration-contract.mjs`; dynamic
selectors add specialists when the request, stack, risk, or artifacts require
them.

| Command | Required baseline agents | Dynamic specialist selectors |
| --- | --- | --- |
| `/supervibe` | `supervibe-orchestrator`, `systems-analyst`, `quality-gate-reviewer` | `intent-router` |
| `/supervibe-adapt` | `supervibe-orchestrator`, `repo-researcher`, `rules-curator`, `memory-curator`, `quality-gate-reviewer` | `changed-artifact-specialists`, `low-risk-fast-path` |
| `/supervibe-audit` | `supervibe-orchestrator`, `repo-researcher`, `memory-curator`, `quality-gate-reviewer` | `audit-domain-specialists` |
| `/supervibe-brainstorm` | `supervibe-orchestrator`, `product-manager`, `systems-analyst`, `quality-gate-reviewer` | `domain-specialists` |
| `/supervibe-design` | `supervibe-orchestrator`, `creative-director`, `design-system-architect`, `ux-ui-designer`, `tauri-ui-designer`, `copywriter`, `prototype-builder`, `accessibility-reviewer`, `ui-polish-reviewer`, `quality-gate-reviewer` | `target-platform-designers`, `competitive-design-researcher` |
| `/supervibe-execute-plan` | `supervibe-orchestrator`, `repo-researcher`, `root-cause-debugger`, `code-reviewer`, `quality-gate-reviewer` | `stack-implementers`, `risk-reviewers` |
| `/supervibe-genesis` | `supervibe-orchestrator`, `repo-researcher`, `rules-curator`, `memory-curator`, `quality-gate-reviewer` | `detected-stack-specialists` |
| `/supervibe-loop` | `supervibe-orchestrator`, `ai-agent-orchestrator`, `repo-researcher`, `quality-gate-reviewer` | `task-wave-specialists`, `reviewers` |
| `/supervibe-plan` | `supervibe-orchestrator`, `systems-analyst`, `architect-reviewer`, `quality-gate-reviewer` | `stack-architects`, `domain-specialists`, `reviewers` |
| `/supervibe-preview` | `supervibe-orchestrator`, `prototype-builder`, `ui-polish-reviewer`, `accessibility-reviewer`, `quality-gate-reviewer` | `target-platform-designers` |
| `/supervibe-score` | `supervibe-orchestrator`, `quality-gate-reviewer` | `rubric-owner-reviewers` |
| `/supervibe-security-audit` | `supervibe-orchestrator`, `security-auditor`, `security-researcher`, `dependency-reviewer`, `quality-gate-reviewer` | `stack-security-specialists` |
| `/supervibe-status` | `supervibe-orchestrator`, `repo-researcher`, `quality-gate-reviewer` | `health-domain-specialists` |
| `/supervibe-strengthen` | `supervibe-orchestrator`, `rules-curator`, `memory-curator`, `prompt-ai-engineer`, `quality-gate-reviewer` | `weak-artifact-specialists` |
| `/supervibe-update` | `supervibe-orchestrator`, `dependency-reviewer`, `repo-researcher`, `quality-gate-reviewer` | `changed-stack-specialists` |

## Retrieval and confidence gates

- Memory: required before non-trivial code, design, command, agent, skill,
  maturity, or release claims. If no memory matches, record the absence and do
  not inflate confidence from silence.
- Code RAG: required before implementation, source-dependent planning, or
  repository-specific recommendations. If the index is stale or partial, report
  the status, run repair only when in scope, or cap confidence.
- CodeGraph: required for refactors, blast-radius claims, ownership claims,
  caller/callee changes, and task graph or route impact analysis. Graph warnings
  must be surfaced instead of hidden.
- Source reads: always required for files being edited or referenced as
  authority.
- Official or domain evidence: required for regulated, security, financial,
  legal, health, government, provider/API, or fast-changing claims.
- Verification: completion claims need an actual command result. For release
  or broad changes, use the release plan's gate, usually including
  `npm run check`.

## Runtime receipt rules

- Runtime-issued receipts are required whenever the output claims a Supervibe
  command, skill, agent, reviewer, worker, validator, or external tool was
  invoked as durable workflow evidence.
- Agent, worker, and reviewer receipts must include real host invocation
  provenance such as `hostInvocation.source` and `hostInvocation.invocationId`.
- Command receipts and skill receipts do not substitute for required
  specialist agent, worker, or reviewer receipts.
- Old global receipts are diagnostic only for active command or handoff work.
  The current run needs scoped receipt trust.
- Inline/manual drafts are diagnostic unless bound to the real producer path
  with receipts.
- If receipts cannot be issued because the workflow is outside the owned write
  set or the current request is read-only, state that limitation and avoid
  durable delegated-work claims.

## Stop conditions

Stop or reroute when any of these occur:

- Command router reports `INTENT: missing_slash_command` or `HARD_STOP: true`.
- The request names a durable workflow but no canonical `/supervibe-*` command
  owns it.
- The route would use a legacy short lifecycle alias instead of a canonical
  Supervibe command.
- Required command-agent plan is missing or reports unavailable callable agents
  for agent-owned durable work.
- Scoped receipts are missing, stale, or from an old/global run.
- A wizard, handoff, plan review, plan-scope, approval, production, or
  destructive-operation user gate is unanswered.
- The selected path would emulate a producer, reviewer, worker, or validator in
  the controller.
- Memory, Code RAG, CodeGraph, or source evidence is required but unavailable
  and the confidence cap would fall below the gate.
- The requested edits exceed the owned write set or would overwrite unrelated
  user changes.
- Verification fails or cannot be run for a completion claim.

## Output contract for `using-supervibe-skills`

A routing plan should include:

- `userIntent`: concise classification.
- `commandOwner`: canonical `/supervibe-*` owner or `none`.
- `selectedSkills`: ordered skill ids with why each is needed.
- `directSkillEnough`: boolean plus rationale.
- `requiredAgents`: command baseline roles and dynamic specialist triggers when
  command-owned.
- `requiredReceipts`: none, command/skill receipts, or host-agent scoped
  receipts with current-run requirements.
- `contextChecks`: memory, Code RAG, CodeGraph, source reads, and any external
  domain evidence with freshness status.
- `stopConditions`: concrete blockers that must halt the route.
- `verificationCommands`: exact commands needed before completion.
- `confidenceBoundary`: why confidence is allowed or capped.

## Final verification by route

| Route | Minimum verification |
| --- | --- |
| Meta-skill or skill routing documentation | `npm run validate:skill-content-quality` and `npm run validate:artifact-links` when reference links or skill docs changed |
| Command docs or command agent profiles | `node scripts/command-agent-plan.mjs --strict` and `npm run validate:command-agent-enforcement` |
| Skill or agent ownership changes | `npm run validate:agent-skill-coverage`, `npm run validate:skill-content-quality`, and relevant agent quality gates |
| Plan artifacts | `node scripts/validate-plan-artifacts.mjs --file <plan>` |
| Plan review artifacts | `node scripts/validate-plan-review-artifacts.mjs --plan <plan> --require-active-review` |
| Work-item graph or loop runtime | `npm run validate:task-graph-runtime`, `npm run validate:task-graph-traceability`, and `/supervibe-loop --validate-completion` for the active graph |
| Design workflow | Design wizard/state/quality validators, browser runtime evidence, and receipt validators named by `/supervibe-design` |
| Security audit | Security audit/re-audit evidence, dependency review where applicable, and targeted tests for remediations |
| Release readiness | Plan-specific release gates, receipt validators when delegated output is claimed, and `npm run check` before release handoff unless explicitly scoped narrower |

## Source references

- `skills/using-supervibe-skills/SKILL.md`
- `references/skill-baseline/canonical-lifecycle-skill-map.md`
- `references/skill-baseline/skill-equivalence-map.md`
- `scripts/lib/command-agent-orchestration-contract.mjs`
- `scripts/lib/supervibe-command-catalog.mjs`
- `scripts/lib/supervibe-skill-chain.mjs`
- `.supervibe/memory/decisions/rag-codegraph-preflight-policy.md`
- `.supervibe/memory/decisions/workflow-receipts-policy.md`
- `.supervibe/memory/decisions/scoped-agent-invocation-receipts.md`
