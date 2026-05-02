---
name: instruction-surface-integrity
description: "Protect agent, skill, command, rule, and docs instruction surfaces from encoding loss, mixed-language intent text, and silent workflow-state drops."
applies-to:
  - any
mandatory: true
severity: high
version: 1.0
last-verified: 2026-05-03
related-rules:
  - anti-hallucination
  - single-question-discipline
  - i18n
  - confidence-discipline
---

# Instruction Surface Integrity

## Why this rule exists

Agent, skill, command, rule, and generated docs files are prompts. If those files
contain corrupted text, mixed-language intent descriptions, or vague workflow
state, every downstream project inherits bad routing and hallucination risk.

Concrete consequence of NOT following: a trigger phrase is replaced by repeated
question marks, a workflow stage looks optional, or a Russian explanation is mixed into an English
frontmatter description. The model then misroutes requests, skips approval
gates, or invents state that was never approved.

## Scope

This rule applies to:

- `agents/**/*.md`
- `skills/**/SKILL.md`
- `commands/*.md`
- `rules/*.md`
- generated docs and registries that summarize those surfaces
- project-adapted copies of the same artifacts in host adapter folders

It does not forbid runtime localization. User-facing replies should still match
the user's language. The restriction is for stored instruction surfaces that are
used for routing and agent behavior.

## Required Behavior

### Encoding

- Store all instruction surfaces as UTF-8.
- Never write Cyrillic or other non-ASCII trigger phrases through a lossy shell
  path that can collapse them to repeated question marks.
- Treat three-or-more question-mark runs in instruction surfaces as a release
  blocker unless the file is a tokenizer/model artifact explicitly excluded from
  instruction scans.
- Treat mojibake such as broken dash, arrow, Cyrillic, or emoji sequences as a
  release blocker.

### Language Boundary

- Frontmatter `description` uses one base language for behavior text.
- Non-English intent phrases are allowed only as quoted phrases after a
  `Triggers:` label.
- Do not add translated paragraphs, `RU:` blocks, or mixed English/non-English
  behavior explanations to frontmatter descriptions.
- Body instructions should be written in the base artifact language. If a
  runtime must display localized labels, describe the localization rule in
  English and keep actual localized strings in tested runtime maps.

### Workflow State

- Every multi-stage command or skill must declare its continuation contract.
- Stage counts are adaptive. Do not force a fixed maximum step count when an
  approved artifact, reusable design system, skip, delegation, or N/A triage
  makes a stage unnecessary.
- If the user changes topic while a `NEXT_STEP_HANDOFF`, `workflowSignal`,
  state file, review gate, or approval gate is pending, ask whether to continue,
  skip/delegate safe non-final decisions, pause and switch topic, or stop/archive
  the current state.
- Skips and delegated decisions must be persisted in the relevant state artifact.
  They cannot satisfy final approval, policy, production, security, destructive
  operation, or handoff gates.

## Enforcement

- `npm run validate:text-encoding` must pass before commit, release, or project
  adaptation. It rejects mojibake, replacement characters, repeated
  question-mark text loss, redundant bilingual descriptions, and Cyrillic
  outside quoted `Triggers:`.
- `npm run validate:workflow-continuation` must pass for workflow commands and
  skills.
- `npm run validate:multistage-user-gates` must pass for design and delivery
  approval surfaces.
- After editing agents, skills, commands, rules, or docs, rebuild generated
  registries/docs and run the validators again.

## Anti-Patterns

- `question-mark-trigger-loss` - accepting repeated question marks as a trigger
  phrase.
- `mixed-language-description` - putting translated behavior paragraphs into
  frontmatter descriptions.
- `localized-runtime-copy-in-docs` - hard-coding localized visible labels in
  shared instruction docs instead of runtime locale maps.
- `silent-workflow-drop` - switching topics while a saved workflow state exists
  without asking the resume question.
- `delegated-final-approval` - treating candidate markers or agent defaults as
  user approval.

## Related

- `rules/single-question-discipline.md`
- `rules/i18n.md`
- `scripts/validate-text-encoding.mjs`
- `scripts/validate-workflow-continuation.mjs`
