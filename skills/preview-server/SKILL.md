---
name: preview-server
namespace: process
description: >-
  Use AFTER generating HTML/CSS/JS mockup files TO spawn a local
  http://localhost preview server with hot-reload, share URL with user,
  optionally capture Playwright screenshot. Triggers: 'покажи в браузере', 'дай
  ссылку', 'открой превью', 'хочу потыкать'.
allowed-tools:
  - Read
  - Bash
  - Glob
phase: prototype
prerequisites: []
emits-artifact: preview-url
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: false
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Preview Server

Spawn the Supervibe local hot-reload preview server for freshly generated mockup files, hand the URL to the user, and (optionally) capture a Playwright screenshot before tearing the server down. For design roots, the feedback overlay is mandatory. The feedback overlay is supplemental and not an approval gate; the surrounding command or skill must still ask its approve/revise/alternative/stop question before any artifact is marked approved, exported, or handed off. The feedback path is IDE-neutral at the preview layer: browser comments are written to `.supervibe/memory/feedback-queue.jsonl`; hooks surface them automatically where supported, and other IDEs can poll with `feedback-status.mjs --list`.

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
2. Run `node "<resolved-supervibe-plugin-root>/scripts/preview-server.mjs" --list` (or the project equivalent) and confirm there is no overlap with another running preview server / dev process. Two skills must not bind the same port.
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
3. Start the server with `node "<resolved-supervibe-plugin-root>/scripts/preview-server.mjs" --root <mockup-root> --label "<label>" --daemon`; capture the PID. Design roots include `.supervibe/artifacts/prototypes/<slug>`, `.supervibe/artifacts/mockups/<slug>`, and `.supervibe/artifacts/presentations/<slug>`; never pass `--no-feedback` for them. Use `--foreground` only when the user explicitly asks to debug server output.
4. Wait for the server to report ready, then capture the canonical URL (`http://localhost:<port>`).
5. For a design root, verify the response body contains `supervibe-fb-toggle` and tell the user the visible `Feedback` button is available in the preview. If the host IDE does not support prompt hooks, also mention that pending comments can be read with `node "<resolved-supervibe-plugin-root>/scripts/feedback-status.mjs" --list`.
6. Hand the URL to the user using the Output contract template below.
7. If the user (or upstream skill) requested a screenshot, drive Playwright against the URL and save the PNG next to the mockup files.
8. Continue the surrounding task — keep the server alive only while the user is reviewing.
9. On task completion (or user "done"), kill the PID and confirm port released.

## Output contract

Return to the user as Markdown:

```markdown
**Preview ready**

- URL: http://localhost:<port>
- Label: <label>
- Root: <absolute path to served directory>
- Hot-reload: <yes|no>
- Feedback button: <visible | n/a for non-design root>
- PID: <pid>
- Screenshot: <absolute path or "none">
```

The Supervibe orchestrator consumes this block to populate `emits-artifact: preview-url`.

## Guard rails

- NEVER spawn a server without first telling the user a local process is starting.
- NEVER serve a directory outside the current project root (no `..`, no absolute paths to `$HOME`).
- ALWAYS kill the server PID on task completion, error, or user cancel — leaked dev servers are a recurring incident class.
- ALWAYS bind to `127.0.0.1` only — never `0.0.0.0` and never an externally routable interface.
- ALWAYS include both the port and PID in the output block so the user (and subsequent skills) can clean up manually if needed.
- NEVER disable the feedback overlay for `.supervibe/artifacts/prototypes/`, `.supervibe/artifacts/mockups/`, or `.supervibe/artifacts/presentations/`; missing `Feedback` button is a blocking preview setup bug.
- ALWAYS use `--daemon` for design roots so the server runs silently in the background; foreground mode is debugging-only.

## Verification

After spawn, before reporting success, confirm:

1. `curl -sS http://localhost:<port>/ | head -n 5` returns HTML (HTTP 200, `<!doctype html>` or `<html` present).
2. The response body contains the hot-reload `EventSource` / WebSocket injection (skip for framework dev servers that use their own HMR channel).
3. For design roots, the response body contains `supervibe-fb-toggle` and the visible button text `Feedback`.
4. `node "<resolved-supervibe-plugin-root>/scripts/preview-server.mjs" --list` now shows the preview-server entry with the same PID.

If any check fails, kill the PID and surface the error — do not return a half-working URL.

## Related

- `supervibe:prototype`
- `supervibe:landing-page`
- `supervibe:interaction-design-patterns`
- `supervibe:mcp-discovery`
- `agents/_design/prototype-builder`
- `agents/_design/ux-ui-designer`
