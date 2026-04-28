---
name: prototype-to-production
description: "HTML prototypes in prototypes/ are 1:1 source of truth for visual implementation; drift between prototype and production >5% blocks merge. RU: Hardening checklist перед промоутом; HTML прототипы — source of truth, дрифт >5% блокирует merge. Trigger phrases: 'prototype to prod', 'промоут прототипа', 'hardening'."
applies-to: [any]
mandatory: false
version: 1.0
last-verified: 2026-04-27
related-rules: [confidence-discipline]
---

# Prototype-to-Production

## Why this rule exists

Designs approved as prototypes regularly drift during implementation — devs reinterpret, eyeball spacing, omit states. Drift accumulates until production looks nothing like the approved design.

By treating `prototypes/` as 1:1 source of truth and measuring drift, we keep design discipline. Approved prototype = contract; production violates at its peril.

Concrete consequence of NOT following: approved design is a fiction; stakeholders reject production saying "this isn't what we approved"; rework cycles.

## When this rule applies

- Any UI feature that was prototyped first
- Cross-platform implementations (web + mobile rendering same brand)

This rule does NOT apply when: explicit ADR documenting deviation reason (e.g., platform constraint).

## What to do

### Prototype phase

1. Build HTML prototype with `evolve:prototype` skill
2. Use ONLY brandbook tokens (`prototypes/_brandbook/tokens.css`)
3. Render all 8 standard states (resting/hover/active/focus/disabled/loading/empty/error)
4. Get stakeholder approval (creative-director + user)

### Production transfer phase

1. Frontend developer reads `prototypes/<feature>/`
2. Implements 1:1 in framework (React/Vue/Svelte/etc.)
3. Token references map directly (CSS var → JS theme object)
4. State implementations match prototype variants

### Drift verification phase

1. `ui-polish-reviewer` agent compares prototype vs production
2. Per dimension (spacing, color, typography, states): measure delta
3. Drift threshold: <5% per dimension (acceptable rounding/snapping)
4. >5% on any dimension → BLOCK merge; revert or update prototype with new approval

### Tools

- Pixel-diff for static comparison (Pixelmatch / Resemble.js)
- Token coverage check (grep for hex values in production CSS — should be 0 outside theme file)
- State coverage check (Storybook or Chromatic for state matrix)

## Examples

### Bad

```css
/* prototype CSS uses brandbook tokens */
.button { background: var(--brand-primary); padding: var(--space-3); }

/* production code uses arbitrary values */
.btn { background: #4A90E2; padding: 12px; }
```

Why this is bad: production drifted; future brand-color change requires hunting hex values.

### Good

```css
/* prototype */
.button { background: var(--brand-primary); padding: var(--space-3); }

/* production (same tokens) */
.btn { background: theme('colors.brand.primary'); padding: theme('space.3'); }
```

Why this is good: 1:1 token reference; brand change = single token swap.

## Enforcement

- `prototype.yaml` rubric (Phase 0+1) — `token-discipline` dim
- `ui-polish-reviewer` agent runs drift check
- `evolve:prototype` skill Step 7 enforces post-transfer drift check

## Related rules

- `confidence-discipline` — drift = score < 9 → blocked

## See also

- `agents/_design/prototype-builder.md`
- `agents/_design/ui-polish-reviewer.md`
- `confidence-rubrics/prototype.yaml`
