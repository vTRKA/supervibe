---
name: prd
namespace: process
description: "Use BEFORE building any user-facing feature to write a Product Requirements Document framing problem, users, solution, success metrics, and out-of-scope. RU: Используется ПЕРЕД сборкой любой user-facing фичи — пишет Product Requirements Document с проблемой, пользователями, решением, success-метриками и out-of-scope. Trigger phrases: 'PRD', 'продуктовая спецификация', 'product requirements', 'оформи PRD'."
allowed-tools: [Read, Grep, Glob, Write, Edit]
phase: brainstorm
prerequisites: []
emits-artifact: requirements-spec
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Product Requirements Document (PRD)

## When to invoke

BEFORE building any user-facing feature with explicit business value. Use when product-manager or systems-analyst agent is involved.

NOT for: internal refactors, infra changes, dev tooling.

## Step 0 — Read source of truth (MANDATORY)

1. Read project's `docs/prd/` for prior PRDs (numbering, format)
2. Read existing user docs / marketing pages (vocabulary, positioning)
3. Read analytics if available (current behavior baseline)
4. Read related specs in `docs/specs/`

## Decision tree

```
Feature scope?
├─ Single user-facing change → lightweight PRD (1 page)
├─ Multi-screen flow → full PRD (2-4 pages) with user journey diagram
└─ New product area → comprehensive PRD with market context, competitive analysis
```

## Procedure

1. **Find next PRD number** in `docs/prd/`
2. **Write PRD** at `docs/prd/NNNN-<feature>.md`:
   ```markdown
   # PRD-NNNN: <Feature Name>

   **Status:** DRAFT | REVIEW | APPROVED | IMPLEMENTED
   **Date:** YYYY-MM-DD
   **Author:** <product-manager>
   **Stakeholders:** <list>

   ## Problem
   <whose problem, when, what's the cost of inaction>

   ## Users
   - Primary persona: <who, JTBD>
   - Secondary personas: <if any>

   ## Solution
   <what we're building, key flows>

   ## Success metrics
   - Quantitative: <metric + target + timeframe>
   - Qualitative: <user feedback signals>

   ## Out-of-scope
   - <explicitly NOT building this>

   ## Risks
   - <risk + mitigation>

   ## Dependencies
   - <other teams / systems / decisions>

   ## Open questions
   - <unresolved items, owner>
   ```
3. **Score** — `evolve:confidence-scoring` artifact-type=requirements-spec
4. **Stakeholder review** — explicit approval before status → APPROVED
5. **Handoff** — to `evolve:brainstorming` (technical design) once APPROVED

## Output contract

Returns: PRD file with all sections filled, success metrics measurable, out-of-scope explicit.

## Guard rails

