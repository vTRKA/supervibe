---
name: brainstorming
namespace: process
description: "Use BEFORE any creative work (new feature, component, behavior change) to explore user intent, requirements, and design through collaborative dialogue, ending with an approved spec — gates implementation behind explicit design approval. RU: используется ПЕРЕД любой творческой работой (новая фича, компонент, изменение поведения) — диалог проясняющий намерение, требования, дизайн до утверждённой спецификации; блокирует реализацию до явного утверждения. Trigger phrases: 'давай добавим', 'давай придумаем', 'хочу сделать', 'как подойти к', 'спроектируй', 'обсудим'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: brainstorm
prerequisites: []
emits-artifact: requirements-spec
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Brainstorming

## When to invoke

BEFORE any creative work — creating features, building components, adding functionality, or modifying behavior. Triggered when user says: "let's add X", "I want to build Y", "how should we approach Z", "design a feature for...".

NOT for: bug fixes (use systematic-debugging), routine refactors (skip to writing-plans), documentation tweaks.

## Step 0 — Read source of truth (required)

Before asking any question, read:
- Project's `CLAUDE.md` (architecture, conventions, scope boundaries)
- Most recent commits (`git log -10 --oneline`) for active context
- Any related existing specs in `docs/specs/`
- `MEMORY.md` if exists

Do NOT skip this — uninformed questions waste user time.

## HARD GATE

Do NOT invoke any implementation skill, write any code, scaffold anything until design is approved AND requirements-spec scores ≥9.

## Decision tree

```
Is this multiple independent subsystems?
├─ YES → flag scope; propose decomposition into sub-projects; brainstorm first sub-project only
└─ NO → continue with single brainstorm

Is the user request clear and small (<3 acceptance criteria, single file area)?
├─ YES → minimal brainstorm (1-2 clarifying questions, design in 1 message)
└─ NO → full brainstorm (multiple questions, multi-section design)
```

## Procedure

1. **Context scan** (Step 0)
2. **Scope check** — multi-subsystem? Decompose first.
3. **Clarifying questions** — one at a time, multiple-choice preferred when applicable. Focus: purpose, constraints, success criteria, edge cases.
4. **Stack-aware question loading** — if `questionnaires/*.yaml` matches detected stack, pull relevant questions.
5. **Propose 2-3 approaches** with tradeoffs and your recommendation.
6. **Present design** in sections scaled to complexity (architecture, components, data flow, error handling, testing). Get approval per section.
7. **Write spec** to `docs/specs/YYYY-MM-DD-<topic>-design.md` with: locked decisions, sections, accepted limitations, out-of-scope list.
8. **Self-review spec** — placeholder scan, internal consistency, scope check, ambiguity check. Fix inline.
9. **Score** — invoke `supervibe:confidence-scoring` with artifact-type=requirements-spec; gap remediation if <9.
10. **User review of written spec** — explicit approval required.
11. **Handoff** to `supervibe:writing-plans`.

## Output contract

Returns: path to approved spec at `docs/specs/YYYY-MM-DD-<topic>-design.md` with confidence score ≥9 and explicit user approval recorded in conversation.

After saving the spec, ALWAYS print a one-line hand-off so the user knows the next command:

```
Spec saved to docs/specs/YYYY-MM-DD-<slug>-design.md
Next: /supervibe-plan docs/specs/YYYY-MM-DD-<slug>-design.md  (for complexity 3+)
      or implement directly (for complexity 1-2)
```

## Guard rails

- DO NOT: implement, scaffold, write code before design approved
- DO NOT: ask multi-part questions (one at a time)
- DO NOT: assume the user agrees if they say "ok" — get explicit approval per section
- DO NOT: rubber-stamp confidence ≥9; honestly assess each dimension
- ALWAYS: scale design depth to complexity (3 sentences for trivial, 200-300 words for nuanced)
- ALWAYS: decompose multi-subsystem requests before deep-diving any one

## Verification

This skill's correct application is verifiable by:
- A spec file exists at the documented path
- Spec frontmatter contains date and topic
- User approval is quoted in the conversation immediately before transition to writing-plans
- Confidence-scoring result ≥9 is recorded

