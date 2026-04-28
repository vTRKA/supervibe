---
name: no-half-finished
description: "Bans placeholder functions, NotImplementedError stubs, TODO/FIXME comments in production paths, mock returns shipped as real, half-wired UI. RU: Запрещает закомиченный код, orphan TODOs, half-applied refactors, placeholder функции. Trigger phrases: 'TODO', 'commented out', 'заглушка'."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-04-27
related-rules: [no-dead-code, no-hardcode, confidence-discipline]
---

# No Half-Finished

## Why this rule exists

Half-finished code in production is worse than no code:
- Placeholder functions return `null`/`undefined` and crash callers
- `throw new NotImplementedError()` stubs reach production and 500 the user
- TODO comments accumulate as silent debt; no one tracks them
- "Coming soon" UI buttons that don't work damage trust
- Mock returns shipped as real return fake data to real users

Concrete consequence of NOT following: user clicks "Export" and gets blank file (button wired to placeholder); checkout flow returns "TODO: implement payment" 500 error in production; users see admin features that throw on click.

## When this rule applies

- Any code reaching `main` / production
- Any UI element rendered to users
- Any API endpoint exposed to consumers

This rule does NOT apply when:
- WIP branch / draft PR (clearly marked, not merged)
- Spike branch (with explicit `archive/` rename or discard plan)
- Future-proofed extension points (with `@experimental` annotation + feature flag gate)

## What to do

### BANNED patterns

- **Placeholder return**: `function foo() { return null; /* TODO */ }` — either implement or don't add the function
- **Throw-stub**: `throw new NotImplementedError("TODO: implement")` — same
- **Empty UI handler**: `<button onClick={() => {}}>Export</button>` — either wire it or remove it
- **TODO/FIXME in production code without ticket**: `// TODO: handle error case` — file ticket and link, OR fix now
- **Mock returns shipped**: `return { id: 'mock-1', name: 'Test User' };` in non-test code
- **Half-wired UI**: button visible but disabled with no explanation (or worse, enabled with no handler)
- **Commented-out code**: deleted code via `//` instead of `git rm`
- **`console.log()`** debug statements in production
- **Coming soon**: features advertised but not built

### REQUIRED patterns

- **Feature flags** for in-progress features (hidden until ready)
- **`@experimental` JSDoc** for unstable APIs (callers know risk)
- **Ticket links in TODOs**: `// TODO(ENG-123): handle 429 rate limit` — never bare TODO
- **Issue references** for known incomplete: `// FIXME(ENG-456): N+1 in this loop, batch via DataLoader`
- **Feature gates** instead of half-built UI: don't render the button if backend not ready

### Acceptable temporary states

- During development on a feature branch (must be resolved before merge)
- Behind feature flag (must be hidden by default until verified)
- In `experimental/` namespace (caller opts in to instability)

## Examples

### Bad

```ts
// payment service
class PaymentService {
  async processPayment(amount: number): Promise<PaymentResult> {
    throw new NotImplementedError("TODO: implement Stripe integration");
  }
}

// UI
<button onClick={() => alert('Coming soon!')}>Export to PDF</button>

// admin module
function deleteUser(userId: string) {
  // TODO: actually delete
  console.log(`Would delete user ${userId}`);
}
```

### Good

```ts
// payment service — feature flag gates exposure
class PaymentService {
  async processPayment(amount: number): Promise<PaymentResult> {
    if (!features.payments.enabled) {
      throw new FeatureUnavailableError('payments');  // typed, handled at boundary
    }
    return this.stripeClient.charge(amount);  // actual implementation
  }
}

// UI — hidden until ready
{features.export.enabled && (
  <button onClick={handleExport}>Export to PDF</button>
)}

// admin module — implemented or not present
async function deleteUser(userId: string): Promise<void> {
  await db.users.delete(userId);
  await auditLog.write({ action: 'user.delete', userId, by: currentUser.id });
}
```

## Enforcement

- Linter: search for `TODO:`/`FIXME:` without ticket reference (CI fails)
- Linter: search for `NotImplementedError`/`throw.*not.*implemented` (CI fails)
- Linter: `no-console` rule (allow only in dev tooling)
- Code review: `code-reviewer` agent flags as MAJOR
- Pre-PR check: grep for forbidden patterns
- Feature flag library mandatory for in-progress features

## Related rules

- `no-dead-code` — paired (both about completeness)
- `no-hardcode` — paired (both about production-readiness)
- `confidence-discipline` — half-finished can never score ≥9

## See also

- "Done means done" — Joel Spolsky
- Feature flag patterns (LaunchDarkly / Unleash docs)
