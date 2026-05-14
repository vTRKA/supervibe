---
name: brandbook
namespace: process
description: >-
  Use WHEN starting a new product, rebrand, or major design-system reset BEFORE
  prototype work to materialize an approved, machine-readable design system at
  .supervibe/artifacts/prototypes/_design-system/. Triggers: 'нужен бренд',
  'разработай бренд', 'фирстиль', 'брендбук', 'rebrand', 'design system',
  'дизайн-система'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: brainstorm
prerequisites: []
emits-artifact: design-system
confidence-rubric: confidence-rubrics/brandbook.yaml
gate-on-exit: true
version: 2.2
last-verified: 2026-05-14T00:00:00.000Z
---

# Brandbook

## Overview

This skill owns the design-system lifecycle. It turns an approved creative
direction into durable tokens, components, motion, voice, accessibility policy,
styleboard evidence, section approvals, and unlock metadata for prototypes.

Keep this file as the workflow contract. Long examples, JSON/CSS templates,
component catalog prompts, approval marker samples, and producer commands live
one hop away in `references/skills/brandbook-examples.md`.

## Local Design Expert Reference

Read `docs/references/design-expert-knowledge.md` before design-facing output. Use `supervibe:design-intelligence`, `designContextPreflight()`, or `searchDesignIntelligence()` before external lookup. Start with Design Pass Triage from the `Eight-Pass Expert Routine` and classify evidence as `required | reuse | delegated | skipped | N/A`.

External references are supplemental; local project memory, approved tokens, accessibility, and code evidence win.

## When to Use

Use this skill for:
- A new product with no approved design system.
- A rebrand, repositioning, rename, or material visual shift.
- Token drift discovered in prototypes or implementation.
- A candidate design system that needs section review or approval.
- A narrow extension to an approved design system: token, component variant,
  motion recipe, copy pattern, asset treatment, or target override.

Do not use it for pure moodboarding without operational tokens, one-off
prototype styling, or production implementation work.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Before writing candidate or approved design-system artifacts:
1. Read `.supervibe/artifacts/brandbook/direction.md` when present.
2. Read `.supervibe/artifacts/prototypes/_design-system/manifest.json`,
   `design-flow-state.json`, `tokens.css`, `motion.css`, `voice.md`,
   `accessibility.md`, `.approvals/*.json`, and `components/*.md` when present.
3. Read the active prototype `config.json` when a slug exists; it determines
   target, runtime, and viewport policy.
4. Run project memory, code search, CodeGraph/design-intelligence lookup for
   brand, style, palette, type, component, platform, and regulated-domain
   evidence.
5. Read `docs/references/design-expert-knowledge.md`,
   `docs/references/creative-reference-taxonomy.md`, and selected local
   creative packs when a new direction or material shift is required.
6. For `/supervibe-design`, consume the wizard/prewrite state from
   `node scripts/design-agent-plan.mjs --brief "<brief>" --status --plan-writes --slug <slug>`
   before durable writes.

If the prewrite manifest blocks `durable-design-artifacts`,
`review-styleboard`, or `prototype`, write only run state or diagnostic scratch
and ask the single next wizard question.

## Decision tree

- Existing system is `approved` and the user did not ask for a rebrand -> reuse
  mode; ask only for the missing extension required by the brief.
- Existing system is `candidate` or `needs_revision` -> review/resume mode; do
  not unlock prototype work.
- No system or explicit rebrand -> full-pass mode; complete preference coverage,
  selected direction, candidate files, styleboard, section review, and approval.
- User asks for exploration without operational tokens -> route to
  creative-director first and return here after direction selection.
- User asks for a prototype before approval -> stop and explain which
  design-system sections block prototype work.

## Procedure

1. Confirm target baseline before durable artifacts: `web`, `chrome-extension`,
   `electron`, `tauri`, `mobile-native`, or `mixed`.
2. Determine mode: full pass, review/resume, reuse, or narrow extension.
3. Complete the Preference Coverage Matrix Gate for new/rebrand runs using
   source=`user` or source=`explicit-default`; never source=`inferred`.
4. For referenced old prototypes, sites, screenshots, PDFs, or Figma files, ask
   the single reference-scope question before reading or using them.
5. Require `.supervibe/artifacts/brandbook/direction.md` with
   `creative_direction.status = selected` before candidate tokens for new or
   rebrand work.
6. Prepare candidate material in `.candidates/<run-id>/` or `.scratch/<run-id>/`
   and archive stale candidates with
   `node scripts/design-system-candidate-manager.mjs --archive-stale`.
7. Draft required sections as candidate files: palette, typography,
   spacing-density, radius-elevation, motion, component-set, copy-language, and
   accessibility-platform.
