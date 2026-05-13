---
name: incident-response
namespace: process
description: >-
  Use WHEN production is broken (outage, data issue, security event) to triage,
  mitigate, root-cause, and write postmortem with timeline and action items.
  Triggers: 'incident', 'постмортем', 'упал прод', 'разбор инцидента'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Incident Response

## When to invoke

WHEN production is broken: outage, data corruption, security event, user-facing degradation, on-call page. Or simulating drill / tabletop.

This skill prioritizes mitigation > investigation > postmortem (in that order, time-pressured).

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

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
4. **Investigate** — `supervibe:systematic-debugging` for root cause
5. **Verify mitigation holding** — monitoring shows recovery
6. **Communicate resolution** — close incident in channel/pager
7. **Postmortem** — within 48h, write `.supervibe/artifacts/postmortems/YYYY-MM-DD-<incident>.md`:
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
8. **Score** — `supervibe:confidence-scoring` agent-output ≥9
9. **Update runbooks / monitors / alerts** per action items

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

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

- `supervibe:systematic-debugging` — invoked for root-cause investigation
- Phase 3 `devops-sre` agent — primary user
- `supervibe:prd` — for architectural changes resulting from postmortem
