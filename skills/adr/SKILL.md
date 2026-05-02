---
name: adr
namespace: process
description: "Use WHEN making a non-trivial architectural decision (technology choice, pattern adoption, structural change) BEFORE implementation to record context, decision, consequences, alternatives. RU: Используется КОГДА принимается нетривиальное архитектурное решение (выбор технологии, паттерна, структурное изменение) ПЕРЕД реализацией — фиксирует контекст, решение, последствия, альтернативы. Trigger phrases: 'ADR', 'architecture decision', 'архитектурное решение', 'оформи решение'."
allowed-tools: [Read, Grep, Glob, Write, Edit, Bash]
phase: plan
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Architecture Decision Record (ADR)

## When to invoke

WHEN about to make a decision that:
- Picks one technology over alternatives (e.g., Postgres vs MongoDB)
- Adopts a pattern that constrains future code (e.g., FSD, hexagonal)
- Changes a system boundary (e.g., split service, merge modules)
- Reverses or amends a previous ADR

NOT for: tactical code changes, bug fixes, routine refactors.

## Step 0 — Read source of truth (required)

1. List existing ADRs in `.supervibe/artifacts/adr/` to find the next number
2. Read related code to ground the decision in current state
3. Read related rules in the selected host adapter rules folder for constraints
4. Find latest ADR template version

## Decision tree

```
What status?
├─ Proposed (still discussing) → write as PROPOSED
├─ Accepted (decision made, implementing) → write as ACCEPTED
├─ Superseded (replaced by newer ADR) → mark old as SUPERSEDED, link to new
└─ Deprecated (no longer relevant) → mark as DEPRECATED, keep for history
```

## Procedure

1. **Find next number**: `ls .supervibe/artifacts/adr/ | sort | tail -1` → increment
2. **Create file**: `.supervibe/artifacts/adr/NNNN-<short-title>.md`
3. **Fill template**:
   ```markdown
   # ADR-NNNN: <Title>

   **Status:** PROPOSED | ACCEPTED | SUPERSEDED | DEPRECATED
   **Date:** YYYY-MM-DD
   **Deciders:** <names/roles>

   ## Context
   <2-4 paragraphs: what's the situation, what forces are at play, what triggered this decision>

   ## Decision
   <1-2 paragraphs: what we decided>

   ## Consequences
   ### Positive
   - <consequence 1>
   ### Negative / Tradeoffs
   - <consequence 1>
   ### Neutral
   - <consequence 1>

   ## Alternatives Considered
   ### <Alt 1>
   - Why rejected: ...
   ### <Alt 2>
   - Why rejected: ...

   ## Related
   - ADR-NNNN: ...
   - Spec: .supervibe/artifacts/specs/...
   ```
4. **Score** — `supervibe:confidence-scoring` artifact-type=agent-output
5. **Cross-link** — update related ADRs / rules / the active host instruction file
6. **User approval** — explicit before transitioning status to ACCEPTED

## Output contract

Returns: ADR file path with all sections filled, status declared, alternatives documented.

## Guard rails

- DO NOT: write Decision before Context (forces backwards justification)
- DO NOT: skip Alternatives Considered (the value of an ADR is comparing options)
- DO NOT: amend an ACCEPTED ADR — supersede with new ADR instead
- DO NOT: invent ADRs for trivial decisions
- ALWAYS: number sequentially, never reuse numbers
- ALWAYS: link related ADRs

## Verification

- ADR file exists at `.supervibe/artifacts/adr/NNNN-<title>.md`
- All sections present
- Status field set
- Cross-links updated

## Related

- `supervibe:brainstorming` — may produce an ADR as part of design
- `supervibe:writing-plans` — may reference ADR as design rationale
- `supervibe:strengthen` (Phase 6) — strengthens stale ADRs via researcher consultation

## Alternatives matrix (required)

Every ADR must include ≥3 alternatives — even if obvious:

| Alternative | Pros | Cons | Effort | Risk | Score |
|-------------|------|------|--------|------|-------|
| **A: <chosen>** | ... | ... | ... | ... | <weighted> |
| B: <runner-up> | ... | ... | ... | ... | <weighted> |
| C: <baseline / status quo> | ... | ... | ... | ... | <weighted> |

The "do nothing / keep current" alternative MUST be one of the 3. Explicitly score it.

## Non-functional requirements addressed

What NFRs does this decision touch?

- **Performance**: latency / throughput targets affected (yes/no, how)
- **Scalability**: scaling envelope (handles N× current load? until when?)
- **Reliability**: SLO impact (does this raise/lower availability?)
- **Security**: threat model changes
- **Maintainability**: complexity added/removed
- **Observability**: telemetry requirements
- **Compliance**: regulatory impact (GDPR / SOC2 / etc.)
- **Cost**: monthly/annual delta

