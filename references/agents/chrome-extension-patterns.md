# Chrome Extension Patterns

Reusable MV3 architecture and implementation depth relocated from chrome-extension agents.

## Slicing Contract

- Agent files keep persona, invocation boundary, procedure, output contract, skills, verification, dialogue discipline, and anti-patterns.
- This reference holds reusable depth: decision trees, workflow matrices, detailed examples, and output templates.
- Load this file only when the current task needs the deeper pattern; otherwise use the concise agent contract.
- Treat copied source sections as reference patterns, not mandatory steps for every task.

## Chrome Extension Architect: Decision Tree

Source agent: `agents/stacks/chrome-extension/chrome-extension-architect.md`
Moved content type: MV3 architecture and permission routing tree

## Decision tree

```
MV3 vs MV2
  Always MV3 for new work. MV2 is deprecated for the public Chrome Web Store
  (June 2024 cutover; enterprise force-installed extensions on a long tail
  but new public submissions must be MV3).
  Exception: Firefox-only extensions may still ship MV2 today — but if cross-browser
  is in scope, design MV3 once and use webextension-polyfill for Firefox.

BACKGROUND: SERVICE WORKER vs OFFSCREEN DOCUMENT vs ALARMS
  Default: service worker — ephemeral, event-driven, sleeps at ~30s idle.
  Switch to offscreen document when ≥1 holds:
    - Need DOM APIs (DOMParser, audio playback, clipboard read, geolocation)
    - Need a long-lived WebSocket or WebRTC connection
    - Need to render off-screen for OCR / canvas work
    - Need iframe sandboxing for untrusted third-party HTML
  Switch to alarms (chrome.alarms) when:
    - Need periodic work (>1 minute interval) that survives service-worker sleep
    - setInterval is forbidden — it dies with the worker
  Anti-pattern: keep service worker alive with a fake long-lived port. Google
    explicitly broke this in late 2024; do not bake the workaround into design.

CONTENT SCRIPT vs declarativeNetRequest
  Use declarativeNetRequest (DNR) when:
    - Blocking, redirecting, or modifying headers on network requests
    - Static rule set (loaded from JSON) OR dynamic rules under 30k limit
    - No need to read response bodies
  Use content script when:
    - Need to read/modify rendered DOM
    - Need to inject UI (overlay, button, tooltip)
    - Need to observe page state changes (MutationObserver, intersection)
  Use webRequest (blocking) when:
    - Enterprise policy explicitly grants it (consumer MV3 dropped blocking webRequest)
  Anti-pattern: content script that re-implements ad-block / request-blocking with
    fetch interception — DNR is faster, safer, and doesn't need host_permissions.

CONTENT SCRIPT WORLD: ISOLATED vs MAIN
  Default: ISOLATED. Has its own JS context, can't see page's window.* directly,
    can't be reached by page's JS. Strong isolation is the safer default.
  Switch to MAIN when:
    - Need to call into a page-defined global (e.g., a known SDK on window)
    - Need to override a page method visible to other page code
  When using MAIN:
    - Inject the smallest possible shim
    - Use postMessage + window event names with a unique nonce to talk to the
      ISOLATED-world content script — never share scope directly
  Anti-pattern: putting all logic in MAIN world for convenience; this exposes
    extension code to malicious page scripts.

POPUP vs SIDE PANEL vs OPTIONS PAGE
  Popup (action.default_popup):
    - Quick actions, status, single-screen
    - Closes when user clicks outside; not suitable for long workflows
  Side Panel (chrome.sidePanel API):
    - Persistent UI, stays open across tab switches
    - Right answer for sustained workflows (chat, reader, sidebar tools)
    - Requires Chrome 114+; feature-detect for older Chromium forks
  Options page (chrome.runtime.openOptionsPage):
    - Settings, account, advanced configuration
    - Full-page form UX, not for primary workflow
  Decision: pick the surface that matches the user task duration. Popup for
    seconds, side panel for minutes, options for setup-once.

CSP HARDENING
  Default extension_pages CSP (MV3 enforced):
    "script-src 'self'; object-src 'self'"
    No 'unsafe-inline', no 'unsafe-eval', no remote script URLs.
  Sandbox CSP (for sandboxed iframes inside the extension):
    Permitted to use eval and inline-script; sandbox MUST NOT have access to chrome.* APIs.
  Anti-pattern: trying to relax extension_pages CSP to load remote scripts —
    rejected by CWS review every time. Bundle dependencies into the extension.

PERMISSIONS: REQUIRED vs OPTIONAL
  Required (manifest "permissions"):
    - Used on first run, integral to core value
    - User must accept at install; refusing = no install
  Optional (manifest "optional_permissions" + chrome.permissions.request):
    - Used by feature subsets, gated by user action
    - Granted at runtime via user gesture; can be revoked
  Rule: every permission that is NOT used in the first 60 seconds of typical
    usage is a candidate for optional_permissions. Smaller install-time
    permission set = higher install conversion.

HOST PERMISSIONS
  Match patterns: tighter is always better.
    - "https://api.example.com/*" >>> "https://*.example.com/*" >>> "<all_urls>"
  Use optional_host_permissions for sites discovered at runtime.
  Use activeTab when the user clicks the extension action — grants tab access
    for that single invocation, no host_permissions needed.
  Anti-pattern: <all_urls> "in case the user wants to use it on any site".
    Use activeTab + content-script-injection-on-click pattern instead.

NATIVE MESSAGING vs IN-EXTENSION
  Use native messaging when ≥1 holds:
    - Need OS-level access (file system, system clipboard beyond what extension API gives,
      shell, hardware)
    - Need to bridge to a desktop app the user installs
  Stay in-extension when:
    - Pure web APIs suffice
    - You can use chrome.storage / IndexedDB for persistence
  Anti-pattern: native messaging "for future flexibility" — it doubles the
    distribution surface (user must install host app), CWS scrutinizes the
    declared host name, and signing/notarization on macOS adds friction.

CWS PUBLISHING READINESS
  Block before submission if any holds:
    - Any permission lacks a one-sentence purpose disclosure
    - Privacy policy URL missing or 404
    - Data collection disclosure does not match actual data sent
    - Remote code execution path exists (eval, new Function, remote script src)
    - host_permissions includes <all_urls> without explicit user-toggle gating
    - Manifest "name", "description", "author", "homepage_url" missing
    - Icons missing for 16 / 32 / 48 / 128 sizes
    - Screenshots: <1 or >1280x800 / <640x400
```

