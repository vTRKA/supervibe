---
description: >-
  Use WHEN the user wants to see or manage epics, work items, phases, loop
  state, context packs, blockers, GC previews, or local task actions visually
  TO launch the local Supervibe UI control plane.
---

# /supervibe-ui

Starts a local browser control plane for Supervibe's native work-item graph.
The UI is IDE-neutral: every host can open the same localhost URL, and future
IDE webviews can wrap it without changing the canonical JSON graph.

## Invocation

```bash
/supervibe-ui --file .claude/memory/work-items/<epic-id>/graph.json
/supervibe-ui --port 3057
```

Equivalent local command:

```bash
npm run supervibe:ui -- --file .claude/memory/work-items/<epic-id>/graph.json
npm run supervibe:ide-bridge -- --file .claude/memory/work-items/<epic-id>/graph.json --out .supervibe/ide-bridge.json
```

## What It Shows

- Epic/work-item status groups: ready, blocked, claimed, deferred, review, done.
- Individual work items with quick selection.
- Context Pack preview for the selected work item.
- Loop `state.json` summary with current wave, gates, tasks, reports, and
  dashboard model.
- SLA report preview from the active work-item graph.
- Work-item GC preview.
- Raw JSON output for debugging and IDE webview adapters.
- IDE bridge descriptor for wrapping the same localhost URL in VS Code, Cursor,
  Zed, JetBrains, or any host that can render a local webview.

## Safe Actions

The UI can perform local-only graph actions:

- `claim`
- `defer`
- `close`
- `reopen`

Every action supports preview first. Real mutations require the local UI token
generated when the server starts. The server binds to `127.0.0.1` only and does
not call provider CLIs, MCPs, network trackers, deployment targets, or external
APIs.

## Local JSON Endpoints

- `GET /api/graph?file=<graph.json>`
- `GET /api/context-pack?file=<graph.json>&item=<item-id>`
- `GET /api/run?file=<state.json>`
- `GET /api/report?file=<graph.json>&type=sla`
- `GET /api/gc`
- `POST /api/action` with `x-supervibe-ui-token`

## Output Contract

```text
SUPERVIBE_UI
URL: http://127.0.0.1:<port>/?token=<token>
TOKEN: <token>
BIND: 127.0.0.1
```

Confidence: N/A    Rubric: read-only-research
