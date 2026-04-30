---
description: "Health-check across project's agents, rules, memory entries, indexes, design-intelligence evidence, and CLAUDE.md routing — surfaces stale artifacts and inconsistencies."
---

# /supervibe-audit

Run a full plugin + project health check. No writes — only reports.

Design audit mode uses the same command surface: `/supervibe-audit --design`. It reads design artifacts and reports missing memory preflight, missing design intelligence citations, token drift, brand/collateral asset drift, slide/deck quality gaps, chart accessibility gaps, and UI polish regressions.

## Procedure

1. **Index health.** Run `npm run supervibe:status` (or `node $CLAUDE_PLUGIN_ROOT/scripts/supervibe-status.mjs`). Capture: code RAG counts, graph resolution rate, memory entries, watcher state, preview servers, MCP registry, agent telemetry.

2. **Frontmatter validation.** Run `node $CLAUDE_PLUGIN_ROOT/scripts/validate-frontmatter.mjs`. Flags any agent / skill / rule / rubric with malformed or missing required fields.

3. **Skill triggers.** Run `node $CLAUDE_PLUGIN_ROOT/scripts/lint-skill-descriptions.mjs`. Flags skill descriptions that fail trigger-clarity (`Use BEFORE/AFTER/WHEN ... TO ...`).

4. **Agent canonical footers.** Run `npm run validate:agent-footers` to confirm every agent's `## Output contract` ends with the parser-readable confidence trailer.

5. **Stale artifacts.** Walk `agents/`, `rules/`, `skills/` for files whose frontmatter `last-verified` is older than 30 days. List each with its age.

6. **Project-level overrides.** If `.claude/agents/` exists in the current project, diff each file against the upstream version in `$CLAUDE_PLUGIN_ROOT/agents/<same-namespace>/<same-name>.md`. Report drifted ones.

7. **Memory hygiene.** List memory categories under `.claude/memory/{decisions,patterns,incidents,learnings,solutions}/` with counts. Flag categories with zero entries (likely under-used).

8. **Override-rate check.** Read `.claude/confidence-log.jsonl`. If override rate over the last 100 entries exceeds 5%, escalate as a finding.

9. **Underperformer scan.** Run `node $CLAUDE_PLUGIN_ROOT/scripts/lib/auto-strengthen-trigger.mjs` (via require), get the suggestions list. Surface flagged agents.

10. **Design intelligence audit.** If design artifacts are in scope, verify that the agent output includes `Design Intelligence Evidence`, memory/code preflight, token compliance, brand asset audit, and the precedence hierarchy `approved design system > project memory > codebase patterns > accessibility law > external lookup`.

11. **Summarize.** Print a one-page report grouped by severity (CRITICAL / WARN / INFO). End with the recommended next command (`/supervibe-strengthen`, `/supervibe-adapt`, or "looks good").

## Output contract

```
=== Supervibe Audit ===
Indexes:        <status line>
Frontmatter:    <N OK / M issues>
Skill triggers: <N OK / M issues>
Agent footers:  <N OK / M issues>
Stale (>30d):   <count>  [list]
Drift overrides:<count>  [list]
Memory:         <category counts>
Override-rate:  <X%>      <ok | over-threshold>
Underperformers:<count>   [list]

Recommended: <single next command>
Confidence: N/A  Rubric: read-only-research
```

## When NOT to invoke

- You only want to score one artifact — use `/supervibe-score`
- You want to fix things — `/supervibe-strengthen`, `/supervibe-adapt`, or `/supervibe-genesis`. Audit is read-only

## Related

- `supervibe:audit` skill — the underlying methodology document
- `/supervibe-strengthen` — fixes weak agents
- `/supervibe-adapt` — fixes drift between upstream and project copies
