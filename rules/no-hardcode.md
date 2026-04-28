---
name: no-hardcode
description: "Bans magic numbers, hardcoded strings, inline configs, hardcoded URLs/paths/IDs in production code; require named constants, env vars, or config files. RU: Tokens / config / strings через config или env, не литералы; запрещает magic numbers и hardcoded URLs. Trigger phrases: 'хардкод', 'magic value', 'hardcoded'."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-04-27
related-rules: [no-dead-code, no-half-finished, best-practices-2026]
---

# No Hardcode

## Why this rule exists

Hardcoded values are time bombs. They look fine on day-1 and explode on day-100 when:
- Someone needs to change the value (now hunting through 47 files)
- Tests break because they reference the same hardcoded URL
- Production deploys fail because dev URL is hardcoded
- Compliance audit catches PII embedded in code

Concrete consequence of NOT following: outage at 3am because DB host was hardcoded to dev value; data leak because test API key shipped to production; brand color change requires sweep across 200 files.

## When this rule applies

- Production code (src/, app/, lib/)
- Configuration loaders (use schema validation; values come from env/config files)
- Test fixtures (use factories with named defaults, not literals)

This rule does NOT apply when:
- Sample/example code in docs (clearly marked as example)
- One-shot migration scripts (single use, throwaway)
- Generated code (with clear "// generated" marker)

## What to do

### BANNED patterns

- **Magic numbers**: `setTimeout(() => ..., 3600000)` → `setTimeout(() => ..., HOUR_IN_MS)`
- **Hardcoded strings used in logic**: `if (status === 'active')` → `if (status === USER_STATUS.ACTIVE)` (use enum/constant)
- **Hardcoded URLs**: `fetch('https://api.example.com')` → `fetch(config.apiBaseUrl)`
- **Hardcoded paths**: `readFile('/var/data/users.json')` → `readFile(config.dataPath)`
- **Hardcoded IDs**: `if (userId === 12345)` → `if (userId === ADMIN_USER_ID)` (or feature flag)
- **Hardcoded credentials**: ANY secret in code = critical security violation; use env vars / vault
- **Hardcoded copy**: `<button>Save</button>` → `<button>{t('actions.save')}</button>` (i18n)
- **Hardcoded colors**: `color: #4A90E2` → `color: var(--brand-primary)` (design tokens)
- **Hardcoded spacing**: `padding: 12px` → `padding: var(--space-3)` (design tokens)

### REQUIRED patterns

- **Named constants** for fixed values (top of file or `const/` module)
- **Env vars** for environment-specific config (URLs, hosts, API keys)
- **Config files** for app-level config (validated via Zod/Pydantic on load)
- **Enums** for state machines (status, type, role)
- **i18n keys** for all user-facing copy
- **Design tokens** for all visual values (colors, spacing, typography)

### Numeric literals — when OK

- `0`, `1`, `-1` — universally understood, no name needed
- Math constants in formulas (`Math.PI`, `2 * radius`)
- Array indices in destructuring (`const [first, second] = arr`)
- Loop counters (`for (let i = 0; i < N; i++)`)

Everything else is a magic number.

## Examples

### Bad

```ts
// retention policy
function isExpired(date: Date): boolean {
  return Date.now() - date.getTime() > 2592000000; // what is this number?
}

// brand color in component
<div style={{ background: '#FF6B35', padding: '24px' }}>...</div>

// hardcoded URL
const response = await fetch('https://api.production.example.com/users');

// admin check by ID
if (user.id === 12345) {
  showAdminPanel();
}
```

### Good

```ts
// retention policy with named constant
const RETENTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isExpired(date: Date): boolean {
  return Date.now() - date.getTime() > RETENTION_PERIOD_MS;
}

// design tokens
<div className="bg-brand-primary p-6">...</div>

// config-driven URL
const response = await fetch(`${config.apiBaseUrl}/users`);

// role-based auth
if (user.role === USER_ROLE.ADMIN) {
  showAdminPanel();
}
```

## Enforcement

- Linter rule: `eslint-plugin-no-magic-numbers` (with sensible allowlist: 0, 1, -1, etc.)
- Linter: `eslint-plugin-no-hardcoded-strings` for user-facing strings
- Code review: `code-reviewer` agent flags any hardcoded value as MAJOR finding
- Pre-commit hook: grep for common hardcoded patterns (env-specific URLs, common color hex)
- Secrets scanning: pre-commit secret detection (gitleaks, trufflehog)

## Related rules

- `no-dead-code` — paired (both about code hygiene)
- `no-half-finished` — paired (both ban incomplete state)
- `best-practices-2026` — references token discipline
- `i18n` — enforces no hardcoded user-facing strings

## See also

- 12-Factor App: Config (https://12factor.net/config)
- OWASP A02:2021 Cryptographic Failures (re hardcoded secrets)
