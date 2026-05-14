---
name: incident-response
namespace: process
description: >-
  Use when a production incident, security incident, degraded service, data
  issue, false alarm, on-call page, outage drill, or tabletop exercise needs to
  drive severity triage, containment, mitigation, rollback, communication,
  root-cause analysis, follow-up ownership, and learning capture.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites: []
emits-artifact: incident-report
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-14T00:00:00.000Z
---

# Incident Response

## Overview

Incident Response stabilizes live reliability, security, and data-integrity
events before deeper analysis. It separates severity triage, containment,
mitigation, communication, rollback, root cause, follow-up, and learning capture
so the response does not turn into an unstructured debugging session.

This skill emits an `incident-report` using
`references/templates/incident-report.md`. The report is incomplete until it
names the incident type, severity, owner, timeline, impact, containment or
mitigation evidence, communication record, rollback path, root-cause status,
follow-ups, and residual risk.

## When to Use

- Use for a production incident: live service outage, failed deploy, broken
  critical workflow, infrastructure failure, or release-caused regression.
- Use for a security incident: suspected exploit, unauthorized access, secret
  exposure, account takeover, suspicious privilege change, data exposure, or
  tampering signal.
- Use for a degraded service: elevated latency, high error rate, missing worker
  capacity, partial dependency failure, queue backlog, or SLO breach where the
  service is still partially usable.
- Use for a data issue: stale, missing, duplicated, corrupted, misrouted, or
  incorrectly migrated data, especially when writes or repairs could worsen the
  blast radius.
- Use for a false alarm only long enough to prove there is no active impact,
  close the alert with evidence, and capture any alert or runbook follow-up.
- Use during drills and tabletop exercises when the response must practice
  severity rules, roles, communication cadence, rollback, and learning capture.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Source-of-truth preflight

Before changing systems or declaring resolution, read and record:

- Incident channel, pager alert, user report, dashboard, log query, trace,
  status page, support ticket, or other original symptom source.
- Affected service, environment, tenant or customer segment, release, feature
  flag, data path, dependency, region, and current owner or on-call escalation.
- Recent deploys, config changes, feature-flag changes, migrations, dependency
  changes, cron jobs, and infrastructure events in the suspected time window.
- Runbooks, rollback instructions, feature-flag kill switches, failover paths,
  backup or restore instructions, and security escalation policy for the
  affected surface.
- For security or data events, preservation needs before destructive cleanup:
  logs, snapshots, audit trails, hashes, access records, affected data IDs, and
  redaction requirements.
- For non-trivial Supervibe work, project memory plus Code RAG/code search and
  CodeGraph status or fallback evidence required by repository policy.

If source evidence is missing or access would be unsafe, return `BLOCKED` or
`PARTIAL` with the missing evidence, owner, and safest next action.

## When not to use

- Do not use incident response to bypass the command, reviewer, producer, or
  workflow that owns durable artifacts or runtime-issued receipts.
- Do not use it as a general debugging shortcut when there is no active,
  suspected, or recently resolved production, security, data, degradation, or
  alerting event.
- Do not perform live production writes, data repair, credential rotation,
  account disablement, rollback, failover, or public communication without an
  explicit owner and scope.
- Do not treat a suspected security or data issue as a normal production outage
  when evidence preservation, privacy, compliance, or disclosure restrictions
  apply.
- Do not close a false alarm only because the alert stopped firing; close it
  only after independent evidence shows no user, data, security, or SLO impact.

## Decision tree

```text
Start
  -> Evidence suggests exploit, unauthorized access, secret exposure, privilege
     abuse, suspicious audit event, data exposure, or tampering?
      -> Type: security incident. Preserve evidence, restrict details, escalate
         to security owner, contain access, then continue severity triage.
  -> Evidence shows stale, missing, duplicated, corrupted, misrouted, or
     incorrectly migrated data?
      -> Type: data issue. Freeze risky writes or jobs, snapshot before repair,
         identify affected records, then continue severity triage.
  -> Live users cannot complete a critical production workflow or the service is
     unavailable?
      -> Type: production incident. Prioritize rollback, failover, flag disable,
         or capacity mitigation before deep root-cause work.
  -> Service is usable but slow, error-prone, capacity constrained, or missing
     a non-critical dependency?
      -> Type: degraded service. Mitigate load, retries, capacity, dependency
         isolation, or user-facing fallback while investigating.
  -> Alert or report is contradicted by dashboards, logs, synthetic checks, and
     user-impact evidence?
      -> Type: false alarm. Document the evidence, close with owner approval,
         and add alert/runbook follow-up if signal quality is weak.
```

