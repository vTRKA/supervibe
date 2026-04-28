---
name: interaction-design-patterns
namespace: process
description: "Use WHEN designing micro-interactions, animations, transitions, loading states to apply timing tiers, easing rules, and WOW-effect patterns from current 2026 design practice. RU: используется КОГДА проектируются микро-взаимодействия, анимации, переходы, loading-состояния — применяет timing tiers, easing-правила и WOW-паттерны из практики 2026. Trigger phrases: 'добавь анимацию', 'нужны переходы', 'микроинтеракция', 'оживи интерфейс'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: []
emits-artifact: prototype
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Interaction Design Patterns

## When to invoke

WHEN building UI that involves:
- Hover/click/focus state transitions
- Page/route transitions
- Loading states (skeletons, spinners, progress)
- Reveal animations (scroll-triggered, time-triggered)
- Drag/drop / gesture interactions
- Toast / notification appearance
- Modal/dialog enter/exit
- "WOW moment" interactions (signature differentiators)

NOT for: pure static layout, content-only screens.

## Step 0 — Read source of truth (MANDATORY)

1. Read `prototypes/_brandbook/motion.md` for timing tiers + easing
2. Read `prototypes/_brandbook/components/` for component-specific transitions
3. Check `prefers-reduced-motion` policy (mandatory respect)

## Timing tiers (canonical 2026)

```
Tier 1 — Micro (50-150ms)
  Use for: hover/focus/active state changes, tiny tooltips
  Easing: ease-out (rapid ack, slow settle)

Tier 2 — Element (150-300ms)
  Use for: button press feedback, dropdown open, accordion expand
  Easing: ease-in-out

Tier 3 — Component (300-500ms)
  Use for: modal open, drawer slide, card flip
  Easing: cubic-bezier(0.4, 0, 0.2, 1) (Material standard)

Tier 4 — Page (500-800ms)
  Use for: route transitions, hero reveals
  Easing: cubic-bezier(0.16, 1, 0.3, 1) (out-expo, dramatic)

Tier 5 — Scene (>800ms)
  Use for: onboarding sequences, loading orchestrations, landing hero
  Easing: custom per moment; use sparingly
```

## WOW-effect catalog (use sparingly — max 1-2 per product)

```
1. Cursor-following gradient — premium feel, subtle
2. Magnetic buttons — cursor draws button slightly
3. Stagger reveal on scroll — list items slide in sequentially (50ms offset)
4. Shared element transition — element morphs from list to detail
5. Optimistic UI with success burst — instant feedback + confetti/checkmark
6. Skeleton with shimmer — perceived performance boost
7. Parallax depth — background slower than foreground (max 2 layers)
8. Confetti on conversion — first signup, purchase complete
9. Cursor-aware 3D tilt on cards — subtle depth (max ±5deg)
10. Page-load morph — splash element morphs into header logo
```

## Decision tree

```
What are you animating?
├─ State change (hover/focus/active) → Tier 1 + ease-out
├─ Element open/close (dropdown/accordion) → Tier 2 + ease-in-out
├─ Component (modal/drawer/card) → Tier 3 + Material easing
├─ Route transition → Tier 4 + out-expo
└─ Hero / scene → Tier 5 + custom

Should this be a WOW moment?
├─ Onboarding first impression → YES, pick from catalog
├─ Signature interaction (signup/checkout/aha-moment) → YES, pick from catalog
├─ Routine interaction → NO, stick to standard tiers
└─ Already 2 WOW moments in product → NO (overuse dilutes)

prefers-reduced-motion?
├─ ALWAYS respect — provide instant fallback
└─ Test: emulate "reduce motion" in browser, confirm no animation runs
```

## Procedure

1. **Step 0** — read brandbook motion + components
2. **Categorize interaction** by tier (decision tree)
3. **Select easing** per tier
4. **If WOW moment**: pick from catalog, justify why this moment
5. **Implement with prototype-builder** in HTML/CSS:
   - Use CSS transitions (preferred) or CSS animations
   - GPU-accelerated properties only (transform, opacity — avoid width/height/top/left)
   - `prefers-reduced-motion: reduce` fallback (instant or fade only)
6. **Test cross-browser** + reduced-motion mode
7. **ui-polish-reviewer** check: feels right, not gratuitous
8. **Score** with prototype rubric
9. **Auto-spawn preview** (mandatory): invoke `evolve:preview-server` skill with `--root <output-dir>` after files are written. Hand URL to user with hot-reload note. Continue task — user will iterate visually.

## Output contract

Returns:
- Animation/transition spec per element (tier + easing + duration)
- prefers-reduced-motion fallback
- WOW moment justification (if applicable)
- Cross-browser screenshot or recording
- **Preview URL**: http://localhost:NNNN — auto-spawned after generation, hot-reload on

## Guard rails

- DO NOT: animate width/height/top/left (causes reflow; use transform)
- DO NOT: skip prefers-reduced-motion fallback (a11y violation)
- DO NOT: use >2 WOW effects in product (dilutes impact)
- DO NOT: use bouncy easing for serious actions (delete confirm = ease-in, not bounce)
- DO NOT: invent new tiers (5 are enough; consistency >novelty)
- ALWAYS: GPU-accelerated properties only
- ALWAYS: test reduced-motion mode

## Verification

- Animation uses transform/opacity only (grep CSS for forbidden properties)
- prefers-reduced-motion media query present
- Tier choice documented per element
- ui-polish-reviewer approval

## Related

- `agents/_design/prototype-builder` — implements
- `agents/_design/ui-polish-reviewer` — reviews
- `agents/_design/accessibility-reviewer` — verifies reduced-motion
- `evolve:brandbook` — motion.md is source of truth
