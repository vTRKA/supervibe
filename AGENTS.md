# AGENTS.md - Supervibe Contributor Context

This repository is the Supervibe Framework: a multi-host AI development plugin for Claude Code, Codex, Gemini, Cursor and OpenCode. It ships specialist agents, skills, rules, Code RAG, Code Graph, project memory and confidence gates.

Read `README.md` for user-facing setup. This file is the Codex entry point; Claude, Gemini, Cursor, and OpenCode have their own host instruction surfaces managed through Supervibe blocks.

## Setup

- Runtime: Node.js 22.5+ with `node:sqlite`.
- Package manager: npm.
- No Docker or native compile step is required for normal development.
- The ONNX embedding model is downloaded from HuggingFace by the installer; large model binaries are not stored in git.

Useful commands:

```bash
npm ci
npm run supervibe:status
npm run check
npm run validate:agent-content-quality
npm run validate:agent-skill-coverage
npm run validate:agent-empirical-hardening
npm run supervibe:agent-heatmap
npm run validate:agent-section-order
npm run validate:agent-tool-use-matrix
npm run validate:skill-operational-contracts
npm run validate:skill-content-quality
npm run measure:tokens:strict
node --test tests/<name>.test.mjs
node scripts/build-code-index.mjs --root . --force --health --no-embeddings
```

Detailed workflow-hardening, token-budget, and prompt-slicing guidance lives in
`docs/supervibe-workflow-hardening.md`; keep this root file focused on runtime
rules and command entry points.

## Working Rules

