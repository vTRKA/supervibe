---
name: brandbook
namespace: process
description: "Use WHEN starting new product OR major brand reset BEFORE any prototype to materialize brand as documented prototypes/_brandbook/ with tokens, components, voice, accessibility, motion. RU: используется КОГДА запускается новый продукт ИЛИ крупный rebrand ДО любого прототипа — материализует бренд в prototypes/_brandbook/ с токенами, компонентами, голосом, accessibility, motion. Trigger phrases: 'нужен бренд', 'разработай бренд', 'фирстиль', 'брендбук', 'rebrand'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: []
emits-artifact: brandbook
confidence-rubric: confidence-rubrics/brandbook.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Brandbook

## When to invoke

BEFORE first `evolve:prototype` invocation in a project (no brandbook exists). OR when user explicitly says "let's do a brand reset". Required by `evolve:prototype` Step 0.

## Step 0 — Read source of truth (MANDATORY)

1. Read existing brand artifacts (`prototypes/_brandbook/` if any, `app/styles/tokens.*`, `design tokens` in package)
2. Read product context (`docs/prd/`, CLAUDE.md product summary)
3. Read existing UI examples in `frontend/`
4. Identify creative-director input (user-supplied direction or invoke creative-director agent)

## Decision tree

```
Brand state?
├─ Greenfield (no existing) → full brandbook from scratch with creative-director
├─ Refresh (have direction, lacking documentation) → materialize existing direction
└─ Reset (drop and rebuild) → archive existing, full new
```

## Procedure

1. **creative-director** produces visual direction document:
   - Mood / personality (3-5 adjectives)
   - Palette intent (semantic, not just hex)
   - Typographic intent
   - Motion intent
   - Emotional anchors per primary user moment
2. **prototype-builder** materializes brandbook in `prototypes/_brandbook/`:
   - `index.html` — overview / navigation
   - `tokens.css` (or `tokens.json`) — color/type/space/radii/elevation/motion
   - `components/` — base components × 8 states matrix (button, input, card, dialog, table, nav, badge, alert)
   - `voice-and-tone.md` — ≥5 do/don't pairs
   - `accessibility.md` — explicit WCAG-AA commitments + contrast samples
   - `motion.md` — easing curves, duration tiers, prefers-reduced-motion fallbacks
3. **copywriter** reviews voice-and-tone document
4. **accessibility-reviewer** verifies token combinations meet contrast targets
5. Score with confidence-scoring (brandbook rubric ≥9)
6. **USER APPROVAL** required — brandbook is "blessed" as source-of-truth
7. Cross-link from CLAUDE.md and `evolve:prototype` Step 0

## Output contract

Returns:
- `prototypes/_brandbook/` directory with all sections
- creative-director direction doc
- copywriter approval
- accessibility-reviewer approval
- User approval recorded

## Guard rails

- DO NOT: ship brandbook without creative-director input (looks generic)
- DO NOT: use raw hex anywhere (every color is a token)
- DO NOT: skip components × states matrix (incomplete brandbook)
- DO NOT: defer voice-and-tone (copywriter relies on it)
- ALWAYS: contrast-check token pairs at WCAG AA minimum
- ALWAYS: respect prefers-reduced-motion in motion.md

## Verification

- Tokens file: 6 categories present (color/type/space/radii/elevation/motion)
- Components file count ≥8 (button/input/card/dialog/table/nav/badge/alert)
- Voice-and-tone: ≥5 do/don't pairs
- Accessibility doc has contrast measurements
- Motion has easing + prefers-reduced-motion fallback

## Related

- `evolve:prototype` — primary consumer; checks brandbook in Step 0
- `agents/_design/creative-director` — provides direction
- `agents/_design/prototype-builder` — materializes
- `agents/_design/copywriter` — reviews voice
- `agents/_design/accessibility-reviewer` — reviews contrast
- `rules/prototype-to-production` — drift discipline downstream