8. Build or show `styleboard.html` only after required axes are recorded:
   target, viewport policy, creative alternatives, anti-generic guardrail,
   reference scope, visual direction, density, palette mood, type personality,
   component feel, and motion intensity.
9. Use `node scripts/brandbook-producer.mjs run ...` to promote prepared design
   system files. Do not hand-write durable producer outputs for
   `/supervibe-design`.
10. Ask explicit review/approval for every required section before setting
    `design_system.status = approved`.
11. After approval, recompute status and surface the next visible choice:
    build prototype, revise design system, or stop at design-system-only
    boundary.

## Design readiness contract

- Visual approval is section-scoped: each candidate section must be shown before
  it can count as approved.
- `approved_sections` is the machine-readable unlock list for prototypes; prose
  approval is not enough.
- `feedback_hash` records the visible review packet that produced approval and
  prevents stale candidate reuse.
- Candidate markers are not user approval; only explicit section approval plus
  flow-state metadata can unlock prototype work.

## Reference Quality Gate

Use a candidate sandbox for new direction work: write exploratory systems under `.candidates/run-id`, mark exactly one active candidate, and archive rejected candidate folders with rejection rationale. Do not let candidate tokens unlock implementation or approval.

Every reference packet must include reference role, quality tier, borrow, avoid, captured date when relevant, and fit rationale. Use `docs/references/creative-reference-taxonomy.md` for creative pack selection, and use `scripts/design-system-candidate-manager.mjs` or the owning workflow producer when candidate state must be durable.

## Continuation Contract

Full-pass mode can draft all required sections before the review packet, but approval still happens through the visible review packet and styleboard. reuse/extension mode must not force a full design-system restart when an approved system only needs a narrow extension. Candidate markers are not user approval. This gate cannot be satisfied by delegated approval markers. Only the visual approval/finalize step is a chat-level gate.

## Feedback prompt

After presenting candidate design-system sections or a styleboard, show exactly
one lifecycle prompt and wait:

- ✅ Approve - mark the reviewed section approved with signer and timestamp.
- ✎ Revise - collect one focused change request for the current section.
- 🔀 Alternative - create a meaningfully different direction with named tradeoffs.
- 📊 Run reviews - dispatch accessibility, polish, and design-system checks.
- 🛑 Stop - archive the candidate without unlocking prototype work.

## Design Diversity Benchmark

Before approving alternatives, require a Design Diversity Benchmark note with palette, type, rationale, motion, imagery, hierarchy, density, composition, and interaction tradeoffs. Reject same shell, new paint candidates even when colors or type tokens changed; a brandbook alternative must explain why the system would create a different first-screen experience.

## Preference Coverage Matrix Gate

Before durable brandbook writes, complete the Preference Coverage Matrix Gate for visual direction and tone, audience/trust posture, information density, typography personality, palette mood, motion intensity, component feel, and reference borrow/avoid. Persist the matrix at `.supervibe/artifacts/brandbook/preferences.json`. Record `first_user_design_gate_ack=true`; source=`inferred` is forbidden for required preferences, while explicit defaults must be marked separately.

Use `.scratch/<run-id>` for diagnostic scratch decisions. Reference source scope must separate project memory, code/design-intelligence evidence, local references, and external references. `.supervibe/artifacts/brandbook/direction.md` must exist before prototypes unlock, and new visual direction work must compare 3 candidate directions. Do not accept blanket approval for all sections before the review packet/styleboard evidence is available.

## Guided Defaults Checklist

For design-system wizard flows, maintain the guided defaults checklist before durable writes. Each axis must offer exactly these user-facing actions: Accept default / Compare alternatives / Customize. Keep the active `questionQueue` synchronized with runtime state, and do not promote design-system files when `writeGate.durableWritesAllowed` is false.

Use `styleboard.html` only after wizard state and diagnostic scratch evidence agree on target, viewport, reference scope, and visual direction.

## Required anti-patterns

- `asking-multiple-questions-at-once` - bundling palette, type, motion,
  components, and approval into one prompt.
- `advancing-without-feedback-prompt` - promoting a design-system section or
  unlocking prototypes without the explicit lifecycle choice above.
- `random-regen-instead-of-tradeoff-alternatives` - creating another direction
  without named axis changes, tradeoffs, and reuse implications.

## Examples

- New SaaS dashboard: run full pass, record guided defaults or user preferences,
  select a creative direction, produce candidate tokens/components, show the
  styleboard, then collect section approvals before prototype unlock.
- Approved system, new settings page: read current components, identify the
  missing settings-shell or form-row variant, ask one extension question, and
  update only that extension after approval.
- Candidate system with missing typography approval: resume review for that
  section; do not proceed to prototype until required approvals and
  `design-flow-state.json` agree.

See `references/skills/brandbook-examples.md` for concrete file layouts,
candidate JSON, approval markers, producer command shapes, section templates,
and component catalog prompts.

