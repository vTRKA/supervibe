---
name: chrome-extension-build
namespace: process
description: "Use WHEN setting up or modifying the build pipeline for a Chrome MV3 extension to choose bundler (Vite-CRXJS / WXT / Plasmo / vanilla), wire HMR for popup, generate icons, lint manifest, and produce a CWS-ready zip. RU: используется КОГДА настраивается или меняется build-пайплайн для Chrome MV3 расширения — выбирает bundler (Vite-CRXJS / WXT / Plasmo / ванильный), включает HMR для popup, генерирует иконки, линтит manifest и собирает готовый для CWS zip. Trigger phrases: 'настрой сборку расширения', 'сделай build для chrome extension', 'добавь HMR в popup', 'упакуй для CWS', 'web-ext lint'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: []
emits-artifact: build-pipeline
confidence-rubric: confidence-rubrics/scaffold.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-28
---

# Chrome Extension Build

Set up or fix the build / lint / package pipeline for a Chrome MV3 extension. Outcome: `npm run build` produces a CWS-ready `dist/` (or `web-ext-artifacts/*.zip`) that passes `web-ext lint` with zero warnings.

## When to invoke

- Bootstrapping a new Chrome MV3 extension after `chrome-extension-architect` has approved the manifest design.
- Adding HMR to a popup that currently requires manual rebuild.
- Switching bundler (e.g. vanilla → CRXJS, or Plasmo → WXT) and need a clean migration path.
- Setting up CWS packaging — zip layout, screenshot prep, package validator.
- A `web-ext lint` warning blocks merge and you need to chase it to root cause.

NOT for:
- Designing the manifest itself — that is `chrome-extension-architect`.
- Implementing popup / content-script logic — that is `chrome-extension-developer`.
- Brand / visual direction — that is `creative-director` + `ux-ui-designer`.

## Step 0 — Read source of truth (required)

1. Read the project's `manifest.json` (or `manifest.json.tpl` if generated). If absent → STOP and tell the user to run `chrome-extension-architect` first.
2. Read `package.json` for current scripts + devDependencies (which bundler is wired, if any).
3. Read `.claude/memory/decisions/` for any past bundler ADR. If one exists, the choice is locked unless an explicit re-evaluation ADR is written.
4. Read `vite.config.*` / `wxt.config.*` / `plasmo.config.*` if present.

## Decision tree — bundler

| Situation | Pick | Why |
|-----------|------|-----|
| TypeScript + React/Vue/Svelte popup, want HMR for popup, hate magic | **Vite + @crxjs/vite-plugin** | Most explicit. You write `manifest.json` by hand, the plugin wires HMR + entry-points |
| Want zero-config, conventional file layout (`entrypoints/`), opinions are fine | **WXT** | Auto-imports, type-safe messaging helpers, generated manifest. Cost: less explicit |
| React-heavy team, want Next.js-like file-based routing for popup/options | **Plasmo** | Tightest React DX. Cost: heaviest framework, more abstraction over manifest |
| Pure vanilla JS, no bundler, fast iteration | **No bundler — copy `extension/` directly** | Minimal moving parts. Fine for ≤5 files. Loses TS, HMR, tree-shaking |

When changing bundler on an existing project, write the migration ADR FIRST. Document the pain point being solved.

## Procedure

1. **Confirm bundler choice.** If a `.claude/memory/decisions/<date>-extension-bundler.md` ADR exists, follow it. Otherwise propose one with the decision tree above and wait for user "yes".

2. **Install bundler + tooling.**
   ```bash
   # Vite + CRXJS path:
   npm i -D vite @crxjs/vite-plugin @types/chrome typescript
   ```
   Other paths analogous — install per chosen bundler's docs (verify versions via `supervibe:mcp-discovery` → context7 if available).

3. **Wire `vite.config.ts`** (CRXJS path):
   ```ts
   import { defineConfig } from 'vite';
   import { crx } from '@crxjs/vite-plugin';
   import manifest from './extension/manifest.json' assert { type: 'json' };
   export default defineConfig({
     plugins: [crx({ manifest })],
     build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
   });
   ```

4. **Add npm scripts** to `package.json` (mirror `stack-packs/chrome-extension-mv3/configs/package.json.tpl`):
   - `dev` — watch mode
   - `build` — production build + `web-ext lint`
   - `lint` — eslint + web-ext lint
   - `typecheck` — `tsc --noEmit`
   - `test` — vitest
   - `package` — zip `dist/` for CWS

