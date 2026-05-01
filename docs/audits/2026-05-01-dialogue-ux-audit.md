# Dialogue UX Audit - 2026-05-01

## Scope

User-reported problem: genesis and other delivery flows can end with a raw
technical menu such as `Approve`, `Refine`, `Alternative`, `Deeper review`,
`Stop`. This is too terse for first-time users and inconsistent with the
plugin goal: beginner-friendly, clear, adaptive guidance.

## Findings

1. Runtime command state uses raw action ids as labels.
   - Evidence: `scripts/lib/supervibe-command-state.mjs` maps
     `["approve", "refine", "alternative", "deeper-review", "stop"]`
     directly to `label: id`.
   - Impact: generated prompts expose internal vocabulary instead of user
     outcomes.

2. Shared dialogue contract documents the same raw labels.
   - Evidence: `scripts/lib/supervibe-dialogue-contract.mjs` emits
     `Approve`, `Refine`, `Alternative`, `Deeper review`, `Stop`.
   - Impact: commands and skills copied the same wording, so the problem
     became a standard.

3. Genesis, adapt, strengthen, and design command docs repeat the raw menu.
   - Evidence: `commands/supervibe-genesis.md`,
     `commands/supervibe-design.md`, `skills/genesis/SKILL.md`,
     `skills/adapt/SKILL.md`, `skills/strengthen/SKILL.md`.
   - Impact: users see a different level of explanation depending on which
     command produced the prompt.

4. The rule checks format, not usability.
   - Evidence: `rules/single-question-discipline.md` and
     `scripts/validate-question-discipline.mjs` require one question,
     recommended/default option, free-form path and stop condition, but do not
     reject raw action-id labels.
   - Impact: a formally compliant flow can still be confusing.

5. Scenario tests assert menu existence but not user-facing quality.
   - Evidence: `tests/dialogue-contract.test.mjs` and
     `tests/fixtures/scenario-evals/supervibe-user-flows.json`.
   - Impact: regressions like `label: id` pass CI.

6. Agent dialogue discipline still points agents to `Step 1/1` consistency
   without requiring language-matched action labels or beginner wording.
   - Evidence: repeated `Step 1/1` guidance across interactive agents.
   - Impact: agents can be consistent while still sounding mechanical.

## Fix Todo

- [x] Add a single beginner-friendly post-delivery action contract in
  `scripts/lib/supervibe-dialogue-contract.mjs`.
- [x] Make runtime command state use user-facing labels and tradeoffs, never
  raw action ids.
- [x] Update genesis/adapt/strengthen/design docs and skills to the same
  contract.
- [x] Update the single-question rule so agents must use language-matched,
  outcome-oriented choices.
- [x] Add validator/test coverage that rejects raw
  `approve/refine/alternative/stop` user-facing menus.
- [x] Add a changelog entry and bump release surfaces.
- [x] Run full `npm run check`; commit and push after final status check.

## Target UX Standard

Post-delivery prompts should answer three beginner questions:

1. What happened and where is the artifact/state?
2. What is the recommended next action?
3. What happens if I choose each option?

The fixed menu must use outcome labels such as `Apply`, `Revise`,
`Try another option`, `Review deeper`, and `Stop here` in English, or
`Применить`, `Доработать`, `Другой вариант`, `Проверить глубже`,
`Остановиться` in Russian. The internal ids may remain in state, but they must
not be the visible labels.
