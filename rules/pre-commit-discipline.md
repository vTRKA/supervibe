---
name: pre-commit-discipline
description: "Every project must have husky+lint-staged+commitlint pre-commit pipeline; pre-push runs full check; CI mirrors pre-push for backstop. RU: Husky pre-commit hooks обязательны к прохождению; pre-push запускает полный check. Trigger phrases: 'pre-commit', 'hook', 'husky'."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-04-27
related-rules: [git-discipline, commit-discipline, no-dead-code]
---

# Pre-Commit Discipline

## Why this rule exists

Bad commits poison history. Once committed, fixes require revert+recommit. Pre-commit hooks catch issues at the cheapest moment (before commit) instead of at the most expensive (post-merge).

Concrete consequence of NOT following: typecheck failures shipped to main; broken builds blocking teammates; lint errors accumulating until "lint cleanup" PR is needed.

## When this rule applies

- All projects scaffolded by Evolve genesis
- All projects manually adopting `.claude/` workflow

This rule does NOT apply when: project explicitly opts out via `.claude/settings.json` override + ADR documenting reason.

## What to do

### Required: 3-tier check pipeline

**Tier 1: pre-commit (fast, on every commit)**
- `lint-staged` runs only on staged files
- Type check incremental (single file)
- Lint changed files
- Format auto-fix
- Time budget: <5 seconds typical

**Tier 2: commit-msg (commitlint)**
- Validates Conventional Commits format
- See `commit-discipline` rule for format

**Tier 3: pre-push (full check, before remote interaction)**
- Full typecheck (whole project)
- Test suite (fast subset, e.g., unit tests)
- Lint full project
- Dep audit (`npm audit` / equivalent)
- Time budget: <60 seconds typical

**Tier 4: CI workflow (backstop)**
- Same as pre-push + e2e tests + cross-platform (Linux + Windows where applicable)
- Block merge until green

### Configuration files (mandatory)

- `.husky/pre-commit` → runs `npx lint-staged`
- `.husky/commit-msg` → runs `npx commitlint --edit $1`
- `.husky/pre-push` → runs `npm run check`
- `commitlint.config.js` → Conventional Commits enforcement
- `lint-staged.config.js` → per-file-pattern checks
- `package.json` → `prepare` script invokes `husky` install
- `.github/workflows/check.yml` → CI mirror

## Examples

### Bad

```json
// package.json with no pre-commit setup
{
  "scripts": {
    "test": "jest"
  }
}
```

Why this is bad: no pre-commit hook → garbage commits possible → main breaks regularly.

### Good

```json
{
  "scripts": {
    "test": "vitest run",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm run lint && npm test",
    "prepare": "husky"
  },
  "devDependencies": {
    "husky": "^9",
    "lint-staged": "^15",
    "@commitlint/cli": "^19",
    "@commitlint/config-conventional": "^19"
  }
}
```

Plus the corresponding `.husky/*` and config files.

Why this is good: full pipeline, enforced from `npm install` (via `prepare`).

## Enforcement

- `supervibe:genesis` (Phase 5) generates all 6 config files automatically
- `scaffold-bundle.yaml` rubric `pre-commit-active` dim (weight 2) requires this
- Code review checks for `.husky/` directory existence in PR's project structure

## Related rules

- `git-discipline` — bans `--no-verify` to skip hooks (implicit, enforced via deny-list)
- `commit-discipline` — what commit-msg hook enforces
- `no-dead-code` — what pre-commit checks via knip

## See also

- https://typicode.github.io/husky/
- https://commitlint.js.org/
- https://github.com/lint-staged/lint-staged