5. **Generate or place icons.** `extension/public/icons/icon-{16,32,48,128}.png`. If missing, ask user for source `512x512.png` and use a tool (sharp/imagemagick) to downsample. Do NOT ship placeholder icons to CWS — automatic rejection.

6. **Set up `_locales/en/messages.json`** with at minimum `extName` + `extDescription` keys (referenced by `__MSG_*__` in manifest):
   ```json
   {
     "extName":        { "message": "<extension display name>" },
     "extDescription": { "message": "<short description, ≤132 chars>" }
   }
   ```

7. **Write the package validator** (`scripts/package-cws.mjs`) that:
   - Reads `dist/manifest.json`, asserts `manifest_version === 3`
   - Asserts every permission has at least one in-code reference (grep the source)
   - Asserts every `host_permissions` entry has tightest possible match-pattern
   - Greps for `eval(`, `new Function(`, `setTimeout(.*string`, fails on hits
   - Asserts `_locales/en/messages.json` exists with required keys
   - Asserts all 4 icon sizes present and valid PNG (use `sharp` or read first bytes for PNG signature)
   - Zips `dist/` to `web-ext-artifacts/<name>-<version>.zip`

8. **Wire web-ext lint** (`scripts/web-ext-lint.mjs`) — runs `npx web-ext lint --source-dir=dist --warnings-as-errors`. Fails the build on any warning.

9. **Smoke test load-unpacked**: print to user `Open chrome://extensions → enable Developer mode → Load unpacked → select dist/`. Optionally use Playwright MCP if available for automated load + console-error scrape.

10. **Score** the resulting pipeline against `confidence-rubrics/scaffold.yaml`. Required: ≥9.

## Output contract

Returns:
- Working `package.json` scripts (dev / build / lint / typecheck / test / package)
- Bundler config file (vite/wxt/plasmo config) with sourcemaps + watch
- `scripts/web-ext-lint.mjs` and `scripts/package-cws.mjs`
- `_locales/en/messages.json` skeleton
- Icon files in place (or note for user to provide source PNG)
- One-line confirmation: `npm run build && npm run lint` exits 0

```
=== Chrome Extension Build Pipeline ===
Bundler:        <choice>            ADR: <path or "ad-hoc — recommend writing one">
Scripts wired:  dev / build / lint / typecheck / test / package
Build output:   dist/  (size: <KB>)
web-ext lint:   <warnings count>    (must be 0 to ship)
CWS package:    web-ext-artifacts/<name>-<version>.zip  (<KB>)

Confidence:     <N>.<dd>/10
Override:       <true|false>
Rubric:         scaffold
```

## Guard rails

- DO NOT switch bundler mid-project without an ADR. Bundler swaps cascade through CI, dev experience, and team muscle memory.
- DO NOT skip `web-ext lint --warnings-as-errors`. CWS catches the same warnings on upload and rejects with worse error messages.
- DO NOT ship placeholder icons. CWS auto-rejection is faster than any review feedback.
- DO NOT inline scripts into HTML pages. CSP `script-src 'self'` is non-negotiable for trust score.
- DO NOT add `unsafe-eval` or `unsafe-inline` to CSP. If a third-party script must run, isolate via `sandbox.pages` instead.

## Verification

After running:
- `npm run build` exits 0
- `npm run lint` exits 0 (eslint + web-ext lint zero warnings)
- `npm run typecheck` exits 0 if TypeScript
- `npm run package` produces a valid zip in `web-ext-artifacts/`
- Loading `dist/` as unpacked extension shows zero console errors in DevTools (popup + service worker + content scripts)
- `chrome://extensions` does not flag any "Errors" badge for the unpacked load

## Related

- `agents/stacks/chrome-extension/chrome-extension-architect.md` — owns the manifest and permissions strategy
- `agents/stacks/chrome-extension/chrome-extension-developer.md` — implements features on top of this build pipeline
- `supervibe:mcp-discovery` — fetch current docs for chosen bundler
- `confidence-rubrics/scaffold.yaml` — the scoring rubric for this output
- `stack-packs/chrome-extension-mv3/manifest.yaml` — full project scaffold including this skill