Severity triage:

```text
SEV1
  Complete outage, critical workflow down for many users, active security
  compromise, confirmed data exposure/loss/corruption, or imminent irreversible
  damage. Mitigate or contain immediately. Communicate at least every 15 min.

SEV2
  Major customer segment affected, repeated errors in an important workflow,
  suspected security exposure, data correctness risk without confirmed loss, or
  sustained SLO breach. Mitigate within 30 min while investigation continues.

SEV3
  Limited degradation, localized data defect, recoverable background failure,
  noisy alert with plausible impact, or internal workaround available. Assign an
  owner, investigate, and mitigate with a bounded timeline.

SEV4
  Internal-only issue, minor operational defect, completed recovery check, or
  confirmed false alarm. Close or schedule follow-up with evidence.
```

Mitigation selection:

```text
Recent deploy or config likely caused it -> rollback, revert config, or disable flag.
Feature isolated by flag or route -> disable feature, gate traffic, or hide action.
Dependency failing -> enable circuit breaker, cache/fallback, retry budget, or failover.
Load/capacity issue -> shed load, scale workers, pause batch jobs, or rate-limit.
Data corruption/staleness -> stop risky writers, snapshot, restore from known-good,
  reconcile records, and verify before resuming writes.
Security compromise -> isolate account/service/host, revoke or rotate scoped secrets,
  block indicators, preserve evidence, and coordinate disclosure owner.
```

## Procedure

1. Declare the incident or alert investigation with an incident ID, owner,
   severity, incident type, affected surface, current status, and next update
   time. Assign incident commander, technical owner, communications owner, and
   scribe when the event is SEV1, SEV2, security, data-related, or user-facing.
2. Create or update an incident report from
   `references/templates/incident-report.md` under
   `.supervibe/artifacts/incidents/YYYY-MM-DD-<slug>.md` unless the active
   workflow requires a different durable artifact path.
3. Triage severity from impact evidence: affected users or tenants, duration,
   SLO or error rate, data or security exposure, availability, revenue/support
   impact, and blast radius. Downgrade only with evidence and owner approval.
4. Contain spread before broad mitigation when security, data, or cascading
   failure is plausible: freeze risky writers, pause jobs, disable flags,
   isolate credentials or hosts, preserve logs/snapshots, block traffic, or
   move traffic away from a bad region.
5. Mitigate the user, data, or security impact with the fastest reversible
   action: rollback, failover, flag disablement, capacity increase, circuit
   breaker, queue pause, data restore, credential revocation, or safe fallback.
6. Verify mitigation is holding with concrete evidence: dashboard recovery,
   alert silence with normal traffic, synthetic or user-path success, log/error
   reduction, queue drain, data reconciliation sample, security audit trail, or
   affected-user confirmation. Keep monitoring through the agreed window.
7. Communicate on the cadence implied by severity. Internal updates must name
   status, impact, owner, action taken, evidence, risks, and next update time.
   External updates must be factual, approved by the communications owner, and
   omit sensitive security, private data, or speculative root-cause details.
8. Decide rollback or forward-fix explicitly. A rollback needs rollback target,
   owner, trigger, expected effect, verification signal, and backout plan. A
   forward-fix needs why rollback is riskier, blast-radius check, and rollback
   fallback if the fix fails.
9. After the event is stable, run root-cause analysis with
   `supervibe:systematic-debugging`: reconstruct the timeline, identify the
   narrow cause, record contributing factors, note ruled-out hypotheses, and
   mark unknowns without pretending certainty.
10. Close the incident only after the report names final status, impact,
    mitigation evidence, owner, communication record, root-cause status,
    follow-ups, residual risk, and verification. For false alarms, record the
    evidence proving no impact and the alert/runbook owner for signal cleanup.
11. Capture learning within 48 hours for SEV1, SEV2, security incidents, data
    issues, repeated degraded-service incidents, or costly false alarms. Update
    runbooks, monitors, alerts, tests, feature-flag defaults, rollback docs,
    project memory, and action-item tracking as required.

## Communication and escalation

- SEV1: incident commander owns decisions; communications owner sends status at
  least every 15 minutes until mitigated, then at the agreed monitoring cadence.
- SEV2: owner sends updates at least every 30 minutes while impact continues.
- SEV3/SEV4: owner records status, next action, and closure evidence in the
  incident channel or tracker.
- Security incident: use restricted channels, avoid exploit details in broad
  updates, coordinate legal/compliance or disclosure owner when exposure is
  plausible, and redact secrets or PII from artifacts.
