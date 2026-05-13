# Supervibe UI Redesign Brief

This brief prepares the runtime control-plane UI for a later design specialist run. It describes the intended product feel, information architecture, states, and constraints without requiring a framework rewrite.

## Product Goal

Design Supervibe as a cozy workbench for long-running AI development work: calm, dense, inspectable, and built for repeated use. The UI should help a user see what the loop is doing, why it is blocked, what evidence exists, and what action is safe next.

The redesign should favor a compact operational surface over a marketing dashboard. Users need to scan active work, claims, blockers, knowledge readiness, and receipts quickly while keeping enough detail one click away for diagnosis.

## Primary Surfaces

### Compact Board

The first viewport should center on a compact board that shows active loop progress and work-item flow. It should fit common laptop screens without forcing the user to scroll before seeing:

- current run identity and status
- work-item totals by state
- ready and blocked queues
- claimed items and stale claims
- review and done counts
- the safest next action

The board can use table, kanban, split-list, or hybrid layouts. The design specialist should choose the pattern that best supports density and readability, not visual novelty.

### Diagnostics Separation

Diagnostics must be visually and structurally separate from execution controls. The user should be able to work from the board without being flooded by logs, but diagnostics must remain easy to inspect when trust or readiness is in question.

Recommended grouping:

- **Run:** current loop state, active command, resume/stop evidence, provider boundary state.
- **Work Items:** ready, blocked, claimed, stale, orphan, drift, review, and done states.
- **Evidence:** receipts, verification commands, completion blockers, readiness notes.
- **Diagnostics:** router output, policy blockers, index health, receipt recovery, and stale evidence.

### Work Items And Kanban

The work-item surface should support a Kanban mental model while staying compact. Columns or grouped lists should use the canonical statuses:

- `ready`
- `blocked`
- `claimed`
- `stale`
- `orphan`
- `drift`
- `review`
- `done`

Each item should show enough metadata to support safe action:

- title and id
- owner or claim source
- dependency/blocker summary
- changed-file scope when known
- verification status
- last update age

Actions should be preview-first when they mutate graph or workflow state. Avoid destructive-looking controls near inspect-only actions.

### Knowledge Tabs

RAG, Memory, and CodeGraph should be treated as knowledge tabs, not mixed into the main work board. Their purpose is to explain what context the runtime has and where readiness is weak.

Suggested tabs:

- **RAG:** index freshness, chunk coverage, query evidence, omitted context, repair action.
- **Memory:** matching decisions, incidents, learnings, stale memory candidates, add-memory prompts.
- **CodeGraph:** symbol coverage, edge health, impact queries, unresolved references, rebuild action.

Each tab should distinguish healthy, stale, missing, and blocked states. The default view should summarize status; detailed rows can expand for citations and repair commands.

## Loop Run States

The UI should name and render these run-level states consistently:

- `idle`: no active loop is selected.
- `loading`: runtime state is being read.
- `ready`: graph is valid and at least one item can move.
- `running`: the controller is executing or waiting for an active worker.
- `needs-user`: the loop is blocked on an explicit user decision.
- `blocked`: policy, provider, dependency, or receipt evidence prevents progress.
- `repair-needed`: state exists but readiness evidence or graph consistency is invalid.
- `stopping`: stop was requested and cleanup is in progress.
- `stopped`: run is paused or intentionally halted.
- `complete`: all close-eligible checks passed.
- `error`: an unexpected runtime failure occurred.

These states should be visible in the run header and reflected in available controls. For example, `needs-user` should foreground the pending question, while `repair-needed` should foreground the repair action and evidence gap.

## UI Constraints

- Do not require a framework rewrite. Designs should be implementable in the current local UI stack or through incremental replacement.
- Preserve local-first behavior. No design should imply cloud sync, hosted telemetry, or remote mutation unless a later product decision adds it.
- Keep status vocabulary aligned with runtime terms. Do not invent alternate names for work-item or run states.
- Keep diagnostics inspectable but secondary to the operator flow.
- Use dense layouts with stable dimensions for boards, tabs, rows, counters, and action bars.
- Avoid landing-page patterns, oversized hero treatments, and decorative-only visuals.
- Prefer clear operational copy over promotional language.
- Show disabled and blocked controls with reasons, especially for provider approvals, receipts, and graph drift.
- Make empty states actionable: missing graph, no selected run, no RAG index, no memory hits, no CodeGraph, no receipts, and no verification evidence should each point to the relevant repair or setup action.

## Design Specialist Inputs

A later design specialist run should use this brief with the runtime hardening plan and current command docs. The expected output is a design direction or prototype brief that includes:

- desktop-first cozy workbench direction
- compact board layout proposal
- diagnostics panel strategy
- run-state and work-item-state visuals
- RAG, Memory, and CodeGraph knowledge-tab treatment
- responsive behavior for narrow laptop and mobile inspection
- accessibility notes for keyboard navigation, focus states, contrast, and status text

The specialist should preserve runtime semantics and propose UI refinements only where they improve scanability, trust, or recovery speed.
