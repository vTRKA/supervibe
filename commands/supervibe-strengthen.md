---
description: >-
  Strengthen underperforming agents/skills using telemetry from
  .claude/memory/agent-invocations.jsonl with quantitative metric thresholds.
  Detects: avg-confidence <8.5 over last 10, override-rate ≥40% delta over 50/50
  split, repeated stale-context (≥2/10 invocations). Triggers: 'strengthen
  agent', 'усиль агента', '/supervibe-strengthen'.
---

# /supervibe-strengthen

Strengthens an agent (or all flagged agents) by analyzing invocation telemetry, identifying failure modes via **quantitative thresholds**, and proposing concrete edits with diff-gate.

## Quantitative metric definitions

All thresholds documented for reproducibility — no AI heuristics.

### Trigger metrics (when an agent is flagged)

| Metric | Threshold | Window | Min sample |
|---|---|---|---|
| `low-avg-confidence` | avg(confidence) < 8.5 | last 10 invocations | ≥10 invocations required |
| `rising-override-rate` | (recent_25_overrides / 25) ≥ (older_25_overrides / 25) + 0.40 (i.e., +40 percentage points) | last 50 invocations split into 25+25 halves | ≥50 invocations required |
| `repeated-stale-context` | count(blocker == 'stale-context') ≥ 2 | last 10 invocations | ≥10 invocations required |
| `repeated-missing-skill` | count(blocker == 'missing-skill') ≥ 2 | last 10 invocations | ≥10 invocations required |
| `repeated-wrong-approach` | count(blocker == 'wrong-approach') ≥ 2 | last 10 invocations | ≥10 invocations required |
| `iteration-rate-high` | avg(iterations) > 2 | last 10 invocations | ≥10 invocations required |

Implementation: `scripts/lib/underperformer-detector.mjs::detectUnderperformers()`. Tested in `tests/underperformer-detector.test.mjs`. Numbers are configurable via the function options (defaults above).

### Edit type → metric mapping

| Trigger metric | Recommended edit |
|---|---|
| `low-avg-confidence` | Tighten Decision tree branches; add 1-2 anti-patterns from frequent failure modes |
| `rising-override-rate` | Audit Persona for ambiguity; clarify Output contract; add explicit verification step |
| `repeated-stale-context` | Update Project Context with grep-verified paths via `/supervibe-adapt` (often agent file is fine, project context drifted) |
| `repeated-missing-skill` | Add the missing skill reference to Skills list; verify skill exists |
| `repeated-wrong-approach` | Persona/Decision tree mismatch — review with user; usually requires manual refactor |
| `iteration-rate-high` | Procedure too vague; add explicit step ordering with verification commands |

## Invocation forms

### `/supervibe-strengthen <agent_id>` — explicit target

Directly strengthen the named agent regardless of metrics. Useful when user has anecdotal evidence of weakness without telemetry threshold being hit.

Procedure:
1. Read `agents/**/<agent_id>.md` (locate by frontmatter `name:`).
2. Read last 100 invocations from `.claude/memory/agent-invocations.jsonl`.
3. Run `detectUnderperformers([this_agent], { logPath: ... })` to identify which metrics fired.
4. Map firing metrics to recommended edits (table above).
5. Show user the current weakness summary + proposed edits with diff.
6. Wait for user "yes" before writing.

### `/supervibe-strengthen` — auto-trigger flow

When invoked without arguments:

1. Run `node $CLAUDE_PLUGIN_ROOT/scripts/lib/auto-strengthen-trigger.mjs` to get the flagged list.
2. Print structured summary:
   ```
   N agents flagged for strengthening:
     - laravel-developer  (low-avg-confidence: 7.85 over last 10) — recommended: Decision tree + Anti-patterns
     - django-developer   (rising-override-rate: 12% → 64%) — recommended: Persona + Output contract
     - nestjs-developer   (low-avg-confidence: 8.10 + iteration-rate: 2.8) — recommended: Procedure + verification
   ```
3. User chooses:
   - `apply all` → run `/supervibe-strengthen <agent_id>` sequentially per flagged agent
   - `pick <agent_id>` → strengthen specific
   - `cancel` → exit

### `/supervibe-strengthen --metrics <agent_id>` — diagnostic only

Print the metric values for one agent without proposing edits. Useful to understand why an agent was flagged or to verify thresholds.

```
=== Metrics: laravel-developer ===
Total invocations:        42
Last 10 avg confidence:   7.85  ⚠ (threshold 8.5)
Last 10 iterations avg:   1.6   ✓
Last 10 stale-context:    1/10  ✓ (threshold ≥2)
Last 50 override delta:   +18%  ✓ (threshold +40%)

Firing: low-avg-confidence
Recommended edit: Decision tree + Anti-patterns
```