- Data issue: state affected data sets, time window, write/freeze status,
  reconciliation plan, and user-visible correctness risk.
- False alarm: say what signal fired, what evidence disproved impact, who
  approved closure, and what alert or runbook follow-up remains.

## Root cause and follow-up standard

- Root cause must be evidence-backed and narrow: file, deploy, config, schema,
  dependency, account action, data job, alert rule, process gap, or runtime
  condition. If unknown, label it `unknown` and record the next evidence owner.
- Follow-ups must prevent recurrence, improve detection, reduce blast radius,
  improve rollback, strengthen security/data controls, or improve response
  learning. Do not create action items that only restate completed mitigation.
- Every follow-up needs owner, due date or trigger, verification method, and
  residual risk if it is not completed before closure.
- Learning capture must update the durable place future responders will read:
  runbook, monitor, alert, test, project memory, status page playbook, data
  repair checklist, security response note, or rollback procedure.

## Common rationalizations

- "It looks like a false alarm because the graph recovered" fails until logs,
  synthetic checks, traffic volume, and user-impact evidence confirm no active
  impact.
- "We need root cause before rollback" fails for SEV1/SEV2 when a reversible
  rollback, flag disablement, failover, or containment action can reduce harm
  faster than investigation.
- "It is only a data issue, not an incident" fails when stale, corrupt,
  missing, duplicated, or misrouted data can affect users, decisions, billing,
  security, compliance, or downstream systems.
- "Security can be handled like a normal outage" fails because evidence
  preservation, access containment, redaction, disclosure, and privacy duties
  change the response path.
- "The fix shipped, so follow-ups are optional" fails when monitors, tests,
  runbooks, ownership, rollback, or learning capture would have reduced impact
  or detection time.

## Red flags

- SEV1/SEV2 response spends time debating root cause while no owner is applying
  rollback, failover, feature disablement, containment, or user-impact
  mitigation.
- Security or data evidence is deleted, overwritten, publicly posted, or
  repaired without preserving logs, snapshots, audit trails, affected IDs, and
  an owner-approved containment plan.
- The incident has no named owner, communications cadence, next update time, or
  distinction between active impact, mitigated, monitoring, resolved, and false
  alarm.
- Resolution is declared from a single green metric while traffic is low, logs
  still show errors, queues remain backlogged, data has not been reconciled, or
  affected-user checks were skipped.
- Follow-ups have no owner, due date, verification method, or residual-risk
  statement.

## Checklist

- Source symptom, dashboards, logs, deploy/config changes, runbooks, and
  escalation path were read and cited.
- Incident type is one of production incident, security incident, degraded
  service, data issue, or false alarm, with evidence and severity rationale.
- Owner, commander when needed, technical owner, communications owner, and
  scribe are named or explicitly not applicable.
- Containment actions and mitigation actions are separated and timestamped.
- Rollback, failover, flag disablement, or forward-fix decision has owner,
  trigger, expected effect, and verification signal.
- Communication updates record audience, channel, cadence, approval, and next
  update time.
- Root-cause status is confirmed, suspected, or unknown with evidence,
  contributing factors, ruled-out hypotheses, and unknowns.
- Follow-ups have owner, due date or trigger, verification method, and residual
  risk.
- Learning capture updates durable memory, runbooks, monitors, tests, or
  rollback/security/data procedures when the incident deserves postmortem work.

## Failure modes

- Postmortem-first response: the team writes analysis while users, data, or
  security remain exposed. Recover by assigning an owner and applying the
  fastest reversible containment or mitigation.
- False resolution: a single alert clears but traffic, error budget, queues,
  data reconciliation, security audit trail, or user checks still show risk.
  Recover by reopening monitoring and naming residual risk.
- Unsafe data repair: a backfill or manual edit overwrites evidence or expands
  corruption. Recover by stopping writers, snapshotting, restoring from a
  known-good state, and reconciling samples before resuming writes.
- Security evidence leak: broad status updates include exploit details, secrets,
  private data, or unapproved attribution. Recover by redacting, moving to a
  restricted channel, and assigning disclosure ownership.
- Ownerless follow-up: action items exist but no one owns detection, prevention,
  rollback, or runbook changes. Recover by blocking closure until owner,
  trigger, due date, and verification are recorded.

## Examples

- A deploy breaks checkout for all production users. Classify as production
  incident SEV1 or SEV2 based on impact, assign roles, rollback or disable the
  feature flag, verify checkout success and error-rate recovery, communicate
  status, then run root cause and add monitor/test/runbook follow-ups.
