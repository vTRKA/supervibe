# Skill system (40 skills)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Skills are **methodologies** — invokable from any agent. Frontmatter `description` follows trigger-clarity format ("Use BEFORE / AFTER / WHEN ... TO ...").

Key skills by phase:

| Phase | Skill | Purpose |
|-------|-------|---------|
| Discover | `evolve:stack-discovery` | Detect tech stack from repo |
| Discover | `evolve:requirements-intake` | Elicit requirements from user |
| Brainstorm | `evolve:brainstorming` | Multi-option exploration |
| Brainstorm | `evolve:explore-alternatives` | Decision matrices |
| Plan | `evolve:writing-plans` | Bite-sized TDD plan documents |
| Plan | `evolve:adr` | Architectural decision records |
| Plan | `evolve:prd` | Product requirements docs |
| Execute | `evolve:executing-plans` | Sequential plan execution |
| Execute | `evolve:subagent-driven-development` | Parallel subagent dispatch |
| Execute | `evolve:tdd` | Red-green-refactor discipline |
| Search | `evolve:code-search` | Semantic + graph code lookup |
| Search | `evolve:project-memory` | Past decisions/patterns search |
| Search | `evolve:mcp-discovery` | Find MCP tools for a task |
| Verify | `evolve:verification` | Cite tests/build/lint as evidence |
| Verify | `evolve:code-review` | 8-dim review with structural change check |
| Verify | `evolve:pre-pr-check` | Pre-PR gate |
| Score | `evolve:confidence-scoring` | Apply rubric to artifact |
| Debug | `evolve:systematic-debugging` | Root-cause methodology |
| Debug | `evolve:incident-response` | Postmortem template |
| Maintain | `evolve:strengthen` | Bring weak artifact to spec |
| Maintain | `evolve:adapt` | Adapt artifact to new context |
| Maintain | `evolve:audit` | Health check of artifacts |
| Maintain | `evolve:evaluate` | Test artifact against rubric |
| Maintain | `evolve:rule-audit` | Audit rule compliance |
| Maintain | `evolve:sync-rules` | Sync rules across sibling repos |
| Memory | `evolve:add-memory` | Persist new memory entry |
| Design | `evolve:brandbook` | Brand guidelines |
| Design | `evolve:tokens-export` | Design tokens to code |
| Design | `evolve:landing-page` | Landing page from brief |
| Design | `evolve:interaction-design-patterns` | Interaction patterns |
| Design | `evolve:prototype` | HTML/CSS prototypes |
| Design | `evolve:experiment` | A/B test scaffolding |
| Genesis | `evolve:genesis` | Initial scaffold |
| Genesis | `evolve:new-feature` | Per-feature scaffold |
| SEO | `evolve:seo-audit` | SEO checklist |
| Misc | `evolve:dispatching-parallel-agents` | Subagent fan-out helper |
| Misc | `evolve:using-git-worktrees` | Git worktree workflow |
| Misc | `evolve:requesting-code-review` | Open code review |
| Misc | `evolve:receiving-code-review` | Process review feedback |
| Misc | `evolve:finishing-a-development-branch` | Wrap-up checklist |

Total: 40. **Every skill** has `name`, `namespace`, `description`, `allowed-tools`, `phase`, `prerequisites`, `emits-artifact`, `confidence-rubric`, `gate-on-exit`, `version`, `last-verified` in frontmatter.
