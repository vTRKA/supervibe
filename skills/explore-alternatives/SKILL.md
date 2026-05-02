---
name: explore-alternatives
namespace: process
description: "Use BEFORE committing to any non-trivial decision (complexity ≥5) to enumerate ≥2 alternatives with tradeoffs and explicit chosen-rationale. RU: Используется ПЕРЕД фиксацией нетривиального решения (сложность ≥5) — перечисляет ≥2 альтернативы с компромиссами и явное обоснование выбора. Trigger phrases: 'варианты', 'decision matrix', 'alternatives', 'сравни подходы'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: plan
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Explore Alternatives

## When to invoke

BEFORE committing to ANY decision with complexity ≥5 (per `supervibe:requirements-intake` complexity score). Specifically:
- Library / framework choice
- Pattern adoption (when ≥2 patterns plausibly fit)
- Architecture decision
- Performance optimization approach (always profile-then-explore)
- Bug fix when root cause has ≥2 possible interventions

NOT for: trivial fixes, single-obvious-solution tasks.

This skill bans "first idea wins" thinking. Forces comparison.

## Step 0 — Read source of truth (required)

1. Read task context (spec / plan / bug report)
2. Read `supervibe:project-memory` for prior decisions in this area
3. Check if existing ADR or pattern already addresses (don't reinvent)

## Decision tree

```
How many alternatives realistic?
├─ 0 (no alternatives possible) → STOP, this skill not needed; document why single path
├─ 1 (only one viable path) → document why others rejected; this skill done
└─ ≥2 → continue with full procedure

Source of alternatives:
├─ Domain knowledge (agent's training)
├─ Project memory (supervibe:project-memory)
├─ Research (best-practices-researcher / infra-pattern-researcher / dependency-researcher)
└─ User suggestion
```

## Procedure

1. **Step 0** — context + memory check
2. **Brainstorm alternatives** — minimum 2, ideally 3
3. **For EACH alternative**:
   - **Description** (1-2 sentences what it is)
   - **Pros** (3+ concrete advantages)
   - **Cons** (3+ concrete disadvantages)
   - **Cost** (effort to implement, ongoing maintenance, runtime cost)
   - **Reversibility** (easy to change later? expensive lock-in?)
   - **When-to-use** (which condition makes this best)
4. **Comparison table**:
   ```
   | Criterion | Alt A | Alt B | Alt C |
   |-----------|-------|-------|-------|
   | Effort    | High  | Low   | Med   |
   | Lock-in   | Low   | High  | Med   |
   | Perf      | Best  | OK    | Best  |
   | DX        | OK    | Best  | OK    |
   ```
5. **Recommendation** — explicit choice with rationale citing project context (constraints, prior decisions, team skills)
6. **Score** with `supervibe:confidence-scoring` (agent-output ≥9)
7. **If decision is structural** → propose `supervibe:adr` to record permanently
8. **If user-facing decision** → seek user approval before implementing

## Output contract

```markdown
## Alternatives Considered: <decision topic>

### Alt A: <name>
- Description: ...
- Pros: 1) ... 2) ... 3) ...
- Cons: 1) ... 2) ... 3) ...
- Cost: ...
- Reversibility: easy | medium | locked-in
- When best: ...

### Alt B: <name>
...

### Alt C: <name>
...

### Comparison
<table>

### Recommendation
**Chose: <Alt X>**
Rationale: <2-3 sentences citing project context>

### Next step
- ADR: <link to .supervibe/artifacts/adr/NNNN.md if structural>
- OR: continue to writing-plans with chosen alternative
```

## Guard rails

- DO NOT: skip this skill on complexity ≥5 decisions
- DO NOT: present 2 alternatives where one is obviously inferior (straw man)
- DO NOT: choose without explicit rationale citing context
- DO NOT: ignore project memory of prior similar decisions (consistency matters)
- ALWAYS: cite which constraint/context drove the choice
- ALWAYS: document when reversal would be cheap vs expensive

## Verification

- ≥2 alternatives with all required fields
- Comparison table present
- Recommendation has explicit rationale
- Confidence ≥9

## Related

- `supervibe:project-memory` — for prior similar decisions
- `supervibe:adr` — to record structural decisions
- `supervibe:brainstorming` — already includes "propose 2-3 approaches"; this skill is for tactical decisions DURING execution where brainstorming is overkill
- `agents/_core/architect-reviewer` — invokes this skill for architectural decisions

## Carbon-copy lookup (mandatory pre-step)

BEFORE generating original alternatives, ask: has someone else solved this problem?

1. Invoke `supervibe:project-memory` with the problem keywords — past decisions in this repo
2. Invoke `supervibe:code-search` semantic — similar code patterns in the codebase
3. Invoke `supervibe:_ops:best-practices-researcher` if applicable — industry references
4. Invoke `supervibe:_ops:competitive-design-researcher` for design problems

If carbon copies exist: list them BEFORE generating new options. Often one of them is the answer.

## Weighted decision matrix (required)

Required format:

```markdown
| Dimension | Weight | A | B | C |
|-----------|--------|---|---|---|
| <name>    | <int>  | 0-10 | 0-10 | 0-10 |
| ...       | ...    | ... | ... | ... |
| **Total** | --     | (sum w_i × a_i) | ... | ... |
```

Rules:
1. **Weights set BEFORE seeing options** (prevents post-hoc rationalization)
2. **Negative weights allowed** for "less is better" dimensions (effort, risk)
3. **At least 4 dimensions** — fewer means lazy thinking
4. **Show calculation** — make math visible

## Sensitivity analysis

After scoring, perturb the weights:

- "If I doubled the weight on Risk, would the winner change?"
- "If I halved the weight on Strategic Fit, would the runner-up win?"

If small weight changes flip the result: the matrix is brittle; revisit weights or add more dimensions.

## Adversarial scoring

Force yourself to argue against your preferred option:

- "Steel-man the case for B as if I'm advocating it"
- "List 3 reasons A might fail that I haven't considered"
- "Who would prefer C and why?"

Document conclusions. Often surfaces hidden assumptions.

## Time-boxed exploration

Explore-alternatives can spiral. Set a budget:

- "I'll spend ≤30 min generating + scoring options"
- "If no clear winner emerges, I'll defer to <named heuristic> (e.g., 'pick the reversible option')"

Document the budget at start. If you exceed it: log "exceeded budget by X; outcome was Y" — learn for next time.

## Output contract template

Save exploration to `.supervibe/artifacts/specs/YYYY-MM-DD-<topic>-alternatives.md` (or as section in brainstorm/ADR/PRD).

Required sections:
1. **Problem restated** (1 paragraph)
2. **Carbon-copy lookup** (results from project-memory + code-search + research)
3. **Options generated** (≥3, each with 1-paragraph description)
4. **Decision matrix** (weights set first, scores second)
5. **Sensitivity analysis** (≥2 perturbations)
6. **Adversarial scoring** (≥1 steel-man for runner-up)
7. **Recommendation** (with rationale + acknowledged risks)
8. **Confidence**: high / medium / low
9. **Decision-reversibility**: reversible (low risk) / hard-to-reverse (high risk)

## Anti-patterns

- **Score-then-weight** → post-hoc rationalization; weights bias toward preferred option
- **Three options when one is straw-man** → fake alternatives ("do nothing" priced ridiculously)
- **No sensitivity analysis** → brittle matrix invisible
- **No adversarial scoring** → confirmation bias unchecked
- **No carbon-copy lookup** → reinventing wheels; missed prior decisions
- **Unbounded exploration** → analysis paralysis
- **Missing "do nothing"** option → can't compare against status quo

## Common workflows

### Workflow: Library / vendor choice

1. Carbon-copy: any prior memory entries?
2. Generate 3-5 candidates (research via best-practices-researcher)
3. Dimensions: maturity, license, ecosystem, perf, cost, lock-in
4. Score; sensitivity; steel-man runner-up
5. Recommendation with reversibility note

### Workflow: Architectural pattern choice

1. Carbon-copy: prior ADRs in this area?
2. Generate 3 patterns (event-driven / sync RPC / async queue, etc.)
3. Dimensions: latency, complexity, ops cost, scaling envelope, blast radius
4. Score; heavy sensitivity (architecture is hard to reverse)
5. Steel-man preferred runner-up
6. Recommendation; flag reversibility = LOW

### Workflow: Quick UX pattern choice (low stakes)

1. Carbon-copy: design system has it?
2. Generate 2-3 options
3. Dimensions: clarity, consistency, accessibility, effort
4. Score; light sensitivity
5. Recommendation; reversibility = HIGH

## Verification

- Output contains all 9 required sections
- ≥3 options including "do nothing" / "keep current"
- ≥4 weighted dimensions
- Weights documented BEFORE scores
- Sensitivity analysis present
- Adversarial scoring present
- Confidence rubric: `requirements`; score ≥ 9

## Related

- `supervibe:brainstorming` — uses this skill as core for option exploration
- `supervibe:adr` — uses this skill for the alternatives matrix
- `supervibe:project-memory` — for carbon-copy lookup
- `supervibe:code-search` — for code-pattern carbon copies
- `supervibe:_ops:best-practices-researcher` — for industry carbon copies
- `supervibe:_ops:competitive-design-researcher` — for design carbon copies
