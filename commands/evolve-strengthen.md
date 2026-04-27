---
description: "Strengthen underperforming agents/skills using telemetry from .claude/memory/agent-invocations.jsonl + invocation analysis."
---

# /evolve-strengthen

Strengthens an agent (or all flagged agents) by analyzing invocation telemetry,
identifying failure modes, and proposing concrete edits to its definition file.

## Invocation forms

### `/evolve-strengthen <agent_id>` — explicit target

Directly strengthen the named agent. Skip detection. Steps:

1. Read `agents/**/<agent_id>.md` (locate by frontmatter `name:`).
2. Read last 100 invocations of this agent from `.claude/memory/agent-invocations.jsonl`.
3. Identify failure patterns: low-confidence subtasks, repeated overrides, common task types that fail.
4. Propose edits: tighter Decision tree, missing Anti-pattern, narrower Out-of-scope, expanded Procedure.
5. Show diff. Wait for user "yes" before writing.

### `/evolve-strengthen` — auto-trigger flow (Phase H)

When invoked without arguments AND `evolve:status` shows underperformers:

1. Run `node $CLAUDE_PLUGIN_ROOT/scripts/lib/auto-strengthen-trigger.mjs` to get the flagged list.
   You can do this in the orchestrator by importing `buildStrengthenSuggestions()` from
   `scripts/lib/auto-strengthen-trigger.mjs` and printing the result.
2. Show user the list with reasons + suggested commands. Example:
   ```
   3 agents flagged for strengthening:
     - laravel-developer  (low-avg-confidence: 7.85)
     - django-developer   (rising-override-rate: 10% → 60%)
     - nestjs-developer   (low-avg-confidence: 8.10)
   ```
3. Ask user to confirm:
   - "Apply strengthen to all 3 flagged agents?" → run sequentially per-agent
   - "Pick specific" → user names one or more
   - "Cancel" → stop, no changes
4. Per agent: invoke the explicit form `/evolve-strengthen <agent_id>` and follow its diff-gate.
5. After all complete: print summary table (agent, edits applied, new confidence target).

## Hard rules

- **Never auto-modify agent files.** User must approve each diff.
- **Never invent metrics.** All numbers come from `.claude/memory/agent-invocations.jsonl`.
- **Preserve canonical sections.** Persona / Project Context / Skills / Decision tree /
  Procedure / Output contract / Anti-patterns / Verification / Common workflows /
  Out of scope / Related must remain.
- **Test after every edit.** Run `npm test` before declaring done.

## Output contract

Per agent:
```
agent: <id>
reason: <flag reason>
edits: <count> sections modified
diff: <git-style unified diff>
verification: tests pass / fail
```
