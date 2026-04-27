---
name: incident-response
namespace: process
description: "Use WHEN production is broken (outage, data issue, security event) to triage, mitigate, root-cause, and write postmortem with timeline and action items"
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Incident Response

## When to invoke

WHEN production is broken: outage, data corruption, security event, user-facing degradation, on-call page. Or simulating drill / tabletop.

This skill prioritizes mitigation > investigation > postmortem (in that order, time-pressured).

## Step 0 — Read source of truth (MANDATORY)

1. Read incident channel / pager / monitoring dashboard for the symptom
2. Read recent deploys (`git log --since='2 hours ago'`)
3. Read `runbooks/` for the affected service
4. Identify on-call escalation path

## Decision tree

```
Severity?
├─ SEV1 (everything down, data loss imminent) → mitigate FIRST, investigate after
├─ SEV2 (partial outage, customer-facing) → mitigate within 30 min, investigate in parallel
├─ SEV3 (degradation, minor) → investigate first, mitigate as RCA found
└─ SEV4 (internal-only) → schedule for normal hours

Mitigation options (SEV1/2):
├─ Roll back recent deploy → fastest if cause is recent
├─ Failover to replica → if database/region issue
├─ Disable feature flag → if isolatable to feature
├─ Scale up → if load-related
└─ Enable circuit breaker → if downstream issue
```

## Procedure

1. **Acknowledge** — declare incident, assign roles (commander, comms, scribe)
2. **Severity classification** (decision tree)
3. **Mitigate** (SEV1/2 only) — apply fastest fix, communicate to stakeholders
4. **Investigate** — `evolve:systematic-debugging` for root cause
5. **Verify mitigation holding** — monitoring shows recovery
6. **Communicate resolution** — close incident in channel/pager
7. **Postmortem** — within 48h, write `docs/postmortems/YYYY-MM-DD-<incident>.md`:
   ```markdown
   # Postmortem: <Title>

   **Date:** YYYY-MM-DD
   **Duration:** <start> to <end> (X minutes)
   **Severity:** SEV1/2/3/4
   **Author:** <name>

   ## Summary
   <2-3 sentences: what happened, impact, resolution>

   ## Timeline
   - HH:MM — <event>
   - HH:MM — <event>

   ## Root cause
   <technical explanation>

   ## Detection
   <how was it noticed; could it have been detected earlier?>

   ## Mitigation
   <what stopped the bleeding>

   ## Action items
   - [ ] <prevent recurrence> — owner — due
   - [ ] <improve detection> — owner — due
   - [ ] <improve runbook> — owner — due

   ## What went well / poorly
   <blame-free retrospective>
   ```
8. **Score** — `evolve:confidence-scoring` agent-output ≥9
9. **Update runbooks / monitors / alerts** per action items

## Output contract

Returns:
- Incident timeline
- Mitigation applied + verification
- Postmortem file
- Action items with owners

## Guard rails

- DO NOT: investigate before mitigating SEV1/2 (lose minutes = lose users)
- DO NOT: blame individuals (postmortems are blame-free)
- DO NOT: mark resolved without verification monitoring shows recovery
- DO NOT: skip postmortem (incident without postmortem = will recur)
- ALWAYS: timeline with timestamps
- ALWAYS: action items have owner + due date

## Verification

- Mitigation verified by monitoring (graph/metric showing recovery)
- Postmortem file exists within 48h
- Action items tracked

## Related

- `evolve:systematic-debugging` — invoked for root-cause investigation
- Phase 3 `devops-sre` agent — primary user
- `evolve:adr` — for architectural changes resulting from postmortem
