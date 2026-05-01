# Supervibe Plugin Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use supervibe:subagent-driven-development for parallel batches or supervibe:executing-plans for inline execution.

**Goal:** привести Supervibe plugin к предсказуемой, тихой, индексируемой и multi-host архитектуре, чтобы `/supervibe-genesis`, RAG, codegraph, intent routing, агенты, rules, skills и host instruction files работали консистентно на реальных multi-stack проектах.

**Architecture:** план разбивает исправление на связанные слои: process lifecycle, index and graph health, shared dialogue contract, semantic intent routing, host-aware genesis, install hardening, context orchestration, local tool metadata, checkpointed agent state, evals, red-team checks and local diagnostics. Каждый слой получает тесты, диагностические команды и health gates, чтобы система не могла тихо деградировать до частичного индекса, неверного выбора инструмента, потери памяти или разнобоя в командах.

**Tech Stack:** Node.js 22.5 ESM, `node:test`, SQLite code store, Tree-sitter queries, local embeddings, command and skill markdown, Windows process APIs through `child_process`, host adapters for Claude, Codex, Cursor, Gemini and OpenCode style layouts.

**Hard constraints (do not violate):** не переписывать пользовательские `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules` и модельные папки без dry-run diff и явного выбора; не индексировать generated and minified output as source; не показывать новые консольные окна для background-серверов на Windows; не ухудшать текущие Claude-only проекты; не добавлять сетевую зависимость в обычный локальный indexing path; не выполнять destructive DB migration без backup and rebuild path; не индексировать archives, binaries, secrets or local private config; не считать release готовым без install, upgrade, watcher and cross-platform smoke.

## Scope Guard

This plan is outcome-driven, not protocol-driven. Do not add Agent2Agent, AG-UI, new MCP protocol adapters, framework parity matrices, plugin SDK governance, SBOM/provenance, policy-as-code, external telemetry exporters or benchmark certification unless the user explicitly asks for that exact integration and there is a failing local test proving it blocks core plugin value.

A task stays in scope only if it improves at least one direct outcome: stronger RAG, fresher memory, cleaner codegraph, better intent/tool routing, safer local agent behavior, lower token use, faster context assembly or clearer user-visible evidence.

---

## Scope Safety Gate

- **Approved scope baseline:** local plugin reliability, RAG/memory/codegraph quality, intent routing, host-aware install/update, safe local agent behavior, context provenance, diagnostics, and release evidence.
- **Deferred scope:** protocol interoperability, enterprise governance, external telemetry exporters, framework parity, certification, and hosted service integrations remain deferred until a user-visible plugin failure proves they are required.
- **Rejected scope:** adding broad Agent2Agent, AG-UI, plugin SDK governance, policy-as-code, or SBOM/provenance work to this remediation is rejected for now because it increases maintenance, QA, docs, and support cost without improving the reported local workflow.
- **Scope expansion tradeoff:** any new task must name the failing user outcome, evidence, complexity cost, files affected, verification command, rollout, rollback, and which existing work is removed or re-estimated.

---

## Research Basis

- Node.js `child_process`: background processes on Windows need explicit hidden-window and detached lifecycle handling: https://nodejs.org/api/child_process.html
- Claude Code memory: project memory is centered on `CLAUDE.md`, with imports and hierarchy that genesis must preserve: https://docs.claude.com/en/docs/claude-code/memory
- OpenAI Codex project instructions: Codex uses `AGENTS.md` conventions, so genesis cannot assume only `CLAUDE.md`: https://developers.openai.com/codex/guides/agents-md
- OpenAI retrieval guidance: retrieval must combine indexed files, chunk metadata, and ranking rather than silently returning no matches: https://platform.openai.com/docs/guides/retrieval
- OpenAI evals guidance: intent routing, retrieval and agent workflow changes need datasets, regression evaluation and continuous evaluation: https://developers.openai.com/api/docs/guides/evaluation-best-practices
- OpenAI agent workflow evaluation: traces and graders should verify tool choice, handoffs, guardrails and routing changes: https://developers.openai.com/api/docs/guides/agent-evals
- Tree-sitter query documentation: codegraph extraction should use tested captures and language-specific query packs: https://tree-sitter.github.io/tree-sitter/using-parsers/queries/
- Anthropic agent guidance: agentic systems should keep workflows explicit, observable, and evaluated: https://www.anthropic.com/engineering/building-effective-agents
- Aider repository map: coding agents need a concise, ranked whole-repo map with symbols, signatures and token-budgeted context: https://aider.chat/docs/repomap.html
- Sourcegraph Cody context model: code assistants should expose which files they read and allow explicit file, symbol and repository context selection: https://sourcegraph.com/docs/cody/capabilities/chat
- LangGraph persistence and memory: multi-step agents need checkpointed state, resumability and thread-scoped memory instead of only chat transcript recall: https://docs.langchain.com/oss/python/langgraph/persistence and https://docs.langchain.com/oss/python/langchain/short-term-memory
- LlamaIndex evaluation guidance: RAG quality needs independent retrieval and response evaluation, including relevance, faithfulness, precision, recall, hit-rate and MRR: https://developers.llamaindex.ai/python/framework/module_guides/evaluating/
- Semantic Kernel planner migration: new plugin orchestration should prefer tool/function calling and typed tool contracts over deprecated planner abstractions: https://learn.microsoft.com/en-us/semantic-kernel/concepts/planning
- Microsoft GraphRAG and LightRAG: graph-enhanced RAG adds entity and relationship extraction, community summaries, local/global query modes and incremental graph updates beyond plain vector retrieval: https://github.com/microsoft/graphrag and https://github.com/HKUDS/LightRAG
- Mem0 and Zep memory systems: production agent memory needs user/agent/run scoping, temporal facts, invalidation of outdated facts, metadata and structured search/update/delete flows: https://docs.mem0.ai/open-source and https://www.getzep.com/product/agent-memory/
- RAGAS, TruLens and DeepEval: RAG quality should track context precision, context recall, faithfulness/groundedness, answer relevance, tool correctness and separate retrieval-versus-generation failure modes: https://arxiv.org/abs/2309.15217, https://www.trulens.org/getting_started/core_concepts/rag_triad/, https://deepeval.com/docs/introduction

---

## External Gap Analysis

| Source pattern | Current plan coverage | Remaining difference | Remediation |
|----------------|-----------------------|----------------------|-------------|
| Aider repo map ranks whole-repo symbols into a token budget | Codegraph and context orchestrator exist | No deterministic repo-map artifact or context budget contract is required | Add T31 |
| Sourcegraph Cody shows retrieved code files and supports explicit context chips | Evidence citations and context packs exist | User-facing context provenance is not yet measured as a UX outcome | Add T36 |
| LangGraph checkpoints every graph step for resumability | Evidence ledger and command state exist | Agent progress can still be transcript-bound instead of resumable state-bound | Add T32 |
| OpenAI and Anthropic eval practice treats tool choice, handoff and regressions as testable eval targets | Scenario evals and tool-use gates exist | No local regression suite or held-out regression budget is required | Add T33 |
| RAG frameworks evaluate retrieval separately from answer quality | Context quality eval exists | Need staged retrieval, rank metrics, rerank calibration and red-team adversarial context cases tied to release gates | Add T26, T35 and T37 |
| Production agent platforms separate private context, approvals and prompt-injection defense | Privacy policy and approval gates exist | Need adversarial tests for malicious memory, code comments, path traversal and context exfiltration | Add T35 |
| GraphRAG and LightRAG fuse vector retrieval with entity/relation graphs and community summaries | Codegraph and repo-map cover source symbols | Project memory does not yet become a temporal project knowledge graph that links decisions, code symbols, agents and user corrections | Add T43 |
| Mem0 and Zep scope memories by user, agent, run and time | Memory curator and checkpoints exist | No explicit memory namespace, invalidation, supersession and temporal query contract is required | Add T43 |
| DeepEval, TruLens and RAGAS separate retrieval, generation and tool-use metrics | Context eval exists | Metrics are not yet routed clearly to index, retriever, tool or memory fixes | Add T26, T28 and T37 |
| Mature LLM apps track latency, token cost and resource budgets as SLOs | Context budget and user metrics exist | Plan lacks release-blocking p50/p95 latency, token, disk, CPU and embedding refresh budgets | Add T46 |
| Multi-project agent tools isolate tenants and namespaces | Privacy policy exists | Plan lacks hard workspace namespace boundaries, cross-project contamination tests and context provenance partitions | Add T47 |
| Human feedback systems turn user corrections into reviewed datasets and memory candidates | User outcome metrics exist | Plan lacks feedback review queue, triage and correction-to-eval promotion | Add T48 |

---

## Confirmed Symptoms

| Area | Evidence | Impact |
|------|----------|--------|
| Silent mode | `preview-server.mjs` and `supervibe-ui.mjs` run foreground servers, while only auto-update uses `detached`, `stdio: "ignore"` and `windowsHide: true`. | Users see console windows during server actions on Windows. |
| Sanitized desktop RAG coverage | Sanitized fixture reproduces a partial-index state: 16 indexed files and 79 chunks while source inventory expects about 829 eligible source files. | RAG answers are incomplete and misleading. |
| Sanitized desktop codegraph quality | top symbols include minified bundle names such as `Ie`, `Os`, `B`, `at`, `Ye`, `_s` from `dist-check/assets`. | Codegraph represents build output instead of project architecture. |
| Stale index | Existing `code.db` does not force full discovery; mtime scan only touches already-indexed rows. | New source files can remain permanently absent. |
| Retrieval fallback | `CodeStore.search()` returns empty when FTS has zero rows, so semantic-only searches do not recover. | Russian or conceptual searches often return `No matches`. |
| Dialogue consistency | `validate-question-discipline.mjs` scans only `agents/`; command and skill markdown are not held to `/supervibe-design` quality. | Other commands feel raw and inconsistent. |
| Intent routing | `supervibe-semantic-intent-router.mjs` is phrase-list based and lacks golden corpus gates. | Agents and commands can miss user intent or route without evidence. |
| Host assumptions | genesis is Claude-centric and A sanitized desktop project fixture has a custom `CLAUDE.md` but no complete `.claude/agents`, `.claude/skills`, `.claude/rules`. | Plugin cannot safely support Codex, Cursor, Gemini and existing context files. |
| Install and upgrade risk | Current plan must also cover postinstall checks, old plugin layouts, DB schema drift and rollback. | A fixed release can break existing users during update. |
| Watcher lifecycle risk | Status shows watcher not running and current reindex path does not guarantee continuous freshness. | Index health can regress after the first successful repair. |
| Privacy and file-classification risk | The sanitized desktop fixture represents archive-like files and project-specific context files that need different treatment from source code. | RAG can index private or irrelevant files and pollute search quality. |
| Cross-platform risk | Windows is the visible failure, but daemon, locks, path handling and signals can fail differently on macOS and Linux. | Silent mode can pass on one OS and break on another. |
| Memory index drift | `.claude/memory/index.json` reports zero entries while memory files exist under `.claude/memory/decisions` and loop folders. | Agents can believe there is no prior memory and repeat old mistakes. |
| Advisory-only context use | `apply-rag-memory-procedure.mjs` and `audit-evidence-citations.mjs` exist, but usage is patch or advisory oriented rather than a release gate. | Agents can skip memory, code search or graph and still appear successful. |
| Missing context quality metrics | Plan covers coverage and generated leakage but not context recall, context precision, citation quality, contradiction handling or graph impact recall. | RAG can be complete but still low relevance or unsafe for decisions. |
| Missing local tool metadata contract | Current plan does not yet require stable local input shapes, deterministic tool order, context requirements and approval boundaries. | Powerful plugin surfaces can become hard for agents to discover, trust and use correctly. |
| Missing repo-map budget | Codegraph can extract symbols, but there is no deterministic whole-repo map with ranking, signatures and token budgets. | Agents can either miss global architecture or overfill context with noisy chunks. |
| Missing resumable agent checkpoints | Evidence logs exist, but multi-step agent state is not guaranteed to be checkpointed after each tool call or handoff. | Long tasks can lose intent, bypass context gates after resume or duplicate work. |
| Missing local agent regression checks | Scenario evals exist, but the plan does not require repeatable local checks for tool choice, retrieval use and handoff regressions. | Behavior can regress between releases without a visible failing check. |
| Missing adversarial context tests | Privacy policy exists, but malicious code comments, stale memory, prompt injection and context exfiltration are not release-blocking fixtures. | A powerful plugin can become unsafe exactly when it gains broader context access. |
| Missing user-perceived power metrics | Health checks target internals, not whether the user sees cited context, useful repair suggestions and faster project understanding. | The system can be technically stronger while still feeling opaque or ordinary. |
| Missing temporal project knowledge graph | Memory is indexed as entries, and codegraph tracks symbols, but decisions, corrections, incidents, tasks and code symbols are not one temporal graph. | Agents can retrieve facts without knowing what supersedes what or which code surface a decision affects. |
| Missing performance SLOs | Context quality is measured, but latency, token cost, disk growth, CPU and watcher overhead are not release-blocking. | A smarter plugin can feel slow or expensive enough that users stop trusting it. |
| Missing project namespace isolation | Privacy filters block some files, but cross-project memory/RAG/codegraph contamination is not tested as a first-class failure. | A user working across projects can receive context from the wrong project. |
| Missing feedback-to-learning loop | User-visible metrics exist, but user corrections are not promoted through annotation, eval and memory review. | The plugin may improve from code changes but not from real user friction. |

---

## AI/Data Boundary

