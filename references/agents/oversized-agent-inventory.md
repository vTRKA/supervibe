# Oversized Agent Inventory

Initial red-phase inventory was captured with `npm run measure:tokens:strict` on 2026-05-14 before the progressive-disclosure split. The current strict measurement after the split reports `PASS: true`, `PER_AGENT_CONTEXT_BUDGET: 8000`, `TOKEN_VIOLATIONS: 10`, `BLOCKING_VIOLATIONS: 0`, and `PLANNED_REPAIRS: 10`.

## Slicing Policy

- Keep agent files as the invocation contract: persona, scope, procedure, output contract, anti-patterns, dialogue discipline, verification, skills, project context, and invocation boundary.
- Move long reusable depth to one-hop `references/agents/` files: decision trees, workflow matrices, deep examples, and output templates.
- Load a reference file only when the current task needs that stack or design depth.
- Preserve non-blocking exceptions for oversized agents outside this task's write set; do not edit out-of-scope files from this work item.

## Current Strict Oversized Agents

These are the complete agent files currently above the configured threshold of more than 500 lines or more than 8,000 tokens.

| Agent | Current size | Destination | Decision |
| --- | ---: | --- | --- |
| `agents/stacks/fastify/fastify-developer.md` | 555 lines / ~6242 tokens | Recommended future `references/agents/fastify-patterns.md` | Out of write set; non-blocking planned repair remains owned by a future Fastify split. |
| `agents/stacks/nuxt/nuxt-architect.md` | 459 lines / ~8169 tokens | Recommended future `references/agents/nuxt-architecture-patterns.md` | Out of write set; non-blocking planned repair remains owned by a future Nuxt split. |

## Red-Phase Destination Inventory

These files were oversized in the red-phase measurement and were normalized by this task into one-hop agent reference files.

| Agent | Red-phase size | Destination | Decision |
| --- | ---: | --- | --- |
| `agents/stacks/chrome-extension/chrome-extension-architect.md` | 564 lines / ~9740 tokens | `references/agents/chrome-extension-patterns.md` | Normalized in this task; MV3 decision tree, PRD template, and workflow matrix moved. |
| `agents/stacks/chrome-extension/chrome-extension-developer.md` | 560 lines / ~11016 tokens | `references/agents/chrome-extension-patterns.md` | Normalized in this task; feature report template, code-placement tree, workflows, and graph template moved. |
| `agents/stacks/django/django-architect.md` | 486 lines / ~8517 tokens | `references/agents/django-architecture-patterns.md` | Normalized in this task; architecture tree, workflows, decision template, and graph evidence moved. |
| `agents/stacks/elasticsearch/elasticsearch-architect.md` | 443 lines / ~8422 tokens | `references/agents/elasticsearch-patterns.md` | Normalized in this task; search architecture tree, decision template, and workflows moved. |
| `agents/stacks/graphql/graphql-schema-designer.md` | 553 lines / ~10050 tokens | `references/agents/graphql-schema-patterns.md` | Normalized in this task; schema tree, decision template, and workflows moved. |
| `agents/stacks/spring/spring-architect.md` | 477 lines / ~8384 tokens | `references/agents/spring-architecture-patterns.md` | Normalized in this task; architecture tree, decision template, graph evidence, and workflows moved. |
| `agents/_design/creative-director.md` | 686 lines / ~13670 tokens | `references/agents/design-creative-direction.md` | Normalized in this task; design-intelligence matrix, full procedure, workflows, engagement tree, and artifact template moved. |
| `agents/_design/prototype-builder.md` | 510 lines / ~9983 tokens | `references/agents/design-prototype-patterns.md` | Normalized in this task; expert reference, capability plan, full procedure, workflows, shape tree, and artifact template moved. |
| `agents/_design/ux-ui-designer.md` | 482 lines / ~8030 tokens | `references/agents/ux-ui-patterns.md` | Normalized in this task; UX decision tree, expert references, workflows, and handoff template moved. |

## Post-Split In-Scope Agent Sizes

All in-scope agent files now stay below the configured agent threshold.

| Agent | Current size | One-hop reference |
| --- | ---: | --- |
| `agents/_design/creative-director.md` | 308 lines / ~5977 tokens | `references/agents/design-creative-direction.md` |
| `agents/_design/prototype-builder.md` | 314 lines / ~5543 tokens | `references/agents/design-prototype-patterns.md` |
| `agents/_design/ux-ui-designer.md` | 294 lines / ~5591 tokens | `references/agents/ux-ui-patterns.md` |
| `agents/stacks/chrome-extension/chrome-extension-architect.md` | 314 lines / ~6680 tokens | `references/agents/chrome-extension-patterns.md` |
| `agents/stacks/chrome-extension/chrome-extension-developer.md` | 351 lines / ~7701 tokens | `references/agents/chrome-extension-patterns.md` |
| `agents/stacks/django/django-architect.md` | 271 lines / ~5456 tokens | `references/agents/django-architecture-patterns.md` |
| `agents/stacks/elasticsearch/elasticsearch-architect.md` | 271 lines / ~6058 tokens | `references/agents/elasticsearch-patterns.md` |
| `agents/stacks/graphql/graphql-schema-designer.md` | 264 lines / ~5831 tokens | `references/agents/graphql-schema-patterns.md` |
| `agents/stacks/spring/spring-architect.md` | 260 lines / ~5650 tokens | `references/agents/spring-architecture-patterns.md` |

## Non-Agent Violations Observed

The same red-phase measurement also reported host roots and five skills above their respective budgets. They are outside this task's write set and remain covered by the existing planned-repair policy in `measure-token-footprint.mjs`.

## Owner Notes

- In-scope destinations created in this task are discoverable from each edited agent's `## Related` section.
- Out-of-scope oversized agents are intentionally listed here so execution-time inventory is complete even though their files were not edited.
- The strict token measurement treats these as non-blocking because `BLOCKING_VIOLATIONS: 0`; remaining out-of-scope items should be scheduled as separate write-scoped repairs.
