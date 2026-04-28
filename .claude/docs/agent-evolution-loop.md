# Agent Evolution Loop (Phase G + H)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Plugin tracks every agent invocation and detects degradation:

1. **Logger** (`scripts/lib/agent-invocation-logger.mjs`) — append-only JSONL at `.claude/memory/agent-invocations.jsonl`
2. **Hook** (`scripts/hooks/post-tool-use-log.mjs`) — wired via `PostToolUse` matcher `Task`, logs every subagent dispatch with extracted confidence score + override marker
3. **Effectiveness tracker** (`scripts/effectiveness-tracker.mjs`) — aggregates log → updates each agent's `frontmatter.effectiveness` block (iterations, last-task, last-outcome, last-applied, avg-confidence, override-rate). Runs on `Stop` hook.
4. **Underperformer detector** (`scripts/lib/underperformer-detector.mjs`) — flags agents with `avg-confidence < 8.5` OR rising override-rate trend (Δ ≥ 40% across recent window).
5. **SessionStart surface** — banner shows flagged agents + recommends `/supervibe-strengthen`.
6. **Auto-strengthen trigger** (`scripts/lib/auto-strengthen-trigger.mjs`) — `/supervibe-strengthen` (no args) reads suggestions, asks user confirmation, dispatches strengthen sequentially per agent with diff-gate.
7. **Re-dispatch suggester** (`scripts/lib/agent-task-store.mjs` + `scripts/lib/dispatch-suggester.mjs`) — every Task call mirrors into `.claude/memory/agent-tasks.db` (SQLite + FTS5). When a Task finishes with `confidence < 8.0` and no override, the hook queries the mirror for similar past tasks where another agent scored ≥8.5 and prints a `[supervibe] dispatch-hint:` system-reminder with up to 3 alternative agents (avg score + sample task). Requires ≥3 historical samples — silent on cold-start. Threshold + sample floor configurable via the suggester's options object.

**Discipline:**
- Underperformers reviewed at every SessionStart
- Manual strengthen always wins — auto-trigger never modifies agent files without explicit user gate per diff
- Detector requires ≥10 invocations before flagging anything

**Override rate** > 5% in 100-entry window also triggers `/supervibe-audit` recommendation (existing behavior).

**E2E:** `tests/evolution-loop-e2e.test.mjs` proves the loop closes (log → aggregate → detect → suggest).
