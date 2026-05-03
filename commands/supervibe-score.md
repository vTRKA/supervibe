---
description: >-
  Score an artifact against its confidence rubric with explicit gap analysis and
  remediation actions. Primary scoring command; use --record when telemetry
  should be updated. Supports auto-detect, batch, dry-run, and override flow.
  Triggers: 'оцени', 'score', 'evaluate confidence', 'gap analysis',
  '/supervibe-score'.
---

# /supervibe-score

Score one or more artifacts against their confidence rubrics. Returns structured score + per-dimension verdicts + concrete remediation actions. Inspection-only by default; with `--record`, it also persists the outcome into telemetry.

For inline scoring during agent execution, agents use `supervibe:confidence-scoring` skill directly. This command is the user-facing entry point for explicit, on-demand scoring and replaces the old user-facing split between one-off scoring and telemetry evaluation.

## Invocation forms

### `/supervibe-score <artifact-type> <path>` — explicit

Examples:
- `/supervibe-score requirements .supervibe/artifacts/specs/2026-04-28-billing-design.md`
- `/supervibe-score plan .supervibe/artifacts/plans/2026-04-28-token-economy-safe-mode.md`
- `/supervibe-score skill-quality skills/component-library-integration/SKILL.md`
- `/supervibe-score brandbook .supervibe/artifacts/prototypes/_design-system/system.md`

### `/supervibe-score <path>` — auto-detect type

Inferred from path conventions:
- `.supervibe/artifacts/specs/*.md` → `requirements`
- `.supervibe/artifacts/plans/*.md` → `plan`
- `agents/**/*.md` → `agent-quality`
- `skills/**/SKILL.md` → `skill-quality`
- `rules/*.md` → `rule-quality`
- `.supervibe/artifacts/prototypes/<slug>/*.html` → `prototype`
- `.supervibe/artifacts/brandbook/*` → `brandbook`
- `.supervibe/memory/<category>/*.md` → `memory-entry`

If type cannot be inferred → ask user with the valid types listed.

### `/supervibe-score <artifact-type>` — most recent of type

Auto-resolve "most recent" via mtime in the canonical location for that type.
Useful when user just produced an artifact in this session.

### `/supervibe-score --batch <pattern>` — score multiple

Glob pattern matched against artifact-type-aware locations:
- `/supervibe-score --batch agent-quality "agents/_design/**/*.md"` — scores all design agents
- `/supervibe-score --batch plan ".supervibe/artifacts/plans/*.md"` — scores every plan

Returns: aggregate table + worst-3 detail.

### `/supervibe-score --dry-run <artifact-type> <path>` — show rubric only

Print the rubric dimensions + evidence requirements WITHOUT actually scoring. Useful for understanding what scoring will check before running.

### `/supervibe-score --record [<artifact-type>] [<path>]` — score and persist

Scores the artifact, then writes the accepted/review/rejected outcome to `.supervibe/memory/agent-invocations.jsonl` via the telemetry logger. This is the mode `/supervibe` proposes when it detects `pending-evaluation`.

When the user correction identifies a missed route, skipped context source, wrong citation, unclear lifecycle choice or failed verification, record it as a feedback review item. Accepted feedback is promoted through the feedback learning loop into memory candidates, eval candidates and high-severity regression fixtures.

## Valid artifact types

Read live from `confidence-rubrics/*.yaml`:

| Type | Rubric file | When to score |
|---|---|---|
| `requirements` | `requirements.yaml` | After spec produced via `/supervibe-brainstorm` |
| `plan` | `plan.yaml` | After plan produced via `/supervibe-plan` |
| `agent-output` | `agent-delivery.yaml` | After agent dispatch returns |
| `agent-quality` | `agent-quality.yaml` | When auditing agent file quality |
| `skill-quality` | `skill-quality.yaml` | When auditing skill file quality |
| `rule-quality` | `rule-quality.yaml` | When auditing rule file quality |
| `scaffold` | `scaffold.yaml` | After `/supervibe-genesis` produces scaffold |
| `framework` | `framework.yaml` | Foundational changes to the plugin itself |
| `prototype` | `prototype.yaml` | After prototype-builder produces files |
| `research-output` | `research-output.yaml` | After researcher agents return |
| `memory-entry` | `memory-entry.yaml` | Before persisting a memory entry |
| `brandbook` | `brandbook.yaml` | After brandbook skill produces system |
| `plan-execution` | `execute-plan.yaml` | After `/supervibe-execute-plan` finishes |

If user invokes with unknown type → list valid types from disk + suggest the closest match (Levenshtein on the type name).

## Procedure

1. **Resolve artifact-type and path:**
   a. If both args explicit → use them.
   b. If single arg looks like a path → infer type from path patterns (table above).
   c. If single arg is type → resolve "most recent" via `find <canonical-loc> -name '*.md' -printf '%T@ %p\n' | sort -rn | head -1`.
   d. If unparseable → list types + ask.

2. **Validate rubric exists:**
   ```
   test -f <resolved-supervibe-plugin-root>/confidence-rubrics/<type>.yaml
   ```
   If missing:
   - Print: "Rubric `<type>.yaml` not found. Available types: <list>."
   - Suggest closest match if user typo'd a known type.
   - Exit gracefully — do not invent a rubric.

