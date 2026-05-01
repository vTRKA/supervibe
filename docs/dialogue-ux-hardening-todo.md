# Dialogue UX Hardening TODO

Date: 2026-05-02

## Goal

Make Supervibe questions feel like explicit collaboration with the user, not generic lifecycle boilerplate.

## Findings

- Runtime Genesis post-delivery menu used a generic fallback question and action labels.
- Trigger router handoffs still used dry `Next step - ... Proceed?` wording.
- Russian handoff wording used the same dry "next step / proceed" pattern.
- Workflow chain and chain handoff enforcer duplicated the same generic handoff wording.
- Agent template hardcoded `<Recommended action> (recommended)`.
- Validator coverage did not block generic handoff phrasing across command, skill, agent, template, and runtime surfaces.

## Completed

- [x] Replaced generic Genesis post-delivery menu with scaffold-specific context.
- [x] Replaced trigger handoff prompts with `Step 1/1:` / localized action questions.
- [x] Replaced workflow chain and handoff enforcer prompts with the same explicit format.
- [x] Localized recommended markers in agent templates and generated discipline examples.
- [x] Added validator coverage for stale handoff wording and hardcoded English recommended markers.
- [x] Added regression tests that fail on dry next-step handoffs and generic Genesis prompt leakage.
- [x] Ran targeted grep scans and full `npm run check`.
- [x] Bumped version, updated changelog, and prepared the release commit for `main`.

## Acceptance Checks

- No runtime, command, skill, agent, rule, template, or README surface contains dry `Next step -` handoff wording.
- No runtime, command, skill, agent, rule, template, or README surface contains the dry Russian equivalent.
- No runtime, command, skill, agent, rule, template, or README surface contains `Proceed?` as a handoff prompt.
- No agent/template dialogue example contains `<Recommended action> (recommended)`.
- Genesis route emits scaffold-specific labels in English and Russian.
- Full repository check passes.
