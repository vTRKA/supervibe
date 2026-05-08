# Agent Capability Heatmap

This document defines the human-facing heatmap contract. The full heatmap is
generated from live agent frontmatter and bodies so it cannot drift from the
roster.

Run:

```bash
npm run supervibe:agent-heatmap
npm run supervibe:agent-heatmap -- --json
```

Hard gate:

```bash
npm run validate:agent-empirical-hardening
```

## What The Heatmap Shows

- Agent id and namespace.
- Skill count, foundational skill count, specialist skill count.
- Tool count, write/edit availability, MCP or web-doc capability.
- Current best-practices freshness posture.
- Numeric agent score and grade.
- Critical-agent marker.

## Quality Bands

| Score | Grade | Meaning |
|---:|---|---|
| 9.7-10 | excellent | Agent has strong role, skill, tool, freshness, and output discipline. |
| 9.0-9.6 | ready | Agent is shippable but may not be a critical-path specialist. |
| <9.0 | needs-work | Release gate blocks until the agent is strengthened. |

## Current Gate

The current release gate requires:

- 92 heatmap rows for 92 agents.
- 92 generated per-agent eval packs.
- At least 3 eval cases per agent.
- Minimum score >= 9.
- Every critical agent has a playbook.
- Stack scenario fixtures cover at least 25 stack surfaces.
- Russian regression corpus has at least 8 cases.

The gate is implemented in `scripts/lib/supervibe-agent-empirical-hardening.mjs`
and exposed by `scripts/validate-agent-empirical-hardening.mjs`.
