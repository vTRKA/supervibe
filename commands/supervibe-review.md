---
description: >-
  Use WHEN verified work needs production-readiness review TO inspect code,
  evidence, risks, rollback, and missing verification before release or ship
  decisions. Triggers: review production readiness, final review after verify,
  review the verified diff, /supervibe-review.
last-verified: "2026-05-14"
---

# /supervibe-review

## Overview

/supervibe-review is the production-readiness review gate after /supervibe-verify. It checks the verified diff, required evidence, risk domains, rollback posture, and remaining blockers before a release or ship decision. Plan-review requests must route to `/supervibe-plan --review <plan-path>` instead; that path keeps `systems-analyst` in the baseline reviewer set and gates atomization on trusted plan-review receipts.

If verification evidence is missing, the command records missing-verify-evidence and stops instead of silently reviewing an unproven change.

## When to Use

Use this command after /supervibe-verify produced a Goal-mapped verification packet, or when a user explicitly asks whether a verified change is production-ready. Do not use it as the first proof step for an implementation claim; route to /supervibe-verify first. If the user asks to review a plan before atomization or execution, run `/supervibe-plan --review`, not `/supervibe-review`.

## Process

1. Read the verification packet and confirm each required Goal has PASS evidence.
2. If verification evidence is absent or incomplete, emit missing-verify-evidence with the exact missing Goal rows and stop.
3. Review the diff and touched contracts with code-reviewer, architect-reviewer, qa-test-engineer, and required dynamic reviewers.
4. Check production readiness: correctness, security, performance, migrations, docs, observability, rollback, support owner, and release notes.
5. Rank findings as blocking or non-blocking with file:line or artifact evidence.
6. Decide whether the next handoff is fix, re-verify, ship readiness, or explicit risk acceptance.

## Evidence Requirements

- Verification packet from /supervibe-verify or a clear missing-verify-evidence finding.
- Diff scope and changed files inspected by reviewer roles.
- Severity-ranked findings with file:line, artifact, or command-output evidence.
- Production-readiness checklist: rollback, support owner, docs/release-note decision, observability, and residual risk.
- Real reviewer receipts for active workflows.

Blocking conditions: missing or stale verify evidence, unresolved critical readiness finding, evidence-free findings, or missing current-run reviewer receipts.

## Red Flags

- Review approves a change that has no Goal-mapped verification packet.
- Findings are advisory-only despite a failed test, unverified Goal, or rollback gap.
- The review ignores release notes, docs, migration, observability, or support impact.
- A code-review skill output is used as a substitute for real reviewer-agent receipts.

## Verification

Before claiming review completion, run or cite:

```bash
node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-review
node --test <targeted-test-files>
```

For command routing and profile coverage in this repo:

```bash
node --test tests/supervibe-command-catalog.test.mjs tests/supervibe-commands-routing.test.mjs
```

## Next Decisions

- APPROVED: route release-impacting work to /supervibe-ship.
- BLOCKED_MISSING_VERIFY: route to /supervibe-verify with the missing Goal rows.
- BLOCKED_FINDINGS: route to implementation or /supervibe-execute-plan --resume, then re-verify.
- APPROVED_WITH_RISK: require explicit risk owner and acceptance before ship.

## Agent Profile

Source of truth: scripts/lib/command-agent-orchestration-contract.mjs profile /supervibe-review.

Required roles: supervibe-orchestrator owns scope and missing-evidence routing; architect-reviewer checks structure; code-reviewer owns severity-ranked findings; qa-test-engineer validates the verification packet; release-governance-reviewer checks production readiness; quality-gate-reviewer gates confidence and evidence completeness.

Dynamic selectors add artifact owners and risk reviewers. Active workflow output remains blocked until current-run reviewer receipts are trusted. For plan-review artifacts, the non-waived required receipt set includes `supervibe-orchestrator`, `systems-analyst`, `architect-reviewer`, `quality-gate-reviewer`, `security-auditor`, `qa-test-engineer`, `release-governance-reviewer`, and `db-reviewer`.

## Skill Contract

Primary skills: supervibe:code-review, supervibe:test-strategy, and supervibe:finishing-a-development-branch.

The skill contract requires severity-ranked findings, verification-packet validation, production-readiness evidence, explicit blocking conditions, and a next handoff. Skill or command receipts cannot replace real code-reviewer, qa-test-engineer, or release-governance-reviewer receipts for active workflow claims.

## Invocation

Primary invocation:

```bash
/supervibe-review --from-verify .supervibe/artifacts/evidence/<verify-packet>.md --handoff <run-id>
node scripts/command-agent-plan.mjs --command /supervibe-review --host codex --active --handoff-id <handoff-id> --verify-agents
```

Use natural language only as a route into /supervibe-review; durable outputs still require the runtime command-agent plan and scoped receipts described below.

## Output Contract

Production-readiness review packet with missing-verify-evidence status when applicable, severity-ranked findings, release blockers, rollback/support checks, and next handoff to /supervibe-ship or implementation.

The output must include a human-readable decision, evidence paths, command results, unresolved blockers, recommended next decisions, and machine-readable handoff metadata. It must not present raw NEXT_STEP_HANDOFF as the primary user-facing response.

## Guard Rails

Do not review unverified work as production-ready; missing verify evidence is a blocker, not a warning.

Never claim completion from inline notes, stale artifacts, old global receipts, or a skill-only summary. If required evidence, callable agents, scoped receipts, or release sequencing are missing, stop with a blocker and present the user's next choices.

## Workflow Invocation Receipts

Durable command output must issue runtime receipts with `node scripts/workflow-receipt.mjs issue ...` or through `node scripts/agent-invocation.mjs log ... --issue-receipt`. Hand-written receipts are untrusted.

Receipt trust is anchored in `workflow-invocation-ledger.jsonl` and `artifact-links.json`. Before claiming command completion, run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts`.

Active workflow gates accept scoped current-run receipts only. Old global receipts are ignored for active durable writes. Host-agent receipts must include `hostInvocation.source` and `hostInvocation.invocationId`. A command or skill receipts must not substitute for a required agent, worker, reviewer, validator, or external-tool receipt.

## Agent Orchestration Contract

Before durable writes, run `node scripts/command-agent-plan.mjs --command /supervibe-review --host <host> --active --handoff-id <handoff-id> --verify-agents` and inspect `SUPERVIBE_COMMAND_AGENT_PLAN`. The executable source is `scripts/lib/command-agent-orchestration-contract.mjs`, governed by `rules/command-agent-orchestration.md`.

The plan must expose `ownerAgentId`, `agentPlan`, `requiredAgentIds`, `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, and `MISSING_CALLABLE_AGENTS`. Durable mode is `real-agents`; if the plan reports `agent-required-blocked`, inline execution is diagnostic/dry-run only.

For Codex, use `spawn_agent` and record each real invocation with `node scripts/agent-invocation.mjs log`. Receipts must bind `hostInvocation.source` and `hostInvocation.invocationId`. Follow `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS`: use `fork_context=true` for command-plan payloads, do not override `agent_type` or `reasoning_effort` from those payloads unless the command profile explicitly allows it.

Do not emulate specialist agents, reviewers, workers, validators, or tools in the controller. A command or skill receipts must not substitute for real agent output when the command profile requires agent proof.
