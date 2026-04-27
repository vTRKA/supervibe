---
name: prototype
namespace: process
description: "Use WHEN user asks for design/mockup/UI exploration BEFORE implementing in framework to produce 1:1 HTML prototype in /prototypes for brand approval and 1:1 transfer"
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: []
emits-artifact: prototype
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Prototype

## When to invoke

WHEN building UI feature, BEFORE implementing in framework. Triggered by user "design X" or by `evolve:new-feature` orchestrator for UI features.

## Step 0 — Read source of truth (MANDATORY)

1. **Check `prototypes/_brandbook/` exists.** If MISSING → STOP, propose `evolve:brandbook` first.
2. Read brandbook tokens (`prototypes/_brandbook/tokens.css`)
3. Read brandbook components inventory
4. Read screen spec from `ux-ui-designer` if exists

## Decision tree

```
Brandbook exists?
├─ NO → propose evolve:brandbook first; STOP
└─ YES → continue

Screen spec exists?
├─ NO → invoke ux-ui-designer first
└─ YES → continue

Feature scope?
├─ Single screen → 1 prototype dir
├─ Multi-step flow → 1 dir per step + flow.html showing transitions
└─ Component-only → add to brandbook/components/, not feature dir
```

## Procedure

1. Brandbook check (Step 0)
2. Invoke `creative-director` (visual direction confirmation)
3. Invoke `ux-ui-designer` (screen spec)
4. Invoke `prototype-builder` to materialize:
   - `prototypes/<feature>/index.html`
   - `prototypes/<feature>/styles.css` (tokens-only)
   - `prototypes/<feature>/states/{resting,hover,active,focus,disabled,loading,empty,error}.html`
   - `prototypes/<feature>/README.md`
5. Invoke `ui-polish-reviewer` (8-dim review)
6. Invoke `accessibility-reviewer` (WCAG AA)
7. Score with confidence-scoring (prototype rubric ≥9)
8. **USER APPROVAL** required (open `prototypes/<feature>/index.html` in browser)
9. Handoff to frontend developer for 1:1 transfer
10. Post-transfer: drift check via `ui-polish-reviewer` (>5% drift = blocked)

## Output contract

Returns:
- `prototypes/<feature>/` directory with all 8 state files
- ui-polish-reviewer report
- accessibility-reviewer report
- User approval recorded
- Drift-check result post-transfer

## Guard rails

- DO NOT: skip brandbook check (causes design drift)
- DO NOT: use Tailwind in prototype (utility classes hide token compliance)
- DO NOT: use framework code (React/Vue) in prototype (pure HTML/CSS only)
- DO NOT: skip states (every component has 8)
- DO NOT: use raw hex (everything via tokens)
- ALWAYS: 1:1 fidelity to design
- ALWAYS: handoff record so transfer can verify

## Verification

- All 8 state files present
- `grep -E '#[0-9a-fA-F]{3,8}' prototypes/<feature>/styles.css` → 0 matches
- ui-polish-reviewer + accessibility-reviewer reports attached
- User approval recorded

## Related

- `evolve:brandbook` — prerequisite
- `agents/_design/prototype-builder` — implements
- `agents/_design/ui-polish-reviewer` — reviews
- `agents/_design/accessibility-reviewer` — reviews
- `rules/prototype-to-production` — transfer discipline
