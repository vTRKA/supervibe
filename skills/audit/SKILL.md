---
name: audit
namespace: process
description: >-
  Use WHEN session starts in existing project OR WHEN agent reports
  stale-context to health-check artifacts: stale references, coverage gaps, weak
  artifacts, agent-freshness, override-rate, effectiveness signals. Triggers:
  'health check', 'audit плагина', 'stale agents', 'аудит проекта'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Audit

## When to invoke

- AT SESSION START if `last-verified` of any artifact >30 days
- After ≥10 files changed in session
- Agent reports `stale-context` blocker
- User runs `/supervibe-audit`

## Dialogue Mode

Audit is read-only and non-interactive by default. No-prompt path: run the audit, print the structured report, and stop without mutation. If the user asks what to do next, ask one `Step 1/1` question with the recommended/default repair path first and include a stop option.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read `registry.yaml` for current artifact list
2. Read `.supervibe/memory/effectiveness.jsonl` (if exists)
3. Read `.supervibe/confidence-log.jsonl` (if exists)
4. Check `.supervibe/memory/index.json`; if missing, report `memory-index-missing` and the exact `node <resolved-supervibe-plugin-root>/scripts/build-memory-index.mjs` repair command before any project-memory-dependent checks
5. Read recent commits for context

## Decision tree

```
Audit request targets 10/10 plugin maturity?
  -> Run maturity, index, retrieval telemetry, receipt, content-quality, and eval coverage gates.

Audit request targets docs, agents, skills, or rules?
  -> Run the matching content-quality validators and flag missing Step 0, decision tree, output contract, placeholders, stale references, or filler.

Audit finds stale code index or retrieval evidence?
  -> Report the exact incremental index repair command and keep maturity below 10/10 until strict retrieval telemetry is green.

Audit finds receipt or producer provenance drift?
  -> Recommend workflow-receipt recovery, reissue, prune-stale, or ledger rebuild instead of hand-written repair.

Audit finds weak artifacts with valid structure but shallow role guidance?
  -> Route to supervibe:strengthen with concrete files and missing evidence, not a generic rewrite.
```

## Procedure

1. **Stale references** — for each artifact, grep paths/funcs/cmds it mentions; flag MISSING
2. **Coverage gaps** — Glob source dirs vs registry; flag uncovered modules
   - Run `node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs --index-health --no-gc-hints`; if `SUPERVIBE_INDEX_GATE READY: false`, flag stale or incomplete code index state with the failed gate codes.
   - Run `node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs --index-policy-diagnostics` when privacy/indexing is in scope; report classes and paths, never secret values.
3. **Weak artifacts** — failing `validate:agent-content-quality`, `validate:skill-content-quality`, `validate:rule-content-quality`, unresolved template placeholders, missing Step 0/decision tree/output contract, stale retrieval evidence, or copied filler sections
4. **Agent-freshness** — every agent's `last-verified` >90d → STALE
5. **Rule-freshness** — every rule's `last-verified` >90d → STALE
6. **Override-rate** — compute over last 100 entries; >5% → flag systemic
7. **Effectiveness signals** — agents with `failed/partial` outcome 2+ times → flag
8. Output structured health report
9. Recommend: `/supervibe-strengthen` for weak, `/supervibe-adapt` for stale refs, `/supervibe-score --record` for effectiveness

## Output contract

```markdown
## Health Report
### Stale References (N)
- ...
### Coverage Gaps (N)
- ...
### Code Index Health
- READY: true|false
- SOURCE_COVERAGE: indexed/eligible (%)
- FAILED: source-coverage, generated-leakage, stale-rows, symbol-coverage, symbol-quality
- Repair partial source coverage: `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --list-missing` then `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress`
- Graph repair: `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health`
- Full rebuild: use `--force --health` only when incremental repair cannot explain the index state
### Weak Artifacts (N)
- ...
### Stale Verifications (N)
- ...
### Override Rate
- X% over last N (threshold: 5%)
### Effectiveness Concerns (N)
- ...
### Recommended Actions
- /supervibe-strengthen
- /supervibe-adapt
```

## Guard rails

- DO NOT: auto-execute remediation (suggest only; user runs)
- DO NOT: flag false positives (verify each finding has evidence)
- ALWAYS: emit reproducible report (same inputs = same report)

## Verification

- Confirm every emitted artifact exists and matches the Output contract.
- Run the validator, test, dry-run, or audit command named by this skill when one exists.
- Include concrete command/output evidence before claiming the skill completed successfully.
- If verification cannot run, state the blocker and keep confidence below the passing gate.

## Related

- `supervibe:strengthen` — fix weak
- `supervibe:adapt` — fix stale references
- `supervibe:evaluate` — track effectiveness