### `/supervibe-strengthen --explain` — show metric definitions

Print the threshold table above. Useful for documentation.

## Hard rules

- **Never auto-modify agent files.** User must approve each diff.
- **Never invent metrics.** All numbers come from `.claude/memory/agent-invocations.jsonl` via `detectUnderperformers()`. If sample size insufficient (e.g., <10 invocations), command says "insufficient data" and exits.
- **Preserve canonical sections.** Persona / Project Context / Skills / Decision tree / Procedure / Output contract / Anti-patterns / Verification / Common workflows / Out of scope / Related must remain. The validator `validate-frontmatter.mjs` enforces this.
- **Test after every edit.** Run `npm test` before declaring done; if test fails, revert and report.
- **One agent per commit.** Never bundle multiple strengthens — debugging regression is impossible across N agents in one commit.

## Procedure (per agent)

1. Read agent file + frontmatter.
2. Compute metrics via `detectUnderperformers([agent_id])`.
3. If no metrics fire → print "Agent above all thresholds; no strengthening needed" and exit.
4. Read last N invocations to understand failure context (read the `task` field, the failed outputs, any override rationales).
5. Search project memory: `supervibe:project-memory --query "<agent_id> failures"` for prior strengthen learnings.
6. Propose edits per the firing-metric → edit-type mapping. For each proposed edit, cite:
   - Specific failure invocation(s) that motivate it (file:line in jsonl)
   - Which agent section gets edited
   - Before/after diff
7. Show user the diff. Wait for explicit "yes" / "no" / "modify".
8. On "yes":
   - Apply the edit
   - Run `npm test`
   - If fails: revert, print error, ask user if they want to retry with smaller scope
9. On success:
   - Bump agent's `version` (semver minor)
   - Update `last-verified` to today
   - Update `verified-against` to current HEAD SHA
   - Append strengthen-record to `.claude/memory/learnings/strengthen-<agent>-<date>.md`

## Error recovery

| Failure | Recovery action |
|---|---|
| Agent file not found | List all agents with similar names (Levenshtein) |
| <10 invocations available | Print "Insufficient data — wait for more usage or use `<agent_id>` form to skip threshold gate" |
| All metrics within threshold | Print "Agent above all thresholds" + suggest `/supervibe-strengthen --metrics <id>` to verify |
| Test fails after edit | Revert via `git restore`; print error; offer to retry with narrower edit scope |
| User rejects diff | Save proposal to `.claude/memory/learnings/rejected-strengthen-<agent>-<date>.md` for future reference |

## Output contract

```
=== Evolve Strengthen ===
Agent:        laravel-developer
File:         agents/stacks/laravel/laravel-developer.md

Metrics analysis:
  Total invocations: 42  (sufficient: ≥10)
  Last 10 avg confidence: 7.85  ⚠ FIRES (threshold 8.5)
  Last 50 override delta: +18%  ✓ ok
  Last 10 iterations avg: 1.6   ✓ ok
  Last 10 stale-context: 1/10   ✓ ok

Firing metrics: low-avg-confidence
Recommended edit type: Decision tree + Anti-patterns

Failure invocations cited:
  - .claude/memory/agent-invocations.jsonl:142  task: "add validation"  conf: 7.2  blocker: wrong-approach
  - .claude/memory/agent-invocations.jsonl:156  task: "model relationships"  conf: 6.9  blocker: stale-context
  - .claude/memory/agent-invocations.jsonl:198  task: "queue setup"  conf: 7.5  blocker: none

Proposed edits:
  1. Decision tree: add branch for "validation logic placement" (form requests vs controllers vs requests classes)
  2. Anti-patterns: add `validation-in-controller-not-form-request`
  3. Anti-patterns: add `eloquent-relationship-without-eager-loading-when-collection`

[diff shown]

Apply? [y / n / modify]
```

## When NOT to invoke

- Agent has <10 invocations — telemetry insufficient, command exits.
- Agent file has structural problem (frontmatter invalid, sections missing) — fix that first via `npm run validate:frontmatter` and manual repair.
- All metrics within threshold — strengthening isn't needed; if user disagrees, use explicit `<agent_id>` form to bypass threshold check.

## Related

- `supervibe:strengthen` skill — methodology
- `scripts/lib/underperformer-detector.mjs` — metric calculation
- `scripts/lib/auto-strengthen-trigger.mjs` — flagged-list builder
- `tests/underperformer-detector.test.mjs` — threshold tests
- `.claude/memory/agent-invocations.jsonl` — telemetry source
- `/supervibe-evaluate` — closes the loop after strengthen by re-scoring
- `/supervibe-score agent-quality <path>` — score agent file quality independently
