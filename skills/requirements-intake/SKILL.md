---
name: requirements-intake
namespace: process
description: "Use BEFORE any new feature, bug fix, or refactor request to capture requirements with stack-aware questions and decide complexity routing (brainstorm vs plan vs exec). RU: Используется ПЕРЕД любым запросом на новую фичу/фикс/рефактор — собирает требования через stack-aware вопросы и определяет маршрут по сложности (brainstorm vs plan vs exec). Trigger phrases: 'requirements', 'intake', 'формализуй задачу', 'собери требования'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: brainstorm
prerequisites: []
emits-artifact: requirements-spec
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Requirements Intake

## When to invoke

BEFORE any new feature/bug/refactor request enters the workflow. This is the entry-gate that decides what skill chain to invoke next.

Triggered when user says: "add X", "fix Y", "refactor Z", "let's build N".

## Step 0 — Read source of truth (required)

1. Read project state (Glob package.json/composer.json/Cargo.toml — detect stack)
2. Read `CLAUDE.md` for project conventions
3. Read `MEMORY.md` for prior preferences/feedback
4. Identify which `questionnaires/*.yaml` apply to detected stack
5. Read `docs/references/scope-safety-standard.md` and apply the Scope Safety Gate before any route decision

## Decision tree (output: which skill to invoke next)

```
Estimated complexity (1-10 scale):
├─ ≥7 → invoke supervibe:brainstorming (full design exploration)
├─ 3-6 → invoke supervibe:writing-plans directly (skip brainstorm)
└─ ≤2 → invoke supervibe:executing-plans directly with single-task plan
                  (only after triviality confirmed via verification)

Complexity signals:
├─ Multi-subsystem touch              → +3
├─ New domain concept                 → +3
├─ External integration               → +2
├─ Schema/migration change            → +2
├─ Crosses ≥3 files                   → +1
├─ Behavior change (vs additive)      → +1
└─ Unknowns / spike                   → +2
```

## Procedure

1. **Stack discovery** (Step 0)
2. **Initial scope reading** — what is the user actually asking?
3. **Load questionnaires** — pull questions matching detected stack and request type
4. **Scope Safety Gate** - separate requested/core scope from optional extras; classify additions as include/defer/reject/spike and explain harmful additions before they enter the backlog.
5. **Ask one question at a time** — multiple-choice when possible
6. **Build requirements-spec** with: objective, scope (in/out), Scope Safety Gate, acceptance criteria, edge cases, stakeholders, complexity score
7. **Confidence-score** the spec (`supervibe:confidence-scoring` artifact-type=requirements-spec)
8. **Machine-validate intake artifact** — run `node "$CLAUDE_PLUGIN_ROOT/scripts/validate-spec-artifacts.mjs" --file docs/specs/YYYY-MM-DD-<topic>-intake.md`. If it fails, fix missing sections/questions before handoff.
9. **If <9** → continue questioning to fill gaps; loop until ≥9
10. **Compute complexity** using signals table above
11. **Decide handoff**: brainstorming / writing-plans / executing-plans
12. **Announce decision** to user with reasoning, including why deferred or rejected additions are not being built now

## Output contract

Returns:
- requirements-spec saved to `docs/specs/YYYY-MM-DD-<topic>-intake.md`
- complexity-score (1-10) with justification
- scope-safety decision table with include/defer/reject/spike rationale
- next-skill recommendation with reason
- list of asked questions and answers

## Guard rails

- DO NOT: ask multiple questions in one message
- DO NOT: assume complexity is low to skip brainstorm — be honest
- DO NOT: invent acceptance criteria the user didn't agree to
- DO NOT: route to executing-plans without verifying triviality (re-read change scope)
- DO NOT: silently accept optional features, protocol parity, or polish work without outcome evidence and a tradeoff
- ALWAYS: stack-aware (load relevant questionnaires)
- ALWAYS: gate ≥9 before handoff
- ALWAYS: explain when "not adding this now" protects the user's project

## Verification

- Spec file exists with complexity score
- `node "$CLAUDE_PLUGIN_ROOT/scripts/validate-spec-artifacts.mjs" --file <spec>` exits 0
- Scope Safety Gate lists included, deferred, rejected, or spiked additions with evidence and complexity cost
- Score ≥9 recorded
- Next-skill recommendation is one of: brainstorming, writing-plans, executing-plans

## Related

- `supervibe:brainstorming` — invoked when complexity ≥7
- `supervibe:writing-plans` — invoked when complexity 3-6
- `supervibe:executing-plans` — invoked when complexity ≤2
- `questionnaires/` (Phase 5) — source of stack-aware questions

## User persona elicitation (required)

Before solution discussion, elicit ≥2 personas:

For each persona ask:
1. **Role / context**: where are they when using this?
2. **Top 3 pains** they currently have (concrete, not abstract)
3. **Top 3 jobs-to-be-done** they're trying to accomplish
4. **Current workaround**: what they do today without our solution
5. **Switching cost**: what makes them try a new solution

If user can't articulate personas: that's a finding — flag "no clear user defined" as Risk #1.

## Constraint elicitation (required)

Probe for hard constraints BEFORE designing:

| Constraint type | Question to ask |
|-----------------|-----------------|
| Time | When do you need this delivered? Hard deadline or flexible? |
| Budget | Cost ceiling? Open-source vs. paid OK? |
| Team capacity | Who builds this? Available hours/week? |
| Compliance | Regulatory requirements (GDPR / SOC2 / HIPAA)? |
| Tech stack | Existing system constraints (must use Postgres? Must run on AWS?) |
| Performance | SLO / latency / throughput targets? |
| Localization | Languages / regions to support? |
| Accessibility | WCAG level required? |

