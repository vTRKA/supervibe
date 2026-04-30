# Skill system (51 skills)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Skills are **methodologies** — invokable from any agent. Frontmatter `description` follows trigger-clarity format ("Use BEFORE / AFTER / WHEN ... TO ...").

Key skills by phase:

| Phase | Skill | Purpose |
|-------|-------|---------|
| Discover | `supervibe:stack-discovery` | Detect tech stack from repo |
| Discover | `supervibe:requirements-intake` | Elicit requirements from user |
| Brainstorm | `supervibe:brainstorming` | Multi-option exploration |
| Brainstorm | `supervibe:explore-alternatives` | Decision matrices |
| Plan | `supervibe:writing-plans` | Bite-sized TDD plan documents |
| Plan | `supervibe:adr` | Architectural decision records |
| Plan | `supervibe:prd` | Product requirements docs |
| Execute | `supervibe:executing-plans` | Sequential plan execution |
| Execute | `supervibe:subagent-driven-development` | Parallel subagent dispatch |
| Execute | `supervibe:tdd` | Red-green-refactor discipline |
| Search | `supervibe:code-search` | Semantic + graph code lookup |
| Search | `supervibe:project-memory` | Past decisions/patterns search |
| Search | `supervibe:mcp-discovery` | Find MCP tools for a task |
| Verify | `supervibe:verification` | Cite tests/build/lint as evidence |
| Verify | `supervibe:code-review` | 8-dim review with structural change check |
| Verify | `supervibe:pre-pr-check` | Pre-PR gate |
| Score | `supervibe:confidence-scoring` | Apply rubric to artifact |
| Debug | `supervibe:systematic-debugging` | Root-cause methodology |
| Debug | `supervibe:incident-response` | Postmortem template |
| Build | `supervibe:chrome-extension-build` | Chrome extension build/release workflow |
| Build | `supervibe:component-library-integration` | Component library adoption workflow |
| Build | `supervibe:error-envelope-design` | Error envelope and API error consistency |
| Build | `supervibe:feature-flag-rollout` | Feature flag rollout and rollback discipline |
| Build | `supervibe:auth-flow-design` | Auth flow and identity-provider planning |
| Loop | `supervibe:autonomous-agent-loop` | Bounded autonomous loop planning/execution discipline |
| Maintain | `supervibe:strengthen` | Bring weak artifact to spec |
| Maintain | `supervibe:adapt` | Adapt artifact to new context |
| Maintain | `supervibe:audit` | Health check of artifacts |
| Maintain | `supervibe:evaluate` | Test artifact against rubric |
| Maintain | `supervibe:rule-audit` | Audit rule compliance |
| Maintain | `supervibe:sync-rules` | Sync rules across sibling repos |
| Memory | `supervibe:add-memory` | Persist new memory entry |
| Design | `supervibe:brandbook` | Brand guidelines |
| Design | `supervibe:tokens-export` | Design tokens to code |
| Design | `supervibe:landing-page` | Landing page from brief |
| Design | `supervibe:interaction-design-patterns` | Interaction patterns |
| Design | `supervibe:prototype` | HTML/CSS prototypes |
| Design | `supervibe:prototype-handoff` | Prototype-to-implementation handoff |
| Design | `supervibe:presentation-deck` | Storyboard and deck production workflow |
| Design | `supervibe:experiment` | A/B test scaffolding |
| Preview | `supervibe:preview-server` | Live preview server workflow |
| Preview | `supervibe:browser-feedback` | Browser feedback capture workflow |
| Genesis | `supervibe:genesis` | Initial scaffold |
| Genesis | `supervibe:new-feature` | Per-feature scaffold |
| SEO | `supervibe:seo-audit` | SEO checklist |
| Misc | `supervibe:dispatching-parallel-agents` | Subagent fan-out helper |
| Misc | `supervibe:using-git-worktrees` | Git worktree workflow |
| Misc | `supervibe:requesting-code-review` | Open code review |
| Misc | `supervibe:receiving-code-review` | Process review feedback |
| Misc | `supervibe:finishing-a-development-branch` | Wrap-up checklist |
| Test | `supervibe:test-strategy` | Test plan and coverage strategy |

Total: 51. **Every skill** has `name`, `namespace`, `description`, `allowed-tools`, `phase`, `prerequisites`, `emits-artifact`, `confidence-rubric`, `gate-on-exit`, `version`, `last-verified` in frontmatter.
