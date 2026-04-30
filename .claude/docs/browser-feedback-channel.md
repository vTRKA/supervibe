# Browser Feedback Channel

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

When `preview-server` runs (default), every served HTML page is injected with a visible `Feedback` button. User clicks `Feedback` -> selects any element -> comments -> comment is appended as JSONL to `.claude/memory/feedback-queue.jsonl`.

**Delivery to active agent session:** the `UserPromptSubmit` hook (`scripts/hooks/user-prompt-submit-feedback.mjs`) drains new entries on every prompt the user sends, advances the per-session cursor at `.claude/memory/feedback-cursor.json`, and emits the entries as `additionalContext` where the host IDE supports hooks. In IDEs without hook delivery, the same queue remains readable through `node "$CLAUDE_PLUGIN_ROOT/scripts/feedback-status.mjs" --list`, so the browser feedback loop is not tied to one editor.

The skill `supervibe:browser-feedback` then triages each entry -> routes to `creative-director` (visual/motion), `prototype-builder` (layout/a11y/copy/mockups), or `presentation-deck-builder` (presentation feedback) -> applies minimal change -> writes `prototypes/<slug>/feedback-resolutions/<id>.md`, `mockups/<slug>/feedback-resolutions/<id>.md`, or `presentations/<slug>/feedback-resolutions/<id>.md`.

Disable only for non-design roots: `node scripts/preview-server.mjs --no-feedback ...`. For `prototypes/`, `mockups/`, and `presentations/`, the preview server rejects `--no-feedback`.

Constraints: localhost-only, single-client typical, text frames only. WebSocket implemented in-process via `node:net` (no `ws` dep) — see `.claude/memory/decisions/2026-04-28-feedback-websocket.md`.