## Related

- `supervibe:requirements-intake` — entry-gate that decides if brainstorming is needed
- `supervibe:writing-plans` — the only skill invoked AFTER brainstorming completes

## First-principle decomposition (mandatory before option generation)

Before listing solutions, decompose the problem:

1. **Restate user request in your own words** — confirm understanding
2. **Identify the actual problem behind the request** (5-Whys: ask "why" five times to reach root)
3. **List constraints**: time, budget, team skills, existing tech, compliance
4. **List success criteria**: what makes this "done well"
5. **List failure modes**: what makes this "done poorly" — at least 3 entries
6. **List explicit non-goals**: what we're NOT solving here (prevents scope creep)

Skip this section ONLY if user explicitly says "I just need a quick brainstorm."

## Competitive scan (when applicable)

When the problem has known industry analogues (auth flows, billing, onboarding, design patterns):

1. Invoke `supervibe:mcp-discovery` to check if Firecrawl/Playwright MCP available
2. If yes: scan 3–5 reference products. Take screenshots OR text excerpts.
3. If no MCP: list reference products by name + ask user "have you seen these? what works/doesn't?"
4. Document findings as "Competitive scan" section in output — DO NOT cargo-cult; flag what's stale

Skip if problem is greenfield/internal (no public analogues exist).

## Stakeholder map (mandatory for cross-team work)

Identify who's affected:

| Stakeholder | Concern | Influence (1-5) | Notify when |
|-------------|---------|-----------------|-------------|
| <name>      | <what they care about> | <number> | <decision phase> |

If solo project: skip this step.

## Non-obvious risks enumeration

