# Incident Report Template

Use this template when `incident-response` emits an `incident-report` for a
production incident, security incident, degraded service, data issue, false
alarm, drill, or tabletop exercise. Keep the report blameless,
evidence-backed, and concrete enough that a future responder can verify what
happened, what stopped the impact, who owns follow-up, and what risk remains.

## Report Metadata

| Field | Required content |
| --- | --- |
| Incident ID | Stable incident, alert, ticket, page, or drill ID. |
| Title | Short user, data, security, or service impact name. |
| Status | ACTIVE, MITIGATED, MONITORING, RESOLVED, FALSE_ALARM, PARTIAL, or BLOCKED. |
| Incident type | Production incident, security incident, degraded service, data issue, or false alarm. |
| Severity | SEV1, SEV2, SEV3, or SEV4 with impact rationale. |
| Owner | Incident commander or response owner. |
| Technical owner | Person, agent, worker, team, or on-call owner driving mitigation. |
| Communications owner | Owner for internal and external status updates. |
| Scribe | Owner for timeline and evidence capture, or not applicable with reason. |
| Start time | First known detection or impact timestamp with timezone. |
| Mitigated time | Timestamp when user, data, or security impact was reduced. |
| Resolved time | Timestamp when verification supports closure, or not resolved. |
| Scope | Services, data sets, tenants, users, workflows, regions, accounts, releases, or dependencies covered. |
| Evidence sources | Alerts, dashboards, logs, traces, commands, support reports, audit records, project memory, Code RAG, CodeGraph, or runbooks used. |
| Artifact path | Path to this report and any linked postmortem, handoff, receipt, or tracker item. |

## Classification

| Incident type | Evidence required | Response emphasis |
| --- | --- | --- |
| Production incident | Live users or critical production workflow affected by outage, deploy, config, infrastructure, dependency, or runtime failure. | Restore availability or correctness quickly, then root cause. |
| Security incident | Suspected exploit, unauthorized access, secret exposure, privilege abuse, suspicious audit event, data exposure, or tampering. | Preserve evidence, contain access, restrict communication details, escalate security owner. |
| Degraded service | Partial availability, elevated latency, high error rate, queue backlog, capacity pressure, or dependency failure with partial usability. | Reduce user impact, isolate dependency/load, monitor SLO recovery. |
| Data issue | Stale, missing, duplicated, corrupted, misrouted, or incorrectly migrated data. | Stop risky writes, snapshot evidence, identify affected records, repair with verification. |
| False alarm | Alert or report is disproved by independent impact evidence. | Close with proof, tune alert/runbook, record owner-approved closure. |

## Severity Triage

| Severity | Required rationale | Communication cadence | Escalation |
| --- | --- | --- | --- |
| SEV1 | Complete outage, critical workflow down for many users, active security compromise, confirmed data exposure/loss/corruption, or imminent irreversible damage. | At least every 15 minutes until mitigated. | Incident commander, technical owner, communications owner, and security/data owner if applicable. |
| SEV2 | Major customer segment affected, repeated important workflow errors, suspected security exposure, data correctness risk, or sustained SLO breach. | At least every 30 minutes while impact continues. | On-call owner plus needed product, security, data, or infrastructure owner. |
| SEV3 | Limited degradation, localized data defect, recoverable background failure, noisy alert with plausible impact, or workaround available. | Status and next action in incident channel or tracker. | Named owner and escalation trigger. |
| SEV4 | Internal-only issue, minor operational defect, completed recovery check, or confirmed false alarm. | Closure note with evidence. | Follow-up owner if signal or runbook needs repair. |

## Impact

| Field | Required content |
| --- | --- |
| Affected users or tenants | Count, segment, region, tier, or unknown with owner to quantify. |
| Affected services or workflows | User-facing action, API, job, data path, dependency, or control plane. |
| Duration | Start, mitigation, recovery, and monitoring window. |
| User impact | Unavailable action, errors, latency, degraded fallback, incorrect result, support load, or no confirmed impact. |
| Data impact | Data sets, records, freshness, correctness, loss, duplication, corruption, or reason not applicable. |
| Security/privacy exposure | Exposure evidence, suspected exposure, ruled-out exposure, or reason not applicable. |
| SLO/error budget | Metric impact, threshold, burn, or not applicable. |
| Blast radius | Components, tenants, regions, accounts, jobs, dependencies, or downstream systems plausibly affected. |
| Confirmed non-impact | Areas checked and ruled out. |

## Timeline

Record concrete timestamps in chronological order. Include detection, triage,
severity changes, containment, mitigation, rollback or forward-fix decisions,
verification, communication, root-cause milestones, follow-up assignment, and
closure.

| Time | Phase | Event | Evidence |
| --- | --- | --- | --- |
| Timestamp with timezone | Detect, triage, contain, mitigate, rollback, verify, communicate, RCA, close, or follow-up. | What happened and who owned it. | Alert, dashboard, log, command, trace, support report, audit record, artifact, or owner note. |

## Containment And Mitigation Evidence