## Chrome Extension Architect: PRD Decision Template

Source agent: `agents/stacks/chrome-extension/chrome-extension-architect.md`
Moved content type: architecture decision and CWS disclosure template

## Context

<2-4 paragraphs: capability driver, target users, browsers in scope, distribution
plan (CWS / Edge Add-ons / Firefox AMO / enterprise sideload), expected install
base, regulatory constraints (GDPR, CCPA, education-K12).>

## Decision

### Manifest skeleton
<Annotated manifest.json with each field justified.>

### Surfaces
- Service worker: <yes/no, why>
- Content scripts: <which match patterns, which world, why>
- Popup / Side panel / Options: <which exist, which user task each serves>
- Offscreen document: <if present, why>
- Native messaging host: <if present, why>

### Message-passing topology
<ASCII or Mermaid diagram. Every arrow labeled with message-type discriminator.>

### Permissions (required)
- `<permission>` — purpose: "<one sentence for CWS disclosure>"
- ...

### Permissions (optional)
- `<permission>` — purpose: "<one sentence>", requested at: "<user gesture>"
- ...

### Host permissions
- `<match-pattern>` — purpose: "<one sentence>"

### CSP
- extension_pages: `<policy>`
- sandbox (if any): `<policy>` with rationale

## Alternatives Considered

1. **<Alternative A>** — <1-2 sentences>. Rejected because: <specific reason>.
2. **<Alternative B>** — <1-2 sentences>. Rejected because: <specific reason>.
3. **Status quo (do nothing / stay on MV2)** — <1-2 sentences>. Rejected because: <specific reason>.

## Consequences

**Positive**:
- <consequence with measurable signal where possible>

**Negative**:
- <consequence; do not hide costs — including review-time risk if any>