- DO NOT: write Solution before Problem (avoids solution-in-search-of-problem)
- DO NOT: vague success metrics ("users will love it")
- DO NOT: skip Out-of-scope (causes scope creep)
- DO NOT: gold-plate (single-flow features don't need 5-page PRDs)
- ALWAYS: state who's affected and how
- ALWAYS: include measurable success criteria

## Verification

- PRD file at `docs/prd/NNNN-<feature>.md`
- All required sections present
- Success metrics include target + timeframe
- Stakeholder approval recorded

## Related

- `evolve:brainstorming` — technical design after PRD approved
- Phase 3 `product-manager` agent — primary author
- `evolve:adr` — for technical decisions referenced in Solution

## User research grounding

A PRD without user evidence is product-by-vibes. Required input:

- **User personas** (≥2): name, role, top 3 pains, top 3 jobs-to-be-done
- **User research artifacts**: which interview/survey/data informed this? Cite source
- **Competitive landscape**: 3 competitors + what users currently do without our solution

If no research exists: explicitly state "No research conducted; PRD is hypothesis-mode" and add user-research as Phase 0 of the implementation plan.

## Acceptance criteria — Gherkin format

Each requirement gets ≥1 acceptance criterion in Given/When/Then form:

```gherkin
Given a user with verified email
When they request password reset
Then they receive an email within 30 seconds with a single-use token
And the token expires after 15 minutes
And reusing the token returns 410 Gone
```

Vague ACs ("should work well") fail rubric scoring.

## Success metrics matrix

PRD must define how we'll know it worked:

| Metric | Baseline | Target | Measurement | Trigger if missed |
|--------|----------|--------|-------------|-------------------|
| <name> | <today> | <goal> | <how we measure> | <action> |

≥3 metrics. At least one is a leading indicator (early signal), one is a lagging indicator (business impact).

## Deprecation plan (when applicable)

If the PRD adds a feature that replaces an existing one:

- **Deprecation timeline**: when does old feature go behind a flag? When removed?
- **Migration path**: how do existing users move?
- **Communication plan**: in-product banner / email / docs?

If no deprecation: explicitly state "No deprecation — additive feature only".

## Launch checklist

Before launch (Phase N+1 of plan), verify:
- [ ] Acceptance criteria all met
- [ ] Success metrics instrumentation deployed
- [ ] Documentation updated (user-facing + internal)
- [ ] Support team briefed
- [ ] Rollback procedure tested in staging
- [ ] Feature flag (if applicable) configured for staged rollout
- [ ] Monitoring/alerting wired

## Instrumentation plan

What events do we emit? What dashboards do we add? Required input from `evolve:_product:analytics-implementation`:

- **Tracked events**: <list with properties>
- **Dashboards**: <which existing dashboards add this; which new ones create>
- **Alerts**: <thresholds and oncall routing>

If feature is non-instrumented: explicitly state "No instrumentation needed" with reason.

## Risk register

Same format as plans:
- **R1 (severity: high)**: <description>; mitigation: <how>
- **R2 (severity: medium)**: ...

≥3 risks. ≥1 must be product/UX risk (not just technical).

## Output contract template

Save PRDs to `docs/specs/YYYY-MM-DD-<feature>-prd.md`. Use template at `docs/templates/PRD-template.md`.

Required sections (in order):
1. **TL;DR** (3 sentences max)
2. **Problem** (with user research grounding)
3. **Users** (personas)
4. **Competitive landscape**
5. **Goals** (success metrics)
6. **Non-goals**
7. **User stories with acceptance criteria** (Gherkin)
8. **Solution overview** (high-level; details in design doc)
9. **Risks**
10. **Deprecation plan** (if applicable)
11. **Instrumentation plan**
12. **Launch checklist**
13. **Open questions**
14. **Appendix: data, screenshots, references**

## Anti-patterns

- **No user research grounding** → PRD is hypothesis disguised as fact
- **Vague acceptance criteria** ("works smoothly") → can't test, can't gate
- **Success metrics without baseline** → can't tell if we improved
- **Missing leading indicator** → can't course-correct early
- **No deprecation plan** for replacement features → tech debt accumulates
- **Empty risk register** → didn't think hard enough; risks always exist
- **Non-quantitative non-goals** ("not for advanced users") → scope creep waiting to happen
- **No instrumentation plan** → can't measure success metrics post-launch

## Common workflows

### Workflow: New feature PRD

1. Pull user research from existing repo or do new (interview 5 users)
2. Define personas + competitive landscape
3. Goals + non-goals
4. User stories with Gherkin ACs
5. Solution overview (defer details)
6. Risks + deprecation + instrumentation + launch
7. Open questions (mandatory non-empty)

### Workflow: Replacement feature PRD

1. Same as new + heavy deprecation plan
2. Migration path explicit per user segment
3. Sunset timeline with named milestones
4. Communication plan with channel mix

### Workflow: Internal tool PRD

1. Skip competitive landscape
2. Personas are internal (which team / role)
3. Success metrics are operational (time saved, error rate)
4. Instrumentation lighter (logs > dashboards)

## Verification

- PRD saved to `docs/specs/YYYY-MM-DD-<feature>-prd.md`
- All 14 sections present
- ACs in Gherkin format with ≥1 per user story
- Success metrics: ≥3, with baseline + target
- Risk register: ≥3 entries
- Open questions: non-empty
- Confidence rubric: `requirements`; score ≥ 9

## Related

- `evolve:requirements-intake` — predecessor (intake → research → PRD)
- `evolve:writing-plans` — consumer (PRD → implementation plan)
- `evolve:adr` — design decisions called out separately from PRD
- `evolve:_product:product-manager` — primary author
- `evolve:_product:systems-analyst` — collaborator on ACs
- `evolve:_product:analytics-implementation` — collaborator on instrumentation
