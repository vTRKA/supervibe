---
name: design-system-governance
description: "Approved design systems are project-level source of truth; new mockups reuse and extend them instead of rebuilding tokens/components from scratch."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-04-29
related-rules: [prototype-to-production, confidence-discipline]
---

# Design System Governance

## Why this rule exists

Design work becomes slow and inconsistent when every mockup recreates palette, type, spacing, motion, and components. Users wait through repeated approval phases, and later prototypes drift from earlier decisions.

Concrete consequence of NOT following: five prototypes for one product use five subtly different button styles, and production engineers cannot tell which one is canonical.

The system has gated states: candidate tokens for design-system review packets, approved design-system state for prototype work, then final handoff metadata after prototype approval. Candidate tokens do not unlock prototypes; final tokens are the only token set developers may treat as production guidance.

## When this rule applies

- Any `/supervibe-design` run after the first approved project design system exists.
- Any prototype that needs a visual token, component variant, motion recipe, copy pattern, or asset treatment.
- Any user feedback that asks for a visual change.

This rule does NOT apply when the user explicitly asks for a rebrand, major reset, or isolated throwaway exploration.

## What to do

- Treat `.supervibe/artifacts/prototypes/_design-system/design-flow-state.json` with `design_system.status = approved` and all required sections approved as the gate for prototype proof; treat `manifest.json` with `status: approved` plus `tokensState: final` as source for development handoff.
- Reuse existing `tokens.css`, `motion.css`, `voice.md`, `accessibility.md`, and `components/*.md`.
- If a prototype needs something missing, create a narrow extension request at `.supervibe/artifacts/prototypes/_design-system/extensions/<date>-<slug>.md`.
- Ask one approval question for the extension only.
- Update the relevant token/component file and append the extension id to `manifest.json.extensions`.
- Do not reopen palette/type/spacing/component baseline approval unless the user asked for a rebrand.
- Classify feedback as system-level or instance-level before changing tokens.
- Do not stamp final tokens until visual approval of the selected prototype. If multiple prototypes compete, park/reject alternatives before finalizing.

## Examples

### Bad

```text
User: make a billing dashboard mockup.
Agent: asks brand personality, palette, typography, spacing, component library again even though .supervibe/artifacts/prototypes/_design-system/manifest.json is approved.
```

Why this is bad: the user pays the same setup cost repeatedly and the new dashboard may drift from the approved system.

### Good

```text
Agent reads .supervibe/artifacts/prototypes/_design-system/manifest.json, reports "approved system v1.0.0, 23 components", then creates only extensions/2026-04-29-data-table.md because the dashboard needs a table component not yet defined.
```

Why this is good: the existing system stays stable, and the missing capability is added with clear scope and approval.

## Enforcement

- `/supervibe-design` Stage 0 checks whether `_design-system/design-flow-state.json` approves every required design-system section.
- `supervibe:brandbook` has reuse/extension mode.
- `prototype-builder` must stop on missing, candidate, or needs_revision design-system state and request approval/extension instead of inventing values.
- `ui-polish-reviewer` flags token bypass and component duplication.
- `scripts/hooks/pre-write-prototype-guard.mjs` blocks prototype HTML/CSS/JS writes until design-flow state allows `prototype.requested`, then blocks raw colors and hardcoded layout pixel values in prototype surfaces.

## Related rules

- `prototype-to-production` — approved prototypes are the production visual contract.
- `confidence-discipline` — low-confidence design-system changes require review or override.

## See also

- `commands/supervibe-design.md`
- `skills/brandbook/SKILL.md`
- `templates/design-system/extension-request.md.tpl`