After option exploration, list ≥3 NON-OBVIOUS risks (not "what could go wrong" — that's table stakes). Examples:
- "If we pick option B, our memory budget on mobile drops by ~40MB; users on 2GB-RAM phones may OOM"
- "Option C requires Postgres 15+; ours is 13; upgrade window is 6 weeks"
- "Option A's vendor recently changed pricing; cost projection assumes old tier — invalid"

These are facts that aren't in the original spec but matter for the decision.

## Kill criteria (mandatory before deciding)

Before committing to an option, write down what would make us KILL the project (not just iterate):
- "If user research shows < 30% interest by week 2, we kill"
- "If integration with existing X breaks invariant Y, we kill"
- "If estimated effort exceeds 6 dev-weeks, we kill"

This forces honesty about the bar.

## Decision matrix

For each finalist option, score on weighted dimensions:

| Dimension | Weight | Option A | Option B | Option C |
|-----------|--------|----------|----------|----------|
| User impact | 3 | 8 | 6 | 9 |
| Effort | -2 | 4 | 2 | 7 |
| Risk | -2 | 3 | 5 | 6 |
| Strategic fit | 2 | 7 | 9 | 5 |
| **Weighted total** | | (calc) | (calc) | (calc) |

Document weights BEFORE scoring (prevents post-hoc rationalization).

## Output contract template

Save brainstorm output to `docs/specs/YYYY-MM-DD-<topic>-brainstorm.md`. Use template at `docs/templates/brainstorm-output-template.md`.

Required sections (in order):
1. **Problem statement** (1 paragraph)
2. **First-principle decomposition** (constraints / success / failure / non-goals)
3. **Competitive scan** (if applicable)
4. **Stakeholder map** (if applicable)
5. **Options explored** (≥3, each with 1 paragraph)
6. **Non-obvious risks** (≥3 bullets)
7. **Kill criteria** (≥2 bullets)
8. **Decision matrix** (table with weights set BEFORE scoring)
9. **Recommended option** (with rationale)
10. **Open questions** (what's still unknown — must NOT be empty)

## Anti-patterns

- **Skip first-principle decomposition** — produces "obvious" solutions that miss real constraints
- **List options without weights** — invites post-hoc rationalization to favor preferred option
- **Skip kill criteria** — leads to sunk-cost projects that should have died at week 2
- **Cargo-cult competitive scan** — copying without understanding why
- **Empty "Open questions"** — means you didn't probe hard enough; SOMETHING is unknown
- **Single-stakeholder thinking** — missing impact on adjacent teams / future maintainers
- **Premature option lock-in** — committing to a solution before exploring alternatives

## Common workflows

### Workflow: New feature brainstorm (greenfield)

1. First-principle decomposition (required)
2. Competitive scan (3 reference products)
3. Stakeholder map
4. Generate ≥3 options (lean on `supervibe:explore-alternatives` for matrix)
5. Risks + kill criteria
6. Decision matrix → recommend
7. Save to `docs/specs/`

### Workflow: Refactor brainstorm (existing system)

1. First-principle decomposition (constraints heavy: existing callers, deploy windows)
2. Skip competitive scan (system-specific)
3. Stakeholder map (existing API consumers)
4. Generate options ranging from "minimal patch" to "rewrite"
5. Risks emphasize regression / rollback
6. Kill criteria: "if migration > 4 weeks, freeze"
7. Decision matrix biased toward low-risk

### Workflow: Brand / design brainstorm

1. First-principle: who is the user, what feeling
2. Competitive scan (mood boards from 5 brands)
3. Skip stakeholder map (creative director is sole owner)
4. Generate 3 directions (with mood boards)
5. Risks: brand misalignment, accessibility issues
6. Kill criteria: "if user testing shows top-2 are equal, we don't pick the riskier"
7. Decision matrix scored by creative director + PM

## Verification

- Output saved to `docs/specs/YYYY-MM-DD-<topic>-brainstorm.md`
- All 10 required sections present
- Decision matrix weights documented BEFORE scores
- ≥3 non-obvious risks listed
- Kill criteria has at least 1 quantitative threshold
- Open questions is non-empty
- Confidence rubric: `requirements` or custom; score ≥ 9

## Related

- `supervibe:writing-plans` — next step after brainstorm picks a direction
- `supervibe:explore-alternatives` — sub-skill for decision matrix
- `supervibe:requirements-intake` — predecessor when intake hasn't happened yet
- `supervibe:adr` — when brainstorm output IS an architectural decision
- `supervibe:mcp-discovery` — for competitive scan tools

## FAQ

**Q: Can I skip the decision matrix if there's only one viable option?**
A: No — if only one option is viable, you haven't brainstormed. Generate at least two
straw-man alternatives ("do nothing", "minimal patch") to make the matrix meaningful.

**Q: What if the user resists structured output?**
A: Honor their preference for the conversation, but still record the decomposition
internally and produce the spec file. The spec is for future maintainers, not the user.

**Q: How do I handle a brainstorm that spans multiple sessions?**
A: Save partial progress to `docs/specs/YYYY-MM-DD-<topic>-brainstorm.md` after each
session. Mark unresolved sections with `TBD: <what's missing>` and surface them at the
top of the file so the next session resumes without re-discovery.

**Q: When should I escalate to `supervibe:adr` instead of finishing here?**
A: If the recommended option locks in a long-term architectural choice (DB engine,
runtime, framework, vendor), the output should also produce an ADR. Brainstorm captures
exploration; ADR captures the binding decision with reversal cost.

## Failure recovery

If a previous brainstorm shipped a flawed recommendation, do NOT silently re-brainstorm.
Instead: open the original spec, add a "Postmortem" section with what was missed
(usually: a non-obvious risk that surfaced too late, or a stakeholder who wasn't
mapped), then start a fresh brainstorm that explicitly references the prior file.
This preserves the decision audit trail and prevents repeating the same blind spot.

## Telemetry hooks

When `supervibe:telemetry` is enabled, this skill emits:
- `brainstorm.started` — with topic and detected workflow variant
- `brainstorm.gate.passed` — confidence score and section count
- `brainstorm.gate.failed` — score and failing dimensions, for trend analysis
- `brainstorm.spec.written` — file path and byte count

Use these signals to detect drift (e.g., specs trending shorter over time often means
decomposition is being skipped).
