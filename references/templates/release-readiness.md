# Release Readiness Template

Use this template when a change is close to PR, merge, deployment, launch, or
support handoff and the release owner needs one bounded record of validation,
artifacts, approvals, rollback, support ownership, and exceptions. The template
is evidence packaging; it does not replace runtime receipts, validators,
reviewers, CI, or release-owner approval.

## Release Metadata

| Field | Required content |
| --- | --- |
| Release or change name | Short name tied to the PR, issue, plan, work item, or release train. |
| Status | Draft, ready for review, ready for release, blocked, released, reverted, or paused. |
| Owner | Release owner or workflow owner responsible for the readiness decision. |
| Support owner | Role or person responsible for post-release questions, incidents, and user support. |
| Scope | Files, commands, artifacts, services, user surfaces, workflows, or packages covered. |
| Source evidence | Project memory, Code RAG, CodeGraph, docs, tests, reviewer notes, or explicit stale/unavailable evidence. |
| Decision source | User request, issue, plan artifact, PR, reviewer approval, ADR, migration plan, or release gate. |

## Change Summary

Write three short paragraphs:

1. What changed, why it changed, and which user, workflow, command, support, or
   runtime contract it affects.
2. What validation was run, what artifacts prove readiness, and what approvals
   are still required or complete.
3. What rollback, support owner, exceptions, and residual risks apply after
   release.

## Commands

Record exact commands. Include skipped commands only when an exception is owned.

| Command | Purpose | Result | Evidence |
| --- | --- | --- | --- |
| Exact command, CI job, reviewer invocation, or manual check. | Contract or risk covered. | Passed, failed, blocked, skipped with exception, or not applicable. | Exit code, output summary, log path, receipt id, artifact path, screenshot, or blocker. |

## Artifacts

Every artifact link should be repository-relative, workflow-relative, or a stable
external URL controlled by the release process.

| Artifact | Type | Status | Owner | Notes |
| --- | --- | --- | --- | --- |
| Path, receipt id, report, screenshot, PR, ADR, migration plan, handoff, or release note. | Evidence, approval, docs, runbook, rollback, support, or exception. | Created, updated, reviewed, approved, blocked, stale, or not applicable. | Owner role. | Why it matters and what the reviewer should inspect. |

## Approvals

| Approver or gate | Required for | Status | Evidence | Expiration or condition |
| --- | --- | --- | --- | --- |
| Reviewer, release owner, security owner, support owner, product owner, CI gate, or workflow gate. | Merge, deploy, rollout, exception, rollback, or support coverage. | Pending, approved, rejected, not required, or expired. | Comment, receipt, CI link, artifact path, or explicit rationale. | Date, release phase, changed scope, failed validation, or not applicable. |

## Release Notes And Docs

| Decision | Required content |
| --- | --- |
| Docs decision | Docs path updated, no-docs rationale, or docs blocker with owner. |
| Changelog decision | Changelog path updated, no-changelog rationale, or blocker with owner. |
| Release-notes decision | Release note text/path, no-note rationale, audience, or blocker with owner. |
| Support communication | Support note, runbook, known issue, migration note, or reason not needed. |

## Rollback

| Field | Required content |
| --- | --- |
| Rollback trigger | Failed validator, incident signal, user impact, support volume, metric, release-owner decision, or dependency issue. |
| Rollback action | Revert PR, disable flag, restore artifact, reroute command, pause rollout, restore previous package, or documented mitigation. |
| Data and artifact recovery | Backup, migration reversal, receipt or ledger recovery, cache rebuild, index rebuild, or reason not applicable. |
| Validation after rollback | Exact command, monitor, manual check, or reviewer confirmation that proves recovery. |
| Rollback owner | Person, role, or workflow authorized to decide and execute rollback. |

## Support Plan

| Field | Required content |
| --- | --- |
| Support owner | Primary post-release owner and escalation route. |
| Monitoring or detection | Test, alert, validator, log, metric, user report path, or manual watch. |
| Known issues | Current limitations, accepted risk, troubleshooting notes, or none with reason. |
| User or maintainer communication | Release note, changelog, docs, issue update, support macro, or not applicable with reason. |
| Review window | Time, release phase, metric threshold, or event that reopens readiness. |

## Exceptions

Record exceptions separately; do not hide them in summary prose.

| Exception | Reason | Impact | Approved by | Expiration or trigger | Mitigation |
| --- | --- | --- | --- | --- | --- |
| Skipped command, stale evidence, missing artifact, deferred docs, release-note omission, approval gap, or known risk. | Why release can continue or why it is blocked. | User, support, security, reliability, workflow, or maintainer impact. | Owner, reviewer, user, or not approved. | Date, release phase, scope change, validator failure, or support signal. | Next safe action, rollback, monitor, or follow-up. |

## Residual Risk

| Risk | Impact | Owner | Trigger | Next action |
| --- | --- | --- | --- | --- |
| Untested surface, stale index, deferred cleanup, dependency uncertainty, support burden, environment gap, or accepted exception. | Release, user, support, data, security, workflow, or maintainer impact. | Responsible role. | Event, date, validator failure, metric, report, or reviewer request. | Concrete mitigation, verification, rollback, or handoff. |

## Handoff

Use [Worker Handoff](worker-handoff.md) when another worker, reviewer, support
owner, or release owner must continue the work. Use
[Source Evidence Report](source-evidence-report.md) when readiness depends on
memory, Code RAG, CodeGraph, official docs, domain standards, or stale-index
fallback. Use [Security Review](security-review.md) when release risk touches
secrets, identity, permissions, privacy, network access, dependency trust, or
regulated data.

## Completion Checklist

- Commands are exact and every required check has a result or owned exception.
- Artifact links point to real evidence or are recorded as blockers.
- Approvals are named with status, evidence, and expiration condition.
- Docs, changelog, release notes, and support communication decisions are
  explicit.
- Rollback trigger, action, recovery validation, and owner are practical.
- Support owner, monitoring, known issues, and review window are recorded.
- Exceptions and residual risks have owner, trigger, mitigation, and next action.
