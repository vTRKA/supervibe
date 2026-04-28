---
name: no-dead-code
description: "Every function, class, struct, enum variant, method, exported symbol must have at least one live call site; deferred wiring banned. RU: Knip-clean — удалять unused exports и functions, все символы должны иметь живые callers. Trigger phrases: 'мёртвый код', 'unused export', 'dead code'."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-04-27
related-rules: [confidence-discipline, anti-hallucination]
---

# No Dead Code

## Why this rule exists

Dead code is a tax on every reader of the codebase. It increases search noise, hides which paths matter, decays as surrounding code changes (so eventually doesn't compile), and makes test coverage metrics meaningless.

"Deferred wiring" — writing code in advance of need with intent to wire later — is the most common cause. It almost never gets wired.

Concrete consequence of NOT following: codebase grows linearly while value grows logarithmically; refactoring becomes archaeology; new contributors waste hours understanding code that does nothing.

## When this rule applies

- All production code (src/, app/, lib/)
- All test fixtures (delete unused ones)
- All exported APIs (deprecate then remove on schedule)

This rule does NOT apply when: explicit `@public-api` or `@stable` annotation marking the symbol as part of intentional unused API surface (e.g., library exporting future-use helpers).

## What to do

- **Every function/method**: must have ≥1 live call site (Grep verifiable)
- **Every class/struct/enum**: must have ≥1 instantiation OR ≥1 type reference
- **Every exported symbol**: must have ≥1 import OR be intentional public API
- **Every test**: must run in `npm test` (no orphan files)
- **Every variant**: switch/match exhaustive — every variant matched somewhere
- **Every parameter**: must affect output (or be marked unused with `_` prefix)

**Detection tools:**
- JS/TS: `knip`, `ts-prune`, `eslint-plugin-unused-imports`
- Rust: `cargo-udeps`, `dead_code` lint
- Python: `vulture`, `pylint --disable=all --enable=W0611`
- Go: `unused`, `staticcheck`
- PHP: `phpstan` with `treatPhpDocTypesAsCertain`

## Examples

### Bad

```ts
// src/billing/discounts.ts
export function calculateBulkDiscount(qty: number, unitPrice: number): number {
  // Future feature: loyalty multiplier
  const loyaltyMultiplier = getLoyaltyMultiplier(qty); // never used
  return qty * unitPrice * 0.9;
}

function getLoyaltyMultiplier(qty: number): number {
  return qty > 100 ? 1.5 : 1.0;
}
```

Why this is bad: `getLoyaltyMultiplier` is called by `loyaltyMultiplier` variable but result is unused. Dead code masquerading as live code.

### Good

```ts
// src/billing/discounts.ts
export function calculateBulkDiscount(qty: number, unitPrice: number): number {
  return qty * unitPrice * 0.9;
}
```

Why this is good: minimal, every line earns its place. When loyalty multiplier becomes a real feature, it's added with tests + call site simultaneously.

## Enforcement

- Pre-commit / CI: `npm run lint:dead-code` (knip / ts-prune / cargo-udeps / etc.)
- Code review: reviewer flags any "added for future use" code
- `evolve:audit` includes dead-code check
- `evolve:executing-plans` enforces this when generating code

## Related rules

- `confidence-discipline` — claim of "complete" requires no dead code
- `anti-hallucination` — invented symbols often become dead code if not grep-verified

## See also

- "Boy Scout Rule" — leave code cleaner than you found it
