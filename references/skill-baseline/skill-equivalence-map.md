# Internal Skill Equivalence Matrix

Refreshed: 2026-05-13

| baselineSkill | localEquivalent | gap | action | owner | verification |
| --- | --- | --- | --- | --- | --- |
| `api-and-interface-design` | error-envelope-design; auth-flow-design | Baseline is general API boundary design; local coverage is split into error envelopes and auth flow contracts. | map | T004 | `npm run validate:skill-content-quality` |
| `browser-testing-with-devtools` | browser-runtime-verification; browser-feedback; preview-server | Local browser skills exist but must retain runtime evidence and DevTools-like diagnostics. | deepen | T006 | `npm run validate:skill-content-quality` |
| `ci-cd-and-automation` | feature-flag-rollout; finishing-a-development-branch; verification | Local release skills cover gates and flags but CI/CD automation needs lifecycle mapping. | map | T011 | `npm run validate:skill-content-quality` |
| `code-review-and-quality` | requesting-code-review; receiving-code-review; code-review; pre-pr-check | Local review flow is split across request/receive/pre-PR and reviewer agents. | map | T012 | `npm run validate:skill-content-quality` |
| `code-simplification` | strengthen; code-review; rule-audit | No exact simplification skill; local behavior is distributed across strengthen, review, and rule audit. | deepen | T012 | `npm run validate:skill-content-quality` |
| `context-engineering` | project-memory; code-search; using-supervibe-skills; mcp-discovery | Local context model is stronger through memory/RAG/CodeGraph but needs concise anatomy docs. | fixed | T021 | `npm run validate:artifact-links` |
| `debugging-and-error-recovery` | systematic-debugging; trigger-diagnostics | Local debugging exists and should keep stop-the-line and recovery evidence explicit. | deepen | T009 | `npm run validate:skill-content-quality` |
| `deprecation-and-migration` | feature-flag-rollout; finishing-a-development-branch | Migration/deprecation is not a first-class skill yet; template coverage planned. | split | T022 | `npm run validate:template-quality` |
| `documentation-and-adrs` | source-driven-development; writing-plans; prd | Docs/ADR behavior exists across planning/source skills, not one canonical skill. | map | T022 | `npm run validate:template-quality` |
| `doubt-driven-development` | doubt-driven-development | Direct local equivalent exists. | fixed | T005 | `npm run validate:skill-content-quality` |
| `frontend-ui-engineering` | interaction-design-patterns; component-library-integration; ui-review-and-polish | Local UI work is split into interaction, component integration, and review polish. | deepen | T004 | `npm run validate:design-skills` |
| `git-workflow-and-versioning` | using-git-worktrees; finishing-a-development-branch | Local git behavior focuses on worktrees and branch finish; versioning language is thinner. | deepen | T011 | `npm run validate:skill-content-quality` |
| `idea-refine` | brainstorming; explore-alternatives | Local ideation is split between divergent brainstorming and alternative exploration. | map | T004 | `npm run validate:skill-content-quality` |
| `incremental-implementation` | new-feature; executing-plans | Local execution covers plan-driven implementation but needs explicit thin-slice anatomy. | deepen | T011 | `npm run validate:skill-content-quality` |
| `performance-optimization` | verification; browser-runtime-verification | Performance is mostly handled by reviewer agents and verification, not a dedicated skill. | support-skill-exception | T022 | `npm run validate:agent-skill-coverage` |
| `planning-and-task-breakdown` | writing-plans; executing-plans | Local planning is canonical through /supervibe-plan and executing-plans. | fixed | T002 | `npm run validate:plan-artifacts` |
| `security-and-hardening` | incident-response; auth-flow-design; rule-audit | Security behavior exists across incident/auth/rule skills and security agents. | deepen | T010 | `npm run validate:agentic-security` |
| `shipping-and-launch` | feature-flag-rollout; finishing-a-development-branch | Local launch flow needs release-readiness template alignment. | deepen | T011 | `npm run validate:skill-content-quality` |
| `source-driven-development` | source-driven-development | Direct local equivalent exists. | fixed | T007 | `npm run validate:skill-content-quality` |
| `spec-driven-development` | requirements-intake; prd | Local spec flow is split into requirements intake and PRD artifacts. | map | T016 | `npm run validate:prd-artifacts` |
| `test-driven-development` | tdd; test-strategy; verification | Direct TDD and test strategy equivalents exist but must preserve red/green/prove-it gates. | fixed | T008 | `npm run validate:skill-content-quality` |
| `using-agent-skills` | using-supervibe-skills | Direct meta-skill equivalent exists; routing map must stay host-neutral. | fixed | T030 | `npm run validate:skill-content-quality` |
