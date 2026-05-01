---
description: >-
  Use WHEN the user wants to see or manage epics, work items, phases, loop
  state, context packs, blockers, GC previews, or local task actions visually
  TO launch the local Supervibe UI control plane.
---

# /supervibe-ui

Starts a local browser control plane for Supervibe's native work-item graph.
The UI is IDE-neutral: every host can open the same localhost URL, and IDE
webviews can wrap it without changing the canonical JSON graph.

## Invocation

```bash
/supervibe-ui --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-ui --port 3057
/supervibe-ui --daemon
/supervibe-ui --foreground
```

Equivalent local command:

```bash
npm run supervibe:ui -- --file .supervibe/memory/work-items/<epic-id>/graph.json --daemon
npm run supervibe:ui -- --foreground --file .supervibe/memory/work-items/<epic-id>/graph.json
npm run supervibe:ide-bridge -- --file .supervibe/memory/work-items/<epic-id>/graph.json --out .supervibe/ide-bridge.json
```

`--daemon` is the normal local control-plane launch: it starts a detached hidden
process, returns the URL and PID, and writes logs under `.supervibe/servers/`.
`--foreground` keeps output attached for debugging.

## What It Shows

- Epic/work-item status groups: ready, blocked, claimed, deferred, review, done.
- Workflow phase rail derived from real graph/run state: plan, atomize, execute,
  verify, close, archive. It marks completed phases, current phase, and blocked
  execution/verification instead of using decorative static labels.
- Kanban board for epics, tasks, projects, active agent claims, blockers,
  verification counts, and task movement across ready/claimed/blocked/review/done.
- Individual work items with quick selection.
- Context Pack preview for the selected work item.
- Loop `state.json` summary with current wave, gates, tasks, reports, and
  dashboard model.
- RAG, project memory, and CodeGraph health with separate visual tabs.
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

Every action supports preview first. Real mutations require an explicit
`confirm=apply-local` apply request after preview. The server binds to
`127.0.0.1` only and does not call provider CLIs, MCPs, network trackers,
deployment targets, or external APIs.

## Local JSON Endpoints

- `GET /api/graph?file=<graph.json>`
  - Includes `kanban.project`, `kanban.epics`, `kanban.agents`, and
    `kanban.columns[]` so IDEs can show task movement and epic ownership.
  - Includes `flow.steps[]`, `flow.activeId`, `flow.status`, and `flow.metrics`
    so IDEs can show phase progress from graph status, task status, gates, and
    archive markers.
- `GET /api/index-status`
- `GET /api/context-pack?file=<graph.json>&item=<item-id>`
  - Includes `workflowSignal` and `flow` so the selected task's context pack
    carries the same phase, epic, gate, claim, and next-action signal that the
    UI shows.
- `GET /api/run?file=<state.json>`
  - Includes the same `flow` model derived from loop status, waves, gates,
    reports, and task completion.
- `GET /api/report?file=<graph.json>&type=sla`
- `GET /api/gc`
- `POST /api/action` with preview-first body; apply uses `confirm=apply-local`

## Output Contract

```text
SUPERVIBE_UI
URL: http://127.0.0.1:<port>/
BIND: 127.0.0.1
AUTH: localhost-only
IDE_WIDGET: npm run supervibe:ide-bridge -- --port <port> --file <graph.json> --out .supervibe/ide-bridge.json
```

Confidence: N/A    Rubric: read-only-research
