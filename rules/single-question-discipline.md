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
version: 1.0
last-verified: 2026-04-28
mandatory: true
related-rules:
  - confidence-discipline
  - anti-hallucination
---

## What
Any agent, command, or skill that engages the user in clarification, requirements gathering, design dialogue, or branching decisions MUST present **one question at a time**, formatted as markdown with a `Шаг N/M:` (or `Step N/M:`) progress indicator. Choices must be a list. The agent must wait for an explicit user reply before asking the next question.

Questions must be easy to answer. Prefer 2-4 choices for ordinary clarifications; delivery gates use the standard 5-action menu. Put the recommended/default choice first and include a one-line tradeoff for each option. If the user can answer freely, say that explicitly after the choices. Avoid mixing configuration, strategy, and approval in one question.

Every question must be transparent about why the user is being asked. The question body must include:
- `Why:` one sentence about user-visible impact.
- `Decision unlocked:` the artifact, route, scope, or implementation choice this answer decides.
- `If skipped:` the safe default, persisted assumption, or stop condition.

Delivery-style flows must also declare lifecycle states, a persisted state artifact path, default behavior, free-form path, stop condition, and a post-delivery menu. Visible choices must be language-matched, outcome-oriented, and domain-specific while mapping to the internal lifecycle actions. Generic fallback labels (`Apply / Применить`, `Revise / Доработать`, `Try another option / Другой вариант`, `Review deeper / Проверить глубже`, `Stop here / Остановиться`) are acceptable only when no better domain noun exists. Genesis must use scaffold-specific labels such as `Apply scaffold / Применить scaffold`, `Adjust install plan / Изменить план установки`, `Compare another set / Сравнить другой набор`, `Review dry-run deeper / Проверить dry-run глубже`, and `Stop without installing / Остановиться без установки`. Internal action ids may remain in saved state, but must not be shown as the labels. Shared reusable wording lives in `scripts/lib/supervibe-dialogue-contract.mjs`.

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

> **Шаг N/M:** <one focused question>
>
> Why: <one sentence explaining the user-visible impact>
> Decision unlocked: <what artifact, route, scope, or implementation choice this decides>
> If skipped: <safe default or stop condition>
>
> - <Recommended action> (<recommended marker in the user's language>) - <what happens and what tradeoff it carries>
> - <Second action> - <what happens and what tradeoff it carries>
> - <Stop here> - <what is saved and what will not happen>
>
> Свободный ответ тоже принимается.

Match the user's language, use outcome-oriented labels, and never show internal lifecycle ids as visible labels. Labels must be domain actions, not generic Option A/B labels. Use `(recommended)` in English and `(рекомендуется)` in Russian. Wait for explicit user reply before advancing N. Do NOT bundle Step N+1 into the same message.
```

The agent's `## Anti-patterns` section MUST list:
- `asking-multiple-questions-at-once`
- `silent-progress` — advancing without reflecting `Шаг N/M:` so the user knows depth.
- `dumping-options-without-rationale` — listing 6 choices with no one-line trade-off.
- `too-many-options` — presenting a menu so large the user must design the system themselves; split into follow-up questions.
- `hidden-default` — asking a question without naming the recommended/default path.

## When NOT to apply
- Pure-output agents that don't ask the user anything (e.g., `code-reviewer` produces a verdict and exits — no questions).
- Background / log-processing agents that have no user dialogue.
- Single-question scenarios — when the agent only needs ONE clarification, the `Шаг 1/1:` indicator is still required for consistency.

## Discipline
Validator `scripts/validate-question-discipline.mjs` (run in `npm run check`) checks that every agent file matching `applies-to` contains either:
- the literal string `## User dialogue discipline`, OR
- the literal string `Шаг N/M`, AND
- the anti-pattern `asking-multiple-questions-at-once`, AND
- transparent markers for `Why:`, `Decision unlocked:`, and `If skipped:`.

Failures block commit.

## Override
If an agent legitimately cannot follow this rule (e.g., the orchestrator dispatches in parallel and never owns dialogue), declare in frontmatter: `dialogue: noninteractive` and the validator skips it.

## Related
- `rules/confidence-discipline.md` — every agent reports confidence
- `skills/brainstorming/SKILL.md` — meta-skill that itself follows this rule
