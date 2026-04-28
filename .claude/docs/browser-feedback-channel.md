# Browser Feedback Channel

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

When `preview-server` runs (default), every served HTML page is injected with a feedback overlay. User clicks a 💬 button → selects any element → comments → comment is appended as JSONL to `.claude/memory/feedback-queue.jsonl`.

**Delivery to active Claude session:** the `UserPromptSubmit` hook (`scripts/hooks/user-prompt-submit-feedback.mjs`) drains new entries on EVERY prompt the user sends, advances the per-session cursor at `.claude/memory/feedback-cursor.json`, and emits the entries as `additionalContext` so Claude sees them inline in the prompt context. There is NO separate watcher / sidecar process — claude-code reads only its own input + hook outputs.

The skill `supervibe:browser-feedback` then triages each entry → routes to `creative-director` (visual/motion) or `prototype-builder` (layout/a11y/copy) → applies minimal change → writes `prototypes/<slug>/feedback-resolutions/<id>.md`.

Disable: `node scripts/preview-server.mjs --no-feedback ...`.

Constraints: localhost-only, single-client typical, text frames only. WebSocket implemented in-process via `node:net` (no `ws` dep) — see `.claude/memory/decisions/2026-04-28-feedback-websocket.md`.
