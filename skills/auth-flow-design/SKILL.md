---
name: auth-flow-design
namespace: app-excellence
description: >-
  Use BEFORE implementing authentication TO choose the right flow
  (authorization-code+PKCE / client-credentials / device-code /
  resource-owner-password) for the use case. Triggers: 'auth flow', 'дизайн
  авторизации', 'OAuth выбор', 'как сделать логин'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: design
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Auth Flow Design

## When to invoke

BEFORE implementing the first auth path of a new app. BEFORE adding a new client type (mobile, CLI, third-party integration) to an existing identity provider. WHEN refresh tokens are not rotating. WHEN logging out only clears a cookie and leaves a JWT alive in localStorage. WHEN someone proposes the password grant for a third-party integration.

This skill picks the OAuth 2.x / OIDC flow per client type, defines refresh-token rotation, decides session-cookie vs. token storage, and coordinates logout across SPA + API + IdP.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read OAuth 2.1 draft, OAuth 2.0 core, PKCE, device authorization, deprecated ROPC guidance, bearer token, and JWT access token specs.
2. Read the IdP docs in use (Auth0, Okta, Keycloak, Cognito, Entra ID, custom). Capability matrices vary; some IdPs disable certain flows by default.
3. Inventory existing clients: `grep -rE "grant_type|response_type|client_id|redirect_uri" src/`. Each hit is a flow already in production.
4. Read app threat model: which clients are public (cannot keep a secret) vs. confidential (can).
5. Read session backend (Redis, signed cookie, DB-backed). Logout coordination depends on whether tokens are reference or self-contained.

## Decision tree

```
What is the client type?
  Browser SPA / mobile app (public client)        → authorization-code + PKCE; NO client secret
  Server-to-server / backend job                  → client-credentials; client secret in secret manager
  CLI / TV / device with no browser              → device authorization grant
  First-party native app + own users (rare)       → still authorization-code + PKCE in a system browser
  Third-party password grant                      → REJECT (ROPC); redesign as authorization-code

Token storage on browsers?
  HttpOnly+Secure+SameSite cookie (refresh)       → preferred; XSS-resistant
  In-memory access token, short TTL               → preferred; never localStorage
  localStorage / sessionStorage                   → REJECT; trivially exfiltrated by any XSS

Refresh strategy?
  Public client (SPA / mobile) → refresh-token ROTATION mandatory; reuse detection revokes the family
  Confidential client          → rotation recommended; long-lived refresh allowed if bound to client cert

Logout?
  Single client → clear cookie + revoke refresh token at IdP
  Multiple clients (SSO) → IdP-initiated logout plus back-channel logout and discovery metadata to every relying party
```

## Procedure

1. **Pick the flow per client** from the decision tree. Document each client's flow, redirect URIs, allowed scopes, and PKCE method (`S256`, never `plain`).
2. **Public vs. confidential**: classify every client. Public clients never hold a secret; if your design requires one, the client is misclassified.
3. **PKCE everywhere**: even confidential clients running authorization-code SHOULD use PKCE; OAuth 2.1 makes this default. No exceptions for SPAs.
4. **Refresh-token rotation**: enable rotation at the IdP. Define the reuse-detection policy: a refresh-token replay revokes the entire token family and forces re-auth. Keep refresh-token TTL bounded (sliding window, max absolute lifetime).
5. **Storage rules**: refresh token in HttpOnly + Secure + SameSite=Lax/Strict cookie scoped to the auth domain; access token in memory only; never persist either to localStorage / IndexedDB. Mobile apps use the platform secure store (Keychain / Keystore).
6. **Session-cookie + JWT hybrid**: pick one boundary. Either the API trusts the session cookie (and looks up state) or the API trusts a short-lived JWT. Mixing both creates a logout race where the cookie is gone but the JWT outlives it.
7. **Logout coordination**: server clears the session, revokes the refresh token at the IdP, AND broadcasts logout to other tabs (BroadcastChannel) and other relying parties (back-channel logout). Document the maximum staleness window for any access token still in flight.
8. **CSRF**: cookie-based auth requires CSRF defence (double-submit token or SameSite=Strict + origin check). Token-based auth in `Authorization` header avoids CSRF but takes on XSS risk.
9. **Output**: the auth design (see Output contract) signed off by security review before code.
10. **Score** — invoke `supervibe:confidence-scoring` with artifact-type=agent-output; ≥9 required to mark this skill complete.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

## Output contract

```
Clients:
  <client-id> | type=<public|confidential> | flow=<auth-code+PKCE|client-creds|device|...>
                redirect_uris=<list>  scopes=<list>  pkce=S256
Token TTLs:
  access:  <minutes>
  refresh: <hours>; rotation=ON; reuse-detection=family-revocation
Storage:
  refresh: HttpOnly + Secure + SameSite=<Lax|Strict>; domain=<auth domain>
  access:  in-memory only
  mobile:  Keychain / Keystore
Logout:
  server: revoke refresh + clear session
  client: BroadcastChannel for tab fanout
  IdP:    back-channel logout to <list of relying parties>
  staleness window: <seconds> for in-flight access tokens
CSRF: <strategy>
Threat-model notes: <XSS / open redirector / mix-up / token substitution>
```

## Anti-patterns

- **ROPC-for-third-party** — password grant for a third-party integration; hands credentials to code that should never see them. Always replaced by authorization-code.
- **no-PKCE-on-spa** — authorization code interception attack is trivial without PKCE; never rely on `state` alone.
- **refresh-without-rotation** — long-lived refresh token equals long-lived breach if leaked.
- **session-and-jwt-mixed** — logout race: cookie gone, JWT alive; ambiguous source of truth on the API.
- **logout-only-clears-cookie** — IdP session and refresh token still valid; next page load silently re-auths.
- **jwt-in-localStorage** — any XSS exfiltrates the token; HttpOnly cookie is the baseline, not an upgrade.

## Verification

- Each client has a named flow; no client uses ROPC for third-party data.
- PKCE is `S256` for every public client; verifier is checked at the IdP.
- Refresh tokens rotate and reuse triggers family revocation (test it).
- No access token or refresh token appears in localStorage / IndexedDB.
- Logout clears server session, revokes refresh at the IdP, and propagates to other tabs/relying parties.
- CSRF defence is named and matches the storage choice.

## Guard rails

- Do not mutate files, provider state, network resources, or external tools unless this skill's procedure and the user approval path allow it.
- Do not skip prerequisites, confidence gates, policy gates, or explicit approval gates.
- Do not claim completion without concrete verification evidence.
- Preserve user-owned content and unrelated worktree changes.

## Related

- `supervibe:error-envelope-design` — auth errors share the project envelope (e.g. `auth.token_expired`).
- `supervibe:test-strategy` — contract tests cover refresh rotation and logout propagation.
- `supervibe:prd` — record the flow choice per client as a PRD decision section.
- `supervibe:incident-response` — token compromise runbook depends on the rotation + revocation design here.