| Area | Allowed | Redaction | approval gate |
|------|---------|-----------|---------------|
| Local source reads | Allowed for this plugin repo and checked-in sanitized fixtures only. | Do not copy private app content into public docs; use synthetic paths, counts, and anonymized shapes. | Required before reading or writing any external private project. |
| Local writes | Allowed only in this plugin repo unless user explicitly selects a target project. | No secrets, tokens, database contents, or user documents. | Dry-run diff required before host context migration. |
| MCP/browser automation | Allowed only for existing local preview and diagnostics when a server is explicitly started; no new MCP protocol work is part of this plan. | Hide private selectors, screenshots and window contents unless user asks. | approval required for browser screenshots from private projects. |
| Figma/design source | Not required for this remediation plan. | No Figma assets handled. | approval required before any design-source writeback. |
| External network/API | Allowed for official documentation research only. | No codebase upload, no project file upload, no secrets. | approval required before using hosted indexing, hosted evals or hosted embeddings. |
| PII/secrets | References only; no access needed. | Secret-like values are never printed into logs or plan output. | approval required for any credential or account setting change. |

**Blocked without exact approval:** production mutation, destructive migration, credential changes, billing, DNS, access-control changes, Figma writeback, and screenshots containing private data.

---

## File Structure

### Created

```text
docs/plans/2026-05-01-supervibe-plugin-remediation.md
docs/references/indexing-best-practices.md
docs/references/host-adapter-matrix.md
scripts/lib/supervibe-process-manager.mjs
scripts/lib/supervibe-index-policy.mjs
scripts/lib/supervibe-index-health.mjs
scripts/lib/supervibe-dialogue-contract.mjs
scripts/lib/supervibe-host-detector.mjs
scripts/lib/supervibe-host-adapters.mjs
scripts/lib/supervibe-context-migrator.mjs
scripts/lib/supervibe-agent-recommendation.mjs
scripts/lib/supervibe-installer-health.mjs
scripts/lib/supervibe-db-migrations.mjs
scripts/lib/supervibe-index-watcher.mjs
scripts/lib/supervibe-privacy-policy.mjs
scripts/lib/supervibe-command-state.mjs
scripts/lib/supervibe-context-orchestrator.mjs
scripts/lib/supervibe-retrieval-decision-policy.mjs
scripts/lib/supervibe-context-quality-eval.mjs
scripts/lib/supervibe-memory-curator.mjs
scripts/lib/supervibe-evidence-ledger.mjs
scripts/lib/supervibe-tool-metadata-contract.mjs
scripts/lib/supervibe-repo-map.mjs
scripts/lib/supervibe-agent-checkpoints.mjs
scripts/lib/supervibe-agent-regression-checks.mjs
scripts/lib/supervibe-context-threat-model.mjs
scripts/lib/supervibe-user-outcome-metrics.mjs
scripts/lib/supervibe-retrieval-pipeline.mjs
scripts/lib/supervibe-project-knowledge-graph.mjs
scripts/lib/supervibe-performance-slo.mjs
scripts/lib/supervibe-workspace-isolation.mjs
scripts/lib/supervibe-feedback-learning-loop.mjs
tests/index-health.test.mjs
tests/retrieval-semantic-fallback.test.mjs
tests/codegraph-symbol-quality.test.mjs
tests/silent-process-manager.test.mjs
tests/dialogue-contract.test.mjs
tests/host-detector.test.mjs
tests/context-migrator.test.mjs
tests/genesis-desktop-fixture.test.mjs
tests/install-upgrade.test.mjs
tests/code-db-migration.test.mjs
tests/index-watcher-lifecycle.test.mjs
tests/index-privacy-policy.test.mjs
tests/cross-platform-process.test.mjs
tests/scenario-evals.test.mjs
tests/release-candidate-gate.test.mjs
tests/context-orchestrator.test.mjs
tests/retrieval-decision-policy.test.mjs
tests/context-quality-eval.test.mjs
tests/memory-curation.test.mjs
tests/agent-tool-use-gates.test.mjs
tests/local-tool-metadata-contract.test.mjs
tests/repo-map-context-budget.test.mjs
tests/agent-checkpoint-resume.test.mjs
tests/agent-regression-checks.test.mjs
tests/context-threat-model.test.mjs
tests/user-outcome-metrics.test.mjs
tests/retrieval-pipeline-calibration.test.mjs
tests/project-knowledge-graph.test.mjs
tests/performance-slo.test.mjs
tests/workspace-isolation.test.mjs
tests/feedback-learning-loop.test.mjs
tests/fixtures/adversarial-context-prompts.json
tests/fixtures/workspace-isolation/projects.json
stack-packs/tauri-react-rust-postgres/pack.yaml
agents/stacks/tauri/tauri-rust-engineer.md
agents/_ops/ipc-contract-reviewer.md
docs/references/privacy-and-indexing-policy.md
docs/references/upgrade-and-rollback.md
docs/references/context-intelligence-contract.md
docs/references/rag-memory-codegraph-evals.md
docs/references/local-tool-metadata-contract.md
docs/references/repo-map-context-budget.md
docs/references/agent-state-checkpoints.md
docs/references/agent-regression-checks.md
docs/references/context-threat-model.md
docs/references/user-outcome-metrics.md
docs/references/retrieval-pipeline-calibration.md
docs/references/project-knowledge-graph.md
docs/references/performance-slo.md
docs/references/workspace-isolation.md
docs/references/feedback-learning-loop.md
```

### Modified

- `scripts/build-code-index.mjs` - add full discovery, policy loading, prune and health output.
- `scripts/lib/code-store.mjs` - repair stale rows, semantic fallback, source metadata and generated-file filtering.
- `scripts/search-code.mjs` - expose health diagnostics, source coverage and semantic-only recovery.
- `scripts/lib/code-graph.mjs` - improve symbol extraction, generated-file filtering and cross-reference metrics.
- `scripts/lib/code-chunker.mjs` - tag chunk origin, generated status, language and stable symbol ranges.
- `scripts/lib/grammar-loader.mjs` - fail visibly when grammar packs are missing or broken.
- `scripts/supervibe-status.mjs` - report index coverage, generated leakage, stale rows and action recommendations.
- `scripts/session-start-check.mjs` - discover new files even when `code.db` already exists.
- `scripts/preview-server.mjs` - add silent daemon mode and explicit foreground mode.
- `scripts/supervibe-ui.mjs` - route UI server startup through shared silent process manager.
- `scripts/lib/preview-server-manager.mjs` - register PIDs, logs, status and shutdown.
- `scripts/lib/supervibe-semantic-intent-router.mjs` - add embedding-backed routing, confidence and hard negatives.
- `scripts/lib/supervibe-trigger-router.mjs` - consume capability registry and dialogue contract.
- `scripts/validate-question-discipline.mjs` - validate agents, commands and skills against one dialogue contract.
- `commands/supervibe-genesis.md` - replace Claude-only bootstrap with host-aware dry-run flow.
- `commands/supervibe-design.md` - extract reusable dialogue pattern rather than being the only polished command.
- `commands/supervibe-preview.md` - fix stale `--serve` wording and document `--daemon` plus `--foreground`.
- `commands/supervibe-ui.md` - document silent startup and server registry.
- `skills/genesis/SKILL.md` - add host detection, adapter selection, context migration and agent profile selection.
- `skills/adapt/SKILL.md` - update evolution loop for host folders and instruction files.
- `skills/audit/SKILL.md` - audit RAG coverage, codegraph quality and dialogue consistency.
- `skills/strengthen/SKILL.md` - strengthen weak artifacts through registry links among agents, skills and rules.
- `rules/single-question-discipline.md` - promote command and skill coverage, not only agents.
- `scripts/lib/supervibe-auto-update.mjs` - run upgrade checks with backup, schema and rollback diagnostics.
- `scripts/supervibe-auto-update.mjs` - expose dry-run upgrade and repair output.
- `scripts/session-start-check.mjs` - run install health, schema migration and watcher readiness checks.
- `scripts/apply-rag-memory-procedure.mjs` - replace mass-patch behavior with registry-driven context policy application.
- `scripts/audit-evidence-citations.mjs` - upgrade advisory thresholds into strict release gates where task policy requires evidence.
- `scripts/supervibe-context-pack.mjs` - consume context orchestrator and emit scored evidence packs.
- `scripts/supervibe-context-eval.mjs` - evaluate memory recall, RAG precision, graph impact recall and citation quality.
- `scripts/build-memory-index.mjs` - repair markdown and SQLite memory drift with curator checks.
- `scripts/search-memory.mjs` - expose freshness, confidence and contradiction metadata in results.
- `scripts/regression-suite.mjs` - add repeatable local suites for tool choice, context use, handoff and user-outcome regressions.
- `scripts/supervibe-loop.mjs` - checkpoint agent state, resume work safely and surface recovery diagnostics.
- `scripts/lib/agent-invocation-logger.mjs` - link invocations to checkpoints, evidence entries and regression cases.
- `scripts/lib/supervibe-capability-registry.mjs` - expose deterministic tool, resource and prompt metadata for discovery.
- `scripts/lib/supervibe-command-state.mjs` - persist command and agent step state with schema versioning and redaction.
- `scripts/audit-release-security.mjs` - fail release on context exfiltration, prompt injection and unsafe tool-surface regressions.
- `scripts/lib/supervibe-process-manager.mjs` - share process primitives across daemon, watcher and preview server flows.
- `scripts/lib/supervibe-semantic-intent-router.mjs` - attach intent confidence and capability evidence to route decisions.
- `scripts/build-memory-index.mjs` - emit temporal knowledge-graph edges, supersession links and project namespaces.
- `scripts/search-memory.mjs` - support temporal graph queries, current-fact filtering and superseded-fact warnings.
- `confidence-rubrics/agent-delivery.yaml` - include workspace namespace, SLO and user-feedback evidence.
- `README.md` - document the visible user experience for context provenance, repair guidance and confidence badges.
- `CLAUDE.md` - document plugin architecture after implementation is complete.

---

## Critical Path

`T1 -> T3 -> T4 -> T5 -> T6 -> T17 -> T18 -> T19 -> T20 -> T47 -> T24 -> T25 -> T37 -> T31 -> T43 -> T26 -> T27 -> T28 -> T29 -> T46 -> T32 -> T33 -> T35 -> T36 -> T48 -> T11 -> T12 -> T13 -> T15 -> T21 -> T22 -> T23`

Parallel and off-path work: `T2` can run after `T1`; `T7 -> T8` can run in parallel with indexing work; `T9 -> T10` can run after `T1`; `T14` can run after `T6` while host-aware genesis is being built; `T21` can run after `T2` and before final release smoke. Phase I tasks share context-intelligence files, so run them in parallel only with clear file ownership and one integration owner for `scripts/supervibe-status.mjs`, `scripts/regression-suite.mjs` and `package.json`.

## Delivery Strategy

- **SDLC flow:** discovery -> evidence harness -> repair implementation -> review gates -> release verification -> post-release memory.
- **MVP path:** first make sanitized fixture failures reproducible, then ship local-only RAG/codegraph/host repairs, then harden release gates.
- **Phase model:** Phase A proves symptoms, B fixes indexing and retrieval, C/D standardize dialogue and routing, E/F harden host genesis, H handles install/runtime safety, I adds context intelligence, J verifies release.
- **Production target:** plugin release must be supportable with deterministic tests, local diagnostics, rollback docs, and no dependency on any private project path.

## Production Readiness

- **Test:** every task introduces or updates `node:test`, validator, smoke, or scenario-eval coverage.
- **Security/privacy:** privacy policy, context threat model, workspace isolation, and release security audit block unsafe context usage.
- **Performance:** performance SLOs gate context latency, token budget, DB size, and watcher overhead.
- **Observability:** status, evidence ledger, checkpoints, context packs, and release reports expose provenance and repair actions.
- **Rollback:** upgrade/rollback docs, DB backup paths, daemon stop commands, and no-commit execution keep recovery explicit.
- **Release:** final T23 repeats plan validation, full check, context eval, evidence audit, regression suite, security audit, and workspace/performance status.

## Final 10/10 Acceptance Gate

- [ ] 10/10 acceptance: every plan task maps to code, tests, docs, diagnostics, or an explicit out-of-scope rationale.
- [ ] Verification: `npm run check` and every T23 command pass after the final plan reread.
- [ ] No open blockers: private-project references are absent, release docs are complete, and optional smoke uses only sanitized fixtures unless the user explicitly supplies a path for that run.
- [ ] Production readiness: security, privacy, performance, observability, rollback, install, upgrade, watcher, and cross-platform gates all pass.
- [ ] Plan reread: after implementation, compare this plan line-by-line against delivered files and fix deviations before final handoff.


---

## Phase A: Evidence And Harness

Purpose: freeze the observed failures before changing implementation, so every later task has regression evidence.

Exit gate:
- Checked-in sanitized fixture proves 16 indexed files versus expected source inventory.
- Generated `dist-check` leakage is reproduced by a failing test.
- Current dialogue validator gap is reproduced by a failing test over `commands/` and `skills/`.

---

## Task T1: Evidence Harness For Sanitized Fixture And Plugin Health

**Files:**
- Create: `tests/index-health.test.mjs`
- Create: `tests/fixtures/sanitized-index-health/manifest.json`
- Modify: `scripts/supervibe-status.mjs`
- Test: `tests/index-health.test.mjs`

**Estimated time:** 3h (confidence: high)  
**Rollback:** remove the new fixture and revert `scripts/supervibe-status.mjs`.  
**Risks:** R1: fixture accidentally encodes private project content; mitigation: store only counts, extensions, root names and synthetic filenames. R2: Windows paths fail on other platforms; mitigation: normalize paths with `path.win32` fixtures and POSIX assertions.