For each NFR: state "no impact" or quantify.

## Decision review trigger (required)

Specify when to re-evaluate this ADR:

- **Time-based**: "review in 12 months" or "review after 3 production releases"
- **Metric-based**: "review if p99 latency exceeds 500ms" or "if user count > 100k"
- **Event-based**: "review when stack X migrates to v2.0"

ADRs without review triggers become stale dogma. Trigger forces honesty.

## Consequences — beyond happy path

ADR consequences must include:

- **Positive consequences** (≥2): what we gain
- **Negative consequences** (≥2): what we lose / sacrifice
- **Operational consequences**: runbook changes / oncall impact
- **Migration consequences** (if replacing existing): timeline + path

## Out of scope (required)

What this ADR does NOT decide. Forces clarity on boundary:

- Decisions deferred to future ADRs
- Decisions left to implementation discretion
- Topics intentionally not addressed (with rationale)

## Output contract template

Save ADRs to `.supervibe/artifacts/specs/adr/YYYY-MM-DD-<NNN>-<slug>.md`. Use template at `docs/templates/ADR-template.md`.

Required sections:
1. **Title**: `ADR-NNN: <decision>`
2. **Status**: `proposed | accepted | superseded by ADR-XXX | deprecated`
3. **Context**: why this decision exists now
4. **Decision**: what we chose, in one sentence
5. **Alternatives matrix** (≥3 with scores)
6. **Non-functional requirements** addressed
7. **Consequences** (positive / negative / operational / migration)
8. **Decision review trigger**
9. **Out of scope**
10. **Related ADRs**
11. **References** (links to research / spec / data)

## Anti-patterns

- **Single-alternative ADR** ("we considered nothing else") → ratification, not decision
- **Missing "do nothing"** alternative → can't honestly score the chosen path
- **Vague status** ("kinda accepted") → reader doesn't know if to follow
- **No NFRs section** → decisions made without measuring trade-offs
- **No review trigger** → ADR becomes stale truth no one questions
- **Empty negative consequences** → didn't think hard enough; every choice has costs
- **Conflating PRD and ADR** → PRD = what/why; ADR = how/why-this-way
- **No related ADRs section** → orphan decisions accumulate technical debt
- **Retrofit ADRs** → writing the ADR after the code shipped to justify what was already done
- **Score-by-vibe** → alternatives matrix with no weights, no rubric — scores are unfalsifiable
- **Decision-by-committee mush** → every alternative scored 7/10; pick a winner and own the trade
- **ADR sprawl** → splitting one decision across N ADRs to dodge review; one decision = one ADR

## Common workflows

### Workflow: New architectural decision

1. Read related ADRs first (avoid contradictions)
2. Draft Context (why now)
3. Generate ≥3 alternatives + score matrix
4. Pick decision; write Status: proposed
5. NFR analysis
6. Consequences (positive / negative / operational / migration)
7. Review trigger
8. Out of scope
9. Submit for review (architect-reviewer agent if available)
10. Status → accepted after sign-off

### Workflow: Superseding an old ADR

1. Read old ADR fully + its descendants
2. Draft new ADR with Status: proposed
3. Reference old ADR explicitly
4. Migration path: how do consumers move from old to new
5. Old ADR Status updates to: superseded by ADR-NNN
6. Sunset timeline if old needs removal

### Workflow: Deprecation ADR

1. Status: deprecated
2. Reason for deprecation
3. Recommended replacement (with ADR ref)
4. Migration deadline
5. What breaks if not migrated

### Workflow: Amending without superseding

Use sparingly — only for clarifications that don't change the decision:

1. Add **Amendment N (YYYY-MM-DD)** section at end of ADR
2. State what was clarified (NOT what was reversed)
3. If the decision itself changed → supersede instead
4. Bump `last-verified` date

## Verification

- ADR saved to `.supervibe/artifacts/specs/adr/YYYY-MM-DD-NNN-<slug>.md`
- All 11 sections present
- ≥3 alternatives scored, including "do nothing"
- NFRs addressed (each with "no impact" or quantified)
- Review trigger specific (time / metric / event)
- Consequences include negative + operational
- Confidence rubric: `requirements` (or `framework` for foundational ADRs); score ≥ 9

## Related

- `supervibe:writing-plans` — consumer (ADR → plan if implementation needed)
- `supervibe:prd` — sibling (PRD says what; ADR says how)
- `supervibe:_core:architect-reviewer` — reviewer for sign-off
- `supervibe:explore-alternatives` — sub-skill for the alternatives matrix
- `supervibe:_core:repo-researcher` — pull related ADRs / past decisions
