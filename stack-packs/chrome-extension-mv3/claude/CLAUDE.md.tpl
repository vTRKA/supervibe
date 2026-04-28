# CLAUDE.md — {{extension-name|Chrome Extension MV3}}

> System context for AI coding agents working on this Chrome MV3 extension. Loaded automatically by Claude Code, Codex, and Gemini at session start.

## Stack summary

{{stack-summary|Chrome Extension Manifest V3 (vanilla / TypeScript / Vite-CRX) — popup + options + side panel + content scripts + service worker. Target: Chrome 116+, optionally Edge / Brave.}}

Bundler: {{bundler-choice|vite-crxjs}}
Target browsers: {{target-browsers|Chrome 116+, Edge, Brave}}

## Architectural ground truth

Three contexts run in this extension, each with its own lifetime and capabilities:

| Context | Lifetime | Capabilities | Restrictions |
|---------|----------|--------------|--------------|
| **Service worker** (`background/`) | Wakes on event, dies after 30s idle | Most `chrome.*` APIs, `fetch` with host_permissions | NO DOM, NO `localStorage`, NO `setTimeout` for keep-alive |
| **Content scripts** (`content/`) | Lives with the host page | Read/write host DOM, message extension via `chrome.runtime.sendMessage` | No direct `chrome.tabs`, no most `chrome.*` |
| **Extension pages** (popup / options / sidepanel / offscreen) | DOM context, dies on close | Full `chrome.*` from extension origin, normal Web Platform | CSP strict — no inline scripts, no `eval` |

**The service worker will die.** Plan persistence via `chrome.storage`, scheduling via `chrome.alarms`, never via `setInterval`.

## Agent roster

{{agent-roster|See `.claude-plugin/plugin.json` agents array}}

The two stack specialists for this project:
- `evolve:stacks/chrome-extension:chrome-extension-architect` — manifest design, permissions strategy, message-passing topology, CSP, CWS readiness (READ-ONLY)
- `evolve:stacks/chrome-extension:chrome-extension-developer` — implementation of popup / options / side panel / content scripts / service worker / messaging

Plus all `_core`, `_meta`, `_design`, `_ops`, `_product` agents from the global plugin.

## Discipline rules

Inherited from the plugin:
- `anti-hallucination` — cite file:line for every claim
- `confidence-discipline` — gate ≥9 on every artifact
- `use-codegraph-before-refactor` — `--callers <symbol>` before any rename
- `no-half-finished` — no commented code, no orphan TODOs
- `commit-discipline` + `commit-attribution` — Conventional Commits, no AI signature trailers
- `privacy-pii` — extensions touch user-page data; PII handling matters
- `i18n` — every user-facing string via `chrome.i18n.getMessage()`

Stack-specific discipline:
- **Permission justification ADR** — every permission added to `manifest.json` requires a one-paragraph ADR in `.claude/memory/decisions/` answering: why this permission, what API call needs it, what is the user-visible feature
- **CSP strict-by-default** — `script-src 'self'`, no `unsafe-inline`, no `unsafe-eval`. If a third-party script must run, sandbox it via `sandbox.pages` instead of relaxing CSP
- **`<all_urls>` requires explicit ADR** — broad host_permissions are a CWS-rejection trigger and a trust cost
- **Message handlers always check `chrome.runtime.lastError`** — silent failures hide bugs that only show on idle restart
- **Port `.onDisconnect` cleanup is mandatory** — leaked ports = leaked memory, observable as service worker bloat

## Paths

{{paths|
- `extension/src/popup/`        — popup UI
- `extension/src/options/`      — options page
- `extension/src/sidepanel/`    — side panel UI
- `extension/src/background/`   — service worker entry
- `extension/src/content/`      — content scripts
- `extension/src/offscreen/`    — offscreen documents
- `extension/src/lib/`          — shared messaging types, storage helpers
- `extension/public/icons/`     — 16/32/48/128 PNG icons
- `extension/public/_locales/`  — i18n messages
- `extension/manifest.json`     — MV3 manifest
- `dist/`                        — vite build output, loaded as unpacked extension
- `docs/cws/`                    — Chrome Web Store listing draft
- `.claude/memory/decisions/`    — ADRs (permissions, architecture)
}}

## Verification commands

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | `tsc --noEmit` — type errors fail the gate |
| `npm run lint` | `eslint . && npx web-ext lint --source-dir=dist` |
| `npm run build` | Vite build → `dist/` ready to load unpacked |
| `npm run dev` | Vite watch mode — reload extension manually after changes |
| `npm test` | Vitest for unit tests, Playwright for popup smoke if available |
| `npm run package` | Zip `dist/` for CWS upload, run package validator first |

## Scope boundaries

{{scope-boundaries|
This project's `.claude/agents/` (after /evolve-genesis) contains stack-specific overrides on top of the global plugin. Do NOT touch:
- `.claude/memory/code.db` / `.claude/memory/memory.db` — generated indexes, gitignored
- `dist/` — build output

Custom decisions, patterns, incidents go in `.claude/memory/<category>/` as markdown.
}}

## Common workflows

**New popup feature:**
1. `chrome-extension-architect` reviews if new permission needed — if yes, ADR
2. `chrome-extension-developer` implements failing test → minimal popup component → wires runtime.sendMessage → service worker handler
3. `ui-polish-reviewer` + `accessibility-reviewer` per `_design` rubric
4. `code-reviewer` final pass

**Add a new content script for site X:**
1. Architect reviews `content_scripts.matches` — tightest pattern (no broad wildcards)
2. ADR if new host_permission required
3. Developer adds content script with `world: "ISOLATED"` by default; only escalate to `MAIN` with rationale
4. CSS isolation via shadow DOM if injecting visible UI into host page

**Migrate one MV2 background page event listener to MV3 service worker:**
1. Identify the event listener and any persistent in-memory state it relied on
2. Move state to `chrome.storage.local` or `chrome.storage.session`
3. Replace `setInterval` / `setTimeout` keep-alive tricks with `chrome.alarms`
4. Re-test under idle restart (Chrome devtools → Service Worker → Stop, then trigger event)

## When in doubt

1. Read this file again — likely answer is here
2. Read `agents/stacks/chrome-extension/chrome-extension-architect.md` for deeper architectural questions
3. Read `agents/stacks/chrome-extension/chrome-extension-developer.md` for implementation patterns
4. Search memory: `node $CLAUDE_PLUGIN_ROOT/scripts/search-memory.mjs --query "<topic>"`
5. Search code: `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<concept>"`
6. Stack-pack source: `$CLAUDE_PLUGIN_ROOT/stack-packs/chrome-extension-mv3/manifest.yaml`
