---
name: command-agent-orchestration
description: "All Supervibe slash commands must build a real agent plan by default and must block rather than emulate missing specialist agents."
applies-to: [slash-command, command-routing, workflow-orchestration]
mandatory: true
version: 1.0
last-verified: 2026-05-03
related-rules: [workflow-invocation-receipts, confidence-discipline, operational-safety, instruction-surface-integrity]
---

# Command Agent Orchestration

## Why this rule exists

Supervibe is an agentic plugin. A command that only role-plays specialists
inline breaks the product contract: users see an agent workflow, but no real
agent invocation, handoff, receipt, or reviewer accountability happened.

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
- Invoke the listed host agents when the command performs domain work,
  review, implementation, design, audit, planning, scoring, or handoff.
- Add dynamic stack/domain specialists when the command profile asks for
  `dynamicAgentSelectors`.
- For agent, worker, or reviewer output, issue runtime workflow receipts with
  real host invocation proof.
- For Codex, invoke specialists through `spawn_agent`, record the returned
  runtime id with `scripts/agent-invocation.mjs log`, and use the same id in
  workflow receipts as `hostInvocation.invocationId`.
- If a required agent is unavailable or proof is missing, set
  `executionMode = agent-required-blocked`, explain what is blocked, and offer
  provision/connect/stop choices.

## What not to do

- Do not use `inline` as a hidden substitute for real agents. Inline is only
  diagnostic or dry-run output.
- Do not claim `real-agents` unless the host actually invoked the agents and
  receipts include host invocation ids.
- Do not copy the full profile logic into command markdown. Commands should
  point to the executable profile and this rule, so duplicated prose cannot
  drift into an emulation path.
- Do not substitute command or skill receipts for missing specialist agent,
  worker, or reviewer receipts.

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
