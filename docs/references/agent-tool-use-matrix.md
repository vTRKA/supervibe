# Agent Tool Use Matrix

This matrix is the release-facing contract for how Supervibe agents choose
project evidence and host tools. Individual agent prompts remain the execution
surface; this document keeps the cross-agent expectations auditable.

## Global Baseline

Every agent must treat project memory, Code RAG, Code Graph, workflow receipts,
and confidence gates as first-class evidence systems.

- Project memory is mandatory before non-trivial planning, architecture,
  recurring bug analysis, policy decisions, and project-history questions.
- Code RAG is mandatory before code changes, unfamiliar-code analysis, bug
  fixes, implementation planning, and stack discovery.
- Code Graph is mandatory for rename, move, delete, extract, public API change,
  dependency impact, architecture review, and cross-module refactors.
- Workflow receipts are mandatory before claiming a Supervibe command, skill,
  agent, reviewer, worker, validator, or external tool invocation produced a
  durable artifact.
- Verification commands are mandatory before saying work is fixed, complete,
  passing, ready, shipped, or merged.
- MCP tools are optional until installed, then required when the task explicitly
  depends on their live data or interaction surface. Recommended MCPs must align
  with the declared capability map in `scripts/lib/mcp-registry.mjs`; do not
  introduce ad hoc recommendations in agent guidance without adding the
  capability to the registry.

## Declared MCP Capability Map

| Capability id | Preferred MCP | Primary use | Fallback |
| --- | --- | --- | --- |
| `context7` | Context7 | Current third-party library documentation and examples | Official docs via web |
| `browser` | Playwright | Browser interaction, DOM snapshots, screenshots, preview QA | Static scrape or manual verification |
| `figma` | Figma MCP | Figma file, node, asset, and design-source extraction | User-provided screenshot or exported assets |
| `firecrawl` | Firecrawl | Web research, crawl, scrape, search, news, and structured extraction | Targeted web search or browser scrape |
| `openai-docs` | OpenAI developer docs MCP | Current OpenAI API, SDK, model, and product documentation | Official OpenAI docs via web |
| `tauri` | Tauri MCP | Native desktop webview, IPC, window, logs, device, and setup verification | Playwright frontend preview only |

## Class Matrix

| Agent class | Required evidence | Required tools when available | Hard stop |
| --- | --- | --- | --- |
| Core reviewers | Project memory, Code RAG, Code Graph for impact, verification output | Code Graph callers/callees/neighbors, workflow receipt validators | No file/line evidence for a finding |
| Repo researchers | Project memory, Code RAG context pack, graph neighborhood | `search-memory.mjs`, `search-code.mjs --context`, `--callers`, `--neighbors` | Index not ready and no repair command shown |
| Refactoring specialists | Project memory, Code RAG, Code Graph impact radius, tests | `search-code.mjs --impact`, `--callers`, targeted test command | Structural edit without graph evidence |
| Stack developers | Project memory, Code RAG, local patterns, official docs when API is current-sensitive | Context7 for library docs, OpenAI docs MCP for OpenAI API/SDK docs, package manager checks, targeted tests | New dependency or API usage without authoritative docs |
| Design agents | Project memory, approved design-system state, design-intelligence rows, product-fit evidence | Figma when a file is supplied, Playwright for browser preview evidence, Tauri MCP for native desktop evidence, image tools for real visual assets | Prototype work before approved or explicitly scoped design-system state |
| UI reviewers | Design-system state, screenshots or DOM snapshot, accessibility evidence | Playwright snapshot/screenshot, Tauri MCP for native webview/IPC/window/log evidence, browser preview server, contrast/focus checks | UI approval without visual or accessibility evidence |
| Product agents | Project memory, user outcome, acceptance criteria, scope boundaries | Work-item graph, scenario eval fixtures, analytics/event taxonomy docs | Vague requirement converted directly to execution |
| QA/test engineers | Project memory, Code RAG, existing tests/fixtures, scenario matrix, and verification output | `supervibe:test-strategy`, targeted test runner, Playwright/Tauri for E2E when available, Code Graph for touched public APIs | `tests/*.test.mjs` created or approved without specialist scenario coverage across happy path, failure path, boundary/null, regression, and provider/host variants where applicable |
| Ops/SRE agents | Project memory, code/config evidence, release/security audit evidence | Shell verification, dependency-health, release-security audit, Firecrawl/vendor docs when current, OpenAI docs MCP for OpenAI platform dependencies | Production mutation without explicit gate |
| Research agents | Project memory, authoritative current sources, applicability notes | Firecrawl for current web/news/CVEs, Context7 for libraries, OpenAI docs MCP for OpenAI APIs and models | Source is stale, unofficial, or uncited |
| Meta/orchestrator agents | Project memory, command-agent plan, receipts, confidence logs, work-item state | Command matcher, workflow receipt runtime, status/maturity validators | Emulating a specialist producer without trusted runtime proof |

## Design-Specific Evidence

Design-facing agents must start from the local knowledge pack in
`docs/references/design-expert-knowledge.md` and
`skills/design-intelligence/data/manifest.json`. External references are
supplemental and are required only for current market examples, official
platform guidance, live competitor pages, or fresh visual evidence.

Regulated-trust briefs such as finance, legal, healthcare, government,
security, and insurance require domain evidence before creative defaults. The
agent must cite product-fit, trust, accessibility, copy-risk, and compliance
constraints before accepting palette, typography, tone, animation, or imagery
defaults.

## Release Gate

A release that claims "agents use their tools at 10/10" must pass:

```bash
npm run validate:agent-tool-use-matrix
npm run supervibe:agent-retrieval-health -- --strict
node scripts/supervibe-agent-maturity.mjs
```

If the retrieval health command reports `MATURITY_SCORE` below `10/10`, the
system may be structurally ready, but observed agent behavior is not yet proven
at 10/10.