3. **Read artifact:**
   - Use Read tool on path.
   - If file missing → print path + suggest `find -name '<basename>'` to locate.
   - If file >2 MB → warn user and ask if they really want to score (skill loads file into context).

4. **Invoke skill `supervibe:confidence-scoring`:**
   - Pass artifact-type + path + content.
   - Skill returns: per-dimension scores, weighted total, gates verdict (block/warn/pass), per-dimension gaps + remediation suggestions.

5. **Format output:**
   - Header: artifact path, type, total score, gate verdict.
   - Per-dimension table: id, weight, score, verdict, evidence-cited, gap-if-any.
   - Remediation list: 1-3 concrete actions to raise score.
   - Footer: standard Confidence/Override/Rubric block.

6. **Persistence:**
   - DO NOT modify the artifact.
   - Always append the score to `.supervibe/memory/score-log.jsonl` for score trends:
     ```jsonl
     {"id":"<uuid>","timestamp":"<ISO>","path":"<path>","type":"<type>","score":N,"gate":"<verdict>","dimensions":{...}}
     ```
   - If `--record` is present, also update the latest matching invocation outcome in `.supervibe/memory/agent-invocations.jsonl`.

7. **Offer follow-up actions** based on verdict:
   - If `block` (score < gate): offer `/supervibe-strengthen <agent>` (for agent-quality) or "fix gaps inline" (returns the remediation list as actionable items).
   - If `warn`: print warning + suggest single targeted improvement.
   - If `pass`: print confirmation + suggest `/schedule` if natural follow-up exists.
   - If user wants to override the gate → collect an explicit reason and append the override record internally with score context.

## Error recovery

| Failure | Recovery action |
|---|---|
| Rubric not found | Auto-suggest closest type via Levenshtein; list all valid types |
| Artifact path missing | Suggest `find` command to locate; offer `--batch` if user meant glob |
| Artifact >2 MB | Warn + ask confirmation (loading large file costs tokens) |
| Skill returns error | Print error + suggest re-running with `--dry-run` to see expected format |
| Score below threshold | Offer 3 paths: fix inline / `/supervibe-strengthen` / record explicit override reason |
| Score-log write fails | Score returned to user; log attempt logged separately; user not blocked |

## Output contract

Single-artifact:

```
=== Supervibe Score ===
Artifact:    .supervibe/artifacts/plans/2026-04-28-token-economy-safe-mode.md
Type:        plan (auto-detected from .supervibe/artifacts/plans/)
Rubric:      confidence-rubrics/plan.yaml
Score:       9.2 / 10
Gate:        pass (block-below: 9, warn-below: 10)

Dimensions (weighted):
  ✓ task-granularity         3/3   evidence: 142 bite-sized tasks
  ✓ verification-per-step    2/2   evidence: 89 Run-X-expect-Y blocks
  ✓ file-paths-explicit      2/2   evidence: every Create:/Modify: cited
  ⚠ self-review-completed    1/2   gap: spec coverage section partial
  ✓ rollback-per-phase       1/1   evidence: git revert <sha> noted

Gaps + remediation:
  • [self-review-completed]: expand spec coverage from 4 to 6 sections; add type-consistency check explicitly

Confidence: 9.2/10
Override: false
Rubric: plan
Score logged: .supervibe/memory/score-log.jsonl#<uuid>

Next:
  • Apply remediation (raises to 9.7) → re-score with /supervibe-score
  • Accept current score → ready to /supervibe-execute-plan
```

Batch:

```
=== Supervibe Score — Batch ===
Type:        agent-quality
Pattern:     agents/_design/**/*.md
Files:       10

Aggregate:
  • Average score: 8.7 / 10
  • Pass: 7  Warn: 2  Block: 1

Worst 3:
  ✗ creative-director.md       7.8/10  gap: persona-years vs effectiveness disagreement
  ⚠ ux-ui-designer.md          8.6/10  gap: missing motion handoff section
  ⚠ accessibility-reviewer.md  8.9/10  gap: WCAG version not declared

Run `/supervibe-score agent-quality <path>` for per-file detail.
```

Dry-run:

```
=== Supervibe Score — Dry Run ===
Type:        plan
Rubric:      confidence-rubrics/plan.yaml
Max score:   10
Gate:        block < 9, warn < 10

Dimensions:
  • task-granularity (weight 3)
    Q: Are tasks bite-sized (≤5 min) with explicit steps?
    Evidence required: every task has numbered steps, no "TBD"/placeholders
  ...
```

## When NOT to invoke

- During an active agent dispatch — that agent uses `supervibe:confidence-scoring` skill internally; no need for the command.
- For files outside the rubric coverage list (the rubric you'd want doesn't exist).
- For binary artifacts (images, compiled bundles) — rubrics expect text content.

## Related

- `supervibe:confidence-scoring` skill — the underlying methodology
- `confidence-rubrics/*.yaml` — the 14 rubrics this command scores against
- `references/internal-commands/supervibe-evaluate.md` — legacy telemetry alias spec
- `/supervibe-strengthen` — if score is `block`, this is the agent-improvement path
- `references/internal-commands/supervibe-override.md` — internal override logging spec
- `.supervibe/memory/score-log.jsonl` — telemetry trail for score trends over time

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-score` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, required agents, and durable-write permission before any agent-owned artifact is produced.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. In Codex, required specialists must be invoked with `spawn_agent`, then recorded with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
