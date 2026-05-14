---
name: tokens-export
namespace: process
description: 'Use WHEN brandbook is approved AND frontend implementation needs theme to export brandbook tokens to framework-specific format (Tailwind/MUI/CSS vars/Style Dictionary). Triggers: ''выгрузи токены'', ''export tokens'', ''tailwind theme'', ''нужна тема''.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites:
  - brandbook
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Tokens Export

## Overview

Tokens Export provides a reusable Supervibe operating method for Use WHEN brandbook is approved AND frontend implementation needs theme to export brandbook tokens to framework-specific format (Tailwind/MUI/CSS vars/Style Dictionary). Triggers: 'выгрузи токены', 'export tokens', 'tailwind theme', 'нужна тема'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## Design Intelligence Preflight

Before exporting or auditing tokens, run project memory, code search, and internal `supervibe:design-intelligence` lookup for brand-to-token sync, token drift, component states, and stack handoff evidence. Approved design-system tokens remain source of truth.

## When to Use

WHEN:
- Approved design system exists (`.supervibe/artifacts/prototypes/_design-system/tokens.css` and `.supervibe/artifacts/prototypes/_design-system/manifest.json` exist with confidence ≥9)
- Frontend implementation begins
- Brandbook tokens updated (re-export needed)

NOT for: ad-hoc one-off color changes (those go through brandbook update first).

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read `.supervibe/artifacts/prototypes/_design-system/tokens.css` (or `tokens.json`)
2. Identify frontend stack from `supervibe:stack-discovery` output
3. Identify target file convention per stack:
   - Tailwind: `tailwind.config.js` `theme.extend`
   - MUI: `src/theme/index.ts` `createTheme()`
   - CSS Vars: `frontend/src/styles/tokens.css`
   - Style Dictionary: `tokens/` source files
   - Vanilla: CSS custom properties in root

## Decision tree

```
Frontend framework?
├─ Tailwind CSS → tailwind.config.js theme.extend.{colors,spacing,fontSize,...}
├─ MUI → createTheme({ palette, typography, spacing, ... })
├─ Chakra → extendTheme({ colors, ... })
├─ vanilla CSS → :root { --token-name: value; }
├─ Style Dictionary → tokens.json source → multi-format build
└─ Other → CSS vars (universal fallback)

Token category mapping:
├─ Color tokens → palette / colors
├─ Spacing tokens → spacing scale (Tailwind: 0.5rem increments; MUI: 8px units)
├─ Typography tokens → fontFamily + fontSize + fontWeight + lineHeight
├─ Radius tokens → borderRadius scale
├─ Shadow/elevation → boxShadow scale
├─ Motion tokens → transition + easing (where supported)
```

## Procedure

1. **Step 0** — read brandbook tokens + identify target
2. **Parse brandbook tokens** — extract semantic names + values
3. **Map to framework format**:
   - Preserve semantic naming (`brand-primary` not `blue-600`)
   - Maintain scale steps (don't add intermediate; stay aligned with brandbook)
   - Document units (px → rem for web, dp for mobile)
4. **Generate framework config file**:
   - Tailwind: extend (not replace) defaults; add ours under namespace
   - MUI: full theme object with semantic names mapped to MUI palette structure
   - CSS Vars: `--brand-primary: <value>;` flat namespace
5. **Write file** at conventional path
6. **Verify roundtrip**: pick 3 random tokens, confirm value matches brandbook
7. **Update CHANGELOG** in frontend with "tokens regenerated from brandbook YYYY-MM-DD"
8. **Score** with confidence-scoring

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

## Output contract

Returns:
- Generated theme/config file at expected path
- Roundtrip verification (token → value lookups for 3 sample tokens)
- Token count exported
- Diff against previous version (if applicable)

## Guard rails

- DO NOT: rename tokens during export (semantic name `brand-primary` stays)
- DO NOT: add tokens not in brandbook (brandbook is source of truth)
- DO NOT: change values during export (must match brandbook exactly)
- DO NOT: replace framework defaults (extend instead — preserve framework's spacing scale alongside ours)
- ALWAYS: roundtrip-verify after generation
- ALWAYS: document export timestamp + brandbook version

## Verification

- Generated file syntactically valid (run framework's config validator)
- Roundtrip: 3 sample tokens match brandbook values
- Token count matches brandbook count
- Frontend build succeeds with new theme

## Related

- `supervibe:brandbook` — produces input
- `agents/_design/prototype-builder` — maintains brandbook tokens
- `agents/stacks/nextjs/nextjs-developer` — consumer (uses generated theme)
- `agents/stacks/react/react-implementer` — consumer
