---
id: feedback-websocket
type: decisions
date: 2026-04-28
tags: [feedback, websocket, preview]
agent: human
confidence: 9
---

# Feedback channel: zero-dep WebSocket

For browser-to-agent feedback in `preview-server.mjs`, we implement minimal WebSocket frame handling with `node:net` rather than adding `ws` as a dependency. Justification:
- Single-client / low-volume use case (one browser per preview session)
- Aligns with CLAUDE.md "no native deps" principle and zero-dep preview-server
- ~200 LOC of frame parsing is acceptable

Trigger to revisit: if multi-tab feedback or binary frames become needed, add `ws`.

Confidence: 9/10