- [ ] **Step 1: Write failing test for source coverage**

```bash
node --test tests/index-health.test.mjs
```

- [ ] **Step 2: Verify fail against current behavior**

Expected fail message: `indexed source coverage below threshold` and `generated output indexed as source`.

- [ ] **Step 3: Add health data model**

Record `eligibleSourceFiles`, `indexedSourceFiles`, `generatedIndexedFiles`, `staleRows`, `languageCoverage`, `symbolQuality` and `crossResolvedEdges`.

- [ ] **Step 4: Run test and verify pass**

```bash
node --test tests/index-health.test.mjs
```

- [ ] **Step 5: Commit**

Commit with message `test: capture supervibe index health regressions`.

---

## Task T2: Silent Windows Server Lifecycle

**Files:**
- Create: `scripts/lib/supervibe-process-manager.mjs`
- Modify: `scripts/preview-server.mjs`
- Modify: `scripts/supervibe-ui.mjs`
- Modify: `scripts/lib/preview-server-manager.mjs`
- Modify: `commands/supervibe-preview.md`
- Modify: `commands/supervibe-ui.md`
- Test: `tests/silent-process-manager.test.mjs`

**Estimated time:** 5h (confidence: medium)  
**Rollback:** revert process manager integration and keep existing foreground server commands.  
**Risks:** R1: daemon processes can outlive stale ports; mitigation: PID registry, heartbeat file and explicit stop command. R2: hidden process failures become invisible; mitigation: write stdout and stderr logs under `.supervibe/servers/`.

- [ ] **Step 1: Write failing test for hidden spawn options**

```bash
node --test tests/silent-process-manager.test.mjs
```

- [ ] **Step 2: Verify fail on current UI and preview startup**

Expected fail message: `background server did not request windowsHide` or `stdio is not ignored`.

- [ ] **Step 3: Implement shared process manager**

Use `detached`, `stdio: "ignore"`, `windowsHide: true`, log files, PID registry, `unref()` and status checks.

- [ ] **Step 4: Add explicit modes**

`--daemon` starts silently and returns URL; `--foreground` keeps current debug behavior; command docs must name both.

- [ ] **Step 5: Run verification**

```bash
node --test tests/silent-process-manager.test.mjs
node scripts/preview-server.mjs --root . --daemon
node scripts/supervibe-ui.mjs --daemon
```

- [ ] **Step 6: Commit**

Commit with message `fix: run supervibe servers silently on windows`.

---

## Phase B: RAG And Codegraph Repair

Purpose: make index state trustworthy, complete, recoverable and visible.

Exit gate:
- Sanitized desktop fixture indexes at least 90 percent of eligible source files.
- Generated leakage is zero for configured generated directories.
- Deleted files are pruned from `code.db`.
- Semantic-only query returns results when FTS has no lexical candidate.
- Top symbol list does not include minified bundle identifiers from generated output.

---

## Task T3: Source Index Policy And Full Discovery

**Files:**
- Create: `scripts/lib/supervibe-index-policy.mjs`
- Create: `docs/references/indexing-best-practices.md`
- Modify: `scripts/build-code-index.mjs`
- Modify: `scripts/lib/code-store.mjs`
- Modify: `scripts/session-start-check.mjs`
- Test: `tests/index-health.test.mjs`

**Estimated time:** 8h (confidence: medium)  
**Rollback:** revert policy module and restore previous `indexAll()` path selection.  
**Risks:** R1: too aggressive excludes can miss real source; mitigation: expose `--explain-policy` with include and exclude reasons. R2: full discovery can be slow in large repos; mitigation: bounded walking, git-aware source inventory and mtime short-circuiting.

- [ ] **Step 1: Write failing test for discovery after existing database**

```bash
node --test tests/index-health.test.mjs
```

- [ ] **Step 2: Verify fail with a preexisting partial `code.db`**

Expected fail message: `new source file was not discovered when database already existed`.

- [ ] **Step 3: Implement index policy**

Add default source roots, generated directory excludes, minified asset detection, git-aware file inventory and per-file reason logging.

- [ ] **Step 4: Add prune and repair**

Remove rows for deleted files, generated files that became excluded and stale paths no longer present in source inventory.

- [ ] **Step 5: Run verification**

```bash
node --test tests/index-health.test.mjs
node scripts/build-code-index.mjs --root . --force --health
```

- [ ] **Step 6: Commit**

Commit with message `fix: make code index discovery complete and policy driven`.

---

## Task T4: Hybrid Retrieval And Semantic Fallback

**Files:**
- Create: `tests/retrieval-semantic-fallback.test.mjs`
- Modify: `scripts/lib/code-store.mjs`
- Modify: `scripts/search-code.mjs`
- Modify: `.claude/docs/code-search.md`
- Test: `tests/retrieval-semantic-fallback.test.mjs`

**Estimated time:** 6h (confidence: medium)  
**Rollback:** revert ranking changes while keeping index policy from `T3`.  
**Risks:** R1: semantic fallback can be slow without candidate pruning; mitigation: cap candidate rows and rank by language, path and recency metadata. R2: noisy embeddings can outrank exact hits; mitigation: reciprocal rank fusion and exact-match boost.

- [ ] **Step 1: Write failing test for concept search with no FTS hits**

```bash
node --test tests/retrieval-semantic-fallback.test.mjs
```

- [ ] **Step 2: Verify fail on current empty FTS branch**

Expected fail message: `semantic fallback returned zero results`.

- [ ] **Step 3: Implement hybrid retrieval**

Run FTS and semantic ranking as separate retrievers, merge with reciprocal rank fusion, and return semantic-only results when FTS has no candidates.

- [ ] **Step 4: Add result diagnostics**

Every search result reports retrieval mode, score components, chunk language, path and generated-source status.

- [ ] **Step 5: Run verification**

```bash
node --test tests/retrieval-semantic-fallback.test.mjs
node scripts/search-code.mjs "genesis host adapter codex claude" --limit 5 --debug-ranking
```

- [ ] **Step 6: Commit**

Commit with message `fix: restore semantic fallback for code search`.

---

## Task T5: Codegraph Symbol Quality And Cross-Language Extraction

**Files:**
- Create: `tests/codegraph-symbol-quality.test.mjs`
- Modify: `scripts/lib/code-graph.mjs`
- Modify: `scripts/lib/code-chunker.mjs`
- Modify: `scripts/lib/grammar-loader.mjs`
- Modify: `grammars/queries/javascript.scm`
- Modify: `grammars/queries/typescript.scm`
- Test: `tests/codegraph-symbol-quality.test.mjs`

**Estimated time:** 10h (confidence: medium)  
**Rollback:** restore prior query packs and graph builder while keeping generated-file excludes from `T3`.  
**Risks:** R1: query changes can drop legitimate short symbols such as loop variables; mitigation: short local variables are allowed inside function bodies but not promoted to top-level graph symbols. R2: Rust and Python coverage needs grammar availability; mitigation: status marks missing grammar as degraded instead of ready.

- [ ] **Step 1: Write failing test for minified two-character top symbols**

```bash
node --test tests/codegraph-symbol-quality.test.mjs
```

- [ ] **Step 2: Verify fail on generated bundle fixture**

Expected fail message: `top symbols contain generated minified names`.

- [ ] **Step 3: Improve extraction**

Promote named functions, classes, methods, exported const functions, React components, Tauri commands and Rust modules; suppress generated bundle captures.

- [ ] **Step 4: Add graph health metrics**

Compute symbol name quality, source-file symbol coverage, unresolved import rate and cross-resolved edge rate.

- [ ] **Step 5: Run verification**

```bash
node --test tests/codegraph-symbol-quality.test.mjs
node scripts/search-code.mjs --top-symbols 30
```

- [ ] **Step 6: Commit**

Commit with message `fix: improve codegraph symbol quality`.

---

## Task T6: Index Health Gates In Status And Audit

