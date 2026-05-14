---
description: >-
  Use WHEN reviewed work is ready for release readiness TO evaluate target-aware
  ship gates, deployment path, rollback, support, and Docker only when the
  target actually uses Docker. Triggers: ship release, release readiness,
  prepare to ship, /supervibe-ship.
last-verified: "2026-05-14"
---

# /supervibe-ship

## Overview

/supervibe-ship is the release-readiness gate after verify and review. It decides whether a reviewed change can be shipped for the detected target: package, CLI/plugin, web app, desktop app, service, docs-only update, or another declared release path.

Docker is checked only when the target has Docker evidence such as Dockerfile, compose files, container CI, deployment manifests, or an explicit Docker release target.

## When to Use

Use this command after /supervibe-verify and /supervibe-review pass, or when a release owner asks for target-aware ship readiness. Do not use it to skip verification or review. If either gate is missing, stop and route to the missing gate.

## Process

1. Confirm verify and review packets are present, current, and passing.
2. Detect release target: npm package, plugin command surface, app, service, desktop/mobile artifact, docs-only change, or configured deployment path.
3. Build the target-aware release checklist: tests, build, packaging, changelog/release notes, docs, migration notes, rollback, observability, support owner, and approvals.
4. Check Docker only when the target evidence says Docker is relevant.
5. Run or cite the release validation commands appropriate to the target.
6. Produce a SHIP_READY, SHIP_BLOCKED, or SHIP_READY_WITH_ACCEPTED_RISK decision.
7. Hand off to the release owner with rollback, support, and residual risk.

## Evidence Requirements

- Passing verify packet and review packet, or explicit blocker naming the missing packet.
- Target detection evidence and selected release path.
- Release validation commands, exit codes, and artifact references.
- Rollback plan, support owner, release notes/changelog decision, docs decision, and approval state.
- Docker readiness evidence only when Docker is relevant; otherwise record Docker: not applicable with target rationale.

Blocking conditions: missing or failing verify/review evidence, unknown release target, failed release validation, missing rollback/support owner, unaccepted high-risk finding, Docker-required target without Docker evidence, or missing real-agent receipts.

## Red Flags

- Docker checks run blindly for a non-Docker target and distract from the real release path.
- A release is marked ready without rollback, support owner, or release-note decision.
- Review blockers are converted into ship residual risk without explicit acceptance.
- The command claims deployment or external mutation without scoped approval.

## Verification

Before claiming ship readiness, run or cite:

```bash
node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-ship
node --test <targeted-test-files>
```

For this repository command surface:

```bash
node --test tests/supervibe-command-catalog.test.mjs tests/supervibe-commands-routing.test.mjs
npm run validate:command-agent-enforcement
```

## Next Decisions

- SHIP_READY: release owner may proceed using the target-specific release procedure.
- SHIP_BLOCKED: fix blockers, re-run /supervibe-verify and /supervibe-review as needed, then retry ship.
- SHIP_READY_WITH_ACCEPTED_RISK: require named risk owner, acceptance rationale, rollback, and follow-up trigger.
- NO_RELEASE_TARGET: route back to planning or release governance to define the target.

## Agent Profile

Source of truth: scripts/lib/command-agent-orchestration-contract.mjs profile /supervibe-ship.

Required roles: supervibe-orchestrator owns target detection and handoff; release-governance-reviewer owns release readiness, approvals, rollback, and support; devops-sre owns deployment/runtime evidence and Docker when relevant; qa-test-engineer checks release validation coverage; quality-gate-reviewer gates confidence and evidence completeness.

Dynamic selectors add stack and risk reviewers for the detected release target. Active workflow output remains blocked until current-run release receipts are trusted.

## Skill Contract

Primary skills: supervibe:finishing-a-development-branch, supervibe:verification, and supervibe:test-strategy.

The skill contract requires target-aware readiness, Docker-only-when-relevant handling, rollback and support evidence, release-note/docs decisions, and an explicit handoff. Skill or command receipts cannot replace real release-governance-reviewer, devops-sre, or qa-test-engineer receipts for active ship claims.

## Invocation

Primary invocation:

```bash
/supervibe-ship --from-review .supervibe/artifacts/reviews/<review-packet>.md --target auto --handoff <run-id>
node scripts/command-agent-plan.mjs --command /supervibe-ship --host codex --active --handoff-id <handoff-id> --verify-agents
```

Use natural language only as a route into /supervibe-ship; durable outputs still require the runtime command-agent plan and scoped receipts described below.

## Output Contract

Target-aware ship readiness packet with release target, validation commands, rollback/support owner, Docker applicability, approvals, SHIP_READY/SHIP_BLOCKED decision, and residual risk.

The output must include a human-readable decision, evidence paths, command results, unresolved blockers, recommended next decisions, and machine-readable handoff metadata. It must not present raw NEXT_STEP_HANDOFF as the primary user-facing response.

## Guard Rails

Do not skip verify or review; do not run Docker checks unless the target has Docker evidence or an explicit Docker release path.

Never claim completion from inline notes, stale artifacts, old global receipts, or a skill-only summary. If required evidence, callable agents, scoped receipts, or release sequencing are missing, stop with a blocker and present the user's next choices.

## Workflow Invocation Receipts

Durable command output must issue runtime receipts with `node scripts/workflow-receipt.mjs issue ...` or through `node scripts/agent-invocation.mjs log ... --issue-receipt`. Hand-written receipts are untrusted.

Receipt trust is anchored in `workflow-invocation-ledger.jsonl` and `artifact-links.json`. Before claiming command completion, run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts`.

Active workflow gates accept scoped current-run receipts only. Old global receipts are ignored for active durable writes. Host-agent receipts must include `hostInvocation.source` and `hostInvocation.invocationId`. A command or skill receipts must not substitute for a required agent, worker, reviewer, validator, or external-tool receipt.

## Agent Orchestration Contract

Before durable writes, run `node scripts/command-agent-plan.mjs --command /supervibe-ship --host <host> --active --handoff-id <handoff-id> --verify-agents` and inspect `SUPERVIBE_COMMAND_AGENT_PLAN`. The executable source is `scripts/lib/command-agent-orchestration-contract.mjs`, governed by `rules/command-agent-orchestration.md`.

The plan must expose `ownerAgentId`, `agentPlan`, `requiredAgentIds`, `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, and `MISSING_CALLABLE_AGENTS`. Durable mode is `real-agents`; if the plan reports `agent-required-blocked`, inline execution is diagnostic/dry-run only.

For Codex, use `spawn_agent` and record each real invocation with `node scripts/agent-invocation.mjs log`. Receipts must bind `hostInvocation.source` and `hostInvocation.invocationId`. Follow `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS`: use `fork_context=true` for command-plan payloads, do not override `agent_type` or `reasoning_effort` from those payloads unless the command profile explicitly allows it.

Do not emulate specialist agents, reviewers, workers, validators, or tools in the controller. A command or skill receipts must not substitute for real agent output when the command profile requires agent proof.
