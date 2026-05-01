---
name: agent-install-profiles
description: "Genesis must install an explicit agent profile instead of copying every available stack-pack agent by default."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-04-29
related-rules: [single-question-discipline, rule-maintenance, agent-excellence-baseline]
---

# Agent Install Profiles

## Why this rule exists

Installing every available specialist into every project makes startup prompts heavier, routing noisier, and maintenance harder. Most projects need a small core first, then optional product, design, ops, and data specialists as the project grows.

Concrete consequence of NOT following: a small project receives 20+ agents it will not use, and users cannot tell which agent is responsible for a task.

## When this rule applies

- `/supervibe-genesis`
- Stack-pack composition
- Any installer or adaptation flow that writes `selected host agents folder/`

This rule does NOT apply to the plugin marketplace checkout itself; the marketplace can contain the full catalog.

## What to do

- Present a single profile choice before writing agents:
  - `minimal`
- `product-design`
- `full-stack`
- `custom`
- Recommend `minimal` by default.
- Show how many agents each profile installs.
- For `custom`, group choices by core, product, design, presentation, ops, data, and stack.
- After profile selection, ask one explicit add-on question. Default: `none`.
- Add-ons must be opt-in:
  - `security-audit` — multi-agent vulnerability audit chain for `/supervibe-security-audit`
  - `ai-prompting` — prompt AI engineer for system prompts, agent prompts, tool-use policies, intent routing, prompt evals, and prompt-injection tests
  - `network-ops` — router/network engineer for real network devices and routing stability
- Write only selected agents into the target project.
- Record the selected profile in generated the active host instruction file.
- Record selected add-ons in generated the active host instruction file. Never install high-risk network/server agents silently.

## Examples

### Bad

```text
Genesis detects Next.js and copies every core/product/design/ops/database agent without asking.
```

Why this is bad: the installed project has a noisy roster and hidden maintenance surface.

### Good

```text
Genesis asks "Install profile?" and defaults to minimal: orchestrator, repo-researcher, code-reviewer, quality-gate, root-cause-debugger, nextjs-developer, nextjs-architect.
Then it asks "Optional add-ons?" and defaults to none. User can select `security-audit`, `ai-prompting`, or `network-ops` explicitly.
```

Why this is good: users start with the agents they need and add more intentionally.

For design-heavy projects, `product-design` may add presentation agents as part of the design workflow, but it still must be an explicit profile choice rather than an automatic full install.

## Enforcement

- `commands/supervibe-genesis.md` requires profile selection.
- `commands/supervibe-genesis.md` requires add-on selection for new specialized agents.
- Stack-pack manifests may define `agent-profiles`.
- Stack-pack manifests may define `agent-addons`.
- Genesis output contract includes selected profile and final agent list.

## Related rules

- `single-question-discipline` — profile choice is one question, not a multi-page wizard.
- `rule-maintenance` — profile sets must stay aligned with stack-pack agent catalog.

## See also

- `skills/genesis/SKILL.md`
- `stack-packs/*/manifest.yaml`