**Files:**
- Create: `scripts/lib/supervibe-index-health.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `skills/audit/SKILL.md`
- Modify: `skills/strengthen/SKILL.md`
- Modify: `.claude/docs/code-graph.md`
- Modify: `.claude/docs/code-search.md`
- Test: `tests/index-health.test.mjs`

**Estimated time:** 5h (confidence: high)  
**Rollback:** keep indexing fixes but revert status gate presentation.  
**Risks:** R1: strict gates can block small projects; mitigation: thresholds scale by project size and language count. R2: users may see warnings without fix instructions; mitigation: every failed gate includes command and reason.

- [ ] **Step 1: Write failing test for misleading ready status**

```bash
node --test tests/index-health.test.mjs
```

- [ ] **Step 2: Verify fail with 16 indexed files and 829 eligible files**

Expected fail message: `status marked unhealthy index as ready`.

- [ ] **Step 3: Add health gates**

Gates cover source coverage, generated leakage, stale rows, language grammar coverage, symbol coverage and cross-resolution.

- [ ] **Step 4: Update audit and strengthen skills**

Audit must detect stale index state; strengthen must know how to trigger repair and reindex.

- [ ] **Step 5: Run verification**

```bash
node --test tests/index-health.test.mjs
node scripts/supervibe-status.mjs --no-gc-hints
```

- [ ] **Step 6: Commit**

Commit with message `feat: surface code index health gates`.

---

## Phase C: Unified User Dialogue

Purpose: make every command and skill use one clear interaction style instead of only `/supervibe-design`.

Exit gate:
- Dialogue validator covers `agents/`, `commands/`, `skills/` and relevant rules.
- Each interactive command asks one question at a time, shows progress, provides choices, explains the recommended default and persists state.
- Each delivery-style flow has lifecycle states, explicit approval/refine/alternative/stop choices, a persisted state artifact, a mandatory post-delivery prompt and no silent done state.
- Non-interactive commands expose `--yes`, `--dry-run` or a documented no-prompt path.

---

## Task T7: Shared Dialogue Contract

**Files:**
- Create: `scripts/lib/supervibe-dialogue-contract.mjs`
- Modify: `rules/single-question-discipline.md`
- Modify: `commands/supervibe-genesis.md`
- Modify: `commands/supervibe-design.md`
- Modify: `skills/genesis/SKILL.md`
- Test: `tests/dialogue-contract.test.mjs`

**Estimated time:** 7h (confidence: medium)  
**Rollback:** revert command and skill prompt changes while keeping validator test coverage disabled by config.  
**Risks:** R1: over-standardization can make specialized workflows worse; mitigation: contract defines required fields, while command-specific wording stays local. R2: command docs can become verbose; mitigation: move repeated wording into shared reference and keep command files concise.

- [ ] **Step 1: Write failing test for command dialogue shape**

```bash
node --test tests/dialogue-contract.test.mjs
```

- [ ] **Step 2: Verify fail on current non-design commands**

Expected fail message: `interactive command missing single-question contract`.

- [ ] **Step 3: Implement contract model**

Required fields: step label, single question, recommended option, tradeoff summary, default behavior, free-form path, stop condition, lifecycle state, persisted state artifact path and post-delivery action menu.

Delivery-style flows must support the `/supervibe-design` interaction pattern: `draft -> review -> approved -> handoff` when applicable, or an equivalent command-specific lifecycle. After every material delivery, the command must ask one explicit next-step question with choices for approve, refine, alternative, deeper review when relevant and stop. The command must not mark work complete silently.

- [ ] **Step 4: Refactor genesis and design**

Extract `/supervibe-design` interaction discipline into shared contract and apply it to `/supervibe-genesis`: lifecycle state, approval/refine/alternative/stop menu, state artifact, mandatory post-delivery prompt and no silent done.

- [ ] **Step 5: Run verification**

```bash
node --test tests/dialogue-contract.test.mjs
node scripts/validate-question-discipline.mjs
```

- [ ] **Step 6: Commit**

Commit with message `feat: standardize supervibe command dialogue`.

---

## Task T8: Command And Skill Dialogue Validator

**Files:**
- Modify: `scripts/validate-question-discipline.mjs`
- Modify: `package.json`
- Modify: `commands/supervibe-preview.md`
- Modify: `commands/supervibe-ui.md`
- Modify: `commands/supervibe-status.md`
- Modify: `skills/audit/SKILL.md`
- Modify: `skills/adapt/SKILL.md`
- Modify: `skills/strengthen/SKILL.md`
- Test: `tests/dialogue-contract.test.mjs`

**Estimated time:** 6h (confidence: high)  
**Rollback:** remove validator expansion and keep agent-only validation.  
**Risks:** R1: existing command docs fail all at once; mitigation: allow a staged allowlist that shrinks each commit. R2: non-interactive docs are incorrectly flagged; mitigation: detect explicit non-interactive mode.

- [ ] **Step 1: Write failing test for validator scope**

```bash
node --test tests/dialogue-contract.test.mjs
```

- [ ] **Step 2: Verify fail because commands and skills are skipped**

Expected fail message: `validator did not inspect commands directory`.

- [ ] **Step 3: Expand scanner**

Scan `agents/`, `commands/`, `skills/` and dialogue rules; classify interactive, delivery-style and non-interactive artifacts.

For delivery-style artifacts, fail validation unless the artifact declares lifecycle states, persisted state artifact, explicit approval/refine/alternative/stop menu, mandatory post-delivery prompt and no silent done behavior.

- [ ] **Step 4: Wire into checks**

Add the expanded validator to `npm run check` or an existing validation script group.

- [ ] **Step 5: Run verification**

```bash
node scripts/validate-question-discipline.mjs
npm run check
```

- [ ] **Step 6: Commit**

Commit with message `test: validate dialogue across commands and skills`.

---

## Phase D: Intent Intelligence And Agent Evolution

Purpose: route user intent with evidence, measure misses and keep agents, commands, rules and skills linked as the plugin evolves.

Exit gate:
- Golden corpus covers Russian and English requests, hard negatives, ambiguous requests and command aliases.
- Router returns a route, confidence, evidence and one clarifying question when confidence is low.
- Agent registry maps capabilities to commands, skills, rules, stack packs and verification hooks.

---

## Task T9: Evaluation-Backed Intent Router

**Files:**
- Create: `tests/intent-router-golden.test.mjs`
- Create: `tests/fixtures/intent-router/golden-corpus.json`
- Modify: `scripts/lib/supervibe-semantic-intent-router.mjs`
- Modify: `scripts/lib/supervibe-trigger-router.mjs`
- Test: `tests/intent-router-golden.test.mjs`

**Estimated time:** 10h (confidence: medium)  
**Rollback:** keep existing rule router and disable semantic routing behind a feature flag.  
**Risks:** R1: embeddings can make routes less deterministic; mitigation: exact slash commands and hard safety blockers always win. R2: corpus can overfit current wording; mitigation: include paraphrases, Russian forms, misspellings and hard negatives.

- [ ] **Step 1: Write failing golden-corpus test**

```bash
node --test tests/intent-router-golden.test.mjs
```

- [ ] **Step 2: Verify fail on ambiguous and Russian feedback requests**

Expected fail message: `expected supervibe-genesis but routed to generic planning`.

- [ ] **Step 3: Add layered routing**

Order: exact command, active workflow state, safety blockers, capability registry retrieval, semantic profile ranking, clarification question.

- [ ] **Step 4: Add explanation output**

Expose `/supervibe --why-trigger` data: matched evidence, rejected alternatives, confidence and next question.

- [ ] **Step 5: Run verification**

```bash
node --test tests/intent-router-golden.test.mjs
node scripts/supervibe-status.mjs --intent-diagnostics
```

- [ ] **Step 6: Commit**

Commit with message `feat: add evaluated intent routing`.

---

## Task T10: Capability Registry Linking Agents, Rules And Skills

**Files:**
- Create: `scripts/lib/supervibe-capability-registry.mjs`
- Create: `tests/capability-registry.test.mjs`
- Modify: `skills/adapt/SKILL.md`
- Modify: `skills/strengthen/SKILL.md`
- Modify: `.claude/docs/agent-evolution-loop.md`
- Modify: `scripts/lib/supervibe-trigger-router.mjs`
- Test: `tests/capability-registry.test.mjs`

**Estimated time:** 8h (confidence: medium)  
**Rollback:** disable registry consumption and route through current static maps.  
**Risks:** R1: registry drift creates false confidence; mitigation: validator checks that referenced agent, skill, rule and command files exist. R2: capability tags become too broad; mitigation: golden corpus asserts intended routing and rejection cases.

- [ ] **Step 1: Write failing test for missing links**

```bash
node --test tests/capability-registry.test.mjs
```

- [ ] **Step 2: Verify fail on orphaned skills and commands**

Expected fail message: `capability references no verification hook` or `agent references missing skill`.

- [ ] **Step 3: Implement registry loader**

Read command, agent, skill and rule metadata; build bidirectional links; expose capabilities to router, genesis and audit.

- [ ] **Step 4: Add evolution loop**

When a stack changes, `adapt` can propose agents, rules and skills together, with evidence and confidence.

- [ ] **Step 5: Run verification**

```bash
node --test tests/capability-registry.test.mjs
node scripts/supervibe-status.mjs --capabilities
```

- [ ] **Step 6: Commit**

Commit with message `feat: link supervibe capabilities across artifacts`.

---

## Phase E: Multi-Host Genesis And Context Migration

Purpose: stop assuming `.claude` and make genesis choose, explain and evolve the correct host-specific instruction layout.

Exit gate:
- Genesis detects host candidates and asks for one selection when confidence is not high.
- Existing context files are parsed, preserved and rebuilt under plugin-managed sections.
- Dry-run shows exact file plan before writes.
- Agent selection is flexible and stack-aware.

---

## Task T11: Host Detector And Adapter Matrix

**Files:**
- Create: `scripts/lib/supervibe-host-detector.mjs`
- Create: `scripts/lib/supervibe-host-adapters.mjs`
- Create: `docs/references/host-adapter-matrix.md`
- Modify: `commands/supervibe-genesis.md`
- Modify: `skills/genesis/SKILL.md`
- Test: `tests/host-detector.test.mjs`

**Estimated time:** 8h (confidence: medium)  
**Rollback:** keep Claude adapter as default and hide other adapters behind a dry-run flag.  
**Risks:** R1: host detection can choose wrong tool when multiple files exist; mitigation: confidence scoring plus one user question. R2: new hosts change conventions; mitigation: adapter matrix is data-driven and versioned.

- [ ] **Step 1: Write failing test for non-Claude target**

```bash
node --test tests/host-detector.test.mjs
```

- [ ] **Step 2: Verify fail because genesis assumes `.claude`**

Expected fail message: `expected Codex adapter but selected Claude adapter`.

- [ ] **Step 3: Implement host detector**

Detect `CLAUDE.md`, `.claude`, `AGENTS.md`, `.codex`, `.cursor`, `.cursor/rules`, `GEMINI.md`, `.gemini`, `opencode.json` and active CLI hints.

- [ ] **Step 4: Implement adapters**

Each adapter declares instruction files, model folder, rules folder, skill folder, import strategy, managed block marker and unsupported features.

- [ ] **Step 5: Run verification**

```bash
node --test tests/host-detector.test.mjs
node scripts/supervibe-status.mjs --host-diagnostics
```

- [ ] **Step 6: Commit**

Commit with message `feat: detect model host for genesis`.

---

## Task T12: Context File Migrator

**Files:**
- Create: `scripts/lib/supervibe-context-migrator.mjs`
- Create: `tests/context-migrator.test.mjs`
- Modify: `skills/genesis/SKILL.md`
- Modify: `skills/adapt/SKILL.md`
- Modify: `CLAUDE.md`
- Test: `tests/context-migrator.test.mjs`

**Estimated time:** 10h (confidence: medium)  
**Rollback:** disable write mode and keep migrator as dry-run diff generator.  
**Risks:** R1: user rules can be overwritten; mitigation: managed blocks only, preserved user sections and backup file before write. R2: markdown parsing can move headings unexpectedly; mitigation: fixture tests for existing project-instruction structure and generated instruction files.

- [ ] **Step 1: Write failing test for preserving custom CLAUDE sections**

```bash
node --test tests/context-migrator.test.mjs
```

- [ ] **Step 2: Verify fail on current genesis behavior**

Expected fail message: `custom project instruction section was not preserved`.

- [ ] **Step 3: Implement parser and planner**

Parse headings, managed markers, imports and known instruction blocks; produce dry-run operations with before and after diff.

- [ ] **Step 4: Implement safe writer**

Write only after user selection, create backup, preserve user-owned sections and add plugin-managed blocks with stable markers.

- [ ] **Step 5: Run verification**

```bash
node --test tests/context-migrator.test.mjs
```

- [ ] **Step 6: Commit**

Commit with message `feat: migrate host instruction files safely`.

---

## Task T13: Flexible Genesis Profile And Agent Selection

**Files:**
- Create: `scripts/lib/supervibe-agent-recommendation.mjs`
- Modify: `commands/supervibe-genesis.md`
- Modify: `skills/genesis/SKILL.md`
- Modify: `rules/single-question-discipline.md`
- Test: `tests/genesis-desktop-fixture.test.mjs`

**Estimated time:** 9h (confidence: medium)  
**Rollback:** keep current fixed genesis set and expose recommender only in dry-run diagnostics.  
**Risks:** R1: too many choices overwhelm users; mitigation: presets first, advanced customization second. R2: recommendations miss project-specific specialists; mitigation: use stack discovery, codegraph inventory and existing instruction files together.

- [ ] **Step 1: Write failing test for custom agent choice**

```bash
node --test tests/genesis-desktop-fixture.test.mjs
```

- [ ] **Step 2: Verify fail because genesis has no flexible selection**

Expected fail message: `expected selectable Tauri and Rust specialists`.

- [ ] **Step 3: Add profile presets**

Profiles: minimal, product-design, full-stack, research-heavy, custom. Each profile shows agent groups and why they are recommended.

- [ ] **Step 4: Add customization flow**

Use one-question contract to add, remove or defer agent groups, rules and skills before writing files.

- [ ] **Step 5: Run verification**

```bash
node --test tests/genesis-desktop-fixture.test.mjs
node scripts/supervibe-status.mjs --genesis-dry-run tests/fixtures/sanitized-project
```

- [ ] **Step 6: Commit**

Commit with message `feat: make genesis agent selection flexible`.

---

## Phase F: Sanitized Desktop Stack Pack And Agent Coverage

Purpose: use a checked-in sanitized desktop fixture as a concrete proof that stack-specific agents are not missed.

Exit gate:
- Stack discovery detects Tauri 2, Rust, React 19, Vite, Tailwind 4, TanStack Router, Playwright and desktop IPC.
- Genesis recommends a stack pack and explains each agent.
- Missing specialist agents are created or mapped to existing ones.

---

## Task T14: Tauri React Rust Postgres Stack Pack

**Files:**
- Create: `stack-packs/tauri-react-rust-postgres/pack.yaml`
- Create: `agents/stacks/tauri/tauri-rust-engineer.md`
- Create: `agents/_ops/ipc-contract-reviewer.md`
- Modify: `scripts/lib/supervibe-agent-recommendation.mjs`
- Modify: `skills/stack-discovery/SKILL.md`
- Modify: `skills/genesis/SKILL.md`
- Test: `tests/genesis-desktop-fixture.test.mjs`

**Estimated time:** 8h (confidence: high)  
**Rollback:** remove new stack pack and agent metadata; recommender falls back to generic agents.  
**Risks:** R1: specialist overlap creates duplicate agent work; mitigation: pack maps primary ownership and secondary collaboration. R2: Postgres may be present by architecture docs but not runtime config; mitigation: mark database specialist as conditional with evidence.

- [ ] **Step 1: Write failing test for sanitized desktop fixture agent gaps**

```bash
node --test tests/genesis-desktop-fixture.test.mjs
```

- [ ] **Step 2: Verify fail against current generic recommendations**

Expected fail message: `missing tauri-rust-engineer` or `missing ipc-contract-reviewer`.

- [ ] **Step 3: Define stack pack**

Recommended core: Tauri Rust engineer, React desktop implementer, IPC contract reviewer, database schema specialist, Playwright desktop QA, security auditor, performance and observability reviewer, prompt and agent-systems engineer.

- [ ] **Step 4: Link pack to capabilities**

Each agent links to owned directories, commands, skills, rules and verification commands.

- [ ] **Step 5: Run verification**

```bash
node --test tests/genesis-desktop-fixture.test.mjs
node scripts/supervibe-status.mjs --stack-pack-diagnostics
```

- [ ] **Step 6: Commit**

Commit with message `feat: add tauri react rust stack pack`.

---

## Task T15: End-To-End Genesis Dry Run On Sanitized Desktop Fixture

**Files:**
- Create: `tests/genesis-desktop-fixture.test.mjs`
- Modify: `scripts/lib/supervibe-host-detector.mjs`
- Modify: `scripts/lib/supervibe-context-migrator.mjs`
- Modify: `scripts/lib/supervibe-agent-recommendation.mjs`
- Modify: `commands/supervibe-genesis.md`
- Test: `tests/genesis-desktop-fixture.test.mjs`

**Estimated time:** 7h (confidence: medium)  
**Rollback:** disable real-project dry run and keep only synthetic fixture coverage.  
**Risks:** R1: direct private-project dependency breaks CI; mitigation: store a sanitized fixture and avoid hardcoded local paths. R2: dry-run output can be too long; mitigation: summarize first, then provide detailed diff sections.

- [ ] **Step 1: Write failing test for full genesis plan**

```bash
node --test tests/genesis-desktop-fixture.test.mjs
```

- [ ] **Step 2: Verify fail on current genesis**

Expected fail message: `dry run did not include host adapter, context migration and agent profile`.

- [ ] **Step 3: Implement dry-run report**

Report target host, folders, instruction files, files to create, files to modify, preserved sections, recommended agents, optional agents and skipped generated folders.

- [ ] **Step 4: Add optional real-project smoke**

Read only checked-in sanitized fixtures by default; external private projects require explicit user-provided path approval for that run and are never written during smoke.

- [ ] **Step 5: Run verification**

```bash
node --test tests/genesis-desktop-fixture.test.mjs
node scripts/supervibe-status.mjs --genesis-dry-run tests/fixtures/sanitized-project
```

- [ ] **Step 6: Commit**

Commit with message `test: verify genesis dry run for desktop fixture shape`.

## Phase H: Anti-Recurrence Hardening

Purpose: close the causes that let the current failures appear again after a good release: partial install, unsafe upgrade, dead watcher, DB drift, privacy leakage, OS-specific daemon behavior and untested end-to-end user scenarios.

Exit gate:
- Install and upgrade dry-run detects broken plugin state before command execution.
- Watcher keeps the index fresh after file creation, deletion and generated-output changes.
- `code.db` schema migrations are reversible through backup or full rebuild.
- Archives, binaries, secrets, local config and generated files are excluded by policy.
- Daemon and lock behavior is tested on Windows, macOS and Linux abstractions.
- Scenario evals prove user request to command and agent behavior, not only router classification.

---

## Task T17: Install And Upgrade Health Gate

**Files:**
- Create: `scripts/lib/supervibe-installer-health.mjs`
- Create: `tests/install-upgrade.test.mjs`
- Create: `docs/references/upgrade-and-rollback.md`
- Modify: `scripts/lib/supervibe-auto-update.mjs`
- Modify: `scripts/supervibe-auto-update.mjs`
- Modify: `scripts/session-start-check.mjs`
- Modify: `package.json`
- Test: `tests/install-upgrade.test.mjs`

**Estimated time:** 7h (confidence: medium)  
**Rollback:** disable installer health gate and keep upgrade checks as warning-only diagnostics.  
**Risks:** R1: strict health gate can block legitimate local development; mitigation: expose `--repair`, `--dry-run` and documented override with audit log. R2: auto-update can modify state before checks finish; mitigation: run preflight before write operations and create rollback manifest.

- [ ] **Step 1: Write failing test for broken install detection**

```bash
node --test tests/install-upgrade.test.mjs
```

- [ ] **Step 2: Verify fail with missing command, skill and schema metadata**

Expected fail message: `install health did not block inconsistent plugin layout`.

- [ ] **Step 3: Implement install health**

Check command files, skills, rules, package scripts, code index schema version, host adapters, executable scripts and required docs.

- [ ] **Step 4: Implement upgrade dry-run**

Report planned file changes, schema migrations, backup path, rollback command and user-facing risks before applying updates.

- [ ] **Step 5: Run verification**

```bash
node --test tests/install-upgrade.test.mjs
node scripts/supervibe-auto-update.mjs --dry-run --health
```

- [ ] **Step 6: Commit**

Commit with message `feat: add install and upgrade health gates`.

---

## Task T18: Index Watcher Lifecycle And Locks

**Files:**
- Create: `scripts/lib/supervibe-index-watcher.mjs`
- Create: `tests/index-watcher-lifecycle.test.mjs`
- Modify: `scripts/session-start-check.mjs`
- Modify: `scripts/build-code-index.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `scripts/lib/supervibe-process-manager.mjs`
- Test: `tests/index-watcher-lifecycle.test.mjs`

