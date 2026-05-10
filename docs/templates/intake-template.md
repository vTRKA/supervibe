# Intake: Billing Export Request

Use this as a canonical intake shape. Keep the artifact short, factual, and decision-oriented; replace the example domain with the user's request only after every section has evidence or a named open question.

**Date:** 2026-05-11
**Requested by:** finance operations lead

---

## Request as stated

> We need a self-serve billing export so finance stops asking engineering for monthly SQL pulls.

---

## Restated in our words

Finance needs a production-safe way to export approved invoice rows without engineering intervention. The first release should solve monthly reconciliation, preserve permission and privacy boundaries, and avoid background-job scope until measured export size requires it.

---

## Personas

### Persona 1
- **Role / context**: Finance admin closing monthly books.
- **Top 3 pains**: waits for engineering, cannot audit manual exports, repeats reconciliation work.
- **Top 3 jobs-to-be-done**: export invoice rows, reconcile payments, share an approved report.
- **Current workaround**: files an engineering request for a manual SQL export.

### Persona 2
- **Role / context**: Support lead answering billing tickets.
- **Top 3 pains**: lacks invoice context, escalates simple questions, risks over-requesting access.
- **Top 3 jobs-to-be-done**: inspect allowed billing data, explain charges, identify permission errors.
- **Current workaround**: asks finance or engineering for a one-off export.

---

## Constraints

| Type | Value | Source |
|------|-------|--------|
| Time | one MVP release cycle | user request |
| Budget | existing stack and test tools only | repository constraint |
| Team | one backend owner plus reviewer | delivery assumption |
| Compliance | approved invoice fields only; no raw payment data | privacy baseline |
| Tech stack | current application stack discovered before planning | repo evidence |
| Performance | 10000-row export completes within 2s in staging | success metric |
| Localization | English CSV headers for the first release | MVP scope |
| Accessibility | permission errors readable by admin UI and support docs | support need |

---

## Success criteria

- Finance admin exports selected invoice rows without engineering help.
- Export contains 100% of approved selected rows and 0 raw secret or payment fields.
- Authorization failures use the documented error path in integration tests.
- Export performance meets the 2s staging budget for 10000 rows or the async queue trigger is explicitly deferred with evidence.

---

## Out of scope

- PDF export, analytics dashboards, and scheduled email delivery.
- Background jobs unless measured export duration exceeds the agreed threshold.
- New billing permissions beyond the finance export permission.

---

## Scope Safety Gate

| Candidate item | Must / Should / Could / Won't | Evidence | Complexity cost | Decision |
|----------------|-------------------------------|----------|-----------------|----------|
| CSV export with approved columns | Must | finance reconciliation job | low | include |
| Role-based authorization error | Must | privacy and support requirement | low | include |
| Async export queue | Could | needed only after performance evidence | medium | defer |
| PDF export | Won't | no current user evidence | high | reject |
| Advanced analytics | Could | separate product value | medium | spike later |

**Recommended scope boundary:** synchronous CSV export with authorization, audit logging, and support-ready errors.
**What we should not add now:** queue operations, PDF layout, scheduled reports, analytics.
**Why not:** each adds support and test surface without evidence that the first user job needs it.
**Tradeoff if user insists:** delivery slows, rollback becomes more complex, and the PRD must add explicit owners, tests, and support paths.

---

## AI/data boundary

| Boundary | Value | Source |
|----------|-------|--------|
| Data agents may read | repository source, tests, docs, generated local metadata | project policy |
| Data agents must not read | secrets, tokens, production payloads, raw customer data | security policy |
| MCP/browser/Figma allowed | local MCP only; browser and Figma disabled unless approved | user request |
| Screenshots allowed | no private screenshots | privacy policy |
| External API calls allowed | public documentation only; no private API mutation | safety policy |
| PII/secrets handling | references only; no raw values in prompts, logs, or fixtures | privacy policy |
| Approval required before | production mutation, credential changes, billing changes, remote writes | repository rules |

---

## Stakeholders

- **Decision approvers**: product owner and engineering lead.
- **Affected parties**: finance, support, security reviewer, release owner.
- **SMEs**: billing backend owner, privacy reviewer.
- **End users**: finance admin and support lead.

---

## Open questions

- Which invoice columns are approved for export?
- Which role or permission grants export access?
- Which timezone defines month filters?
- Who owns support escalation for large-account export failures?

---

## Suggested next step

- [ ] Brainstorm (`supervibe:brainstorming`) when solution options or scope boundaries are still unclear.
- [ ] PRD (`supervibe:prd`) when the user outcome and MVP scope are clear enough to specify.
- [ ] Direct implementation plan (`supervibe:writing-plans`) only when requirements, scope, risks, and verification are already explicit.
