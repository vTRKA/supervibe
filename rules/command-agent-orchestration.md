---
name: command-agent-orchestration
description: "All Supervibe slash commands must build a real agent plan by default and must block rather than emulate missing specialist agents."
applies-to: [slash-command, command-routing, workflow-orchestration]
mandatory: true
version: 1.2
last-verified: 2026-05-06
related-rules: [workflow-invocation-receipts, confidence-discipline, operational-safety, instruction-surface-integrity]
---

# Command Agent Orchestration

## Why this rule exists

Supervibe is an agentic plugin. A command that only role-plays specialists
inline breaks the product contract: users see an agent workflow, but no real
agent invocation, handoff, receipt, or reviewer accountability happened.

## Scope

This rule applies to every published `/supervibe-*` command, natural-language
command route, command-agent plan, staged workflow runner, and durable command
artifact that claims command, specialist, reviewer, worker, or validator work.

It does not require real specialist dispatch for diagnostics that explicitly
return dry-run output and do not claim producer completion.

## Source of truth

The executable command profile map lives in
`scripts/lib/command-agent-orchestration-contract.mjs`.

Every command must materialize the profile through the runtime preflight:

```bash
node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-design
```

The preflight prints `SUPERVIBE_COMMAND_AGENT_PLAN`, required agents, selected
host dispatch support, proof source, and whether durable writes are allowed.
If the plan says `executionMode = agent-required-blocked`, the command must
stop before durable artifacts.

Every published `/supervibe-*` command must have a profile with:

- `ownerAgentId = supervibe-orchestrator`
- `defaultExecutionMode = real-agents`
- `requiredAgentIds` containing the owner and the command specialists
- `inlineScope = diagnostic/dry-run only`
- `blockedMode = agent-required-blocked`
- receipt proof fields `hostInvocation.source` and
  `hostInvocation.invocationId`

## What to do

- Build `agentPlan` from the command profile before durable command work.
- Run `scripts/command-agent-plan.mjs` before durable command work and follow
  its host dispatch/proof result.
- When a profile prints `IMMEDIATE_AGENTS`, `DEFERRED_AGENTS`, or
  `AGENT_STAGE_GATE`, invoke only the immediate owner/control-plane agents
  before the gate. Staged specialists must wait until the executable workflow
  state says their stage is ready.
- Invoke the listed host agents when the command performs domain work,
  review, implementation, design, audit, planning, scoring, or handoff.
- Add dynamic stack/domain specialists when the command profile asks for
  `dynamicAgentSelectors`.
- Let command profiles select dynamic required roles from workflow context.
  Low-risk fast paths may reduce required roles, but only when the executable
  plan prints the selected mode and the counts/evidence that made it safe.
- Print required role sources as `project artifact`, `plugin-only`, or
  `logical role` so users can tell whether an agent is installed in the
  project or supplied by the plugin profile.
- Treat `REQUIRED_AGENT_SOURCES` as definition evidence and
  `CALLABLE_AGENT_SOURCES` as host invocation evidence. A plugin-only
  definition is not enough for `CALLABLE_AGENTS_READY=true`; missing callable
  roles must print as `MISSING_CALLABLE_AGENTS` and keep durable output
  blocked.
- For active commands, build the plan with the current slug/handoff so
  `SCOPED_RECEIPT_GATE` proves this run specifically. Old global receipts are
  diagnostic only and do not authorize a new command/handoff.
- Use the shared stage runner when a workflow provides it. A stage runner owns
  producer execution or host-invocation binding, receipt issue, validation,
  planner/state refresh, and post-stage continuation output for that stage.
- For agent, worker, or reviewer output, issue runtime workflow receipts with
  real host invocation proof.
- For Codex, use the `CODEX_SPAWN_PAYLOAD_RULES` and
  `CODEX_SPAWN_NOW_PAYLOADS` / staged payload information printed by
  `command-agent-plan.mjs`. Forked
  payloads must set `fork_context=true`, must omit `agent_type`, `model`, and
  `reasoning_effort`, and must encode the Supervibe logical role in `message`
  instead of Codex `agent_type`.
- For Codex, record each returned runtime id with
  `scripts/agent-invocation.mjs log`, and use the same id in workflow receipts
  as `hostInvocation.invocationId`.
- If a required agent is unavailable or proof is missing, set
  `executionMode = agent-required-blocked`, explain what is blocked, and offer
  provision/connect/stop choices.

## What not to do

- Do not use `inline` as a hidden substitute for real agents. Inline is only
  diagnostic or dry-run output.
- Do not claim `real-agents` unless the host actually invoked the agents and
  receipts include host invocation ids.
- Do not treat `REQUIRED_AGENTS` as "spawn all immediately" when a workflow
  gate is present; it means those agents are required before their stage can be
  claimed complete.
- Do not copy the full profile logic into command markdown. Commands should
  point to the executable profile and this rule, so duplicated prose cannot
  drift into an emulation path.
- Do not substitute command or skill receipts for missing specialist agent,
  worker, or reviewer receipts.
- Do not leave users at a lifecycle gate with only `NEXT_ACTION` or "done".
  Stage plans must surface explicit continuation choices when review,
  approval, recovery, or prototype unlock is pending.

## Enforcement

- `scripts/validate-command-operational-contracts.mjs` verifies every command
  has a concise orchestration section and an executable profile.
- `scripts/command-agent-plan.mjs` is the mandatory runtime preflight for
  every slash command before durable artifacts or completion claims.
- `validateCommandAgentProfiles()` verifies every published command defaults
  to `real-agents`, references existing agents, and forbids emulation.
- `npm run validate:workflow-receipts` and
  `npm run validate:agent-producer-receipts` verify runtime proof before
  completion claims.

## Examples

### Bad

```text
/supervibe-audit result:
security-auditor says everything is fine.
code-reviewer says everything is fine.
```

No command-agent plan, host invocation id, agent output artifact, or workflow
receipt proves those specialists actually ran.

### Good

```bash
node scripts/command-agent-plan.mjs --command /supervibe-audit
node scripts/agent-invocation.mjs log --agent security-auditor --host codex \
  --host-invocation-id <runtime-id> --task "release security audit" \
  --confidence 9 --issue-receipt --command /supervibe-audit \
  --stage security-review --handoff-id <handoff-id> \
  --output-artifacts .supervibe/artifacts/_agent-outputs/<runtime-id>/agent-output.json
npm run validate:agent-producer-receipts
```

The command can claim specialist output only after the runtime id, output
artifact, receipt, and producer validator agree.

## Related rules

- `workflow-invocation-receipts` - provenance for claimed producers.
- `confidence-discipline` - command completion claims need evidence.
- `operational-safety` - blocked agent stages must not be hidden as manual work.
- `instruction-surface-integrity` - command docs must not drift from executable
  profile behavior.
