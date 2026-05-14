---
name: evaluate
namespace: process
description: >-
  Use AFTER each agent task completion to track effectiveness (outcome,
  iterations, blockers, confidence-score, user-corrections) into
  effectiveness.jsonl. Triggers: 'оцени артефакт', 'log outcome', 'запиши
  результат', 'evaluate'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Evaluate

## Overview

This skill records how well an agent, skill, or workflow delivered against the
task contract. It is an evidence log, not a sentiment score: the outcome must
come from the requested artifact, rubric, verification evidence, confidence
gate, and user correction history.

The resulting evaluation should help later agents see which work patterns are
effective, which failures repeat, and which remediation command or skill should
run next.

## When to Use

- After agent claims task complete
- After user corrects agent output (signal of partial success)
- User runs `/supervibe-score --record`

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read `.supervibe/memory/effectiveness.jsonl` for prior entries
2. Read agent's `effectiveness:` frontmatter section
3. Read recent confidence-log entries
4. Read the task request, acceptance criteria, final artifact, changed files,
   verification output, runtime receipts, and user corrections
5. Read the confidence rubric named by the invoked skill, emitted artifact, or
   task type before assigning a score

## Rubric selection

Choose the rubric from the strongest available local signal:

1. If the completed skill or agent declares `confidence-rubric`, use that file.
2. If the task produced a typed artifact, map the artifact type to its rubric:
   `requirements-spec` -> `confidence-rubrics/requirements.yaml`,
   `memory-entry` -> `confidence-rubrics/memory-entry.yaml`,
   `agent-output` -> `confidence-rubrics/agent-delivery.yaml`.
3. If a command or plan artifact explicitly names a rubric, use that rubric and
   record the source.
4. If no rubric can be identified, classify the evaluation as `partial` or
   `failed` depending on delivery evidence; do not invent a custom rubric inside
   this skill.
5. If multiple rubrics apply, score against the most specific durable artifact
   rubric and record secondary rubric gaps in `notes`.

## Evidence packet

Build an evidence packet before scoring. Required fields:

- `task`: concise requested outcome and acceptance criteria.
- `artifact`: path, receipt id, or final answer being evaluated.
- `rubric`: selected rubric path and why it applies.
- `verification`: exact command names, test results, screenshots, reviewer
  receipts, or `read-only` when no command is appropriate.
- `retrievalEvidence`: memory ids, Code RAG status, Code Graph readiness, docs,
  source file references, or fallback reasons used by the worker.
- `confidenceEvidence`: rubric score, confidence gate status, override reason
  if one exists, and any missing evidence.
- `userCorrections`: count and short summary of user corrections after the
  claim.
- `limits`: unverified claims, tool failures, stale context, or scope that was
  intentionally left out.

## Scoring and confidence gates

- `success` requires the requested task to be complete, required verification to
  pass, no unresolved blocker to remain, and confidence/rubric score >=9 unless
  the applicable rubric defines a stricter gate.
- `partial` means useful work was delivered but evidence is incomplete, the user
  corrected material behavior, confidence is 7-8, or a non-blocking gate is
  missing.
- `failed` means the artifact is unusable, abandoned, below score 7, blocked by
  missing required evidence, or contradicted by verification output.
- For `gate-on-exit: true` skills, a BLOCK or missing confidence score prevents
  success classification even if some artifact exists.
- For `gate-on-exit: false` support skills, record the confidence fallback:
  what was verified, what was not, and why the lower gate is acceptable.
- Never average away a critical failure. Security, data loss, user-visible
  breakage, or missing required receipt keeps the outcome below success.

## Failure handling

- If evidence is missing, write `outcome: "partial"` or `outcome: "failed"` and
  add a normalized blocker; do not repair the artifact inside evaluation.
- If `.supervibe/memory/effectiveness.jsonl` contains invalid prior rows,
  preserve them, append nothing, and report the parse failure as a blocker.
- If updating agent frontmatter would touch files outside the active write set,
  skip the edit and record `frontmatterUpdate: "skipped-out-of-scope"`.
- If verification failed, include the failing command and first actionable
  failure in `notes`, then recommend the owning repair command or skill.
- If runtime receipts are required but absent, classify below success and name
  the missing receipt type.

## Procedure

1. Determine outcome:
   - `success` — task complete, no corrections, score ≥9
   - `partial` — task complete with corrections OR score 7-8
   - `failed` — task abandoned OR score <7
2. Identify blockers if any:
   - `none` / `stale-context` / `missing-skill` / `wrong-approach` / `user-correction`
   - Include `missing-verification`, `missing-artifact`, `missing-receipt`, or
     `scope-creep` when the evidence packet exposes those gaps.
   - Select the rubric, build the evidence packet, and apply confidence gates
     before choosing `success`.
3. Append entry to `.supervibe/memory/effectiveness.jsonl`:
   ```json
   {"ts":"<ISO>","agent":"<id>","task":"<text>","outcome":"...","iterations":N,"blockers":[...],"confidence":N,"user-corrections":N}
   ```
