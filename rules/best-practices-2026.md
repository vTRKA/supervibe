---
name: best-practices-2026
description: "Curated cross-stack best practices as of 2026 — TypeScript strict, async/await over callbacks, immutable defaults, structured logging, no implicit any"
applies-to: [any]
mandatory: false
version: 1.0
last-verified: 2026-04-27
related-rules: [no-dead-code, anti-hallucination, observability]
---

# Best Practices (2026 Snapshot)

## Why this rule exists

Best practices evolve. What was canonical in 2018 (callbacks, var, prototype methods) is anti-pattern in 2026. This rule captures the current state across stacks for new code; existing code migrates opportunistically.

Concrete consequence of NOT following: code that future contributors find archaic; longer onboarding; missed performance/safety wins built into modern tooling.

## When this rule applies

- New code (default to current best practices)
- Major refactors (consider migrating)

This rule does NOT apply when: matching existing project style intentionally for consistency (open ADR if changing project direction).

## What to do

### Universal

- **Immutable by default**: `const`/`final`/`val`; mutation is opt-in
- **Strict typing**: TypeScript strict mode, mypy strict, PHP `declare(strict_types=1)`
- **Async/await over callbacks**: applies to all async-supporting languages
- **Structured logging**: JSON logs with consistent fields (level, ts, request_id, error)
- **Boundary validation**: Zod / Pydantic / Joi at every external input
- **No god objects**: 10-method limit per class typical; split if more
- **Composition over inheritance**: prefer interfaces + delegation
- **Errors are values**: explicit error returns OR typed exceptions (not generic Error)

### TypeScript / JavaScript

- TypeScript 5.x strict mode (noImplicitAny, strictNullChecks)
- ESM (no CommonJS for new packages)
- Vitest over Jest for new projects (faster, better DX)
- Biome / Oxlint over ESLint+Prettier (single tool, faster)

### Python

- Python 3.12+; type hints everywhere
- Pydantic v2 for boundaries
- Ruff over Black + isort + flake8
- pytest with parametrize, no class-based unittest

### PHP

- PHP 8.3+; readonly properties, enums, named args
- `declare(strict_types=1)` every file
- PHPStan level max
- Pint over PHP-CS-Fixer

### Rust

- Edition 2024+
- thiserror + anyhow for errors (lib + app split)
- tokio for async (alternatives have lost traction)
- cargo nextest over cargo test (concurrent, faster)

### Go

- Go 1.22+
- errors.Is / errors.As; wrap with fmt.Errorf %w
- Slog over log
- testify minimal (prefer stdlib testing.T)

## Examples

### Bad (TypeScript)

```ts
function processOrder(order: any) {  // implicit any defeats type system
  return fetch('/api/orders').then(r => r.json()).then(d => d.items);
}
```

### Good (TypeScript)

```ts
import { z } from 'zod';

const Order = z.object({ id: z.string(), items: z.array(...) });
type Order = z.infer<typeof Order>;

async function processOrder(order: Order) {
  const response = await fetch('/api/orders');
  const data = await response.json();
  return Order.parse(data).items;
}
```

## Enforcement

- Project linter / typechecker config matches stack section above
- Code review checks for usage of patterns
- `evolve:_ops:best-practices-researcher` agent updates this rule periodically based on community signals

## Related rules

- `no-dead-code` — modern patterns + dead-code detection are paired
- `observability` — structured logging is best practice + observability
- `anti-hallucination` — typed languages catch some hallucinations at compile time

## See also

- TypeScript handbook, Rust book, Python typing docs (all 2026 editions)
