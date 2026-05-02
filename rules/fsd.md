---
name: fsd
description: >-
  Feature-Sliced Design for frontend: layered structure
  (app/pages/widgets/features/entities/shared) with strict downward-only
  dependencies. Triggers: 'FSD', 'структура frontend', 'feature-sliced'.
applies-to:
  - react
  - nextjs
  - vue
  - svelte
mandatory: false
version: 1
last-verified: 2026-04-27T00:00:00.000Z
related-rules:
  - modular-backend
  - no-dead-code
---

# Feature-Sliced Design (FSD)

## Why this rule exists

Frontend grows fast and tangles fast. Without explicit layers, every component imports every other; refactoring becomes archaeology; new contributors take weeks to understand structure.

FSD provides a layered model where dependencies flow downward only. Refactoring affects predictable scope.

## When this rule applies

- Frontend projects with ≥10 pages OR ≥30 components
- New projects (adopt from start)

This rule does NOT apply when: tiny app (<10 components), one-shot landing page, marketing site.

## What to do

### Layers (top to bottom)

1. **app/** — app initialization, providers, router
2. **pages/** — route-level components (in Next.js: `app/` dir)
3. **widgets/** — composite blocks (Header, Sidebar, ProductCard)
4. **features/** — user-facing capabilities (AddToCart, Login)
5. **entities/** — business entities (User, Product, Order)
6. **shared/** — reusable utilities (UI kit, lib, api, config)

### Dependency rule

A layer can import only from layers BELOW it. e.g., pages can import widgets/features/entities/shared, but features cannot import pages.

### Slices (within layer)

Each layer is split into slices by domain (e.g., `entities/user/`, `entities/product/`). Slices are isolated — no cross-slice imports within same layer.

### Segments (within slice)

`ui/`, `model/`, `api/`, `lib/`, `config/`

## Examples

### Bad

```
src/
├── components/Button.tsx
├── components/UserCard.tsx
├── pages/Home.tsx
└── ...
# UserCard imports from pages/Home for styling reasons → tangle
```

### Good

```
src/
├── app/
├── pages/Home/
├── widgets/UserBar/
├── features/auth/
├── entities/user/
│   ├── ui/UserCard.tsx
│   ├── model/store.ts
│   └── api/getUser.ts
└── shared/ui/Button/
```

UserCard in `entities/user` imports from `shared/ui/Button` (allowed: shared is below). Pages compose UserCard. No upward imports.

## Enforcement

- Linter: `eslint-plugin-boundaries` or `dependency-cruiser` config
- Pre-commit hook validates dependency direction
- Code review checks for layer violations

## Related rules

- `modular-backend` — analogous principle for backend
- `no-dead-code` — FSD layers reveal unused slices clearly

## See also

- https://feature-sliced.design/
