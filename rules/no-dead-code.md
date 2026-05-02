---
name: no-dead-code
description: >-
  Every function, class, struct, enum variant, method, exported symbol must have
  at least one live call site; deferred wiring banned. Triggers: 'мёртвый код',
  'unused export', 'dead code'.
applies-to:
  - any
mandatory: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
related-rules:
  - confidence-discipline
  - anti-hallucination
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

- **Every route/component/command/job**: must be registered in the runtime graph and reachable from a user flow, scheduled job, CLI entrypoint, queue consumer, or documented public API.
- **Every warning about unused code**: treat as a dead-code signal until proven intentional. TypeScript, compiler, linter, bundler, framework and CI warnings are not "noise" when they point to unreferenced code, unreachable branches, unused imports, unreachable CSS/classes, unregistered routes, or uncalled generated clients.

**Detection tools:**
- JS/TS: `knip`, `ts-prune`, `eslint-plugin-unused-imports`
- Rust: `cargo-udeps`, `dead_code` lint
- Python: `vulture`, `pylint --disable=all --enable=W0611`
- Go: `unused`, `staticcheck`
- PHP: `phpstan` with `treatPhpDocTypesAsCertain`

**Stack-specific checks:**
- React / Next.js / Remix / TanStack Router: components must be imported by a route, layout, story/test fixture, or exported public package surface; routes must be reachable from the router manifest; server actions/loaders must have a caller; CSS modules/classes must be referenced.
- Vue / Nuxt / SvelteKit: components, composables, stores, pages, endpoints and load functions must be referenced by framework routing or imports; orphan `.vue`/`.svelte` files are dead unless documented as public examples.
- Node APIs (Express, NestJS, Fastify): controllers, routers, middleware, providers, background jobs and DI tokens must be registered; unused DTOs/schemas are dead unless generated public contracts.
- Python (Django/FastAPI): views, routers, serializers, management commands, Celery tasks and migrations must be registered; unused settings, URL patterns and dependency providers count.
- Rails / Laravel / Symfony: controllers, routes, service providers, console commands, jobs/listeners, policies and views must be wired in route/service/event registries.
- Go / Rust / Java / .NET: exported packages/modules, structs/classes, traits/interfaces, enum variants and generated clients must have callers or public API annotations; compiler warnings are release blockers.
- Mobile / desktop / browser extensions: screens, permissions, manifests, commands, background handlers, IPC/Tauri commands and extension content scripts must be reachable from navigation, manifest entries or registered IPC bridges.

**Intentional exceptions must include all three:**
- explicit annotation (`@public-api`, `@generated`, `@external-contract`, or local equivalent);
- owner/date or upstream contract reference;
- verification command showing why removal would break compatibility.

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
- `supervibe:audit` includes dead-code check
- `supervibe:executing-plans` enforces this when generating code

## Related rules

- `confidence-discipline` — claim of "complete" requires no dead code
- `anti-hallucination` — invented symbols often become dead code if not grep-verified

## See also

- "Boy Scout Rule" — leave code cleaner than you found it