| Field | Required content |
| --- | --- |
| Containment actions | Steps that stopped spread, preserved evidence, froze risky paths, isolated access, blocked traffic, or reduced blast radius. |
| Mitigation actions | Rollback, failover, flag disablement, capacity change, circuit breaker, queue pause, restore, credential revocation, data repair, fallback, or forward-fix. |
| Why this action | Fastest safe path, reversibility, blast-radius reasoning, and rejected alternatives. |
| Mitigation evidence | Metrics, logs, traces, command output, dashboards, synthetic checks, user-path checks, data samples, audit records, or owner confirmations proving impact is reduced. |
| Verification window | Time range and signal proving mitigation is holding under meaningful traffic or data/security checks. |
| Remaining active impact | What still fails, for whom, and who owns it. |

## Communication Log

| Time | Audience | Channel | Message summary | Owner | Next update |
| --- | --- | --- | --- | --- | --- |
| Timestamp with timezone | Internal responders, executives, support, users, customers, regulators, or not applicable. | Incident channel, pager, status page, ticket, email, support macro, restricted security channel, or tracker. | Status, impact, action, evidence, caveat, approval, and redaction boundary. | Communications owner or delegate. | Timestamp, trigger, resolved, or not applicable. |

## Rollback And Recovery

| Field | Required content |
| --- | --- |
| Rollback or failover option | Deploy rollback, config revert, feature flag, traffic shift, backup restore, job pause, credential rotation, or not applicable. |
| Decision | Executed, prepared, rejected, blocked, or forward-fix selected. |
| Owner | Person, agent, worker, on-call, or team accountable. |
| Trigger | Metric, user impact, security/data signal, failed fix, timeout, or reviewer decision that activates rollback. |
| Expected effect | Impact expected to stop or risk expected to reduce. |
| Backout plan | How to reverse the mitigation if it causes worse impact. |
| Verification signal | Metric, log, synthetic check, data sample, audit record, or user-path proof. |

## Root Cause

| Field | Required content |
| --- | --- |
| Root-cause status | Confirmed, suspected, unknown, or not applicable for false alarm. |
| Narrowed cause | File, deploy, config, schema, migration, data job, dependency, account action, alert rule, infrastructure state, process gap, or runtime condition. |
| Evidence for cause | Source reads, command output, logs, traces, metrics, payloads, audit records, data samples, Code RAG, CodeGraph, or support reports. |
| Ruled-out hypotheses | Alternatives checked and evidence that ruled them out. |
| Contributing factors | Missing guard, weak alert, risky rollout, stale runbook, dependency behavior, capacity gap, data validation gap, security control gap, or review miss. |
| Why existing guard missed it | Test, monitor, alert, dashboard, runbook, review, permission, data validation, or rollout gap. |
| Unknowns | Facts not proved, confidence impact, owner, and next evidence action. |

## Follow-Ups

Each follow-up must prevent recurrence, improve detection, reduce blast radius,
improve rollback or recovery, strengthen security/data controls, or capture
learning where future responders will read it.

| ID | Action | Type | Owner | Due or trigger | Verification | Residual risk |
| --- | --- | --- | --- | --- | --- | --- |
| INC-001 | Concrete action item. | Prevent, detect, recover, contain, communicate, or learn. | Responsible role. | Date, release, metric trigger, recurring failure, or dependency change. | Command, monitor, alert, runbook update, test, reviewer check, audit record, or artifact. | Risk if not done before closure. |

## Learning Capture

| Surface | Update required | Owner | Evidence |
| --- | --- | --- | --- |
| Runbook | New or changed response step, rollback path, escalation, or false-alarm closure rule. | Owner. | Path, ticket, or not applicable with reason. |
| Monitor or alert | Threshold, coverage, routing, severity, dashboard, or synthetic check change. | Owner. | Link, command, or not applicable with reason. |
| Test or validator | Regression, data validation, security check, rollback proof, or SLO guard. | Owner. | Command, PR, or not applicable with reason. |
| Project memory or handoff | Compressed learning, postmortem link, action-item owner, or next-worker context. | Owner. | Memory path, handoff path, or not applicable with reason. |
| Status/support process | Customer communication, support macro, disclosure, or support owner update. | Owner. | Path, ticket, or not applicable with reason. |

## Residual Risk

Record each remaining risk separately.

| Risk | Impact | Owner | Trigger | Next action |
| --- | --- | --- | --- | --- |
| Remaining user, data, security, reliability, support, detection, rollback, or knowledge risk. | User, data, security, compliance, reliability, release, support, or developer impact. | Responsible role. | Date, metric, alert, user report, audit event, dependency change, failed validator, or recurring incident. | Concrete mitigation, follow-up, review, or accepted-risk note. |

## Closure Checklist

- Incident type is production incident, security incident, degraded service,
  data issue, or false alarm, with evidence.
- Severity, owner, impacted surface, communication cadence, and escalation path
  are recorded.
- Timeline covers detection, triage, containment, mitigation, verification,
  communication, rollback or forward-fix decision, root-cause status, and
  closure.
- Impact records users, services, data, security/privacy, duration, blast
  radius, SLO/error budget, and confirmed non-impact where relevant.
- Mitigation evidence directly matches the original impact and shows recovery is
  holding through the agreed verification window.
- Rollback, failover, restore, feature disablement, or forward-fix decision has
  owner, trigger, expected effect, backout plan, and verification signal.
- Root cause is confirmed, suspected, or unknown with evidence and unknowns.
- Follow-ups have owner, due date or trigger, verification method, and residual
  risk.
- Learning capture updates runbook, monitor, alert, test, project memory,
  support/status process, or records why each is not applicable.
- Residual risk names owner, trigger, and next action.
