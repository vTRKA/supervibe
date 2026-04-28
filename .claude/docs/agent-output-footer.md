# Canonical agent output footer (mandatory)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Every agent's last 3-5 lines MUST contain a canonical footer that the PostToolUse hook can parse:

```
Confidence: <N>.<dd>/10
Override: <true|false>
Rubric: <rubric-id-from-confidence-rubrics-dir>
```

**Why:** the evolution loop's PostToolUse hook regex-matches `Confidence: N/10` to log a score. Without the canonical format → score=0 → false underperformer flag.

**Where to put it:** as a fenced code block (preferred) or plain text inside the agent's `## Output contract` section. The agent definition file MUST include this in `## Output contract` so authors know to print it.

**For agents that legitimately can't score themselves** (e.g. pure-research read-only agents): output `Confidence: N/A` and `Rubric: read-only-research` — the regex treats `N/A` as null and skips logging.

**Validator:** `npm run validate:agent-footers` — fails build if any agent's `## Output contract` lacks a Confidence line + Rubric line.