**Estimated time:** 9h (confidence: medium)  
**Rollback:** turn watcher off by default and keep manual reindex commands.  
**Risks:** R1: watcher can create CPU churn on large repos; mitigation: debounce, max queue size, backoff and source policy filtering before work. R2: concurrent reindex can corrupt DB state; mitigation: lock files, single writer and retry with status message.

- [ ] **Step 1: Write failing test for file creation and deletion**

```bash
node --test tests/index-watcher-lifecycle.test.mjs
```

- [ ] **Step 2: Verify fail because watcher is absent or inactive**

Expected fail message: `created source file did not reach code index`.

- [ ] **Step 3: Implement watcher**

Track create, modify, delete and rename events; debounce changes; route through index policy before DB mutation.

- [ ] **Step 4: Implement locking**

Use per-project lock file with owner PID, operation name, heartbeat and stale lock recovery.

- [ ] **Step 5: Run verification**

```bash
node --test tests/index-watcher-lifecycle.test.mjs
node scripts/supervibe-status.mjs --watcher-diagnostics
```

- [ ] **Step 6: Commit**

Commit with message `feat: keep code index fresh with watcher lifecycle`.

---

## Task T19: Code Database Migration And Corruption Recovery

**Files:**
- Create: `scripts/lib/supervibe-db-migrations.mjs`
- Create: `tests/code-db-migration.test.mjs`
- Modify: `scripts/lib/code-store.mjs`
- Modify: `scripts/build-code-index.mjs`
- Modify: `scripts/session-start-check.mjs`
- Modify: `.claude/docs/code-search.md`
- Test: `tests/code-db-migration.test.mjs`

**Estimated time:** 8h (confidence: medium)  
**Rollback:** bypass migration and force full rebuild from backed-up database.  
**Risks:** R1: schema migration can lose embeddings or graph rows; mitigation: backup first and verify row counts after migration. R2: corrupt DB can crash session startup; mitigation: detect open failure and offer rebuild path with preserved backup.

- [ ] **Step 1: Write failing test for old schema upgrade**

```bash
node --test tests/code-db-migration.test.mjs
```

- [ ] **Step 2: Verify fail on old schema fixture**

Expected fail message: `schema version missing migration path`.

- [ ] **Step 3: Implement migration registry**

Use monotonic schema versions, idempotent migration steps, backup creation, row-count checks and rebuild fallback.

- [ ] **Step 4: Add corruption recovery**

Detect unreadable database, move it to backup, rebuild from source inventory and report action through status.

- [ ] **Step 5: Run verification**

```bash
node --test tests/code-db-migration.test.mjs
node scripts/build-code-index.mjs --root . --migrate --health
```

- [ ] **Step 6: Commit**

Commit with message `feat: add code database migrations and recovery`.

---

## Task T20: Privacy And File Classification Policy

**Files:**
- Create: `scripts/lib/supervibe-privacy-policy.mjs`
- Create: `tests/index-privacy-policy.test.mjs`
- Create: `docs/references/privacy-and-indexing-policy.md`
- Modify: `scripts/lib/supervibe-index-policy.mjs`
- Modify: `scripts/lib/code-store.mjs`
- Modify: `commands/supervibe-genesis.md`
- Modify: `skills/audit/SKILL.md`
- Test: `tests/index-privacy-policy.test.mjs`

**Estimated time:** 8h (confidence: high)  
**Rollback:** keep current source policy and disable privacy classification only behind a local development flag.  
**Risks:** R1: useful docs can be excluded too aggressively; mitigation: classify source, docs and private local files separately. R2: secret detection can produce false positives; mitigation: never print secret values and allow path-level explanations.

- [ ] **Step 1: Write failing test for archives, binaries and secrets**

```bash
node --test tests/index-privacy-policy.test.mjs
```

- [ ] **Step 2: Verify fail with `.rar`, `.env`, binary and generated fixtures**

Expected fail message: `private or binary file accepted for indexing`.

- [ ] **Step 3: Implement file classification**

Classify files as source-code, source-doc, generated, binary, archive, secret-like, local-config or unsupported; each class has index and graph rules.

- [ ] **Step 4: Add user-facing index manifest**

Expose what will be indexed, skipped and why during genesis dry-run, audit and status.

- [ ] **Step 5: Run verification**

```bash
node --test tests/index-privacy-policy.test.mjs
node scripts/supervibe-status.mjs --index-policy-diagnostics
```

- [ ] **Step 6: Commit**

Commit with message `feat: protect private files during indexing`.

---

## Task T21: Cross-Platform Process And Path Smoke

**Files:**
- Create: `tests/cross-platform-process.test.mjs`
- Modify: `scripts/lib/supervibe-process-manager.mjs`
- Modify: `scripts/lib/supervibe-index-policy.mjs`
- Modify: `scripts/lib/supervibe-host-detector.mjs`
- Modify: `package.json`
- Test: `tests/cross-platform-process.test.mjs`

**Estimated time:** 6h (confidence: medium)  
**Rollback:** keep Windows daemon fix and mark non-Windows daemon behavior as foreground-only until fixed.  
**Risks:** R1: CI may not cover every OS; mitigation: abstract spawn options and path rules, then test OS-specific decisions deterministically. R2: signal handling differs across shells; mitigation: status and stop commands use PID registry plus heartbeat instead of shell-specific control sequences.

- [ ] **Step 1: Write failing test for OS-specific spawn decisions**

```bash
node --test tests/cross-platform-process.test.mjs
```

- [ ] **Step 2: Verify fail because process manager has Windows-only assumptions**

Expected fail message: `platform strategy missing daemon stop behavior`.

- [ ] **Step 3: Add platform strategies**

Define spawn, path, lock, signal, heartbeat and log-file behavior for Windows, macOS and Linux.

- [ ] **Step 4: Add smoke script**

Package script runs deterministic platform strategy tests and local daemon smoke where supported.

- [ ] **Step 5: Run verification**

```bash
node --test tests/cross-platform-process.test.mjs
npm run check
```

- [ ] **Step 6: Commit**

Commit with message `test: cover cross platform daemon behavior`.

---

## Task T22: Scenario Evals For User Outcomes

**Files:**
- Create: `scripts/lib/supervibe-command-state.mjs`
- Create: `tests/scenario-evals.test.mjs`
- Create: `tests/fixtures/scenario-evals/supervibe-user-flows.json`
- Modify: `scripts/lib/supervibe-trigger-router.mjs`
- Modify: `scripts/lib/supervibe-capability-registry.mjs`
- Modify: `commands/supervibe-genesis.md`
- Modify: `commands/supervibe-status.md`
- Test: `tests/scenario-evals.test.mjs`

**Estimated time:** 10h (confidence: medium)  
**Rollback:** disable scenario eval gate and keep intent golden corpus as the release blocker.  
**Risks:** R1: scenario evals can become brittle snapshots; mitigation: assert outcomes, files and questions rather than exact wording. R2: stateful command flows can conflict in parallel sessions; mitigation: run IDs, project locks and explicit resume or cancel actions.

- [ ] **Step 1: Write failing scenario evals**

```bash
node --test tests/scenario-evals.test.mjs
```

- [ ] **Step 2: Verify fail on current command outcomes**

Expected fail message: `user flow did not produce required dry-run, question or health gate`.

- [ ] **Step 3: Implement command state**

Track active command, lifecycle state, current step, selected options, pending question, locks, dry-run output, resume token, delivery artifact path, approval state and last post-delivery prompt.

- [ ] **Step 4: Add outcome evals**

Cover flows: broken RAG repair, genesis on existing `CLAUDE.md`, Codex target, silent preview, user asks broad feedback, user asks approve/refine/alternative/stop after delivery, user asks stop or resume.

Each delivery scenario must assert that the command prints one explicit post-delivery question, offers approve/refine/alternative/stop choices, persists state before waiting, and does not claim done without user choice.

- [ ] **Step 5: Run verification**

```bash
node --test tests/scenario-evals.test.mjs
npm run check
```

- [ ] **Step 6: Commit**

Commit with message `test: add scenario evals for supervibe outcomes`.

---

## Phase I: Context Intelligence And Agent Tool Use

Purpose: make RAG, memory and codegraph a coordinated intelligence layer rather than three optional tools. Agents must know when to call each source, receive a scored context pack, cite evidence and fail gates when required evidence is missing.

Exit gate:
- A single context orchestrator builds task-specific packs from memory, source RAG, docs RAG, codegraph and host instruction files.
- Retrieval policy states when memory, RAG and codegraph are mandatory, optional or blocked.
- Context quality evals measure recall, precision, citation validity, contradiction handling, stale evidence and graph impact recall.
- Memory curator repairs stale indexes, deduplicates entries, flags contradictions and routes high-value learnings into durable memory.
- Agent tool-use gates fail release when agents bypass required memory, code search or graph usage.
- Plugin tool surfaces expose stable local metadata, deterministic ordering, context requirements and approval boundaries.
- Local diagnostics record context assembly, tool calls, handoffs and evidence without leaking secrets.

---

## Task T24: Context Orchestrator For RAG, Memory And Codegraph

**Files:**
- Create: `scripts/lib/supervibe-context-orchestrator.mjs`
- Create: `tests/context-orchestrator.test.mjs`
- Create: `docs/references/context-intelligence-contract.md`
- Modify: `scripts/supervibe-context-pack.mjs`
- Modify: `scripts/lib/supervibe-context-pack.mjs`
- Modify: `scripts/search-code.mjs`
- Modify: `scripts/search-memory.mjs`
- Test: `tests/context-orchestrator.test.mjs`

**Estimated time:** 10h (confidence: medium)  
**Rollback:** keep separate search tools and disable orchestrator consumption behind a feature flag.  
**Risks:** R1: one orchestrator can hide source-specific failure modes; mitigation: output per-source health, scores and failure reasons. R2: context packs can exceed token budgets; mitigation: budget by source, dedupe overlapping chunks and require citations for every included item.

- [ ] **Step 1: Write failing test for uncoordinated context pack**

```bash
node --test tests/context-orchestrator.test.mjs
```

- [ ] **Step 2: Verify fail because memory, RAG and graph are not merged by one policy**

Expected fail message: `context pack missing required memory, source chunks or graph neighborhood`.

- [ ] **Step 3: Implement orchestrator**

Build a context pack with source inventory, memory matches, RAG chunks, graph neighborhood, impact radius, host instructions, citations, freshness and token budget.

- [ ] **Step 4: Add source diagnostics**

Every pack reports why each source was included, skipped or blocked, plus index health and confidence.

- [ ] **Step 5: Run verification**

```bash
node --test tests/context-orchestrator.test.mjs
node scripts/supervibe-context-pack.mjs --query "genesis host adapter codegraph" --json
```

- [ ] **Step 6: Commit**

Commit with message `feat: orchestrate rag memory and codegraph context`.

---

## Task T25: Retrieval Decision Policy For Agents And Commands

**Files:**
- Create: `scripts/lib/supervibe-retrieval-decision-policy.mjs`
- Create: `tests/retrieval-decision-policy.test.mjs`
- Modify: `scripts/lib/supervibe-trigger-router.mjs`
- Modify: `scripts/lib/supervibe-capability-registry.mjs`
- Modify: `rules/single-question-discipline.md`
- Modify: `skills/project-memory/SKILL.md`
- Modify: `skills/code-search/SKILL.md`
- Test: `tests/retrieval-decision-policy.test.mjs`

