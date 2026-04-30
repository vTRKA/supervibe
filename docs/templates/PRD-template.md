# PRD: <Feature Name>

**Status:** draft | review | accepted | shipped | deprecated
**Author:** <name>
**Date:** YYYY-MM-DD
**Reviewers:** <names>
**Related:** <PRD/ADR/plan refs>

---

## TL;DR

<3 sentences max. What it is. Who it's for. Why now.>

---

## Problem

<1-2 paragraphs. What's broken / missing today, with user evidence.>

**User research grounding:**
- Source: <link / file ref>
- Sample size: <N users>
- Key insight: <quote or finding>

---

## Users

### Persona 1: <name>
- **Role / context**: ...
- **Top 3 pains**: ...
- **Top 3 jobs-to-be-done**: ...
- **Current workaround**: ...

### Persona 2: <name>
(same fields)

---

## Competitive landscape

| Product | What they do | What's good | What's missing |
|---------|--------------|-------------|----------------|

---

## Goals (Success Metrics)

| Metric | Baseline | Target | Measurement | Trigger if missed |
|--------|----------|--------|-------------|-------------------|

(>=3 metrics; >=1 leading + >=1 lagging)

---

## Non-Goals

- ...

---

## AI/Data Boundary

| Data or surface | Allowed for agents/MCPs? | Redaction required | Approval required |
|-----------------|--------------------------|--------------------|-------------------|
| Source code | yes/no | <paths/fields> | <when> |
| Customer/user data | yes/no | <PII fields> | <approver> |
| Figma/design files | yes/no | <hidden layers/assets> | <file/node scope> |
| Browser screenshots | yes/no | <regions to blur> | <when> |
| External APIs/tools | yes/no | <request/response fields> | <tool/action scope> |

**Never share:** <secrets, raw tokens, credentials, production PII, internal URLs, screenshots with private data>.
**Approval boundary:** <which MCP, Figma, browser, network, or remote mutation actions require exact approval>.

---

## User stories with acceptance criteria

### Story 1: <name>
**As a** <persona>, **I want** <goal>, **so that** <benefit>.

**Acceptance criteria** (Gherkin):
```gherkin
Given <precondition>
When <action>
Then <observable outcome>
```

---

## Solution overview

<High-level. Architecture details belong in companion ADR.>

---

## Risks

- **R1 (severity: high)**: <description>; mitigation: <how>

(>=3 entries; >=1 product/UX risk)

---

## Deprecation plan (if applicable)

OR: "No deprecation - additive feature only."

---

## Instrumentation plan

**Tracked events:** <list with properties>
**Dashboards:** <existing + new>
**Alerts:** <thresholds + oncall routing>

---

## Launch checklist

- [ ] Acceptance criteria verified in staging
- [ ] Success metrics instrumentation deployed
- [ ] Documentation updated
- [ ] Support team briefed
- [ ] Rollback procedure tested
- [ ] Feature flag configured
- [ ] Monitoring/alerting wired

---

## Open questions

(>=3, mandatory non-empty)

---

## Appendix

- Data: <links>
- Screenshots: <paths>
- References: <links>
