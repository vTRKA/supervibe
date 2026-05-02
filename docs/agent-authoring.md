# Agent Authoring Guide

Agents are executors with personality — they USE skills, have tools, scope, and a deep-domain persona that anchors their decisions.

## Quick start

1. Copy template:
   ```bash
   mkdir -p agents/<namespace>
   cp templates/agent.md.tpl agents/<namespace>/<your-agent>.md
   ```
2. Fill in all `{{...}}` placeholders
3. Validate: `npm run validate:frontmatter`
4. Score: `/supervibe-score agent-quality agents/<namespace>/<your-agent>.md` — must be ≥9

## Namespaces

| Namespace | Purpose | Examples |
|-----------|---------|----------|
| `_core/` | Process agents (review, debug, research) | code-reviewer, root-cause-debugger |
| `_meta/` | Framework self-management | rules-curator, supervibe-orchestrator |
| `_product/` | Product / strategy / QA | product-manager (CPO scope), systems-analyst |
| `_ops/` | Infrastructure / deps / DB / research | devops-sre, ai-integration-architect, *-researcher |
| `_design/` | UX / brand / accessibility | ux-ui-designer, prototype-builder |
| `stacks/<stack>/` | Stack-specific implementers/architects | laravel-developer, nextjs-architect |

## Required frontmatter fields

```yaml
---
name: <slug>                              # required, lowercase + hyphens
namespace: <namespace>                    # required (matches dir)
description: "Use WHEN <trigger> TO <purpose> GATES <scoring>"  # trigger-clarity match
persona-years: 15                         # required, always 15+ for shipped agents
capabilities: [<cap1>, <cap2>, ...]       # required
stacks: [<stack> | any]                   # required
requires-stacks: []                       # required if stack-specific
optional-stacks: []                       # required (use [] if none)
tools: [Read, Grep, Glob, Bash, Edit, Write]  # required, scoped to role
skills: [supervibe:<skill>, ...]             # required (≥1)
verification: [<command1>, ...]           # required (≥1)
anti-patterns: [<pattern1>, ...]          # required (≥4)
version: 1.0
last-verified: 2026-04-27
verified-against: <commit-hash>
effectiveness:
  last-task: null
  outcome: null
  iterations: 0
---
```

## Required body sections

### `# <agent-name>`

### `## Persona`
- Senior-level domain background — concrete past systems shipped, scars from real incidents, not vague "expert in X" claims
- Core principle (one sentence in quotes)
- Priorities in order (e.g., `correctness > readability > performance`)
- Mental model (1-2 paragraphs)

### `## Project Context`
Real paths from current project (filled by `supervibe:strengthen` per project). Placeholder OK in plugin source.

### `## Skills`
List of attached skills with one-line purpose each.

### `## Procedure`
Numbered steps the agent follows. Include verification step + confidence-scoring step.

### `## Anti-patterns`
≥4 concrete patterns to avoid, each with one-line reasoning.

### `## User dialogue discipline`
Required for every interactive agent. Ask one question per message, match the user's language, include `Step N/M` or `Шаг N/M`, explain `Why:`, name `Decision unlocked:`, state `If skipped:`, list outcome-oriented choices with tradeoffs, and include `asking-multiple-questions-at-once` in anti-patterns. Use `scripts/lib/supervibe-dialogue-contract.mjs` for post-delivery menus instead of hardcoding one-off approval prompts.

### `## Verification`
Specific commands the agent runs to prove done.

### `## Out of scope`
What this agent must NOT touch + what it must NOT decide.

### `## Output contract` — Canonical footer (MANDATORY)

Every agent's `## Output contract` section MUST end with this block (verbatim, in a code fence — placeholders OK because this is the contract spec, not the runtime value):

````
```
Confidence: <N>.<dd>/10
Override: <true|false>
Rubric: <rubric-id>
```
````

At runtime the agent prints the actual numbers (e.g. `Confidence: 9.2/10`).

Without this footer:
- `PostToolUse` hook can't parse the score → `confidence_score=0` in invocation log
- Agent gets falsely flagged as underperformer
- `npm run validate:agent-footers` fails the build (gate in `npm run check`)

For pure-research read-only agents that can't produce a meaningful confidence:
````
```
Confidence: N/A
Override: false
Rubric: read-only-research
```
````

The hook treats `N/A` as null and skips logging.

## Quality bar (agent-quality rubric)

6 dimensions = 10 max:

1. **persona-depth** (×2) — concrete past systems shipped, core principle, priorities
2. **scope-precision** (×2) — concrete paths/dirs (not vague)
3. **anti-patterns** (×2) — ≥4 with reasoning
4. **verification-commands** (×2) — ≥2 named commands
5. **size-and-shape** (×1) — ≥250 lines, ≤25 KB, all required frontmatter
6. **canonical-output-format** (×1) — Output contract has Confidence + Override + Rubric footer

Threshold: ≥9 to ship. **Note**: in v0.x, many agents are 60-150 lines (compact form). `supervibe:strengthen` pass will expand to ≥250.

## Tool selection

- READ-ONLY agents (reviewers, researchers, architects): `tools: [Read, Grep, Glob, Bash]`
- WRITE agents (developers, implementers): add `Write, Edit`
- Special purpose: `WebFetch` for researchers, `Bash` for ops/devops

Principle: smallest tool set that lets agent do its job.

## Skill attachment

Every agent attaches:
- `supervibe:confidence-scoring` (mandatory — final score)
- Domain skill(s) — what it does
- `supervibe:verification` (recommended — evidence-before-claim)

## Persona writing tips

**Persona depth is non-negotiable.** Lead with concrete past-systems and scars, not generic "senior" labels. The agent should make decisions like someone who has shipped and broken things in this domain — not someone who has read about it.

Good persona:
> Has shipped marketplaces, billing systems, and high-throughput queue pipelines on Laravel + PostgreSQL/MySQL + Redis/Horizon. Has watched "DDD from day one" projects collapse under abstraction weight, and "fat controllers everywhere" projects collapse under change cost. Core principle: "Boundaries before features." Priorities: maintainability > developer ergonomics > performance > novelty. Mental model: Laravel ships generous defaults; production scale demands explicit boundaries. Modular monolith default for >5 modules.

Bad persona:
> Senior developer who knows Laravel.

## Anti-patterns to avoid

- **Generic "knows X"** persona — say WHAT they've shipped/seen
- **Vague scope** — "all backend code" ≠ specific paths
- **Generic anti-patterns** — "writes bad code" ≠ concrete pattern
- **Missing Out-of-scope** — invites scope creep
- **No verification commands** — can't prove anything done

## Examples to study

- `agents/_core/code-reviewer.md` — clean process agent
- `agents/_core/root-cause-debugger.md` — methodology-heavy
- `agents/_meta/rules-curator.md` — meta-level (manages other artifacts)
- `agents/_meta/supervibe-orchestrator.md` — full decision tree
- `agents/stacks/laravel/laravel-architect.md` — stack-specific READ-ONLY
- `agents/stacks/laravel/laravel-developer.md` — stack-specific WRITE

## After authoring: register

1. Run `npm run registry:build` — agent should appear in `registry.yaml`
2. Reference in stack-pack manifest if stack-specific
3. Reference in the selected host instruction template if universal