**Neutral / accepted trade-offs**:
- <e.g., service worker ephemerality forces storage-backed state>

## Migration Plan (if applicable)

1. <Step 1 — concrete, owner, estimated effort>
2. ...

**Rollback path**: <how to undo if mid-migration failure or CWS rejection>
**Reversibility**: One-way (CWS published) | Reversible (pre-publish)
**Estimated effort**: N engineer-days, M calendar weeks
**Blast radius**: <existing user count if shipped extension>

## CWS Purposes Disclosure (draft)

<Copy-paste-ready block for the CWS listing's "Permissions justification" field.>

## Verification

- [ ] manifest_version: 3
- [ ] No <all_urls> in host_permissions (or explicit user-toggle gating covered by PRD decision section)
- [ ] No remote script src / no eval / no new Function / no inline scripts
- [ ] Every permission has a one-sentence CWS purpose
- [ ] Service worker assumed ephemeral — no module-scope state
- [ ] Message types are discriminated unions, version-tagged
- [ ] declarativeNetRequest rule count under 30k (if used)
- [ ] web_accessible_resources scoped to specific match patterns
```

End every delivery with the canonical footer block (see end of this file).

## Chrome Extension Architect: Common Workflows

Source agent: `agents/stacks/chrome-extension/chrome-extension-architect.md`
Moved content type: MV3 architecture workflow matrix

## Common workflows

### New MV3 extension from scratch

1. Read the active host instruction file + run `supervibe:requirements-intake` for capability driver
2. `supervibe:project-memory` — prior extension PRD decision sections (if any), permission lessons learned
3. `supervibe:mcp-discovery` — pull current Chrome Extensions API docs via context7 (MV3 surface changes quarterly)
4. List user tasks → map each task to a surface (popup / side panel / options / content script / offscreen / native host)
5. Draw message-passing topology — every surface pair, every message type, version tag, transport (sendMessage vs Port)
6. Compute minimum permission set: start at zero, add per code-path justification, split required vs optional
7. Tighten host permissions by path/subdomain; consider `activeTab` first; consider optional_host_permissions for runtime-discovered sites
8. Confirm extension_pages CSP stays at MV3 default; identify any third-party JS that needs bundling
9. Plan declarativeNetRequest rule budget if blocking/redirecting is in scope
10. Scope web_accessible_resources to specific match patterns
11. Draft annotated `manifest.json` template
12. Draft CWS purposes disclosure (one sentence per permission)
13. Write PRD decision section with alternatives (e.g., MV2 still allowed elsewhere — rejected; native messaging — rejected unless OS access needed)
14. Verify against anti-patterns
15. Confidence score ≥9; deliver PRD decision section + annotated manifest + topology diagram + CWS disclosure draft

### MV2 to MV3 migration

1. Read existing `manifest.json` v2 — inventory background page, persistent flag, browser_action vs page_action, webRequest blocking usage, content_security_policy string
2. `supervibe:project-memory` — prior MV3 attempts in this codebase, blockers found
3. `supervibe:code-search` for `chrome.extension.getBackgroundPage`, `chrome.runtime.getBackgroundPage`, `chrome.webRequest.*` listeners with blocking, `chrome.browserAction`, `eval(`, `new Function(`, inline `<script>` — every one is a migration item
4. Convert background page → service worker:
   - Identify all module-scope state in current background.js → move to `chrome.storage.session` / `chrome.storage.local`
   - Identify long-lived connections (WebSocket, SSE, polling timers) → migrate to offscreen document
   - Identify periodic work → migrate to `chrome.alarms`
   - Identify DOM-API usage (DOMParser, audio) → migrate to offscreen document
5. Convert blocking webRequest → declarativeNetRequest static + dynamic rules; budget rule count under 30k
6. Replace `browser_action` / `page_action` → `action` field
7. Move host permissions from `permissions[]` to `host_permissions[]` (MV3 split)
8. Update CSP from string format to object format (`extension_pages` / `sandbox`)
9. Audit remote-code paths — any `<script src="https://...">` in extension HTML, any `executeScript({code: ...})` (MV3 only allows `func` + `args` or `files`); refactor or remove
10. Test in `chrome://extensions` with "Load unpacked" pointing at MV3 build; check service-worker registration, message flows, content-script injection
11. Write migration PRD decision section with step ordering, rollback (re-publish MV2 to enterprise track only), CWS resubmission risk, user-impact estimate (settings reset? re-permission prompt?)
12. Confidence score ≥9; deliver

### Add a new permission to a shipped extension

1. Read current `manifest.json` and CWS listing
2. `supervibe:project-memory` — prior permission additions, CWS review history, rejection notes
3. Identify the user-facing feature requesting the permission; tie to a specific user task
4. Decide: required (added to `permissions[]`, triggers update prompt to existing users — high friction) vs optional (added to `optional_permissions[]`, requested at runtime via user gesture — low friction)
5. Strong default: optional, unless the feature is core to first-run UX
6. Tighten match pattern if it's a host permission
7. Draft updated CWS purposes disclosure for the new permission
8. Estimate update-prompt user impact: existing users granted permissions will get a re-prompt for new permissions; opt-out users will be auto-disabled until they re-accept; this can crater MAU
9. Write PRD decision section: context (the new feature), decision (required vs optional, match pattern), alternatives (do without; gate behind activeTab; gate behind native messaging), consequences (user-impact estimate, CWS review risk)
10. Plan staged rollout: ship to small percentage via CWS gradual rollout if available; monitor uninstall rate
11. Confidence score ≥9; deliver

## Chrome Extension Developer: Output Contract

Source agent: `agents/stacks/chrome-extension/chrome-extension-developer.md`
Moved content type: feature delivery report template

## Output contract

Returns:

```markdown
# Feature Delivery: <feature name>

**Developer**: supervibe:stacks/chrome-extension:chrome-extension-developer
**Date**: YYYY-MM-DD
**PRD decision section referenced**: .supervibe/artifacts/prd/<NNNN>-<title>.md (status: Accepted)

### Summary
<1–2 sentences: what was built and which surface(s) it touches.>

### Files written / modified

| Path | Surface | Purpose |
|------|---------|---------|
| `extension/src/background/<feature>.ts` | service worker | Event handler, message reducer |
| `extension/src/content/<feature>.ts`    | content script (ISOLATED) | DOM observation, message bridge |
| `extension/src/popup/<Feature>.tsx`     | popup | UI for <user task> |
| `extension/src/lib/messages.ts`         | shared | Added `<MessageType>` discriminator |
| `extension/src/lib/storage.ts`          | shared | Added `<key>` typed accessor |
| `extension/manifest.json`               | manifest | New content_scripts entry / permission (if any) |
| `extension/_locales/en/messages.json`   | i18n | Keys: `<key1>`, `<key2>` |
| `tests/<feature>.test.ts`               | unit | N test cases, all green |

### Tests
- `tests/<feature>.test.ts` — N test cases (vitest), all green
- `tests/e2e/<feature>.spec.ts` — M Playwright cases (popup render + interaction), all green
- Coverage delta on `extension/src/<feature>/`: +N%

### Verification (verbatim tool output)
- `npx tsc --noEmit`: 0 errors
- `npx eslint .`: 0 errors, 0 warnings
- `npx web-ext lint --source-dir dist`: 0 errors, 0 warnings
- `node -e 'JSON.parse(...)'` on `dist/manifest.json`: parses, manifest_version=3
- Load-unpacked smoke: popup renders, console clean, 0 CSP violations
- Grep-checks: no `localStorage`, no `setTimeout`/`setInterval` in `src/background/`, no `eval`, no `new Function`, no inline `<script>`

### Graph evidence
<Case A / Case B / Case C — see template below.>

### Anti-pattern audit
- [x] Service worker has no module-scope mutable state
- [x] No `setTimeout`/`setInterval` in service worker (alarms used for periodic work)
- [x] Every `port.onMessage` paired with `port.onDisconnect`
- [x] `chrome.runtime.lastError` checked in every callback
- [x] Content script in ISOLATED world unless PRD decision section justifies MAIN
- [x] CSS scoped via Shadow DOM (no host-page bleed)
- [x] Storage scope chosen per data lifetime (local / sync / session)
- [x] No DOM injection without escaping (textContent over innerHTML)

### Follow-ups (out of scope)
- <e.g., new permission addition deferred to chrome-extension-architect PRD decision section>
- <e.g., CWS listing copy update deferred to copywriter>

**Canonical footer** (parsed by PostToolUse hook for improvement loop):

```
Confidence: <N>.<dd>/10
Override: <true|false>
Rubric: agent-delivery
```
```

## Chrome Extension Developer: Common Workflows

Source agent: `agents/stacks/chrome-extension/chrome-extension-developer.md`
Moved content type: implementation workflow matrix

## Common workflows

### Add a new popup feature

1. Read the architect's PRD decision section for popup surface; confirm popup is the right surface (popup closes on outside click — if the workflow takes >10s, side panel is probably correct).
2. `supervibe:project-memory` for prior popup features; `supervibe:code-search --query "<feature topic>" --lang typescript`.
3. Read existing `src/popup/<App>.tsx` (or framework equivalent) for component conventions.
4. Decide: which messages does this feature dispatch? Which storage keys does it read/write? Add types to `src/lib/messages.ts` and `src/lib/storage.ts` first; type contract before UI.
5. Write failing vitest test for the message reducer / storage adapter; write failing Playwright test for the popup interaction (click → expected DOM change).
6. Implement message handler in service worker; implement storage helper; implement popup UI component using existing framework.
7. Wire i18n: every user-visible string goes through `chrome.i18n.getMessage(key)`; add keys to `_locales/en/messages.json`.
8. Build, load unpacked, click extension action, verify popup renders, console clean.
9. Run tsc / eslint / web-ext lint / vitest / Playwright; capture verbatim output.
10. Self-review against anti-patterns; confidence score; deliver.

### Add a new content script for site X

1. Read architect's PRD decision section for the content-script surface; confirm `host_permissions` already covers site X (or open a PRD decision section-update task to add it — do NOT add permissions silently).
2. Decide world: ISOLATED unless there's a specific need to call into a page-defined global on `window`. Document the choice in the commit message.
3. Decide CSS scoping: Shadow DOM (open mode for testability) is the default. Plain stylesheets only if injected UI must inherit page styles.
4. `supervibe:code-search` for similar content scripts in the project; reuse patterns (selectors, MutationObserver shape, message bridge to service worker).
5. Add `content_scripts[]` entry to `manifest.json`: `matches`, `js`, `css` (if any), `run_at` (default `document_idle` unless DOM must be observed earlier), `world` (default ISOLATED).
6. Write failing test: vitest for any pure logic (URL matcher, DOM-extraction function with jsdom); Playwright spec navigating to a fixture page that mimics site X structure.
7. Implement: create shadow root, render UI, wire MutationObserver with a debounced handler, send messages to service worker for any cross-origin fetch (content scripts can't fetch where host_permission is missing — service worker can if granted).
8. Add cleanup: store the observer + listener references on a sentinel object; on `pagehide` event tear down to avoid leaks across SPA route changes.
9. Build, load unpacked, navigate to site X, verify content script injects, no DOM mutations break the host page, console clean, no CSP violations.
10. Run tsc / eslint / web-ext lint / vitest / Playwright; deliver with anti-pattern audit.

### Migrate one MV2 background event listener to MV3 service worker

1. Read MV2 `background.js` — identify the listener (`chrome.tabs.onUpdated`, `chrome.webRequest.onBeforeRequest`, `chrome.runtime.onInstalled`, etc.).
2. Inventory module-scope state the listener touches — every `let`, `const` of mutable Map/Set/object, every long-lived connection, every timer.
3. For each piece of state, decide migration target:
   - Per-session ephemeral → `chrome.storage.session`
   - Persistent across restart → `chrome.storage.local`
   - Periodic timer → `chrome.alarms` (replace `setInterval`)
   - Long-lived WebSocket / DOMParser / audio → offscreen document (separate task; defer to architect if not yet covered by PRD decision section)
4. Refactor listener: register at module top synchronously (must run on every service-worker wake before it idles again), read state from storage on entry, write state back before returning, never rely on closure-captured mutable state.
5. For blocking webRequest listeners: refactor to declarativeNetRequest (consumer MV3 dropped blocking webRequest). If genuinely impossible without webRequest, escalate to architect — this is now an enterprise-only carve-out.
6. Replace `chrome.tabs.executeScript({code: '...'})` calls with `chrome.scripting.executeScript({func: f, args: [...]})` or `{files: ['...']}`. The string-code form is forbidden under MV3.
7. Write a vitest test that exercises the new handler with a mocked `chrome.*` API (use `@vitest/mock-chrome` or hand-rolled mocks) — assert the storage round-trip works.
8. Write a manual smoke: trigger the event in `chrome://extensions` (e.g., visit a matching URL for `tabs.onUpdated`), verify the handler fires after a service-worker wake.
9. Run full verification: tsc / eslint / web-ext lint / unit tests / load-unpacked smoke.
10. Deliver migration report listing every state piece moved + every API replaced + every test added.

### Wire `chrome.alarms` for periodic work

1. Decide alarm period: minimum 1 minute on consumer Chrome (30s in dev, but ship 1m+).
2. Register the alarm on `chrome.runtime.onInstalled` AND `chrome.runtime.onStartup` — onInstalled fires on install/update, onStartup on browser launch; both are needed for alarms to survive across user sessions.
3. Use `chrome.alarms.create(name, { periodInMinutes })` with a stable `name` so re-registration is idempotent (creating an alarm with an existing name replaces it).
4. Register `chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === '<name>') ... })` at module top — must be synchronous so the worker registers before idling.
5. The alarm handler reconstructs all state from storage; never assume module-scope cache survived since the last alarm fire.
6. Write a vitest test mocking `chrome.alarms` and asserting the handler reads from storage and writes the expected updates.
7. Manual smoke: in `chrome://extensions` "Inspect views: service worker", run `chrome.alarms.getAll()` to confirm the alarm is registered; force-fire via `chrome.alarms.create('<name>', { delayInMinutes: 0.1 })` for a quick test.

## Chrome Extension Developer: Code Placement Decision Tree

Source agent: `agents/stacks/chrome-extension/chrome-extension-developer.md`
Moved content type: MV3 code-placement routing tree

## Decision tree (where does this code go?)

```
BUNDLER (one-time per project; do not bikeshed mid-feature)
  Project already has Vite          → @crxjs/vite-plugin
  Project wants opinionated DX      → WXT (file-based routing for surfaces)
  Project wants TypeScript-first    → Plasmo (built-in TS, React, but heavier conventions)
  Project is greenfield + minimal   → vanilla webpack OR Vite + CRXJS (preferred default)
  Decision lives in the architect's PRD decision section — do not change it without superseding the PRD decision section.

LANGUAGE
  TypeScript YES — always for new code; @types/chrome catches API drift early
  JavaScript only when: extending a vanilla-JS legacy extension and migrating
    incrementally. Mark .js files for eventual migration.

POPUP / OPTIONS / SIDEPANEL UI
  Vanilla DOM         → for tiny popups (<3 controls, no state)
  Web Components      → for shareable widgets across surfaces
  React               → default for non-trivial popups + side-panel workflows
  Vue / Svelte        → if the broader project already standardizes on it
  Decision: match the project's existing UI stack. Do not introduce a second framework.

CSS SCOPING IN CONTENT SCRIPTS
  Shadow DOM (open or closed)       → default; isolates host-page CSS bleed both ways
  Plain <link rel="stylesheet">     → only if the injected UI must inherit page styles
  Inline <style> in content script  → never; pull into shadow root or external file
  Tailwind in shadow DOM            → emit `:host` and `:where()` rules; rely on
    @tailwindcss/forms/typography only inside the shadow scope.

CONTENT SCRIPT WORLD: ISOLATED vs MAIN
  Default ISOLATED — own JS context, page can't see extension code.
  Switch to MAIN only when: must call into a page-defined global (e.g., a known SDK
    on `window`), or must override a page method visible to other page code.
  When MAIN: inject the smallest possible shim; talk back to the ISOLATED-world
    counterpart via `window.postMessage` with a unique nonce per extension version.
  Anti-pattern: putting all logic in MAIN for convenience — page can tamper.

MESSAGE PASSING: sendMessage vs Port vs storage broadcast
  chrome.runtime.sendMessage(msg, cb) — request/response, one-shot.
    Use when: caller needs a single reply; service worker can wake, handle, sleep.
  chrome.runtime.connect({name}) → Port — bidirectional, streaming, until disconnect.
    Use when: long-lived stream (live updates, progress events). MUST handle
    `port.onDisconnect` to clean up listeners and chrome.runtime.lastError.
  chrome.storage.local.set({ key }) + chrome.storage.onChanged broadcast
    Use when: many listeners want the same state change without explicit topology;
    fan-out via storage is the right pattern when popup, sidepanel, and content
    script all need the same update.
  Decision: pick one per channel. Mixing within the same surface pair makes the
  topology untraceable.

PERIODIC WORK: alarms vs setTimeout vs setInterval
  chrome.alarms — ALWAYS for any interval ≥1 minute. Survives service-worker sleep.
  setTimeout / setInterval — forbidden in service worker; allowed only inside
    long-lived UI surfaces (popup while open, sidepanel, offscreen document).
  Anti-pattern: setInterval inside a service worker as a "keepalive" — Google
    closed this loophole; use the right primitive instead.

STORAGE SCOPE: local vs sync vs session
  chrome.storage.local — persistent across browser restart, ~10MB quota by default,
    unlimitedStorage permission to grow. Default for app data.
  chrome.storage.sync — synced across the user's signed-in Chrome profiles, ~100KB
    quota with per-key limits. Use ONLY for user preferences that should follow
    them. Never for app state, never for secrets.
  chrome.storage.session — in-memory for the browser session, cleared on restart.
    Right answer for ephemeral state the service worker needs to reconstruct
    after wake (e.g., last-active tab id, in-progress request maps).
  Anti-pattern: localStorage / sessionStorage in extension pages — works but is
    not synced across surfaces, not awaitable, and not the right vehicle.

DECLARATIVE NET REQUEST vs CONTENT SCRIPT for network manipulation
  declarativeNetRequest (DNR) — header rewrite, redirect, block, modify; under the
    30k dynamic-rule cap; no host_permissions needed for static rules.
  Content script + fetch interception — only if you need to read response bodies,
    which DNR cannot do.
  Anti-pattern: re-implementing ad-block in a content script when DNR exists.

NATIVE MESSAGING
  Use only when: OS-level access required (file system beyond extension API,
  hardware, shell, native app bridge). Otherwise stay in-extension.

GRAPH USAGE before refactor (mandatory per rule use-codegraph-before-refactor)
  Need to know who/what depends on a symbol?
    --callers <name>      who calls this
    --callees <name>      what does this call
    --neighbors <name>    BFS expansion (depth 1-2)
  Run BEFORE rename / move / extract / delete on any exported symbol.
```

## Chrome Extension Developer: Graph Evidence Template

Source agent: `agents/stacks/chrome-extension/chrome-extension-developer.md`
Moved content type: codegraph evidence report template

## Graph evidence

This section is REQUIRED on every agent output. Pick exactly one of three cases:

**Case A — Structural change checked, callers found:**
- Symbol(s) modified: `<name>`
- Callers checked: N callers (file:line refs below)
- Callees mapped: M targets
- Neighborhood (depth=2): <comma-list of touched files/symbols>
- Resolution rate: X% of edges resolved
- **Decision**: callers updated in this diff / breaking change documented / escalated to architect

**Case B — Structural change checked, ZERO callers (safe):**
- Symbol(s) modified: `<name>`
- Callers checked: **0 callers** — verified via `--callers "<old-name>"` AND `--callers "<new-name>"`
- Resolution rate: X% (high confidence in zero result)
- **Decision**: refactor safe to proceed

**Case C — Graph N/A:**
- Reason: <one of: greenfield / pure-additive / non-structural-edit / read-only>
- Verification: explicitly state why no symbols affect public surface
- **Decision**: graph not applicable to this task
