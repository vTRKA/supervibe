# Postmortem Template

Use this template for non-trivial bugs, incidents, repeated flaky behavior,
integration drift, environment failures, data risk, user impact, or any fix with
meaningful residual risk. Keep the postmortem blameless, evidence-backed, and
specific enough that a future worker can reproduce the failure and verify the
guard.

## Metadata

| Field | Required content |
| --- | --- |
| Title | Short failure name tied to the user-visible symptom or broken contract. |
| Status | Draft, ready for review, blocked, or closed. |
| Owner | Person, agent, worker, or team responsible for follow-up. |
| Date range | First known occurrence through verified recovery or closure. |
| Scope | Files, services, commands, artifacts, integrations, users, or workflows covered. |
| Severity | Impact-based severity and rationale. |
| Evidence sources | Logs, commands, tests, metrics, project memory, Code RAG, CodeGraph, reviewer notes, or external docs used. |

## Summary

Write three short paragraphs:

1. What failed, how it was detected, and when it started.
2. Failure mode, user impact, affected contract, blast radius, and recovery
   status.
3. Root cause, fix, regression guard, residual risk, owner, and next trigger for
   revisiting the issue.

## Impact And Contract

| Field | Required content |
| --- | --- |
| Failure mode | Failing test, runtime error, flaky behavior, integration failure, environment failure, data/state issue, performance issue, security issue, or other named mode. |
| User impact | Affected users, workflows, data, support load, release risk, or confirmed internal-only impact. |
| Affected contract | Behavior, API, Data, UI, Security, Performance, Observability, Environment, Documentation, or Verification. |
| Expected behavior | The behavior promised by tests, docs, API contract, UI state, runbook, or product requirement. |
| Observed behavior | The exact wrong behavior, error, status, log, metric, assertion diff, or environment failure. |
| Blast radius | Components, commands, data paths, tenants, platforms, or workflows plausibly affected. |
| Detection signal | Test, alert, log, user report, reviewer finding, metric, or manual check that surfaced it. |
| Data or security exposure | Evidence of exposure or a reason it is not applicable. |
| Rollback or mitigation | Fastest safe action if the fix fails or the issue recurs. |

## Reproduction Evidence

| Field | Required content |
| --- | --- |
| Reproduction command | Exact command, request, scenario, log query, seed, script, or manual steps. |
| Pre-fix evidence | Exit code, stdout, stderr, assertion diff, stack trace, raw payload, metric, screenshot note, or environment delta. |
| Reduced case | Smallest test, input, fixture, request, seed, data row, config, or environment delta that still fails. |
| Environment | Runtime version, package manager, OS, shell, dependency install state, config, env vars, permissions, sandbox, and network facts that matter. |
| Boundary evidence | Raw request, response, schema, auth mode, timeout, retry, idempotency, rate limit, or reason external access was unavailable. |
| Non-reproduction attempts | Commands or scenarios that did not fail and what they rule out. |

## Timeline

Record concrete timestamps in chronological order. Include detection, triage,
reproduction, localization, mitigation, fix, guard, verification, release, and
communication events.

| Time | Event | Evidence |
| --- | --- | --- |
| Timestamp with timezone | What happened. | Command, log, metric, artifact, reviewer note, or decision. |

## Root Cause Analysis

| Field | Required content |
| --- | --- |
| Narrowed cause | Concrete file, function, boundary, state transition, schema, config, dependency, or environment delta that caused the failure. |
| Evidence for cause | Source reads, command output, logs, reduced case, CodeGraph, Code RAG, metrics, or payloads that prove the cause. |
| Ruled-out hypotheses | Up to three alternatives and the evidence that ruled each out. |
| Contributing factors | Missing guard, ambiguous contract, stale fixture, weak observability, integration drift, environment drift, review gap, or process gap. |
| Why existing guard missed it | Missing test, wrong fixture, mock-only contract, assertion gap, alert threshold, untracked environment, or validator blind spot. |
| Unknowns | Remaining facts that could not be proved and how they affect confidence. |

## Fix And Guard

| Field | Required content |
| --- | --- |
| Fix summary | Minimal change that addresses the narrowed cause rather than the symptom. |
| Changed artifacts | Files, schemas, configs, tests, docs, runbooks, commands, or generated artifacts changed. |
| Fix evidence | Exact post-fix command output, reviewer evidence, metric recovery, or runtime replay. |
| Regression guard | Test, validator, monitor, fixture, contract check, environment preflight, or alert that prevents recurrence. |
| Guard proof | Evidence the guard fails before the fix or would have detected the old failure. |
| Adjacent checks | Smallest blast-radius checks run because of the affected contract. |
| Rollback plan | How to revert or mitigate if the fix causes regressions. |

## Verification Matrix

| Command or check | Purpose | Result | Evidence path or note |
| --- | --- | --- | --- |
| Original reproduction command | Prove the original symptom is fixed. | Pass, fail, blocked, or not applicable with reason. | Output summary, log path, artifact, or reviewer note. |
| Regression guard command | Prove recurrence is guarded. | Pass, fail, blocked, or not applicable with reason. | Output summary, log path, artifact, or reviewer note. |
| Adjacent blast-radius check | Prove nearby contract behavior still holds. | Pass, fail, blocked, or not applicable with reason. | Output summary, log path, artifact, or reviewer note. |
| Documentation or handoff check | Prove the durable record is complete. | Pass, fail, blocked, or not applicable with reason. | Postmortem path, memory path, runbook path, or handoff id. |

## Residual Risk

Record each remaining risk separately.

| Risk | Impact | Owner | Trigger | Next action |
| --- | --- | --- | --- | --- |
| Remaining uncertainty, uncovered platform, unverified boundary, flaky signal, missing monitor, or accepted tradeoff. | User, data, reliability, release, support, or developer impact. | Responsible role. | Event, date, metric, user report, dependency change, or validator failure that reopens the issue. | Concrete follow-up, mitigation, or review. |

## Action Items

Each action item must prevent recurrence, improve detection, reduce blast radius,
or improve recovery. Avoid action items that only restate the completed fix.

| ID | Action | Owner | Due or trigger | Verification |
| --- | --- | --- | --- | --- |
| PM-001 | Concrete follow-up. | Responsible role. | Date, release, dependency update, or recurring failure trigger. | Command, reviewer check, artifact, monitor, or user-facing proof. |

## Handoff

Use [Source Evidence Report](source-evidence-report.md) when the postmortem
depends on project memory, Code RAG, CodeGraph, official docs, domain standards,
or stale-index fallback. Use [Worker Handoff](worker-handoff.md) when another
worker must implement action items, run verification, or continue investigation.

## Completion Checklist

- Failure mode, user impact, affected contract, expected behavior, and observed
  behavior are explicit.
- Reproduction command and pre-fix evidence are recorded or blocked with reason.
- Narrowed cause is supported by evidence, and unknowns are named.
- Fix evidence proves the original symptom is fixed.
- Regression guard is present or blocked with an owner and next action.
- Adjacent blast-radius check matches the affected contract.
- Rollback or mitigation path is documented.
- Residual risks have owner, trigger, and follow-up.
