---
name: single-question-discipline
description: All agents that ask the user clarifying questions MUST ask one question at a time, with markdown formatting and a Step N/M progress indicator. Multi-question dumps are forbidden.
applies-to:
  - agents/_design/**
  - agents/_product/**
  - agents/_meta/supervibe-orchestrator.md
  - agents/_core/repo-researcher.md
  - agents/_core/root-cause-debugger.md
  - agents/_ops/**
  - agents/stacks/**
severity: high
version: 1.2
last-verified: 2026-05-06
mandatory: true
related-rules:
  - confidence-discipline
  - anti-hallucination
---

## What
Any agent, command, or skill that engages the user in clarification, requirements gathering, design dialogue, or branching decisions MUST present **one question at a time**, formatted as markdown with a `Step N/M:` (or `Step N/M:`) progress indicator. `M` is adaptive: compute it from current triage, required gates, saved workflow state, and user-requested skips/delegations. Do not hard-code a fixed total such as 8 unless the current triage proves exactly eight user-visible questions are required. Choices must be a list. The agent must wait for an explicit user reply before asking the next question.

Questions must be easy to answer. Prefer 2-4 choices for ordinary clarifications; delivery gates use the standard 5-action menu. Put the recommended/default choice first and include a one-line tradeoff for each option. If the user can answer freely, say that explicitly after the choices. Avoid mixing configuration, strategy, and approval in one question.

Visible questions and option lists must be authored by the active agent from current context. Static questionnaire rows, seed catalogs, fallback scratch questions, and generated defaults are reference material only. If the runtime only has fallback material, show the specialist/agent dispatch gate instead of rendering the fallback as a user-facing question.

A `Step N/M:` line without explicit choices is not a valid question. Do not ask bare binary prompts such as `Step 3/6: main screen or shell?`; render the choices as bullets with the recommended one first, include what each choice unlocks, and include the stop option.

Every question must be transparent about why the user is being asked. The question body must include:
- `Why:` one sentence about user-visible impact.
- `Decision unlocked:` the artifact, route, scope, or implementation choice this answer decides.
- `If skipped:` the safe default, persisted assumption, or stop condition.

Delivery-style flows must also declare lifecycle states, a persisted state artifact path, default behavior, free-form path, stop condition, and a post-delivery menu. Visible choices must be language-matched, outcome-oriented, and domain-specific while mapping to the internal lifecycle actions. Never show labels in two languages inside one visible option; locale maps are internal/reference data, not user-facing menu text. Generic fallback labels are `Apply`, `Revise`, `Try another option`, `Review deeper`, and `Stop here`; translate those semantics at runtime into the active user language. Genesis must use scaffold-specific labels such as `Apply scaffold`, `Adjust install plan`, `Compare another set`, `Review dry-run deeper`, and `Stop without installing`, localized at runtime when needed. Internal action ids may remain in saved state, but must not be shown as labels. Shared reusable wording lives in `scripts/lib/supervibe-dialogue-contract.mjs`.

Long-running or multi-stage flows must preserve state across topic drift. If a saved `NEXT_STEP_HANDOFF`, `workflowSignal`, stage triage, plan review gate, or loop state exists and the user asks about a different topic, do not silently drop the current workflow. Ask one resume question that shows the saved phase, artifact, next command, and safe choices: continue current stage, skip/delegate safe non-final decisions to the agent, pause and switch topic, or stop/archive current state. Skips/delegations must be recorded in the state artifact and cannot bypass final approval, safety, policy, production, or destructive-operation gates.

Genesis-style install flows must split selection into separate questions: host adapter, install profile, optional add-ons, then custom group edits. Presets such as `minimal`, `product-design`, `full-stack`, `research-heavy`, and `custom` must include one-line tradeoffs and a stop condition before any file write.

When a question branches into implementation or refactor work, apply
`scripts/lib/supervibe-retrieval-decision-policy.mjs` before asking for approval:
memory, code RAG and codegraph requirements must be explicit, and skipped
retrieval needs a reason.

## Why
Multi-question dumps overwhelm users, cause partial answers, and produce ambiguous state. Designers learned this first — the design-pipeline rollout in commit `2a16afc` proved one-at-a-time dialogues raise approval rates and reduce rework. The discipline must extend to product, ops, stack, and meta agents — not only design.

## How to apply

For every interactive agent, the agent MUST include a section in its definition:

```markdown
## User dialogue discipline

Ask one question per message. Format:

> **Step N/M:** <one focused question>
>
> Why: <one sentence explaining the user-visible impact>
> Decision unlocked: <what artifact, route, scope, or implementation choice this decides>
> If skipped: <safe default or stop condition>
>
> - <Recommended action> (<recommended marker in the user's language>) - <what happens and what tradeoff it carries>
> - <Second action> - <what happens and what tradeoff it carries>
> - <Stop here> - <what is saved and what will not happen>
>
> A free-form answer is also accepted.

Match the user's language, use outcome-oriented labels, and never show internal lifecycle ids as visible labels. Labels must be domain actions, not generic Option A/B labels. Recompute `M` after triage, resumed state, skipped stages, and delegated safe decisions; never use a fixed total just because a workflow can have that many stages. Use `(recommended)` in English, or the localized equivalent when replying in another language. Wait for explicit user reply before advancing N. Do NOT bundle Step N+1 into the same message.
```

The agent's `## Anti-patterns` section MUST list:
- `asking-multiple-questions-at-once`
- `silent-progress` — advancing without reflecting `Step N/M:` so the user knows depth.
- `fixed-stage-gauntlet` - forcing a user through a stale or maximum step count when triage, approved artifacts, or explicit delegation make stages reusable or N/A.
- `lost-topic-resume` - dropping a saved handoff/workflow stage when the user changes topic instead of asking continue, skip/delegate, pause/switch, or stop.
- `dumping-options-without-rationale` — listing 6 choices with no one-line trade-off.
- `bare-step-question` - showing a `Step N/M:` prompt without bullet choices and tradeoffs.
- `too-many-options` — presenting a menu so large the user must design the system themselves; split into follow-up questions.
- `hidden-default` — asking a question without naming the recommended/default path.
- `visible-fallback-question` — rendering fallback seeds, static questionnaire rows, or catalog choices as if they were agent-authored.

## When NOT to apply
- Pure-output agents that don't ask the user anything (e.g., `code-reviewer` produces a verdict and exits — no questions).
- Background / log-processing agents that have no user dialogue.
- Single-question scenarios — when the agent only needs ONE clarification, the `Step 1/1:` indicator is still required for consistency.

## Discipline
Validator `scripts/validate-question-discipline.mjs` (run in `npm run check`) checks that every agent file matching `applies-to` contains either:
- the literal string `## User dialogue discipline`, OR
- the literal string `Step N/M`, AND
- the anti-pattern `asking-multiple-questions-at-once`, AND
- transparent markers for `Why:`, `Decision unlocked:`, and `If skipped:`.

Failures block commit.

## Examples

### Bad

```text
Before I start, answer these:
1. Web or desktop?
2. Who is the audience?
3. Should I use dark mode?
4. Do you want animations?
```

This creates partial answers and ambiguous state. The user can answer only one
item, the agent may infer the rest, and no saved workflow state records which
decision unlocked which artifact.

### Good

```markdown
**Step 1/3:** Which target should this design flow produce first?

Why: target choice controls viewport policy, review gates, and handoff files.
Decision unlocked: design target for `.supervibe/memory/design-wizard/<slug>.runtime.json`.
If skipped: I will stop before durable design artifacts.

- Web landing page (recommended) - fastest path for browser preview and SEO review.
- Desktop app shell - applies Tauri/Electron viewport and interaction rules.
- Stop here - saves no new design state.

A free-form answer is also accepted.
```

This is answerable in one turn, names the artifact impact, and preserves the
stop condition.

## Enforcement

- `npm run validate:question-discipline` blocks agents that omit the dialogue
  section, `Step N/M`, anti-patterns, or transparency markers.
- `npm run validate:dialogue-ux` checks delivery menus and visible option
  labels for supported workflow surfaces.
- `npm run validate:multistage-user-gates` catches missing continuation choices
  around approval, review, and resume gates.
- Code review should reject visible raw ids such as `creative_direction` or
  `blocked_mode`; those are saved-state ids, not user-facing labels.

## Override
If an agent legitimately cannot follow this rule (e.g., the orchestrator dispatches in parallel and never owns dialogue), declare in frontmatter: `dialogue: noninteractive` and the validator skips it.

## Related rules
- `rules/confidence-discipline.md` — every agent reports confidence
- `skills/brainstorming/SKILL.md` — meta-skill that itself follows this rule