- Check project memory, code search and code graph before non-trivial code changes.
- Durable Supervibe plan, graph, task, and design workflows must follow the runtime work graph instead of controller shortcuts: route command-like input first, honor missing-command and hard-stop exits, keep canonical next action state aligned, and delegate named specialist work through real agents or executable producers.
- For plan, graph, and task workflows, do not run tests or validators during development. Defer `node --test`, `npm test`, `npm run check`, validator npm scripts such as `validate:*`, and `node scripts/validate-*` to the final release/merge gate; use text search and scoped diff checks while drafting.
- Do not claim 10/10 agent, skill, design-data, or system maturity unless project memory, Code RAG, and CodeGraph readiness were checked, or the output explicitly records that no prior memory/index evidence was available and why that does not reduce confidence.
- Use `validate:workflow-logic-10of10:dev` only as part of the final validation block for plan/graph/task work; `validate:workflow-logic-10of10:release` remains final release/merge gate only.
- For command-like user requests, run `node scripts/supervibe-commands.mjs --match "<user request>"` before broad source search. If the result is `INTENT: missing_slash_command` or `HARD_STOP: true`, report the missing command and stop; do not inspect source files, marketplace command files, or repository paths to emulate it.
- For ambiguous audit phrases about agents, skills, design datasets, RAG/CodeGraph, memory, or "10/10" maturity, route to `/supervibe-audit` before plan review unless the user explicitly references an existing plan artifact.
- For every claimed Supervibe command, skill, agent, reviewer, worker, validator, or external-tool invocation, create a runtime-issued workflow receipt with `node scripts/workflow-receipt.mjs issue ...`; hand-written receipts are untrusted and `npm run validate:workflow-receipts` must pass before claiming delegated work is complete.
- Inline/manual drafts are diagnostic only. If a workflow names a producer agent, worker, reviewer, validator, executable skill producer, or external tool, use the real host/tool path whenever available and bind the result with runtime receipts. A receipt proves only the invocation it names; command, skill, and question-proposal receipts cannot substitute for agent, worker, reviewer, validator, or durable artifact proof.
- For Codex active durable workflow steps, invoke named Supervibe specialists through `spawn_agent`, record the returned Codex agent id, and issue receipts with `hostInvocation.source=codex-spawn-agent` plus that invocation id. Generic worker/explorer substitutions and controller-authored inline outputs never satisfy specialist proof.
- For non-trivial test creation or expansion, including `tests/*.test.mjs`, route test design or review through `qa-test-engineer` and any relevant domain specialist, using `supervibe:test-strategy` when scenario coverage is not obvious. Controller-authored tests are diagnostic until a specialist has checked happy path, failure path, boundary/null, regression case, and provider/host variants where applicable, with runtime evidence or receipts recorded for durable claims.
- Keep Codex behavior consistent by treating `AGENTS.md` as concise policy. Shipped Supervibe plugin agents live under tracked `agents/`; `.codex/agents/` is only for Codex-local adapter prompts when needed, not production agent storage. Validate runtime enforcement via `node scripts/command-agent-plan.mjs --strict` and `npm run validate:command-agent-enforcement` instead of ad hoc local conventions.
- For skill-owned durable design-system outputs, use executable producers such as `node scripts/brandbook-producer.mjs run ...`; use `workflow-receipt.mjs reissue`, `workflow-receipt.mjs prune-stale --apply`, `workflow-receipt.mjs rebuild-ledger`, and `workflow-receipt.mjs recovery-status` for repair/recovery instead of editing receipt JSON or the ledger by hand.
- For `/supervibe-design`, never show a user option id that `node scripts/design-wizard-answer.mjs` cannot accept. If a trusted specialist proposal exists but the wizard queue is still fallback, stop and repair/import the proposal before asking or recording the answer.
- `/supervibe-design` has one canonical next action. Runtime state, `design-agent-plan`, prewrite manifests, and status output must agree on the next question/action; if they disagree, repair state instead of continuing.
- Resolve design target before durable design artifacts. Website/landing briefs resolve to `target=web`; Tauri/Electron/desktop briefs require desktop viewport policy; mobile-native briefs require mobile platform assumptions.
- Domain evidence is mandatory before creative defaults for legal, finance, health, government, security, and other regulated-trust briefs. Use design-intelligence/project-memory/code evidence before accepting palette, typography, copy-risk, or trust defaults.
- A specialist question proposal receipt is not durable progress. It can unlock a wizard question; it cannot substitute for `direction.md`, tokens, styleboard, prototype, reviewer, or approval receipts.
- Keep production guidance free of internal initiative names, task ids, temporary evidence paths, and source-only rationale unless those labels are part of the public user contract.
- Preserve user-owned sections in host instruction files. Supervibe managed blocks are updated through `scripts/lib/supervibe-context-migrator.mjs`.
- Use host-neutral wording in shared agents, skills and rules. Do not assume any provider-specific folder, instruction file, or plugin root unless the artifact is explicitly adapter-specific.
- Provider runtime configs are user-provider-home scoped only. Genesis and Adapt may add missing settings to the selected user provider config, such as `CODEX_HOME/config.toml` or `~/.codex/config.toml`, and must never create or mutate project runtime configs such as `.codex/config.toml`, `.claude/settings*.json`, or root `config.toml`.
- When adding or changing agents/skills, preserve explicit skill coverage: every agent needs at least 4 skills, at least 2 foundational skills, at least 1 specialist skill, a `## Skills` explanation for each declared skill, and every skill under `skills/` needs at least one owning agent. Run `npm run validate:agent-skill-coverage`.
- Agent quality is empirical, not pass/fail only: keep generated per-agent eval packs, capability heatmap rows, freshness gates, stack fixtures, Russian routing corpus, and critical-agent playbooks green via `npm run validate:agent-empirical-hardening` and inspect scores with `npm run supervibe:agent-heatmap`.
- Keep generated project state under `.supervibe/memory/`.
- Terminal/file I/O is governed by `rules/terminal-file-io.md`, `.editorconfig`, and `.gitattributes`: write text as UTF-8 with LF, prefer Node `fs.writeFile(..., "utf8")`, and avoid legacy PowerShell redirection for non-ASCII or machine-readable files. Use `Set-Content -Encoding utf8` only when PowerShell writes are unavoidable. Machine-readable approval evidence should use ASCII strings unless preserving exact user text is required.
- Do not claim completion without a verification command.
- Do not revert unrelated user changes.

## Agent And Artifact Map

- Agents: 96 files under `agents/`; human-readable role map in `docs/agent-roster.md`; content-quality, skill-coverage, empirical-hardening, section-order and tool-use gates in `scripts/validate-agent-content-quality.mjs`, `scripts/validate-agent-skill-coverage.mjs`, `scripts/validate-agent-empirical-hardening.mjs`, `scripts/validate-agent-section-order.mjs`, and `scripts/validate-agent-tool-use-matrix.mjs`.
- Skills: 64 folders under `skills/`; every skill needs at least one agent owner; operational/content-quality gates in `scripts/validate-skill-operational-contracts.mjs` and `scripts/validate-skill-content-quality.mjs`.
- Rules: 31 files under `rules/`.
- Confidence rubrics: 19 YAML files under `confidence-rubrics/`.
- Commands: 19 files under `commands/`.
- Core libraries: `scripts/lib/`.
- Tests: `tests/*.test.mjs`.

## Verification Expectations

For narrow non-workflow changes, run the targeted `node --test` command that covers the edited module. For plan, graph, and task workflows, defer targeted tests and validators to the final release validation block. Before release or commit, run:

```bash
npm run check
```

If `npm run check` fails, report the failing command and keep the fix scoped to failures caused by the current change unless the user explicitly asks for broader cleanup.
