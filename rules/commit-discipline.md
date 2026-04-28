---
name: commit-discipline
description: "Enforces Conventional Commits format (type(scope): subject) via commitlint, with type-enum, subject-case, and length rules. RU: Требует Conventional Commits формат через commitlint. Trigger phrases: 'коммит', 'commit message', 'conventional commits'."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-04-27
related-rules: [git-discipline, pre-commit-discipline]
---

# Commit Discipline

## Why this rule exists

Conventional Commits enable automated changelog generation, semantic version bumping, and grep-able history. Inconsistent messages destroy these benefits and force humans to read every diff to understand what shipped.

Concrete consequence of NOT following: changelog requires manual curation; releases pause waiting for someone to write them; bisect on "fixed stuff" yields no insight; future readers spend 10x time understanding intent.

## When this rule applies

- Every commit on every branch
- Both interactive (developer) and automated (CI bot, Renovate, Dependabot)

This rule does NOT apply when: imported history from other repos (preserve as-is for archaeology).

## What to do

Format: `type(scope): subject`

**Allowed types** (from `commitlint.config.js`):
- `feat` — new feature
- `fix` — bug fix
- `chore` — maintenance, deps, tooling
- `docs` — documentation only
- `test` — test additions/changes
- `refactor` — preserve behavior, improve structure
- `perf` — performance improvement (with measured evidence)
- `ci` — CI configuration
- `build` — build system / external deps
- `revert` — reverts a previous commit

**Subject rules:**
- Lowercase first letter (no UPPER, no PascalCase, no Start-Case)
- ≤100 chars total header length
- Imperative mood ("add" not "added")
- No trailing period

**Body (optional):**
- Blank line after subject
- Wrap at 72 chars
- Explain WHY, not WHAT (diff shows what)

**Footer (optional):**
- `BREAKING CHANGE: <description>` for breaking changes
- `Refs #123` for issue links
- `Co-authored-by: Name <email>` for pair work

## Examples

### Bad

```
WIP stuff
```

Why this is bad: no type, no scope, no useful subject. commitlint fails.

### Bad

```
Added new authentication flow that allows users to log in with Google and also fixed the bug with the password reset email which was going to spam folder for some users
```

Why this is bad: 200+ chars header, mixes concerns (feat + fix should be 2 commits), no type.

### Good

```
feat(auth): add Google OAuth provider

Closes #142.

Adds google-oauth-provider with token exchange, profile fetch,
and email verification check. Existing email-password flow unchanged.

Refs #142
```

Why this is good: type(scope) prefix, single concern, ≤100 char header, body explains why.

### Good

```
fix(billing): clamp negative invoice amounts to zero

Cause: subtotal could go negative when manual discount exceeded
items total. Affected ~3 invoices in production over past month.

Refs #218
```

## Enforcement

- `.husky/commit-msg` hook runs commitlint on every commit
- CI enforces commitlint on PR commits via `commitlint/commitlint-github-action`
- `commitlint.config.js` defines exact rules
- PR title (squash merges) is also linted

## Related rules

- `git-discipline` — paired enforcement (no banned ops + clean messages)
- `pre-commit-discipline` — commit-msg hook is part of pre-commit pipeline

## See also

- https://www.conventionalcommits.org/
- https://commitlint.js.org/
