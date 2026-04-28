---
description: >-
  Debug a failed agent invocation by replaying the task with structured
  root-cause analysis. Reads .claude/memory/agent-invocations.jsonl, identifies
  failure pattern, dispatches root-cause-debugger, proposes fix. Triggers:
  'почему упал', 'debug agent', 'invocation failed', 'replay task',
  '/evolve-debug'.
---

# /evolve-debug

Debug a failed (or low-confidence) agent invocation. Replays the task with structured root-cause analysis: identifies whether the failure was stale-context, missing-skill, wrong-approach, or environment, then proposes a concrete fix.

This is the missing entry-point in the audit→strengthen→evaluate loop: `/evolve-audit` says "agent X is weak", `/evolve-strengthen` proposes edits — but neither tells you WHY a specific invocation failed. `/evolve-debug` answers that.

## Invocation forms

### `/evolve-debug <invocation-id>` — by ID from telemetry

If user has the invocation ID (e.g., from `/evolve-audit` output or `agent-invocations.jsonl` directly).

### `/evolve-debug <agent-id>` — debug the most recent failure of an agent

Auto-resolves the most-recent invocation where confidence < 8 OR override = true OR outcome = failed.

Examples:
- `/evolve-debug laravel-developer`
- `/evolve-debug creative-director`

### `/evolve-debug` — debug the latest failure across all agents

No args: scan `agent-invocations.jsonl` for the most recent failure (any agent), debug it.

### `/evolve-debug --replay <invocation-id>` — re-dispatch on same task

Re-dispatches the SAME agent on the SAME task. Compares old vs new output. Used when:
- Agent was strengthened (verify fix worked)
- Project context changed (verify still failing)
- User suspects flakiness (run twice, compare)

### `/evolve-debug --trace <invocation-id>` — full trace (no replay)

Print the entire invocation record: task, dispatched-by, tool calls made, intermediate outputs, final output, confidence, override status, blocker classification. Used when user wants to inspect without re-running.

### `/evolve-debug --all-failed` — list all recent failures

Shows top 20 invocations where confidence < 8 across all agents in last 30 days. User picks one to debug.

## Procedure

1. **Resolve invocation:**
   a. If `<invocation-id>` → look up directly in `.claude/memory/agent-invocations.jsonl`.
   b. If `<agent-id>` → grep latest invocation matching agent + low-confidence/override/failed.
   c. If no args → most recent failure across all agents.
   d. If not found → list recent failures with `--all-failed` view.

2. **Read full invocation record:**
   ```jsonl
   {"id":"<uuid>","timestamp":"<ISO>","agent":"<id>","task":"<text>","tool_calls":[...],"output":"...","confidence":N,"override":false|true,"blocker":"none|stale-context|missing-skill|wrong-approach|environment","iterations":N}
   ```

3. **Classify failure pattern:**

| Pattern | Signal | Root cause |
|---|---|---|
| `stale-context` | Agent referenced paths/symbols that don't exist | Project context drifted; run `/evolve-adapt` |
| `missing-skill` | Agent tried to do work no skill covers | Add skill to `Skills:` list or create new one |
| `wrong-approach` | Agent picked wrong branch in Decision tree | Tighten Decision tree; add anti-pattern |
| `environment` | Tool failure, command not found, network issue | Not an agent problem; investigate environment |
| `prompt-bloat` | Confidence dropped + iterations high | Agent file too large; consider Phase 4 cache reordering |
| `ambiguous-task` | Override rationale mentions "unclear request" | User needs better /evolve-brainstorm pre-step |

4. **Search for prior similar failures:**
   ```bash
   evolve:project-memory --query "<agent> <task-keywords> failure"
   ```
   If matched → quote the prior fix; offer to reapply it.

5. **Dispatch root-cause-debugger** for deep analysis when classification is ambiguous (≥2 patterns possible). The debugger uses `evolve:systematic-debugging` skill: symptom → 3 hypotheses → evidence per hypothesis → narrowed root cause.

