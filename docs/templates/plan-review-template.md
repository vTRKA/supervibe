# Plan Review: Review Loop Result

## Review Summary

- Plan: durable plan path
- Verdict: pass or fail
- Score: numeric score out of 10
- Stop reason: convergence reached, blocked by open findings, or user stopped the loop

## Reviewer Coverage

- supervibe-orchestrator: workflow order, receipts, and next handoff
- systems-analyst: requirements, MVP production slice, anti-bloat boundary, and production-readiness completeness
- architect-reviewer: architecture, data, cache, queue, and deployment risk
- quality-gate-reviewer: tests, validators, release gates, rollback, and evidence
- Triggered specialists: database, cache, queue, security, api, infrastructure, frontend

## Risk Trigger Matrix

| Area | Trigger | Specialist | Decision |
| --- | --- | --- | --- |
| database | yes or no | db-reviewer | topology decision |
| cache | yes or no | redis-architect | cache decision |
| queue | yes or no | queue-worker-architect | queue decision |
| security | yes or no | security-auditor | security and privacy decision |
| api | yes or no | api-contract-reviewer | API contract decision |
| infrastructure | yes or no | devops-sre | release and operations decision |
| frontend | yes or no | accessibility-reviewer | UI and accessibility decision |

## Plan Review Scorecard

| Dimension | Score | Evidence |
| --- | --- | --- |
| spec-coverage | pass or fail | requirement mapping evidence |
| mvp-value | pass or fail | MVP value and anti-bloat evidence |
| scope-safety | pass or fail | approved, deferred, rejected scope evidence |
| architecture-fit | pass or fail | boundaries and ADR evidence |
| data-storage-topology | pass or fail | database, migration, backup, restore evidence |
| cache-queue-topology | pass or fail | cache, queue, retry, idempotency evidence |
| api-contract-readiness | pass or fail | request, response, error envelope evidence |
| security-privacy | pass or fail | PII, secrets, permissions, audit logging evidence |
| observability-release-support | pass or fail | logs, metrics, alerts, rollback, support evidence |
| dependency-graph | pass or fail | dependency graph evidence |
| task-size | pass or fail | atomic task evidence |
| verification-coverage | pass or fail | verification command coverage |
| rollback-coverage | pass or fail | rollback coverage |
| parallel-safety | pass or fail | write-set conflict evidence |
| worktree-suitability | pass or fail | isolation decision evidence |
| provider-policy | pass or fail | provider safety and no bypass evidence |
| convergence-decision | pass or fail | review-loop stop evidence |

## Findings

- Critical: Open count, Resolved count, and remaining action.
- Major: Open count, Resolved count, and remaining action.
- Minor: Open count, Resolved count, and accepted non-blocking action.

## Convergence Ledger

| Iteration | Opened | Resolved | Remaining | Stop reason |
| --- | --- | --- | --- | --- |
| 1 | blocking findings opened | blocking findings resolved | remaining blocking findings | continue or stop |

## Residual Risks

| Risk | Accepted | Owner | Expiry | Rollback | Source |
| --- | --- | --- | --- | --- | --- |
| residual risk statement | yes or no | responsible reviewer or owner | revisit trigger or date | rollback action | acceptance source |

## Reviewer Self-Critique

- Weak assumptions inspected: list the assumptions the reviewer challenged before passing the plan.
- What could be missed: list areas not inspected and why they do not block execution.
- Hidden failure modes: name failure modes that could still happen despite passing tests.
- What a senior engineer would reject: list any shortcut, unsupported claim, or weak evidence that would block 10/10.
- What improves this to 10/10: name the exact evidence required before final production claim.

## Next User Decision

- Continue to atomization: run atomization with the reviewed plan and `--plan-review-passed`.
- Revise reviewed plan first: route back to plan editing with findings.
- Ask another specialist review: rerun the specific unresolved specialist area.
- Inspect readiness: show blockers, receipts, and verification evidence without mutation.
- Keep reviewed plan and stop: record the passed review without work item creation.

## Evidence

- workflow receipt: runtime receipt path or receipt id.
- verification command: validator or test command with expected pass evidence.
- plan-review-passed: proof flag required before atomization.
