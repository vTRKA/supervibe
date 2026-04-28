---
name: preview-server
namespace: process
description: "Use AFTER generating HTML/CSS/JS mockup files TO spawn a local http://localhost preview server with hot-reload, share URL with user, optionally capture Playwright screenshot. RU: используется ПОСЛЕ генерации файлов мокапа HTML/CSS/JS — поднимает локальный http://localhost preview-сервер с hot-reload, отдаёт URL пользователю, опционально снимает Playwright-скриншот. Trigger phrases: 'покажи в браузере', 'дай ссылку', 'открой превью', 'хочу потыкать'."
allowed-tools: [Read, Bash, Glob]
phase: prototype
prerequisites: []
emits-artifact: preview-url
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: false
version: 1.0
last-verified: 2026-04-27
---

# Preview Server

Spawn a local hot-reload preview server for freshly generated mockup files, hand the URL to the user, and (optionally) capture a Playwright screenshot before tearing the server down.

## When to invoke

Run this skill AFTER one of the following has produced concrete mockup files on disk:

- `supervibe:landing-page` — finished a landing page draft.
- `supervibe:prototype` — finished a clickable prototype.
- `supervibe:interaction-design-patterns` — emitted an interaction demo.
- `agents/_design/prototype-builder` — produced HTML/CSS/JS scaffolds.

Trigger phrases from the user: "show me what it would look like", "open it in the browser", "give me a link", "let me click around".

Do NOT invoke for: pure code review, schema/spec work, or anything without a renderable artifact.

## Step 0 — Read source of truth

1. Verify mockup files exist under the expected output directory (Glob for `*.html`, `index.html`, or framework entry files).
2. Run `evolve --list` (or the project equivalent) and confirm there is no overlap with another running preview server / dev process. Two skills must not bind the same port.
3. If files are missing or another server is already serving the same root, STOP and report — do not spawn a second instance.

## Decision tree

| Input shape                            | Server choice                                  |
| -------------------------------------- | ---------------------------------------------- |
| Single self-contained `index.html`     | `npx serve` or `python -m http.server` + LiveReload shim |
| Multi-file static mockup (HTML+CSS+JS) | `npx live-server` (hot-reload built in)        |
| Vite / Next.js / framework dev project | `npm run dev` from the project's own scripts   |
| Static screenshots only (PNG/JPG)      | Skip server — return file paths instead        |

Always prefer the project's own dev script when one exists; fall back to `live-server` for ad-hoc HTML.

## Procedure

1. Complete Step 0 (verification + `--list` check).
2. Pick a human-readable label for the preview (e.g. `landing-v3`, `checkout-flow`).
3. Start the server bound to `127.0.0.1` on an ephemeral port; capture the PID.
4. Wait for the server to report ready, then capture the canonical URL (`http://localhost:<port>`).
5. Hand the URL to the user using the Output contract template below.
6. If the user (or upstream skill) requested a screenshot, drive Playwright against the URL and save the PNG next to the mockup files.
7. Continue the surrounding task — keep the server alive only while the user is reviewing.
8. On task completion (or user "done"), kill the PID and confirm port released.

## Output contract

Return to the user as Markdown:

```markdown
**Preview ready**

- URL: http://localhost:<port>
- Label: <label>
- Root: <absolute path to served directory>
- Hot-reload: <yes|no>
- PID: <pid>
- Screenshot: <absolute path or "none">
```

The `evolve` orchestrator consumes this block to populate `emits-artifact: preview-url`.

## Guard rails

- NEVER spawn a server without first telling the user a local process is starting.
- NEVER serve a directory outside the current project root (no `..`, no absolute paths to `$HOME`).
- ALWAYS kill the server PID on task completion, error, or user cancel — leaked dev servers are a recurring incident class.
- ALWAYS bind to `127.0.0.1` only — never `0.0.0.0` and never an externally routable interface.
- ALWAYS include both the port and PID in the output block so the user (and subsequent skills) can clean up manually if needed.

## Verification

After spawn, before reporting success, confirm:

1. `curl -sS http://localhost:<port>/ | head -n 5` returns HTML (HTTP 200, `<!doctype html>` or `<html` present).
2. The response body contains the hot-reload `EventSource` / WebSocket injection (skip for framework dev servers that use their own HMR channel).
3. `evolve --list` now shows the preview-server entry with the same PID.

If any check fails, kill the PID and surface the error — do not return a half-working URL.

## Related

- `supervibe:prototype`
- `supervibe:landing-page`
- `supervibe:interaction-design-patterns`
- `supervibe:mcp-discovery`
- `agents/_design/prototype-builder`
- `agents/_design/ux-ui-designer`
