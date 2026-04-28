# Preview Server (local mockup hosting)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Design / prototype agents can spawn a local `http://localhost:NNNN` to serve generated HTML/CSS/JS with hot-reload — user opens in browser, edits propagate via SSE within ~200ms.

**When to use:** after `supervibe:landing-page`, `supervibe:prototype`, `supervibe:interaction-design-patterns`, or any agent that produces visual output.

**Skill:** `supervibe:preview-server`

**CLI:**
| Form | Action |
|------|--------|
| `node $CLAUDE_PLUGIN_ROOT/scripts/preview-server.mjs --root <dir>` | Start server, print URL |
| `... --list` | List running servers |
| `... --kill <port>` | Kill specific server |
| `... --kill-all` | Kill all |

**Auto-cleanup:** SessionStart prunes stale registry entries (PIDs no longer alive). SIGINT/SIGTERM cleanup on session end. Idle-shutdown after 30min of no activity (--idle-timeout configurable).

**Status:** `npm run supervibe:status` shows running previews with URL/PID/age.

**Optional Playwright integration:** when MCP available, skill captures screenshot to `.claude/memory/previews/<label>-<timestamp>.png` as evidence.

**Constraints:** binds to 127.0.0.1 only (no network access); zero new deps (pure node:http + SSE).