4. Update agent's frontmatter `effectiveness:` block with most recent
5. **Pattern detection**:
   - 2+ failed with `stale-context` → suggest `/supervibe-audit`
   - 2+ failed with `missing-skill` → suggest `/supervibe-strengthen`
   - 2+ failed with `wrong-approach` → flag for Persona review
6. Output: log entry + pattern detection

## Decision tree

```
Was the task verified with command output?
  yes -> success is possible if confidence >=9 and user made no correction
  no  -> classify as partial unless the task was explicitly read-only/advisory

Did the user correct the agent?
  yes -> record user-correction and classify success only if correction was optional polish
  no  -> continue

Did the agent skip required memory/RAG/codegraph?
  yes -> blocker includes stale-context or missing-context
  no  -> continue

Did the final output omit confidence footer?
  yes -> blocker includes missing-confidence-footer
  no  -> continue
```

## Effectiveness schema

Each JSONL row must include:
- `ts`: ISO timestamp.
- `agent`: stable agent id or skill id.
- `task`: short task summary.
- `outcome`: `success`, `partial`, or `failed`.
- `iterations`: count of meaningful correction loops.
- `blockers`: array of normalized blocker tags.
- `confidence`: numeric confidence or null.
- `rubric`: selected rubric path or null when no rubric applies.
- `gateStatus`: `PASS`, `WARN`, `BLOCK`, `not-run`, or `not-required`.
- `userCorrections`: count of user corrections.
- `verification`: command names or `read-only`.
- `evidencePacket`: compact references to artifact, receipts, retrieval
  evidence, and limits.
- `frontmatterUpdate`: `updated`, `skipped-out-of-scope`, or `not-applicable`.
- `notes`: short explanation when outcome is not success.

## Blocker taxonomy

- `stale-context`: memory, RAG, graph, or docs were stale.
- `missing-skill`: correct skill was absent or not invoked.
- `wrong-approach`: agent chose an approach that did not fit the task.
- `missing-verification`: agent claimed done without evidence.
- `missing-artifact`: required spec, plan, diff, screenshot, or test output was absent.
- `missing-receipt`: workflow, reviewer, validator, worker, or external tool
  invocation needed a runtime receipt but none was available.
- `user-correction`: user corrected scope, quality, or behavior.
- `tool-failure`: tool or environment prevented completion.
- `scope-creep`: agent expanded task without explicit approval.

## Verification

- `.supervibe/memory/effectiveness.jsonl` exists or is created append-only.
- New row is valid JSON.
- Agent frontmatter was updated only for the targeted agent.
- Prior JSONL rows are unchanged.
- Pattern detection ran after the append.
- Rubric selection is recorded with source evidence.
- Evidence packet includes artifact reference, verification, retrieval evidence,
  confidence gate status, corrections, and limits.
- Failed or partial outcomes include normalized blocker tags and a recommended
  repair path.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.
- Do not use it to change the artifact being evaluated; evaluation records the
  outcome and recommends repair.
- Do not use it as a substitute for `supervibe:confidence-scoring` when a gate
  requires rubric scoring.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.
- "The agent sounded confident, so call it success" - reject; success needs
  artifact, verification, and gate evidence.
- "One failed test is unrelated" - reject unless the failure is attributed with
  a concrete scope reason and recorded as a limit.
- "No rubric was obvious, so use 9 by default" - reject; absent rubric evidence
  lowers the outcome classification.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.
- Success is recorded while the selected confidence gate is missing or BLOCK.
- The JSONL row omits artifact, rubric, verification, or user correction data.
- Repeated failures are appended without pattern detection or a recommended
  repair path.
- The evaluator edits prior JSONL rows to make trend data look cleaner.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.
- Rubric selected from frontmatter, artifact type, command, or recorded as
  unavailable.
- Evidence packet assembled before scoring.
- Confidence gate status recorded.
- Failure handling path chosen for partial/failed outcomes.
- Pattern detection checked after append.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.
- Evaluation becomes a subjective thumbs-up instead of an evidence record.
- Success hides missing receipts or stale retrieval context.
- Partial outcomes lack blocker tags, so audit and strengthen workflows cannot
  find the recurring pattern.
- Frontmatter edits spill outside the intended agent or write scope.

## Output contract

Returns:
- `entry`: JSONL row written or append failure reason
- `outcome`: `success`, `partial`, or `failed`
- `rubric`: selected rubric and selection reason
- `evidencePacket`: artifact, verification, retrieval evidence, confidence
  evidence, user corrections, and limits
- `confidence`: numeric score and gate status
- `blockers`: normalized blocker tags
- `frontmatterUpdate`: updated/skipped/not-applicable
- `patternDetection`: repeated failure signals, if any
- `recommendedAction`: repair command, skill, audit, strengthen action, or none

## Guard rails

- DO NOT: edit prior entries (append-only)
- DO NOT: mark success when required verification, receipts, or rubric evidence
  are missing.
- DO NOT: invent rubric scores or normalize away critical failures.
- DO NOT: classify as success without confidence ≥9
- ALWAYS: include user-corrections count
- ALWAYS: include rubric selection, evidence packet, gate status, blockers, and
  limitations.
- ALWAYS: pattern-check after write

## Related

- `supervibe:audit` — consumes effectiveness data
- `supervibe:strengthen` — consumes failure patterns
