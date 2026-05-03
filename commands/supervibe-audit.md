---
description: "Health-check across project's agents, rules, memory entries, indexes, design-intelligence evidence, and host instruction routing — surfaces stale artifacts and inconsistencies."
---

# /supervibe-audit

Run a full plugin + project health check. No writes — only reports.

Design audit mode uses the same command surface: `/supervibe-audit --design`. It reads design artifacts and reports missing memory preflight, missing design intelligence citations, token drift, brand/collateral asset drift, slide/deck quality gaps, chart accessibility gaps, and UI polish regressions.

## Invocation

```bash
/supervibe-audit
/supervibe-audit --design
/supervibe-audit --json
```

## Procedure

1. **Index health.** Run `npm run supervibe:status` (or `node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs`). Capture: code RAG counts, graph resolution rate, memory entries, watcher state, preview servers, MCP registry, agent telemetry.

2. **Frontmatter validation.** Run `node <resolved-supervibe-plugin-root>/scripts/validate-frontmatter.mjs`. Flags any agent / skill / rule / rubric with malformed or missing required fields.

3. **Skill triggers.** Run `node <resolved-supervibe-plugin-root>/scripts/lint-skill-descriptions.mjs`. Flags skill descriptions that fail trigger-clarity (`Use BEFORE/AFTER/WHEN ... TO ...`).

4. **Agent canonical footers.** Run `npm run validate:agent-footers` to confirm every agent's `## Output contract` ends with the parser-readable confidence trailer.

5. **Stale artifacts.** Walk `agents/`, `rules/`, `skills/` for files whose frontmatter `last-verified` is older than 30 days. List each with its age.

6. **Project-level overrides.** If the selected host adapter's agents folder exists in the current project, diff each file against the upstream version in `<resolved-supervibe-plugin-root>/agents/<same-namespace>/<same-name>.md`. Report drifted ones.

7. **Memory hygiene.** First check `.supervibe/memory/index.json`. If it is missing, diagnose that memory lookup is not ready and print:
   ```bash
   node <resolved-supervibe-plugin-root>/scripts/build-memory-index.mjs
   ```
   Then list memory categories under `.supervibe/memory/{decisions,patterns,incidents,learnings,solutions}/` with counts. Flag categories with zero entries (likely under-used).

8. **Override-rate check.** Read `.supervibe/confidence-log.jsonl`. If override rate over the last 100 entries exceeds 5%, escalate as a finding.

9. **Underperformer scan.** Run `node <resolved-supervibe-plugin-root>/scripts/lib/auto-strengthen-trigger.mjs` (via require), get the suggestions list. Surface flagged agents.

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
- You want an AppSec / vulnerability remediation loop — use `/supervibe-security-audit`

## Related

- `supervibe:audit` skill — the underlying methodology document
- `/supervibe-strengthen` — fixes weak agents
- `/supervibe-adapt` — fixes drift between upstream and project copies
- `/supervibe-security-audit` — read-only multi-agent vulnerability audit plus optional remediation/re-audit loop

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-audit` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, required agents, and durable-write permission before any agent-owned artifact is produced.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