**Estimated time:** 8h (confidence: medium)  
**Rollback:** downgrade policy enforcement to warnings while preserving diagnostics.  
**Risks:** R1: mandatory retrieval can slow trivial tasks; mitigation: policy classifies trivial, non-code and read-only requests as optional. R2: agents can over-call tools; mitigation: policy includes stop conditions and max calls per task class.

- [ ] **Step 1: Write failing test for missing required retrieval**

```bash
node --test tests/retrieval-decision-policy.test.mjs
```

- [ ] **Step 2: Verify fail for refactor without graph and feature work without memory**

Expected fail message: `task policy required codegraph but no graph evidence was attached`.

- [ ] **Step 3: Define mandatory cases**

Memory is mandatory for non-trivial planning, architecture, recurring bugs, policy decisions and project-history questions. Code RAG is mandatory for code changes, unfamiliar code, bug fixes, implementation planning and stack discovery. Codegraph is mandatory for rename, move, delete, extract, public API change, dependency impact analysis, architecture review and multi-file refactor.

- [ ] **Step 4: Define optional and blocked cases**

Simple terminal answers, exact file reads and formatting-only tasks can skip retrieval with a reason. Private, binary, secret-like and generated files are blocked by policy.

- [ ] **Step 5: Run verification**

```bash
node --test tests/retrieval-decision-policy.test.mjs
node scripts/audit-evidence-citations.mjs --strict
```

- [ ] **Step 6: Commit**

Commit with message `feat: enforce retrieval decision policy`.

---

## Task T26: Context Quality Evals

**Files:**
- Create: `scripts/lib/supervibe-context-quality-eval.mjs`
- Create: `tests/context-quality-eval.test.mjs`
- Create: `docs/references/rag-memory-codegraph-evals.md`
- Modify: `scripts/supervibe-context-eval.mjs`
- Modify: `tests/fixtures/scenario-evals/supervibe-user-flows.json`
- Modify: `package.json`
- Test: `tests/context-quality-eval.test.mjs`

**Estimated time:** 10h (confidence: medium)  
**Rollback:** keep eval runner but remove release-blocking thresholds until dataset quality improves.  
**Risks:** R1: metrics can reward irrelevant citations if gold sets are weak; mitigation: include expert-authored gold memory IDs, source chunks, symbols and negative cases. R2: eval fixtures can become stale after refactors; mitigation: regenerate candidate cases but keep held-out gold cases reviewed.

- [ ] **Step 1: Write failing eval for context precision and recall**

```bash
node --test tests/context-quality-eval.test.mjs
```

- [ ] **Step 2: Verify fail because current checks measure coverage but not relevance**

Expected fail message: `context recall below threshold` or `citation precision below threshold`.

- [ ] **Step 3: Add quality metrics**

Measure memory recall, memory precision, source chunk recall, source chunk precision, graph impact recall, citation validity, stale evidence rate, contradiction detection and token budget compliance.

- [ ] **Step 4: Add release thresholds**

Target context recall at least 0.85, context precision at least 0.70, citation validity at least 0.95 and graph impact recall at least 0.90 on gold cases.

- [ ] **Step 5: Run verification**

```bash
node --test tests/context-quality-eval.test.mjs
node scripts/supervibe-context-eval.mjs --case-file tests/fixtures/scenario-evals/supervibe-user-flows.json
```

- [ ] **Step 6: Commit**

Commit with message `test: evaluate rag memory and codegraph quality`.

---

## Task T27: Memory Curation, Contradiction And Freshness

**Files:**
- Create: `scripts/lib/supervibe-memory-curator.mjs`
- Create: `tests/memory-curation.test.mjs`
- Modify: `scripts/build-memory-index.mjs`
- Modify: `scripts/search-memory.mjs`
- Modify: `scripts/supervibe-memory-gc.mjs`
- Modify: `skills/add-memory/SKILL.md`
- Modify: `skills/project-memory/SKILL.md`
- Test: `tests/memory-curation.test.mjs`

**Estimated time:** 9h (confidence: medium)  
**Rollback:** leave curator in audit-only mode and keep existing memory index builder active.  
**Risks:** R1: curator can delete useful historical context; mitigation: never delete by default, archive with restore and cite reason. R2: contradiction detection can over-warn; mitigation: flag contradictions for review unless a managed block proves supersession.

- [ ] **Step 1: Write failing test for stale memory index**

```bash
node --test tests/memory-curation.test.mjs
```

- [ ] **Step 2: Verify fail with markdown memory present and index reporting zero entries**

Expected fail message: `memory markdown entry missing from searchable index`.

- [ ] **Step 3: Implement curator**

Rebuild markdown and SQLite memory indexes, dedupe entries, validate frontmatter, score confidence, flag stale entries and detect contradictory decisions.

- [ ] **Step 4: Add durable memory lifecycle**

High-value outcomes from incidents, releases, failed evals and user corrections create reviewable memory candidates with tags, related links and confidence.

- [ ] **Step 5: Run verification**

```bash
node --test tests/memory-curation.test.mjs
node scripts/build-memory-index.mjs
node scripts/search-memory.mjs --query "feedback websocket"
```

- [ ] **Step 6: Commit**

Commit with message `feat: curate project memory for agent retrieval`.

---

## Task T28: Agent Tool-Use Gates And Evidence Ledger

**Files:**
- Create: `scripts/lib/supervibe-evidence-ledger.mjs`
- Create: `tests/agent-tool-use-gates.test.mjs`
- Modify: `scripts/audit-evidence-citations.mjs`
- Modify: `scripts/apply-rag-memory-procedure.mjs`
- Modify: `scripts/lib/agent-invocation-logger.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `scripts/effectiveness-tracker.mjs`
- Modify: `confidence-rubrics/agent-delivery.yaml`
- Modify: `skills/requesting-code-review/SKILL.md`
- Test: `tests/agent-tool-use-gates.test.mjs`

**Estimated time:** 8h (confidence: medium)  
**Rollback:** keep evidence ledger as advisory and do not block release until evidence gates mature.  
**Risks:** R1: strict gates can penalize legitimate simple tasks; mitigation: every bypass must include task class and policy reason. R2: evidence logs can leak paths or snippets; mitigation: store citations and hashes by default, with redacted snippets only when allowed. R3: diagnostic logging can grow noisy; mitigation: keep local summary events, sample large payloads and never capture raw private output by default.

- [ ] **Step 1: Write failing test for agent bypass**

```bash
node --test tests/agent-tool-use-gates.test.mjs
```

- [ ] **Step 2: Verify fail because audit is advisory**

Expected fail message: `required memory or graph evidence was missing but task passed`.

- [ ] **Step 3: Implement evidence ledger**

Record task ID, agent ID, retrieval policy, memory IDs, RAG chunk IDs, graph symbols, citations, bypass reasons, verification commands, redaction status and local diagnostic events for user intent, routing, context assembly, tool call, handoff, verification and feedback.

- [ ] **Step 4: Gate agent delivery**

Agent delivery score fails when required evidence is absent, stale, uncited or contradicted by newer memory. Failed evidence events create eval candidates, memory candidates, strengthen tasks and capability-registry warnings.

- [ ] **Step 5: Run verification**

```bash
node --test tests/agent-tool-use-gates.test.mjs
node scripts/audit-evidence-citations.mjs --strict
node scripts/supervibe-status.mjs --evidence-ledger
```

- [ ] **Step 6: Commit**

Commit with message `feat: gate agents on required context evidence`.

---

## Task T29: Local Tool Metadata Contract

**Files:**
- Create: `scripts/lib/supervibe-tool-metadata-contract.mjs`
- Create: `tests/local-tool-metadata-contract.test.mjs`
- Create: `docs/references/local-tool-metadata-contract.md`
- Modify: `scripts/lib/supervibe-capability-registry.mjs`
- Modify: `scripts/lib/supervibe-trigger-router.mjs`
- Modify: `commands/supervibe-genesis.md`
- Test: `tests/local-tool-metadata-contract.test.mjs`

**Estimated time:** 8h (confidence: medium)  
**Rollback:** keep contract validation as documentation-only while command behavior remains unchanged.  
**Risks:** R1: rigid metadata can slow plugin evolution; mitigation: keep the required contract small and derive most fields from existing command and skill frontmatter. R2: tool lists can become too large for prompts; mitigation: deterministic ordering, tool groups and intent-scoped tool exposure.

- [ ] **Step 1: Write failing test for unstable tool metadata**

```bash
node --test tests/local-tool-metadata-contract.test.mjs
```

- [ ] **Step 2: Verify fail because tools lack one contract**

Expected fail message: `tool metadata missing input shape, context requirement, approval policy or deterministic order`.

- [ ] **Step 3: Implement local metadata contract**

Every command, skill and tool declares stable name, aliases, short description, input shape, side-effect level, approval policy, required context sources, token-cost hint and owner.

- [ ] **Step 4: Add trust and safety rules**

Human confirmation is required for writes, migrations, network use, external APIs and private screenshots; deterministic ordering and intent-scoped exposure improve cache, routing quality and token use.

- [ ] **Step 5: Run verification**

```bash
node --test tests/local-tool-metadata-contract.test.mjs
node scripts/supervibe-status.mjs --capabilities
```

- [ ] **Step 6: Commit**

Commit with message `feat: validate local tool metadata contracts`.

## Task T31: Deterministic Repo Map And Context Budget

**Files:**
- Create: `scripts/lib/supervibe-repo-map.mjs`
- Create: `tests/repo-map-context-budget.test.mjs`
- Create: `docs/references/repo-map-context-budget.md`
- Modify: `scripts/build-code-index.mjs`
- Modify: `scripts/search-code.mjs`
- Modify: `scripts/supervibe-context-pack.mjs`
- Modify: `scripts/lib/supervibe-context-orchestrator.mjs`
- Modify: `package.json`
- Test: `tests/repo-map-context-budget.test.mjs`

**Estimated time:** 9h (confidence: medium)  
**Rollback:** disable repo-map enrichment and keep existing RAG plus graph retrieval path active.  
**Risks:** R1: repo map can become another stale artifact; mitigation: build it from the same indexed file metadata and fail freshness checks when source inventory changes. R2: ranked symbols can overfit to imports and miss domain entry points; mitigation: combine dependency rank, exported symbols, tests, command entry points and recent files.

- [ ] **Step 1: Write failing test for missing deterministic repo map**

```bash
node --test tests/repo-map-context-budget.test.mjs
```

- [ ] **Step 2: Verify fail because context packs lack ranked whole-repo structure**

Expected fail message: `repo map missing deterministic symbol ranking or token budget`.

- [ ] **Step 3: Implement repo-map builder**

Build a stable map of files, exported symbols, class and function signatures, test links, dependency edges, entry points and graph rank. Output must be deterministic across repeated runs with unchanged inputs.

- [ ] **Step 4: Add token budget tiers**

Define `tiny`, `standard`, `deep` and `refactor` budgets. Each tier selects repo-map slices, RAG chunks and graph neighbors with explicit byte and token ceilings plus a reason for every omitted high-rank item.

- [ ] **Step 5: Run verification**

```bash
node --test tests/repo-map-context-budget.test.mjs
node scripts/supervibe-context-pack.mjs --query "intent router context budget" --explain
```

- [ ] **Step 6: Commit**

Commit with message `feat: add deterministic repo map context budgets`.

---

## Task T32: Agent Checkpoint And Resume State

**Files:**
- Create: `scripts/lib/supervibe-agent-checkpoints.mjs`
- Create: `tests/agent-checkpoint-resume.test.mjs`
- Create: `docs/references/agent-state-checkpoints.md`
- Modify: `scripts/supervibe-loop.mjs`
- Modify: `scripts/lib/supervibe-evidence-ledger.mjs`
- Modify: `scripts/lib/supervibe-command-state.mjs`
- Modify: `scripts/lib/agent-invocation-logger.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `package.json`
- Test: `tests/agent-checkpoint-resume.test.mjs`

**Estimated time:** 10h (confidence: medium)  
**Rollback:** keep checkpoints read-only and resume from existing work-item graph until the checkpoint store is trusted.  
**Risks:** R1: checkpoint state can leak tool output or private file snippets; mitigation: default redacted payloads, citation hashes and opt-in snippets. R2: resume can replay unsafe writes; mitigation: persisted state records completed side effects and requires fresh approval for mutation steps.

- [ ] **Step 1: Write failing test for resume after interrupted handoff**

```bash
node --test tests/agent-checkpoint-resume.test.mjs
```

- [ ] **Step 2: Verify fail because agent state is transcript-bound**

Expected fail message: `checkpoint missing retrieval policy, evidence IDs or next safe action`.

- [ ] **Step 3: Implement checkpoint schema**

Persist task ID, user intent, selected agent, retrieval policy, memory IDs, RAG chunk IDs, graph symbols, approvals, completed side effects, verification commands, next safe action and schema version after each tool call and handoff.

- [ ] **Step 4: Add resume and recovery diagnostics**

Expose `--resume-task`, `--checkpoint-status` and `--repair-checkpoints` flows. Resume must revalidate stale context before continuing and must not repeat write operations without a side-effect ledger match.

- [ ] **Step 5: Run verification**

```bash
node --test tests/agent-checkpoint-resume.test.mjs
node scripts/supervibe-status.mjs --checkpoint-diagnostics
```

- [ ] **Step 6: Commit**

Commit with message `feat: checkpoint agent state for safe resume`.

---

## Task T33: Local Regression Checks For Agent Behavior

