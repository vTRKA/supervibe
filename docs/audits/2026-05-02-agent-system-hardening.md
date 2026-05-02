# Agent System Hardening Audit - 2026-05-02

## Scope

This audit covers the Supervibe agent, skill, rule, host-instruction, Code RAG, Code Graph, trigger routing, and dialogue surfaces requested for the 2.0.30 hardening pass.

Reviewed surfaces:
- `agents/**/*.md`
- `skills/**/SKILL.md`
- `rules/*.md`
- `commands/*.md`
- `templates/agent.md.tpl`
- `scripts/lib/supervibe-dialogue-contract.mjs`
- `scripts/validate-question-discipline.mjs`
- `scripts/validate-artifact-links.mjs`
- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`
- `.supervibe/memory/index.json`
- `.supervibe/memory/code.db` health via `supervibe-status`

## Findings and actions

| Area | Finding | Action |
|------|---------|--------|
| Dialogue UX | Agents had a shared one-question rule, but question anatomy was not enforced and `prototype-builder` kept a one-off approval menu. | Standardized all 82 interactive agent dialogue sections with `Why:`, `Decision unlocked:`, `If skipped:`, localized recommended markers, and domain action labels. Added validator coverage. |
| Post-delivery menus | Shared dialogue contract only had a genesis-specific delivery context. | Added `prototype_delivery` and `requirements_delivery` contexts and updated prototype/requirements agents to use shared contract. |
| Artifact links | Router referenced `supervibe:trigger-diagnostics`, but no skill file existed. | Added `skills/trigger-diagnostics/SKILL.md` and `scripts/validate-artifact-links.mjs` to catch missing skill, rubric, rule, and routed-skill references. |
| Agent maturity | Six agents were below the 250-line quality-bar shape and lacked detailed production scenarios. | Expanded `ai-agent-orchestrator`, `ipc-contract-reviewer`, `llm-evals-engineer`, `llm-rag-architect`, `model-ops-engineer`, and `tauri-rust-engineer` with scenario playbooks, evidence gates, failure modes, self-review, and completion discipline. |
| Skill maturity | Five skills were below the 80-line minimum useful shape. | Expanded `evaluate`, `mcp-discovery`, `rule-audit`, `seo-audit`, and `sync-rules` with decision trees, verification details, output evidence, and safety policies. |
| RAG and Code Graph | Existing implementation was healthy: Code RAG indexed 262/262 source files; Code Graph had 1,958 symbols and 8,725 edges with source-readiness health passing. | Strengthened RAG agent guidance and kept health verification as a release gate. |
| Host linkage | Host docs reference Code RAG, Code Graph, memory, and verification expectations; structured cross-artifact validation was missing. | Added artifact-link validator to `npm run check`; host docs remain source-of-truth for repo-level verification. |
| Internal lifecycle completeness | Agent workflows needed stronger coverage for planning, task graph, checkpoint, review, verification, release, and memory loops. | Strengthened relevant agents and skills around durable state, ready-front execution, confidence gates, completion evidence, and post-task learning without adding external dependency references. |

## Remaining TODO

No blocking TODO remains for this hardening pass. Follow-up opportunities:

- Add a scheduled CI job that runs `npm run supervibe:status -- --index-health --no-gc-hints` alongside `npm run check`.
- Add a future validator for semantic rule contradictions; current `rule-audit` is a guided skill, while artifact-link validation covers structural links.
- Add more retrieval fixtures for project-specific RAG answer quality as real user incidents accumulate.

## Verification plan

Required before release:
- `npm run validate:question-discipline`
- `npm run validate:dialogue-ux`
- `npm run validate:artifact-links`
- `node --test tests/validate-question-discipline.test.mjs tests/dialogue-contract.test.mjs tests/artifact-link-validator.test.mjs tests/supervibe-trigger-diagnostics.test.mjs tests/agent-rag-discipline.test.mjs tests/agent-modern-expert-standard.test.mjs tests/agent-output-contract-validator.test.mjs`
- `node scripts/supervibe-status.mjs --index-health --no-gc-hints`
- `npm run registry:build`
- `npm run check`