6. **Propose fix** based on classification:

   - `stale-context` → suggest `/evolve-adapt` to refresh project context
   - `missing-skill` → list skill candidates; offer to add to agent's Skills list
   - `wrong-approach` → suggest `/evolve-strengthen <agent>` with focus on Decision tree
   - `environment` → print exact environment issue; suggest fix outside the plugin
   - `prompt-bloat` → suggest cache-friendly reordering (Phase 4 of token-economy plan)
   - `ambiguous-task` → suggest re-running through `/evolve-brainstorm` first

7. **Optional replay** (if `--replay`):
   - Re-dispatch same agent on same task
   - Compare new output to old output side-by-side
   - Score each via `evolve:confidence-scoring`
   - Report: regressed | unchanged | improved
   - If improved by ≥0.5 confidence → suggest closing the failure case (memory entry: `solutions/<topic>.md`)

8. **Persist debug record:**
   `.claude/memory/incidents/debug-<invocation-id>-<ISO>.md`:
   ```markdown
   # Debug: <agent-id> on "<task-snippet>"
   Invocation ID: <id>
   Date: <ISO>
   Confidence: <N>/10  (Override: <bool>)
   Blocker: <classification>
   Root cause: <one-sentence summary>
   Proposed fix: <action>
   Replay outcome (if --replay): regressed | unchanged | improved (delta: +X)
   ```

## Error recovery

| Failure | Recovery action |
|---|---|
| Invocation ID not found | Suggest `--all-failed` to browse recent |
| Agent has no failures | Print "Agent has no recorded failures in last 30 days. Use `<invocation-id>` form for older or successful invocations." |
| `agent-invocations.jsonl` missing | Telemetry not yet running; suggest verifying hook in `hooks/hooks.json` |
| Replay returns same low score | Suggest deeper investigation: read agent file + skill files; consider `/evolve-strengthen` |
| Classification ambiguous | Auto-dispatches root-cause-debugger; user accepts/refines |

## Output contract

```
=== Evolve Debug ===
Invocation:    <uuid>
Agent:         laravel-developer
Task:          "add validation to PaymentController.store"
Timestamp:     2026-04-27T14:32:00Z
Confidence:    7.2 / 10
Override:      false
Blocker:       wrong-approach
Iterations:    2

=== Root cause analysis ===
Pattern: wrong-approach
Signal: agent placed validation in controller method instead of FormRequest class
Decision tree branch missed: "Where does validation live?" (request | controller | service)

Prior similar failure: yes
  - .claude/memory/incidents/debug-abc123-2026-04-15.md
  - Same agent, same wrong approach, fix was: add Decision tree branch + anti-pattern
  - Was fix applied? NO (commit history shows agent file unchanged since)

=== Proposed fix ===
Run: /evolve-strengthen laravel-developer

Specific edit:
  - Decision tree: add "Validation logic placement" branch
  - Anti-patterns: add `validation-in-controller-not-form-request`

Alternative: replay this task to verify reproducibility
  Run: /evolve-debug --replay <invocation-id>

Debug record saved: .claude/memory/incidents/debug-<id>-<date>.md
```

## When NOT to invoke

- For non-agent failures (your code crashed, infrastructure issue) — use stack-specific debugger or `root-cause-debugger` directly.
- When telemetry shows agent succeeded — there's nothing to debug; check whether you actually want strengthening (use `/evolve-score agent-quality`).
- For agents with <5 invocations — sample too small for pattern analysis.

## Related

- `evolve:_core:root-cause-debugger` agent — invoked for ambiguous classifications
- `evolve:systematic-debugging` skill — methodology
- `/evolve-strengthen <agent>` — applies fix proposed by debug
- `/evolve-evaluate` — closes loop after fix verified
- `/evolve-adapt` — fix for `stale-context` blockers
- `.claude/memory/agent-invocations.jsonl` — telemetry source
- `.claude/memory/incidents/debug-*.md` — debug record persistence