Document each as: "Constraint: <name>; Value: <hard limit>; Source: <user / regulation / system>".

If no constraint stated: write "no constraint communicated" — don't assume.

## Success criteria definition (mandatory before solution)

Force user to define "done" before discussing how:

- **Outcome metrics**: what changes for the user when this works?
- **Adoption signals**: how do we know users use it? (e.g., "30% of MAU within 6 weeks")
- **Quality bar**: what makes it "good enough" vs. "great"?

If user says "I'll know when I see it": still document this as success criterion = "user satisfaction (subjective)" + risk = "subjective bar invites scope creep".

## Out-of-scope elicitation

Ask explicitly:
- "What's NOT in scope here?"
- "What could we add but shouldn't?"
- "What's the line we won't cross?"

Document. Forces honesty about boundaries.

## Stakeholder identification

Beyond the user requesting:
- **Decision approvers**: who signs off?
- **Affected parties**: who else's work changes?
- **Subject matter experts**: who has knowledge we'll need?
- **End users** (if different from requester): who actually uses this?

## Open questions register

End every intake with explicit "Open questions" section. Required ≥3. If you can't think of 3: ask user "what am I missing?".

## Output contract template

Save intake notes to `docs/specs/YYYY-MM-DD-<topic>-intake.md`. Use template at `docs/templates/intake-template.md`.

Required sections:
1. **Request as stated by user** (verbatim quote)
2. **Restated in our words** (with confirmation)
3. **Personas** (≥2)
4. **Constraints** (table)
5. **Success criteria**
6. **Out of scope**
7. **Scope Safety Gate**
8. **Stakeholders**
9. **Open questions** (≥3)
10. **Suggested next step**: brainstorm / PRD / ADR / direct implementation

## Anti-patterns

- **Skip persona elicitation** → designing for nobody specific
- **Assume constraints** → discover hard limits during execution
- **Define solution before success criteria** → can't tell when done
- **No "out of scope"** → invites scope creep
- **No Scope Safety Gate** - agents can turn one request into an overbuilt project
- **Single-stakeholder thinking** → adjacent teams blindsided
- **Empty open questions** → didn't probe; you have hidden assumptions
- **Restatement skipped** → misalignment compounds through downstream phases

## Common workflows

### Workflow: Intake from PM

1. Read user request verbatim
2. Restate; confirm
3. Personas (PM usually has these)
4. Constraints (budget / timeline / tech)
5. Success criteria (PM usually has metrics)
6. Out of scope
7. Open questions for design phase
8. Suggest next: PRD

### Workflow: Intake from end-user (no PM)

1. Read request; restate
2. Personas (probe deeper — user might not know how to describe themselves)
3. Constraints (probe with examples)
4. Success criteria (probe with "how would you know it works?")
5. Out of scope
6. Stakeholders (who else affected?)
7. Open questions ≥5 (more uncertainty without PM)
8. Suggest next: brainstorm

### Workflow: Internal tooling intake

1. Skip personas (internal team)
2. Skip competitive landscape
3. Heavy on constraints (existing systems, deploy windows)
4. Success criteria operational (time saved, error rate)
5. Open questions short (less ambiguity)
6. Suggest next: ADR or direct plan

## Verification

- Intake saved to `docs/specs/YYYY-MM-DD-<topic>-intake.md`
- All 9 sections present
- Personas: ≥2
- Constraints: ≥1 per category (or explicit "no constraint")
- Success criteria: ≥3 measurable items
- Open questions: ≥3
- Confidence rubric: `requirements`; score ≥ 9
- Machine validator: `validate-spec-artifacts.mjs --file <spec>` exits 0

## Related

- `supervibe:brainstorming` — successor when intake reveals exploration needed
- `supervibe:prd` — successor when intake is well-defined enough for product spec
- `supervibe:adr` — successor when intake is purely architectural
- `supervibe:_product:product-manager` — collaborator
- `supervibe:_product:systems-analyst` — collaborator on ACs
- `supervibe:explore-alternatives` — for tradeoff matrix when multiple paths exist
- `supervibe:writing-plans` — terminal successor when intake leads directly to plan
- `supervibe:project-memory` — search prior intakes from this project before drafting

## Trap patterns to recognize

User responses that indicate hidden complexity:

- **"Just like X but..."** — they want X with deviations they haven't articulated. Probe each "but".
- **"Should be simple"** — usually isn't. List 3 reasons why it might not be, ask user to confirm none apply.
- **"I'll know it when I see it"** — subjective bar. Document explicitly + add to risk register.
- **"Make it like Stripe / Apple / Linear"** — surface-level analogy, deeper assumptions hidden. Ask: which specific behaviors? Why those products vs others?
- **"For now we just need..."** — flag the implied "later we'll need". Document as Phase 2 scope.

## Output formatting discipline

Intake notes must be **scannable in 60 seconds** by someone who wasn't in the conversation:

- TL;DR at top (3 bullets max)
- Personas / constraints / success in tables (not prose)
- Open questions as numbered list (easier to reply: "1: yes, 2: no, 3: skip")
- Suggest-next-step is a single decisive sentence — not "perhaps consider one of brainstorm/PRD/ADR"

A reader who skips the body and reads only TL;DR + Suggest-next-step should still get the right action.

## Discipline reminder

Intake is **listening**, not problem-solving. If you start designing a solution mid-intake, you've stopped listening and started defending an answer. Catch yourself, write down the half-formed solution as "Open question: should we use X?" and return to elicitation.
