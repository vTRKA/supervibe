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
- Browser, Figma, Context7, Firecrawl, and other MCP tools are optional until
  installed, then required when the task explicitly depends on their live data
  or interaction surface.

## Class Matrix

| Agent class | Required evidence | Required tools when available | Hard stop |
| --- | --- | --- | --- |
| Core reviewers | Project memory, Code RAG, Code Graph for impact, verification output | Code Graph callers/callees/neighbors, workflow receipt validators | No file/line evidence for a finding |
| Repo researchers | Project memory, Code RAG context pack, graph neighborhood | `search-memory.mjs`, `search-code.mjs --context`, `--callers`, `--neighbors` | Index not ready and no repair command shown |
| Refactoring specialists | Project memory, Code RAG, Code Graph impact radius, tests | `search-code.mjs --impact`, `--callers`, targeted test command | Structural edit without graph evidence |
| Stack developers | Project memory, Code RAG, local patterns, official docs when API is current-sensitive | Context7 for library docs, package manager checks, targeted tests | New dependency or API usage without authoritative docs |
| Design agents | Project memory, approved design-system state, design-intelligence rows, product-fit evidence | Figma when a file is supplied, browser/Playwright for preview evidence, image tools for real visual assets | Prototype work before approved or explicitly scoped design-system state |
| UI reviewers | Design-system state, screenshots or DOM snapshot, accessibility evidence | Playwright snapshot/screenshot, browser preview server, contrast/focus checks | UI approval without visual or accessibility evidence |
| Product agents | Project memory, user outcome, acceptance criteria, scope boundaries | Work-item graph, scenario eval fixtures, analytics/event taxonomy docs | Vague requirement converted directly to execution |
| Ops/SRE agents | Project memory, code/config evidence, release/security audit evidence | Shell verification, dependency-health, release-security audit, MCP/vendor docs when current | Production mutation without explicit gate |
| Research agents | Project memory, authoritative current sources, applicability notes | Firecrawl/web search for current docs/news/CVEs, Context7 for libraries | Source is stale, unofficial, or uncited |
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