**Files:**
- Create: `scripts/lib/supervibe-agent-regression-checks.mjs`
- Create: `tests/agent-regression-checks.test.mjs`
- Create: `docs/references/agent-regression-checks.md`
- Modify: `scripts/regression-suite.mjs`
- Modify: `scripts/validate-trigger-replay.mjs`
- Modify: `scripts/audit-evidence-citations.mjs`
- Modify: `confidence-rubrics/agent-delivery.yaml`
- Modify: `package.json`
- Test: `tests/agent-regression-checks.test.mjs`

**Estimated time:** 8h (confidence: medium)  
**Rollback:** keep regression checks advisory while retaining the test fixtures for manual review.  
**Risks:** R1: regression checks can be noisy and block harmless changes; mitigation: separate blocking gold cases from advisory exploratory cases. R2: LLM-scored checks can be non-deterministic; mitigation: prefer static evidence logs, tool-use logs, exact expected labels and deterministic fixture replay for release gates.

- [ ] **Step 1: Write failing test for missing local context regression check**

```bash
node --test tests/agent-regression-checks.test.mjs
```

- [ ] **Step 2: Verify fail because tool-use regressions are not repository checks**

Expected fail message: `agent behavior regression check missing from package scripts or regression suite`.

- [ ] **Step 3: Add regression suites**

Define held-out cases for memory-required planning, codegraph-required refactor, RAG-required unfamiliar code, tool-choice routing, handoff boundary, refusal on unsafe context and bypass explanation quality.

- [ ] **Step 4: Wire local regression checks**

Add package scripts so local review can fail when required context evidence is missing or a tool route regresses.

- [ ] **Step 5: Run verification**

```bash
node --test tests/agent-regression-checks.test.mjs
npm run regression:run
```

- [ ] **Step 6: Commit**

Commit with message `test: gate agent behavior regressions locally`.

---

## Task T35: Prompt Injection And Context Exfiltration Red-Team

**Files:**
- Create: `scripts/lib/supervibe-context-threat-model.mjs`
- Create: `tests/context-threat-model.test.mjs`
- Create: `tests/fixtures/adversarial-context-prompts.json`
- Create: `docs/references/context-threat-model.md`
- Modify: `scripts/lib/supervibe-privacy-policy.mjs`
- Modify: `scripts/lib/supervibe-retrieval-decision-policy.mjs`
- Modify: `scripts/lib/supervibe-evidence-ledger.mjs`
- Modify: `scripts/audit-release-security.mjs`
- Modify: `package.json`
- Test: `tests/context-threat-model.test.mjs`

**Estimated time:** 8h (confidence: medium)  
**Rollback:** run threat model fixtures in audit-only mode while keeping privacy filters active.  
**Risks:** R1: red-team fixtures can encode sensitive patterns too specifically; mitigation: use synthetic path, token and comment payloads. R2: strict exfiltration rules can block legitimate diagnostics; mitigation: allow scoped, user-approved reveal with redaction evidence.

- [ ] **Step 1: Write failing adversarial context test**

```bash
node --test tests/context-threat-model.test.mjs
```

- [ ] **Step 2: Verify fail because malicious context is not release-blocking**

Expected fail message: `context red-team case bypassed retrieval or output policy`.

- [ ] **Step 3: Add threat fixtures**

Cover prompt injection in source comments, hostile markdown memory, stale contradictory decisions, path traversal requests, secret-looking values, generated files, private screenshots, network exfiltration requests and unsafe tool escalation.

- [ ] **Step 4: Gate release security**

Fail release when a fixture causes an agent to obey untrusted retrieved instructions, print blocked private content, skip approval or cite stale context without warning.

- [ ] **Step 5: Run verification**

```bash
node --test tests/context-threat-model.test.mjs
npm run audit:release-security
```

- [ ] **Step 6: Commit**

Commit with message `test: red-team context injection and exfiltration`.

---

## Task T36: User-Perceived Power Metrics And UX Evidence

**Files:**
- Create: `scripts/lib/supervibe-user-outcome-metrics.mjs`
- Create: `tests/user-outcome-metrics.test.mjs`
- Create: `docs/references/user-outcome-metrics.md`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `scripts/supervibe-context-pack.mjs`
- Modify: `tests/fixtures/scenario-evals/supervibe-user-flows.json`
- Modify: `README.md`
- Modify: `package.json`
- Test: `tests/user-outcome-metrics.test.mjs`

**Estimated time:** 7h (confidence: medium)  
**Rollback:** keep metrics collection disabled and retain only scenario eval assertions.  
**Risks:** R1: UX metrics can reward flashy output over correctness; mitigation: tie every metric to evidence quality, task completion and user-visible repair guidance. R2: latency targets can fail on slow machines; mitigation: measure fixture-relative budgets and report p50 plus p95 separately.

- [ ] **Step 1: Write failing test for invisible context power**

```bash
node --test tests/user-outcome-metrics.test.mjs
```

- [ ] **Step 2: Verify fail because users cannot see context value**

Expected fail message: `user outcome report missing context provenance, repair action or confidence delta`.

- [ ] **Step 3: Define user outcome metrics**

Measure time to first useful context, context provenance visibility, repair suggestion quality, confidence delta after retrieval, number of avoided questions, successful resume rate, user-confirmable citations, post-delivery choice clarity, approval/refine/alternative/stop completion rate and no-silent-done violations.

- [ ] **Step 4: Surface evidence**

Status, context-pack and scenario output must show which memory entries, RAG chunks and graph symbols were used, why each source was required, what was skipped, what lifecycle state the flow is in, which user decision is needed next and what repair action is recommended when confidence is below gate.

- [ ] **Step 5: Run verification**

```bash
node --test tests/user-outcome-metrics.test.mjs
node scripts/supervibe-context-pack.mjs --query "why does this project need memory and codegraph" --explain
```

- [ ] **Step 6: Commit**

Commit with message `feat: measure visible context intelligence outcomes`.

---

## Task T37: Adaptive Retrieval Pipeline And Rerank Calibration

**Files:**
- Create: `scripts/lib/supervibe-retrieval-pipeline.mjs`
- Create: `tests/retrieval-pipeline-calibration.test.mjs`
- Create: `docs/references/retrieval-pipeline-calibration.md`
- Modify: `scripts/lib/supervibe-context-orchestrator.mjs`
- Modify: `scripts/lib/supervibe-retrieval-decision-policy.mjs`
- Modify: `scripts/supervibe-context-eval.mjs`
- Modify: `tests/fixtures/scenario-evals/supervibe-user-flows.json`
- Modify: `package.json`
- Test: `tests/retrieval-pipeline-calibration.test.mjs`

**Estimated time:** 9h (confidence: medium)  
**Rollback:** route context packs back to the existing hybrid search while keeping calibration fixtures for later analysis.  
**Risks:** R1: reranking can hide rare but important files; mitigation: preserve high-risk symbols, entry points and recent edits as protected candidates. R2: query rewriting can drift from user intent; mitigation: store the original query, rewritten query and per-candidate reason in the evidence ledger.

- [ ] **Step 1: Write failing test for uncalibrated retrieval**

```bash
node --test tests/retrieval-pipeline-calibration.test.mjs
```

- [ ] **Step 2: Verify fail because retrieval lacks explicit pipeline stages**

Expected fail message: `retrieval pipeline missing rewrite, hybrid candidate set, rerank score or fallback reason`.

- [ ] **Step 3: Implement staged retrieval**

Add language-aware query rewrite, exact symbol lookup, FTS, embedding search, repo-map expansion, graph-neighbor expansion, dedupe, rerank and fallback stages. Every stage records candidate counts and rejection reasons.

- [ ] **Step 4: Calibrate thresholds**

Use gold fixtures to tune top-k, min-score, freshness penalty, generated-file penalty, multilingual query handling and contradiction warning thresholds.

- [ ] **Step 5: Run verification**

```bash
node --test tests/retrieval-pipeline-calibration.test.mjs
node scripts/supervibe-context-eval.mjs --case-file tests/fixtures/scenario-evals/supervibe-user-flows.json --explain
```

- [ ] **Step 6: Commit**

Commit with message `feat: calibrate adaptive retrieval pipeline`.

---

## Task T43: Temporal Project Knowledge Graph

**Files:**
- Create: `scripts/lib/supervibe-project-knowledge-graph.mjs`
- Create: `tests/project-knowledge-graph.test.mjs`
- Create: `docs/references/project-knowledge-graph.md`
- Modify: `scripts/build-memory-index.mjs`
- Modify: `scripts/search-memory.mjs`
- Modify: `scripts/lib/supervibe-context-orchestrator.mjs`
- Modify: `scripts/lib/supervibe-memory-curator.mjs`
- Modify: `scripts/supervibe-context-eval.mjs`
- Modify: `package.json`
- Test: `tests/project-knowledge-graph.test.mjs`

**Estimated time:** 11h (confidence: medium)  
**Rollback:** keep temporal graph generation disabled and continue using flat memory index plus codegraph while preserving graph fixtures.  
**Risks:** R1: entity extraction can hallucinate links; mitigation: only create graph edges from explicit frontmatter, file paths, symbol IDs, task IDs and verified citations. R2: supersession rules can hide useful history; mitigation: current-fact queries hide superseded facts by default but expose history with `--include-superseded`.

- [ ] **Step 1: Write failing test for missing temporal graph memory**

```bash
node --test tests/project-knowledge-graph.test.mjs
```

- [ ] **Step 2: Verify fail because memory and codegraph are disconnected**

Expected fail message: `knowledge graph missing decision, symbol, task, agent or supersession edge`.

- [ ] **Step 3: Build graph schema**

Model decisions, learnings, incidents, solutions, tasks, agents, skills, commands, files, symbols, user corrections and release evidence as typed nodes with temporal `validFrom`, `validTo`, `supersedes` and `sourceCitation` fields.

- [ ] **Step 4: Fuse retrieval**

Context orchestrator can expand from memory entry to affected code symbols, from symbol to decisions, from failed eval to correction memory and from user project to namespace-specific graph facts.

- [ ] **Step 5: Run verification**

```bash
node --test tests/project-knowledge-graph.test.mjs
node scripts/search-memory.mjs --query "feedback websocket" --graph --include-history
```

- [ ] **Step 6: Commit**

Commit with message `feat: link memory and code through temporal project graph`.

## Task T46: Performance, Token And Resource SLOs

**Files:**
- Create: `scripts/lib/supervibe-performance-slo.mjs`
- Create: `tests/performance-slo.test.mjs`
- Create: `docs/references/performance-slo.md`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `scripts/supervibe-context-pack.mjs`
- Modify: `scripts/supervibe-context-eval.mjs`
- Modify: `scripts/regression-suite.mjs`
- Modify: `README.md`
- Modify: `package.json`
- Test: `tests/performance-slo.test.mjs`

**Estimated time:** 7h (confidence: medium)  
**Rollback:** keep SLO reporting informational while release gates still use correctness and safety checks.  
**Risks:** R1: timings vary across developer machines; mitigation: use fixture-relative budgets, p50 and p95 bands, and mark machine profile in output. R2: strict token budgets can reduce answer quality; mitigation: SLO failures report tradeoff and never trim required safety or citation evidence.

- [ ] **Step 1: Write failing SLO test**

```bash
node --test tests/performance-slo.test.mjs
```

- [ ] **Step 2: Verify fail because release has no performance contract**

Expected fail message: `SLO missing context-pack latency, token budget, disk growth or watcher overhead`.

- [ ] **Step 3: Define SLOs**

Track context-pack p50/p95 latency, index rebuild time, watcher CPU budget, code.db size growth, memory graph size, tokens per context tier, retrieval top-k cost and eval run time.

- [ ] **Step 4: Add budget gates**

Release gates fail on unbounded growth, missing machine profile, p95 regression above threshold or token budget overflow without an explicit quality tradeoff.

- [ ] **Step 5: Run verification**

```bash
node --test tests/performance-slo.test.mjs
node scripts/supervibe-status.mjs --performance-slo
```

- [ ] **Step 6: Commit**

Commit with message `perf: gate supervibe context performance slos`.

---

## Task T47: Workspace Isolation And Cross-Project Boundaries