## When not to use

- Do not use this skill to bypass `/supervibe-design` or its durable write
  gates.
- Do not promote scratch or candidate material before preference coverage,
  selected direction, and write gates allow it.
- Do not treat broad user approval as section approval unless the full review
  packet/styleboard was visible in the current run.
- Do not replace required producer, worker, reviewer, validator, or receipt
  paths with controller-authored inline outputs.

## Common rationalizations

- "The user said use defaults." Reject silent defaults; show the guided defaults
  checklist so each axis can be accepted, compared, or customized.
- "The design looks good enough." Reject without section approvals, styleboard
  evidence, and machine-readable tokens.
- "The prototype can define the missing color." Reject; design-system extension
  comes before prototype styling.
- "Candidate markers prove approval." Reject; candidates are progress evidence,
  not user approval.

## Red flags

- `design_system.status = approved` appears without manifest, flow state,
  per-section approvals, `approved_by`, `approved_at`, approved sections, and
  feedback evidence.
- Root `_design-system/` contains multiple current token sets or rejected
  alternatives.
- Raw hex, magic spacing, ad-hoc radius, or local keyframes appear in prototype
  files because the design system was incomplete.
- A styleboard exists before target, viewport policy, reference scope, direction,
  density, palette, typography, component feel, and motion axes are recorded.
- A candidate or needs-revision system is used to unlock prototype work.

## Checklist

- Target baseline resolved before durable design artifacts.
- Prior memory, local references, Code RAG, and CodeGraph/design evidence
  checked or caveated.
- Preference Coverage Matrix complete for new/rebrand work.
- Creative direction selected before candidate tokens.
- Candidate sandbox isolated; stale candidates inspected.
- Styleboard evidence shown before approval.
- Producer promotion and workflow receipt path used where required.
- Required sections explicitly approved before prototype unlock.
- Final handoff metadata deferred until an approved prototype exists.

## Failure modes

- The skill becomes a long brand tutorial and hides required gates.
- Defaults become hidden agent assumptions instead of user-editable decisions.
- Candidate files leak into root source-of-truth paths.
- A one-off prototype style bypasses tokens and creates drift.
- Review status, wizard state, and runtime status disagree on the next action.

## Output contract

Return these fields:
- `location`: `.supervibe/artifacts/prototypes/_design-system/`.
- `mode`: full pass, review/resume, reuse, or extension.
- `target`: target baseline and viewport policy.
- `sections`: palette, typography, spacing-density, radius-elevation, motion,
  component-set, copy-language, accessibility-platform.
- `artifacts`: manifest, design-flow-state, tokens, motion, voice,
  accessibility, components, styleboard, approvals, and extensions.
- `approval`: candidate, needs_revision, approved design system, or final
  handoff metadata after prototype approval.
- `verification`: commands run, producer receipt status, and blockers.
- `confidence`: numeric score, override flag, and `brandbook` rubric.

## Guard rails

- Ask one user-facing question at a time.
- Do not write candidate tokens for new/rebrand work before selected creative
  direction exists.
- Do not create durable full styleboards before required axes are recorded.
- Do not unlock prototype work from candidate or needs-revision status.
- Do not inline raw design values in downstream prototypes.
- Do not delete rejected alternatives; archive them with rationale.
- Do not claim final handoff until an approved prototype exists.

## Verification

- `_design-system/manifest.json` and `design-flow-state.json` parse as JSON and
  block prototypes until required sections are approved.
- `tokens.css` and `motion.css` parse and contain no unresolved placeholders.
- Every component spec has anatomy, states, variants, tokens, and accessibility.
- Contrast pairs satisfy the project WCAG target.
- Reduced-motion strategy is documented.
- `node scripts/design-system-candidate-manager.mjs --archive-stale` reports the
  candidate/archive plan without moving active work unless `--apply` is intended.
- `npm run validate:design-diversity-benchmark` passes when alternatives are
  produced.
- Producer or workflow receipt evidence is present when durable design-system
  outputs are claimed.

## Supporting references

- `references/skills/brandbook-examples.md`
- `references/checklists/accessibility.md`
- `references/checklists/performance.md`
- `references/skill-baseline/skill-anatomy-baseline.md`

## Related

- `agents/_design/creative-director` produces selected creative direction before
  full design-system materialization.
- `agents/_design/design-system-architect` reviews token/component/styleboard
  coverage before prototype unlock.
- `supervibe:interaction-design-patterns` supplies motion recipes; brandbook
  declares which ones are approved vocabulary.
- `supervibe:prototype` consumes the approved design system.
- `supervibe:tokens-export` exports approved tokens to implementation stacks.
- `commands/supervibe-design.md` orchestrates brand, prototype, review, and
  handoff lifecycle.
