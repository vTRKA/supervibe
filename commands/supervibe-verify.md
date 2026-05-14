---
description: >-
  Use WHEN implementation claims need tester-style verification against explicit
  Goals TO map evidence, commands, outputs, and residual gaps before review or
  shipping. Triggers: verify goals, verification evidence, prove goals are done,
  /supervibe-verify.
last-verified: "2026-05-14"
---

# /supervibe-verify

## Overview

/supervibe-verify is the evidence gate between implementation and review. It is read-only by default and proves whether the requested Goals are satisfied by tester-style evidence: commands run, outputs captured, changed behavior inspected, and gaps mapped back to the specific Goal they affect.

The command does not approve production readiness. It produces the verification packet that /supervibe-review consumes.

## When to Use

Use this command when a feature, fix, plan task, or workflow claim says work is complete and needs proof against Goals or acceptance criteria. If there are no explicit Goals, acceptance criteria, plan tasks, or user-visible completion claims, stop and ask for the Goal source or route back to planning.

## Process

1. Resolve the Goal source: user request, plan tasks, work-item graph, PR checklist, issue, or explicit acceptance criteria.
2. Build a Goal map with one row per Goal: expected behavior, touched files, verification command, and required evidence.
3. Dispatch or apply the qa-test-engineer profile from the command-agent plan for tester-style coverage.
4. Run the smallest command set that proves each Goal, then add broader checks only when the Goal or changed surface requires them.
5. Record each command, exit code, relevant output, and the Goal ids it proves.
6. Mark every Goal as PASS, FAIL, PARTIAL, or NOT_VERIFIED with a concrete reason.
7. Hand off to /supervibe-review only when blocking verification gaps are absent or explicitly named.

## Evidence Requirements

- Goal map with stable Goal ids and source references.
- Tester evidence from qa-test-engineer or an equivalent real host agent receipt when active workflow receipts are required.
- Exact verification commands, exit codes, and relevant output snippets.
- File or artifact references for behavior inspected manually.
- Residual risk for any Goal that is partial, unverified, skipped, or blocked.

Blocking conditions: no Goal source, claimed Goal without evidence, failed verification not proven unrelated, or missing current-run real-agent receipts.

## Red Flags

- The report says tests passed without naming commands and exit codes.
- Evidence is grouped globally instead of mapped to individual Goals.
- Manual inspection replaces an available deterministic test.
- A flaky, skipped, or partial check is treated as a pass.
- Review or ship is requested while FAIL or NOT_VERIFIED Goal rows remain.

## Verification

Before claiming this command is complete, run or cite:

```bash
node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-verify
node --test <targeted-test-files>
```

For this repository command surface, the routing and catalog guards are:

```bash
node --test tests/supervibe-command-catalog.test.mjs tests/supervibe-commands-routing.test.mjs
```

## Next Decisions

- If every Goal is PASS: route to /supervibe-review with the verification packet.
- If any Goal is FAIL: route back to implementation or /supervibe-execute-plan --resume.
- If any Goal is PARTIAL or NOT_VERIFIED: ask whether to add evidence, reduce scope, or accept residual risk.
- If the change is release-impacting: include the verification packet in /supervibe-ship only after review passes.

## Agent Profile

Source of truth: scripts/lib/command-agent-orchestration-contract.mjs profile /supervibe-verify.

Required roles: supervibe-orchestrator owns routing and handoff; repo-researcher maps touched source and prior evidence; qa-test-engineer owns tester-style Goal evidence; quality-gate-reviewer checks evidence completeness and confidence.

Dynamic selectors add risk reviewers when the Goal, artifact, stack, or risk domain requires them. Active workflow output remains blocked until host-agent receipts include hostInvocation.source and hostInvocation.invocationId.

## Skill Contract

Primary skills: supervibe:test-strategy and supervibe:verification.

The skill contract requires Goal-to-evidence mapping, deterministic commands where possible, explicit flake or skip handling, and a handoff packet that /supervibe-review can evaluate without rerunning discovery. Skill receipts or command receipts cannot substitute for the qa-test-engineer agent output when an active workflow requires specialist proof.

## Invocation

Primary invocation:

```bash
/supervibe-verify --from-goals .supervibe/artifacts/plans/<plan>.md --handoff <run-id>
node scripts/command-agent-plan.mjs --command /supervibe-verify --host codex --active --handoff-id <handoff-id> --verify-agents
```

Use natural language only as a route into /supervibe-verify; durable outputs still require the runtime command-agent plan and scoped receipts described below.

## Output Contract

Goal verification packet with Goal ids, PASS/FAIL/PARTIAL/NOT_VERIFIED rows, commands, exit codes, output evidence, residual gaps, and the next handoff to /supervibe-review or implementation.

The output must include a human-readable decision, evidence paths, command results, unresolved blockers, recommended next decisions, and machine-readable handoff metadata. It must not present raw NEXT_STEP_HANDOFF as the primary user-facing response.

## Guard Rails

Do not approve production readiness; this command only proves Goal evidence for review.

Never claim completion from inline notes, stale artifacts, old global receipts, or a skill-only summary. If required evidence, callable agents, scoped receipts, or release sequencing are missing, stop with a blocker and present the user's next choices.

## Workflow Invocation Receipts

Durable command output must issue runtime receipts with `node scripts/workflow-receipt.mjs issue ...` or through `node scripts/agent-invocation.mjs log ... --issue-receipt`. Hand-written receipts are untrusted.

Receipt trust is anchored in `workflow-invocation-ledger.jsonl` and `artifact-links.json`. Before claiming command completion, run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts`.

Active workflow gates accept scoped current-run receipts only. Old global receipts are ignored for active durable writes. Host-agent receipts must include `hostInvocation.source` and `hostInvocation.invocationId`. A command or skill receipts must not substitute for a required agent, worker, reviewer, validator, or external-tool receipt.

## Agent Orchestration Contract

Before durable writes, run `node scripts/command-agent-plan.mjs --command /supervibe-verify --host <host> --active --handoff-id <handoff-id> --verify-agents` and inspect `SUPERVIBE_COMMAND_AGENT_PLAN`. The executable source is `scripts/lib/command-agent-orchestration-contract.mjs`, governed by `rules/command-agent-orchestration.md`.

The plan must expose `ownerAgentId`, `agentPlan`, `requiredAgentIds`, `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, and `MISSING_CALLABLE_AGENTS`. Durable mode is `real-agents`; if the plan reports `agent-required-blocked`, inline execution is diagnostic/dry-run only.

For Codex, use `spawn_agent` and record each real invocation with `node scripts/agent-invocation.mjs log`. Receipts must bind `hostInvocation.source` and `hostInvocation.invocationId`. Follow `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS`: use `fork_context=true` for command-plan payloads, do not override `agent_type` or `reasoning_effort` from those payloads unless the command profile explicitly allows it.

Do not emulate specialist agents, reviewers, workers, validators, or tools in the controller. A command or skill receipts must not substitute for real agent output when the command profile requires agent proof.