- A database migration duplicates invoices for a subset of tenants. Classify as
  data issue, freeze the writer, snapshot affected rows, identify the time
  window, reconcile samples, communicate correctness risk, restore or repair
  with owner approval, and track residual billing/support risk.
- A leaked API key appears in logs. Classify as security incident, preserve
  audit evidence, revoke or rotate the scoped key, check access logs for abuse,
  restrict communication details, assign disclosure owner if exposure is
  plausible, and add secret-scanning or logging follow-up.
- Anti-example: an alert fires once during a deploy and clears. Do not close it
  as a false alarm until traffic, synthetic checks, logs, dashboards, and user
  impact evidence show no active incident and the owner approves closure.

## Output contract

Return an `incident-report` with these fields:

- `status`: `ACTIVE`, `MITIGATED`, `MONITORING`, `RESOLVED`, `FALSE_ALARM`,
  `PARTIAL`, or `BLOCKED`.
- `incidentType`: production incident, security incident, degraded service, data
  issue, or false alarm.
- `severity`: SEV1, SEV2, SEV3, or SEV4 with impact-based rationale and update
  cadence.
- `timeline`: timestamped detection, triage, containment, mitigation, rollback
  or forward-fix decision, verification, communication, root-cause, and closure
  events.
- `impact`: affected users, tenants, services, data sets, security exposure,
  duration, SLO or error-budget effect, support/revenue risk, and confirmed
  non-impact areas.
- `containment`: actions that stopped spread, preserved evidence, froze risky
  paths, isolated access, or reduced blast radius.
- `mitigationEvidence`: exact metrics, logs, traces, commands, dashboards,
  synthetic checks, user-path checks, data samples, audit records, or owner
  confirmations proving mitigation is holding.
- `owner`: incident commander or response owner plus technical,
  communications, security/data, and follow-up owners when applicable.
- `communications`: audiences, channels, message summaries, approval owner,
  next update time, external-status decision, and redaction boundary.
- `rollbackPlan`: rollback, failover, flag disablement, restore, forward-fix,
  or backout plan with trigger, owner, and verification signal.
- `rootCause`: confirmed, suspected, or unknown cause with evidence,
  contributing factors, ruled-out hypotheses, and remaining unknowns.
- `followUps`: action items with owner, due date or trigger, verification method,
  and whether each prevents, detects, recovers, or captures learning.
- `learningCapture`: runbook, monitor, alert, test, project memory, rollback,
  data repair, or security procedure updates completed or assigned.
- `residualRisk`: remaining user, data, security, reliability, support, or
  detection risk with owner, trigger, and next safe action.
- `artifactPath`: path to the incident report or postmortem artifact, or blocker
  explaining why it could not be written.
- `confidence`: confidence score and boundary, kept below gate when source,
  mitigation, verification, or owner evidence is partial.

## Guard rails

- Do not investigate SEV1/SEV2 root cause before assigning an owner and applying
  the fastest safe containment or mitigation.
- Do not declare `RESOLVED` without monitoring or verification evidence that
  matches the incident type and original impact.
- Do not perform destructive data repair, account changes, credential rotation,
  rollback, or public communication without a named owner and rollback or
  evidence-preservation plan.
- Do not disclose secrets, private user data, exploit details, or speculative
  attribution in broad incident updates.
- Do not skip the incident report for SEV1, SEV2, security incidents, data
  issues, repeated degraded-service incidents, or costly false alarms.
- Always distinguish containment from mitigation and mitigation from root cause.
- Always include timeline, impact, mitigation evidence, owner, follow-ups, and
  residual risk in the output.

## Verification

- Incident mitigation is verified by monitoring, logs/traces, synthetic or
  user-path checks, data reconciliation samples, security audit evidence, or
  owner confirmation that directly matches the original impact.
- Incident report exists at the agreed artifact path, or the blocker and owner
  are recorded.
- Follow-ups are tracked with owner, due date or trigger, verification method,
  and residual risk.
- For this skill and template, run `npm run validate:skill-content-quality` and
  `npm run validate:artifact-links`.

## Related

- `supervibe:systematic-debugging` - root-cause analysis after mitigation holds.
- `supervibe:verification` - evidence-backed validation of recovery checks.
- `supervibe:feature-flag-rollout` - kill switch, rollout, and rollback paths.
- `supervibe:source-driven-development` - source evidence and official-doc
  handling for external services.
- `references/templates/incident-report.md` - durable incident output template.
- `references/templates/postmortem.md` - deeper blameless postmortem for
  non-trivial follow-up analysis.