**Files:**
- Create: `scripts/lib/supervibe-workspace-isolation.mjs`
- Create: `tests/workspace-isolation.test.mjs`
- Create: `tests/fixtures/workspace-isolation/projects.json`
- Create: `docs/references/workspace-isolation.md`
- Modify: `scripts/lib/supervibe-privacy-policy.mjs`
- Modify: `scripts/lib/supervibe-context-orchestrator.mjs`
- Modify: `scripts/build-code-index.mjs`
- Modify: `scripts/build-memory-index.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `package.json`
- Test: `tests/workspace-isolation.test.mjs`

**Estimated time:** 9h (confidence: medium)  
**Rollback:** keep namespace checks in audit-only mode and preserve existing per-project `.claude/memory` storage.  
**Risks:** R1: strict isolation can block intentional shared plugin knowledge; mitigation: separate global plugin namespace from project-private namespace and require explicit import. R2: path normalization can differ by OS; mitigation: use resolved real paths, case-folding tests for Windows and symlink loop checks.

- [ ] **Step 1: Write failing cross-project contamination test**

```bash
node --test tests/workspace-isolation.test.mjs
```

- [ ] **Step 2: Verify fail because namespace boundaries are not explicit**

Expected fail message: `context result crossed workspace namespace without import approval`.

- [ ] **Step 3: Implement namespace model**

Every memory entry, RAG chunk, graph symbol, checkpoint, diagnostic event, task and user correction carries `workspaceId`, `projectRoot`, `sourceKind`, `visibility` and `importedFrom` metadata.

- [ ] **Step 4: Add isolation gates**

Context orchestrator denies cross-project retrieval unless the source is global plugin knowledge or an explicitly approved import. Status reports namespace drift and orphaned entries.

- [ ] **Step 5: Run verification**

```bash
node --test tests/workspace-isolation.test.mjs
node scripts/supervibe-status.mjs --workspace-isolation
```

- [ ] **Step 6: Commit**

Commit with message `feat: isolate context by workspace namespace`.

---

## Task T48: Human Feedback Review Loop

**Files:**
- Create: `scripts/lib/supervibe-feedback-learning-loop.mjs`
- Create: `tests/feedback-learning-loop.test.mjs`
- Create: `docs/references/feedback-learning-loop.md`
- Modify: `scripts/effectiveness-tracker.mjs`
- Modify: `scripts/lib/supervibe-memory-curator.mjs`
- Modify: `scripts/supervibe-context-eval.mjs`
- Modify: `scripts/regression-suite.mjs`
- Modify: `commands/supervibe-score.md`
- Modify: `README.md`
- Modify: `package.json`
- Test: `tests/feedback-learning-loop.test.mjs`

**Estimated time:** 8h (confidence: medium)  
**Rollback:** keep feedback capture active but disable automatic promotion into eval and memory candidates.  
**Risks:** R1: user corrections can become noisy memory; mitigation: corrections enter a review queue and require confidence, tags and review before becoming durable memory. R2: recent feedback can dominate older recurring problems; mitigation: prioritize by severity, recurrence, affected workflow and novelty.

- [ ] **Step 1: Write failing test for missing feedback promotion**

```bash
node --test tests/feedback-learning-loop.test.mjs
```

- [ ] **Step 2: Verify fail because user corrections do not become reviewed eval cases**

Expected fail message: `feedback item missing annotation state, memory candidate, eval candidate or reviewer action`.

- [ ] **Step 3: Add feedback review queue**

Create states `new`, `triaged`, `accepted`, `rejected`, `promoted-to-memory`, `promoted-to-eval` and `resolved`. Store user correction, affected diagnostic event, failure taxonomy, suggested fix and reviewer notes.

- [ ] **Step 4: Add reviewed promotion routing**

Repeated failures create strengthen tasks, accepted corrections create memory candidates, high-severity misses create regression fixtures and stale feedback gets archived with reason.

- [ ] **Step 5: Run verification**

```bash
node --test tests/feedback-learning-loop.test.mjs
node scripts/regression-suite.mjs --feedback-learning-smoke
```

- [ ] **Step 6: Commit**

Commit with message `feat: promote user feedback into memory and eval loops`.

---

## Phase J: Final Release Gate

Purpose: only after all repair and hardening tasks pass, package the plugin as a release candidate with explicit rollback, compatibility notes and evidence.

Exit gate:
- Every test introduced by this plan passes.
- `npm run check` passes.
- Optional smoke uses only sanitized fixtures unless the user explicitly supplies and approves a private project path for that run.
- Release notes list breaking changes, repair commands, migration paths and rollback.

---

## Task T23: Final Release Candidate Verification

**Files:**
- Create: `tests/release-candidate-gate.test.mjs`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `docs/references/upgrade-and-rollback.md`
- Modify: `docs/references/context-intelligence-contract.md`
- Modify: `docs/references/rag-memory-codegraph-evals.md`
- Modify: `docs/references/local-tool-metadata-contract.md`
- Modify: `docs/references/repo-map-context-budget.md`
- Modify: `docs/references/agent-state-checkpoints.md`
- Modify: `docs/references/agent-regression-checks.md`
- Modify: `docs/references/context-threat-model.md`
- Modify: `docs/references/user-outcome-metrics.md`
- Modify: `docs/references/retrieval-pipeline-calibration.md`
- Modify: `docs/references/project-knowledge-graph.md`
- Modify: `docs/references/performance-slo.md`
- Modify: `docs/references/workspace-isolation.md`
- Modify: `docs/references/feedback-learning-loop.md`
- Test: `tests/release-candidate-gate.test.mjs`

**Estimated time:** 6h (confidence: high)  
**Rollback:** do not publish the release candidate; revert final docs and keep all functional fixes available for another review cycle.  
**Risks:** R1: release can pass synthetic tests but fail in a real project; mitigation: optional sanitized fixture smoke and at least one clean fixture project. R2: rollback docs can drift from implementation; mitigation: release-candidate test checks that every migration and daemon command has rollback text.

- [ ] **Step 1: Write failing release-candidate gate**

```bash
node --test tests/release-candidate-gate.test.mjs
```

- [ ] **Step 2: Verify fail before all evidence is linked**


- [ ] **Step 3: Link evidence**

Collect command names, test outputs, migration rollback paths, index repair instructions and daemon diagnostics into release docs.

- [ ] **Step 4: Run complete verification**

```bash
npm run check
node scripts/validate-plan-artifacts.mjs --file docs/plans/2026-05-01-supervibe-plugin-remediation.md
node scripts/supervibe-status.mjs --no-gc-hints
node scripts/supervibe-context-eval.mjs --case-file tests/fixtures/scenario-evals/supervibe-user-flows.json
node scripts/audit-evidence-citations.mjs --strict
node scripts/regression-suite.mjs
npm run audit:release-security
node scripts/supervibe-status.mjs --workspace-isolation --performance-slo
```

- [ ] **Step 5: Run optional sanitized fixture smoke**


- [ ] **Step 6: Commit**

Commit with message `chore: verify supervibe remediation release candidate`.

---

## Review Gates

### REVIEW GATE 1 after Phase A

- [ ] Evidence harness passes.
- [ ] Sanitized fixture symptoms are represented by sanitized fixtures.
- [ ] User confirms the problem statement matches the reported feedback.

### REVIEW GATE 2 after Phase B

- [ ] RAG indexes complete source inventory on fixture.
- [ ] Codegraph top symbols are source-level names.
- [ ] `supervibe-status` clearly fails unhealthy index states.

### REVIEW GATE 3 after Phase C and Phase D

- [ ] All interactive commands and skills use the same dialogue contract.
- [ ] Delivery-style commands expose lifecycle state, state artifact, approval/refine/alternative/stop menu, mandatory post-delivery prompt and no silent done behavior.
- [ ] Intent router golden corpus passes for Russian and English requests.
- [ ] Capability registry links agents, commands, rules, skills and verification hooks.

### REVIEW GATE 4 after Phase E and Phase F

- [ ] Genesis dry-run chooses correct host adapter or asks one clear question.
- [ ] Existing `CLAUDE.md` style files are preserved and rebuilt under managed sections.
- [ ] Sanitized desktop stack pack recommends the missing specialists and explains optional agents.

### REVIEW GATE 5 after Phase H

- [ ] Install and upgrade health gates pass on old and current plugin layouts.
- [ ] Watcher, DB migration and privacy policy tests pass.
- [ ] Cross-platform process strategy tests pass.
- [ ] Scenario evals prove full user outcomes, including approve/refine/alternative/stop after delivery, not only router labels.

### REVIEW GATE 6 after Phase I

- [ ] Context orchestrator returns scored packs from memory, RAG and codegraph.
- [ ] Retrieval decision policy proves agents know when each source is mandatory.
- [ ] Adaptive retrieval pipeline records rewrite, hybrid search, rerank and fallback evidence.
- [ ] Repo-map output is deterministic, ranked and bounded by explicit context budgets.
- [ ] Temporal project knowledge graph links decisions, symbols, tasks, agents and user corrections with supersession.
- [ ] Context quality evals meet recall, precision, citation and graph impact thresholds.
- [ ] Memory curator repairs stale indexes and flags contradictions.
- [ ] Agent evidence ledger blocks missing required context.
- [ ] Performance SLOs gate latency, token budgets, disk growth and watcher overhead.
- [ ] Workspace isolation blocks cross-project context contamination.
- [ ] Agent checkpoints resume safely without repeating side effects.
- [ ] Local regression checks fail on tool choice, handoff and context-use regressions.
- [ ] Prompt-injection and context-exfiltration red-team fixtures pass.
- [ ] User-outcome metrics prove users can see context provenance, lifecycle state, needed next decision, repair actions and confidence deltas.
- [ ] Feedback learning loop promotes reviewed corrections into memory and eval candidates.
- [ ] Local tool metadata contract and evidence ledger diagnostics pass validation.

### FINAL REVIEW GATE

- [ ] `npm run check` passes.
- [ ] Windows daemon smoke passes.
- [ ] Install and upgrade dry-run passes on old and current plugin layouts.
- [ ] Watcher, DB migration, privacy policy and cross-platform strategy tests pass.
- [ ] Scenario evals pass for broken-index repair, host-aware genesis and silent server flows.
- [ ] Context quality evals and evidence gates pass for memory, RAG and codegraph usage.
- [ ] Local tool metadata contract and evidence ledger diagnostics pass.
- [ ] Release docs and rollback paths are complete.
- [ ] User approves merge or release packaging.

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| 1. Console windows must become silent | T2 |
| 2. RAG and codegraph must fully index sanitized source inventory and stop showing minified names | T1, T3, T4, T5, T6, T15 |
| 3. All commands need one polished dialogue format with lifecycle, state artifact, approval/refine/alternative/stop menu and no silent done | T7, T8, T22, T36 |
| 4. Intentness of agents and commands must improve with best practices and evaluation | T9, T10 |
| 5. Genesis must detect model or host and avoid always creating `.claude` | T11, T13 |
| 6. `CLAUDE.md` style files must be rebuilt consistently and safely | T12 |
| 7. Agents and commands must evolve model folders and instruction files | T10, T11, T12, T13 |
| 8. The sanitized fixture must reveal missing specialist agents | T14, T15 |
| 9. Genesis must give users more agent choice | T13 |
| 10. Agents, rules, skills and instruction files must be linked flexibly | T10, T12, T13, T14 |
| 11. Install and upgrade must not recreate the same failures | T17, T23 |
| 12. Index must stay fresh after initial repair | T18 |
| 13. `code.db` schema drift and corruption must be recoverable | T19 |
| 14. Archives, binaries, secrets and local config must not pollute RAG | T20 |
| 15. Silent mode and locks must work across OS strategies | T2, T21 |
| 16. End-to-end user outcomes must be evaluated | T9, T10, T22, T23 |
| 17. RAG, memory and codegraph must work as one coordinated context layer | T24 |
| 18. Agents must know when each context source is required | T25, T28 |
| 19. Context quality must be measured, not assumed | T26, T31, T36 |
| 20. Project memory must stay fresh, deduplicated and contradiction-aware | T27 |
| 21. Plugin tools must follow stable local metadata contracts | T29 |
| 22. Context intelligence must feed an evolution loop | T28, T33 |
| 23. Whole-repo context must be deterministic, ranked and bounded | T31 |
| 24. Long-running agents must resume from structured state, not transcript memory | T32 |
| 25. Agent behavior must be guarded by local regression checks | T33 |
| 26. Powerful context access must survive prompt-injection and exfiltration red-team cases | T35 |
| 27. Users must feel the plugin power through visible context provenance and repair guidance | T36 |
| 28. Retrieval must be staged, calibrated, multilingual and explainable | T37 |
| 29. Project memory must become a temporal knowledge graph linked to code and tasks | T43 |
| 30. Context intelligence must meet latency, token and resource SLOs | T46 |
| 31. Multi-project usage must enforce workspace namespace isolation | T47 |
| 32. User feedback must become reviewed memory and eval improvements | T48 |

### Placeholder scan

- No placeholder tokens are intentionally left in this plan.
- All tasks name concrete files, tests, commands, rollback and risks.
- Any future unknown is represented as a tested adapter or dry-run choice, not as an unbounded promise.

### Type consistency

- New runtime modules are ESM `.mjs`, matching the repository.
- Tests use `node:test`, matching the repository.
- Markdown artifacts keep command and skill docs in existing plugin style.
- Host adapters return structured objects with paths, supported features, confidence and migration operations.
- Index health metrics use numeric counts, ratios and explicit pass or fail states.

---

## Execution Handoff

**Subagent-Driven batches:**  
Batch 1: `T1` owner handles evidence harness.  
Batch 2: `T2` owner handles silent process lifecycle.  
Batch 3: `T3`, `T4`, `T5`, `T6` owners split by index policy, retrieval, graph quality and status gates.  
Batch 4: `T7`, `T8` owner handles dialogue contract and validator.  
Batch 5: `T9`, `T10` owner handles intent router and capability registry.  
Batch 6: `T11`, `T12`, `T13` owner handles host-aware genesis and context migration.  
Batch 7: `T14`, `T15` owner handles Sanitized desktop stack pack and end-to-end dry run.  
Batch 8: `T17`, `T18`, `T19`, `T20` owners handle install, watcher, DB migration and privacy hardening.  
Batch 9: `T21`, `T22` owners handle cross-platform process strategy and scenario evals.  
Batch 10: `T23` owner handles final release candidate evidence, release docs and rollback guidance.

**Inline batches:**  
Inline order is Phase A, Phase B, Phase C, Phase D, Phase E, Phase F, Phase H, Phase I, Phase J. Use inline execution only when there is one worker or when review gates require serial approval.

**Recommended first execution slice:**  

**NEXT_STEP_HANDOFF:**  
Run `node scripts/validate-plan-artifacts.mjs --file docs/plans/2026-05-01-supervibe-plugin-remediation.md`. If it passes, request review of this plan. After approval, start `T1` and keep writes limited to the plugin repo unless the user explicitly authorizes a separate target project.

