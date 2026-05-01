# Supervibe User Feedback Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `supervibe:project-memory`, `supervibe:code-search`, `supervibe:verification`, and `supervibe:pre-pr-check` before release.

**Goal:** Close the 12-point user feedback report by making genesis, host artifacts, agent routing, rules, indexing, docs, adapt/update, and retrieval discipline understandable, provider-adaptive, and verifiable.

**Architecture:** Treat Supervibe as a host-adapter framework, not a Claude-only package. Centralize host terminology, generated instruction content, agent roster data, index configuration, and update/adapt drift evidence in reusable scripts so README, genesis, commands, skills, agents, and validators cannot drift independently.

**Tech Stack:** Node ESM, `node:test`, YAML frontmatter, SQLite-backed Supervibe memory/RAG/code graph, Chokidar watcher, markdown docs and command/skill artifacts.

**Constraints:** Preserve user-owned host instructions outside managed blocks, keep `.supervibe/memory/` as project-local state, do not silently install all agents, do not create Claude-only paths for Codex/Gemini/Cursor/OpenCode projects, keep generated artifacts diff-gated, and run `npm run check` before release.

---

## Research Evidence

### Local Findings

| Feedback area | Evidence | Finding |
|---|---|---|
| Agent visibility in genesis | `scripts/lib/supervibe-agent-recommendation.mjs`, `commands/supervibe-genesis.md`, `README.md` | The recommendation engine selects groups and agents, but formatted output only lists ids, not role summaries or user-facing responsibilities. README has command list but no full agent roster. |
| Dry dialogue | `.supervibe/memory/patterns/2026-05-01-beginner-friendly-dialogue-actions.md`, `scripts/lib/supervibe-dialogue-contract.mjs`, `commands/supervibe-genesis.md` | A prior 10/10 memory already says interactive flows must use outcome-oriented labels. Genesis still needs richer "what I found, why it matters, next choice" summaries for non-expert users. |
| Claude hardcodes | `git grep` found 138 `CLAUDE.md` mentions, 366 `CLAUDE_PLUGIN_ROOT` mentions, and 88 `.claude` mentions across agents, skills, rules, commands, docs, templates | Core code has host adapters, but shipped agent/skill/rule text still teaches Claude-only paths and env vars. This misleads Codex, Gemini, Cursor, and OpenCode. |
| Rules too shallow | `rules/no-dead-code.md` | The rule covers general symbol liveness and a few tools, but does not cover stack-specific warnings-as-dead-code, unused routes/components/jobs/migrations, orphan generated artifacts, or framework analyzer warnings. |
| Brainstorming depth | `skills/brainstorming/SKILL.md` | It already has decomposition and matrix sections, but does not explicitly present a transparent interview loop, user collaboration state, or 10/10 readiness rubric in plain dialogue. |
| Install docs | `README.md`, `docs/getting-started.md` | Install exists, but README does not clearly say "first install plugin, restart CLI, run `/supervibe-genesis`, then choose profile, then run status". |
| Generated host files | `templates/claude-md/_base.md.tpl`, `renderManagedInstruction` in `supervibe-agent-recommendation.mjs`, root `GEMINI.md` | Root plugin contexts are richer than generated project blocks. Generated managed blocks are minimal and do not encode current best practices for AGENTS/CLAUDE/GEMINI. |
| Index cadence and excludes | `scripts/lib/code-watcher.mjs`, `scripts/lib/supervibe-index-policy.mjs`, `scripts/session-start-check.mjs` | PostToolUse reindexes touched files, SessionStart does mtime scan, watcher events are real-time. There is no `.supervibe/memory` user config for index excludes and no explicit 5-minute polling fallback while watcher runs. |
| Project update/adapt | `commands/supervibe-adapt.md`, `skills/adapt/SKILL.md`, `scripts/lib/supervibe-state-detector.mjs` | Version-bump detection can propose `/supervibe-adapt`, but users do not see a simple update sequence, per-file drift classification, or why project copies are not wiped. |
| Agent retrieval discipline | `agents/*`, `scripts/audit-evidence-citations.mjs`, `tests/agent-rag-discipline.test.mjs` | Agents usually include memory/RAG/codegraph steps, but wording depends on `$CLAUDE_PLUGIN_ROOT`; audit telemetry needs docs and release gate visibility. |

### External Sources

- OpenAI Codex documents `AGENTS.md` discovery, override precedence, 32 KiB default instruction cap, nested project instructions, and verification commands for loaded instruction sources: https://developers.openai.com/codex/guides/agents-md
- The AGENTS.md open format positions `AGENTS.md` as a README for agents with setup commands, tests, conventions, security notes, and nested monorepo guidance: https://agents.md/
- Claude Code docs say `CLAUDE.md` is advisory context, should stay specific and concise, should import shared instructions when needed, and Claude Code reads `CLAUDE.md` rather than `AGENTS.md`: https://code.claude.com/docs/en/memory
- Claude best practices emphasize verification, explore -> plan -> code, concise CLAUDE.md, on-demand skills, subagents for investigation, and early course correction: https://code.claude.com/docs/en/best-practices
- Claude subagent docs define frontmatter, project/user/plugin scopes, tool restrictions, and description-driven delegation: https://code.claude.com/docs/en/sub-agents
- Claude skills docs emphasize progressive disclosure, concise descriptions, optional supporting files, and skill loading behavior: https://code.claude.com/docs/en/skills
- Gemini CLI docs describe hierarchical `GEMINI.md` context, `/memory show`, imports, and configurable `context.fileName` including `AGENTS.md`: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md
- Cursor docs define Project Rules in `.cursor/rules`, `AGENTS.md` as a simpler root-only alternative in current docs, and metadata-backed rule attachment: https://docs.cursor.com/en/context
- OpenCode docs define AGENTS/CLAUDE fallback precedence, custom `instructions`, markdown agents, permissions, and skill discovery paths including `.opencode`, `.claude`, and `.agents`: https://opencode.ai/docs/rules/ and https://opencode.ai/docs/agents/ and https://opencode.ai/docs/skills/

---

## AI/Data Boundary

| Area | Allowed | Redaction | Approval gate |
|------|---------|-----------|---------------|
| Local source reads | Yes | Do not expose absolute user paths in public docs, changelog, commit messages, or release notes | No extra approval; this plan is repo-maintenance work |
| Local writes | Yes | Only tracked repo docs, scripts, tests, rules, skills, agents, templates, package metadata, changelog, and memory entry | Writes are scoped to this plan and verified by git diff |
| MCP/browser automation | No MCP required | No browser screenshots or private UI data | Approval required before adding browser artifacts |
| Figma/design source | No | No design assets used | Approval required before design writeback |
| External network/API | Yes for official docs research and git push | Cite source URLs only; no copied long passages | Git push is explicitly requested by the user |
| PII/secrets | No access | Do not print env values, tokens, home directories, or secret-like files | Stop if any secret-like content is encountered |

**Blocked without exact approval:** production mutation, destructive migration, credential changes, billing/account/DNS/access-control changes, Figma writeback, and screenshots containing private data.

---

## File Structure

### Created

```text
docs/plans/2026-05-02-supervibe-user-feedback-hardening.md
docs/agent-roster.md
scripts/lib/supervibe-agent-roster.mjs
scripts/lib/supervibe-index-config.mjs
tests/agent-roster-docs.test.mjs
tests/index-config-policy.test.mjs
```

### Modified

- `README.md` - add first-run path, update/adapt path, and visible agent roster section.
- `CHANGELOG.md` - add release notes for the hardening pass.
- `package.json` and `package-lock.json` - bump patch version and add any validation script if needed.
- `commands/supervibe-genesis.md` - make genesis dialogue user-facing and agent-role transparent.
- `commands/supervibe-adapt.md` and `commands/supervibe-update.md` - clarify plugin update versus project artifact adaptation.
- `skills/genesis/SKILL.md` - require visible role roster and richer dry-run explanations.
- `skills/adapt/SKILL.md` - require upstream/project/both-changed classification with clean apply/skip/archive options.
- `skills/brainstorming/SKILL.md` - add transparent interview loop and 10/10 readiness dialogue.
- `skills/code-search/SKILL.md`, `skills/project-memory/SKILL.md`, and `skills/verification/SKILL.md` - replace Claude-only command assumptions with resolved Supervibe tool paths.
- `rules/no-dead-code.md` - expand stack-specific dead-code, warnings, and unwired-functionality coverage.
- `rules/rule-maintenance.md`, `rules/agent-install-profiles.md`, `rules/git-discipline.md`, `rules/pre-commit-discipline.md` - replace Claude-only path language with selected host adapter language.
- `scripts/lib/supervibe-agent-recommendation.mjs` - expose role summaries, selected groups, update marker artifact, and stronger generated managed instruction content.
- `scripts/lib/supervibe-index-policy.mjs` and `scripts/lib/code-watcher.mjs` - read `.supervibe/memory/index-config.json`, apply excludes, and add 5-minute polling fallback.
- `scripts/supervibe-status.mjs` - show index config path, exclude count, and polling cadence.
- `docs/getting-started.md` and `docs/references/host-adapter-matrix.md` - document provider-specific instruction behavior and project update workflow.
- `agents/**`, `skills/**`, `rules/**` - mechanically normalize misleading `CLAUDE.md`, `.claude`, and `$CLAUDE_PLUGIN_ROOT` references where they are not host-specific documentation examples.
- `.supervibe/memory/solutions/2026-05-02-user-feedback-hardening.md` - record durable learning after release.

---

## Critical Path

`T1 -> T2 -> T3 -> T4 -> T5 -> T8 -> T9 -> T10 -> T11 -> T12` (sequential release path)

Off-path: T6 || T7 can run after T2 because docs and rule expansion do not block index config work. T10 can run after T8. T12 runs last after T11 verification is green.

---

## Scope Safety Gate

- **Approved scope baseline:** Address all 12 user feedback points through docs, command/skill/rule hardening, host portability normalization, generated genesis output, agent roster visibility, index config, update/adapt clarity, retrieval discipline, version bump, changelog, commit, and push.
- **Deferred scope:** Building a full interactive TUI wizard for genesis/adapt is deferred; the production-safe slice is improved text contracts, dry-run data, docs, and tests.
- **Deferred scope:** Full semantic rewrite of all 89 agents by hand is deferred; the production-safe slice is mechanical host-portability normalization plus targeted template and high-risk artifact updates.
- **Rejected scope:** Deleting project-installed agents during adapt is rejected because users fear data loss; adapt must classify, diff, archive, or skip with explicit confirmation.
- **Rejected scope:** Auto-installing every specialist agent by default is rejected because it increases noise and user confusion; profiles and add-ons stay explicit.
- **Tradeoff:** The first release optimizes clarity and guardrails over a large UI rewrite; tests and docs prevent the same drift from returning.
- **Scope expansion rule:** any new feature beyond the listed files requires a scope-change note with user outcome, evidence, complexity cost, tradeoff, owner, verification, rollout, and rollback.
- **Execution stop condition:** if a task needs destructive cleanup of user project artifacts, stop and re-plan instead of silently applying it.

---

## Delivery Strategy

- **SDLC flow:** discovery -> plan -> verified implementation -> regression checks -> release metadata -> commit -> push -> memory entry.
- **MVP path:** one patch release that makes first-run, update/adapt, and provider behavior understandable without requiring a separate UI.
- **Phase model:** Phase A foundation and config, Phase B docs and dialogue, Phase C portability and rules, Phase D verification and release.
- **Launch model:** one-shot patch release on `main`; users get it through existing installer/update flow.
- **Production target:** no regression in `npm run check`; docs and generated output align with the current 89-agent registry and host adapter matrix.

---

## Production Readiness

- **Test:** add focused `node:test` coverage for agent roster docs and index config; run targeted tests and `npm run check`.
- **Security/privacy:** keep index excludes local under `.supervibe/memory`, preserve secret/local-config default skips, avoid absolute paths in public docs, and keep update/adapt diff-gated.
- **Performance:** watcher polling fallback defaults to 5 minutes and reuses mtime scans; event-based watcher remains primary; no fixed total timeout is added to full index builds.
- **Observability:** `supervibe:status` reports watcher state, polling cadence, config path, exclude count, and repair actions.
- **Rollback:** each task is reversible with `git revert <sha>` after the final commit; no database migrations or destructive file deletes are planned.
- **Release:** bump patch version, update changelog, update memory, run full checks, commit to main, and push to origin.

---

## Final 10/10 Acceptance Gate

- [ ] 10/10 acceptance: every one of the 12 feedback points maps to at least one changed artifact and one verification signal.
- [ ] Verification: targeted tests and `npm run check` pass with captured output.
- [ ] No open blockers: remaining deferred items are documented as explicit non-goals, not hidden gaps.
- [ ] Host portability: agents, skills, and rules no longer teach Claude-only paths where provider-neutral wording is required.
- [ ] Genesis clarity: README and genesis dry-run output expose selected agent groups, agent responsibilities, profile tradeoffs, and next user actions.
- [ ] Index config: `.supervibe/memory/index-config.json` is documented, honored by index policy, and includes a 5-minute polling fallback.
- [ ] Update/adapt clarity: README and adapt command explain how to update plugin source and sync project-installed agents/rules/skills without wiping local customizations.
- [ ] Production readiness: security, performance, observability, rollback, docs, and support gates pass.
- [ ] Plan reread: compare final implementation against this plan and fix deviations before handoff.

---

## Task 1: Plan Artifact And Coverage Matrix

**Files:**
- Create: `docs/plans/2026-05-02-supervibe-user-feedback-hardening.md`
- Modify: none
- Test: `scripts/validate-plan-artifacts.mjs`

**Estimated time:** 15min (confidence: high)
**Rollback:** remove the plan file before commit, or `git revert <sha>` after commit.
**Risks:** R1: plan misses one feedback item; mitigation: add a 12-row coverage matrix and run validator plus manual reread.

- [ ] **Step 1: Write failing test**
```powershell
node scripts/validate-plan-artifacts.mjs --file docs/plans/2026-05-02-supervibe-user-feedback-hardening.md
```

- [ ] **Step 2: Run test, verify fail before the plan exists**
```text
Expected output: FAIL or file-not-found before this plan is created.
```

- [ ] **Step 3: Create the plan with all required validator sections**
```text
Add this file under docs/plans with concrete tasks, evidence, scope gate, and acceptance gate.
```

- [ ] **Step 4: Run test, verify pass**
```powershell
node scripts/validate-plan-artifacts.mjs --file docs/plans/2026-05-02-supervibe-user-feedback-hardening.md
```

- [ ] **Step 5: No commit yet**
```text
Commit suppressed until all planned changes pass final verification.
```

---

## Task 2: Agent Roster Data And Generated Docs

**Files:**
- Create: `scripts/lib/supervibe-agent-roster.mjs`
- Create: `docs/agent-roster.md`
- Create: `tests/agent-roster-docs.test.mjs`
- Modify: `README.md`
- Test: `tests/agent-roster-docs.test.mjs`

**Estimated time:** 1h (confidence: high)
**Rollback:** `git revert <sha>` or remove the created files and README section.
**Risks:** R1: roster drifts from actual agent files; mitigation: test generated docs against `agents/**/*.md`. R2: README becomes too long; mitigation: README has grouped summary and links to full roster.

- [ ] **Step 1: Write failing test**
```javascript
// tests/agent-roster-docs.test.mjs
// Assert docs/agent-roster.md lists every agent id from agents/**/*.md,
// README links to docs/agent-roster.md, and count equals 89.
```

- [ ] **Step 2: Run test, verify fail**
```powershell
node --test tests/agent-roster-docs.test.mjs
```

- [ ] **Step 3: Add roster library and generated docs**
```text
Read frontmatter name, namespace folder, description block, and path. Emit grouped markdown with "when to use" summaries.
```

- [ ] **Step 4: Add README first-run and roster sections**
```text
Add "First run", "Choose agents during genesis", and "Available agents" sections with a link to docs/agent-roster.md.
```

- [ ] **Step 5: Run test, verify pass**
```powershell
node --test tests/agent-roster-docs.test.mjs
```

- [ ] **Step 6: No commit yet**
```text
Commit suppressed until final check.
```

---

## Task 3: Genesis Role Transparency And Managed Host Context

**Files:**
- Modify: `scripts/lib/supervibe-agent-recommendation.mjs`
- Modify: `commands/supervibe-genesis.md`
- Modify: `skills/genesis/SKILL.md`
- Modify: `tests/genesis-desktop-fixture.test.mjs`
- Test: `tests/genesis-desktop-fixture.test.mjs`

**Estimated time:** 1h (confidence: high)
**Rollback:** `git revert <sha>` after final commit.
**Risks:** R1: dry-run output becomes verbose; mitigation: keep machine block stable and add concise user-facing explanation fields. R2: generated managed block duplicates root docs; mitigation: include only selected profile, selected agents, rules, skills, next actions, and host-specific caveats.

- [ ] **Step 1: Write failing test**
```javascript
// Extend genesis dry-run test:
// report.agentProfile.agentGroups[*].agents[*] has id, label, responsibility.
// formatGenesisDryRunReport includes AGENT_ROLES and UPDATE_ADAPT_NEXT.
// generated managed instruction mentions selected host instruction file and preserve-user-owned content.
```

- [ ] **Step 2: Run test, verify fail**
```powershell
node --test tests/genesis-desktop-fixture.test.mjs
```

- [ ] **Step 3: Add role summaries to recommendation output**
```text
Create concise responsibility text per agent from frontmatter/body fallback and include selected/deferred/missing status.
```

- [ ] **Step 4: Strengthen genesis docs**
```text
Document "what I detected", "why these agents", "what will be written", and "what to do next" dialogue contract.
```

- [ ] **Step 5: Run test, verify pass**
```powershell
node --test tests/genesis-desktop-fixture.test.mjs
```

- [ ] **Step 6: No commit yet**
```text
Commit suppressed until final check.
```

---

## Task 4: Index Config And Five-Minute Polling Fallback

**Files:**
- Create: `scripts/lib/supervibe-index-config.mjs`
- Create: `tests/index-config-policy.test.mjs`
- Modify: `scripts/lib/supervibe-index-policy.mjs`
- Modify: `scripts/lib/code-watcher.mjs`
- Modify: `scripts/supervibe-status.mjs`
- Modify: `docs/getting-started.md`
- Test: `tests/index-config-policy.test.mjs`, `tests/index-watcher-lifecycle.test.mjs`, `tests/supervibe-status.test.mjs`

**Estimated time:** 1h (confidence: medium)
**Rollback:** `git revert <sha>` after final commit.
**Risks:** R1: custom excludes accidentally override privacy defaults; mitigation: apply privacy/default skips before user includes, and never allow secrets by config. R2: polling adds overhead; mitigation: default 5-minute interval, mtime-only scans, timer unref.

- [ ] **Step 1: Write failing test**
```javascript
// tests/index-config-policy.test.mjs
// Create .supervibe/memory/index-config.json with exclude globs.
// Assert discoverSourceFiles excludes matching path and reports user-exclude.
// Assert default scanIntervalMinutes is 5.
```

- [ ] **Step 2: Run test, verify fail**
```powershell
node --test tests/index-config-policy.test.mjs
```

- [ ] **Step 3: Implement config loader**
```text
Read .supervibe/memory/index-config.json. Support exclude globs, scanIntervalMinutes default 5, and diagnostics with config path.
```

- [ ] **Step 4: Wire policy, watcher, and status**
```text
Index policy uses config excludes. Watcher runs mtime fallback every configured interval. Status shows config and interval.
```

- [ ] **Step 5: Run tests, verify pass**
```powershell
node --test tests/index-config-policy.test.mjs tests/index-watcher-lifecycle.test.mjs tests/supervibe-status.test.mjs
```

- [ ] **Step 6: No commit yet**
```text
Commit suppressed until final check.
```

---

## Task 5: Host-Portability Normalization

**Files:**
- Modify: `agents/**/*.md`
- Modify: `skills/**/*.md`
- Modify: `rules/**/*.md`
- Modify: `commands/*.md`
- Modify: `docs/references/host-adapter-matrix.md`
- Test: `tests/supervibe-project-state-root.test.mjs`, `tests/repo-portability-and-install-channel.test.mjs`

**Estimated time:** half-day (confidence: medium)
**Rollback:** `git revert <sha>` after final commit.
**Risks:** R1: mechanical rewrite damages provider-specific examples; mitigation: keep official host examples in docs and normalize only misleading operational instructions. R2: validation misses future hardcodes; mitigation: add or extend tests if feasible without false positives.

- [ ] **Step 1: Write failing test**
```javascript
// Extend portability/state-root checks to reject $CLAUDE_PLUGIN_ROOT,
// .claude/code.db, and mandatory CLAUDE.md wording in agents/skills/rules unless marked as host-specific example.
```

- [ ] **Step 2: Run test, verify fail**
```powershell
node --test tests/supervibe-project-state-root.test.mjs tests/repo-portability-and-install-channel.test.mjs
```

- [ ] **Step 3: Normalize text**
```text
Replace operational instructions with "selected host instruction file", "selected host rules folder", and "resolved Supervibe plugin root".
```

- [ ] **Step 4: Preserve legitimate host docs**
```text
Keep host adapter matrix, README install paths, and official provider examples explicit where they explain compatibility.
```

- [ ] **Step 5: Run tests, verify pass**
```powershell
node --test tests/supervibe-project-state-root.test.mjs tests/repo-portability-and-install-channel.test.mjs
```

- [ ] **Step 6: No commit yet**
```text
Commit suppressed until final check.
```

---

## Task 6: No-Dead-Code Rule Expansion

**Files:**
- Modify: `rules/no-dead-code.md`
- Modify: `rules/no-half-finished.md` if cross-link wording needs alignment
- Test: `npm run validate:frontmatter`

**Estimated time:** 15min (confidence: high)
**Rollback:** `git revert <sha>` after final commit.
**Risks:** R1: rule becomes too broad to act on; mitigation: structure by stack and detection command, with explicit exceptions for public API and generated code.

- [ ] **Step 1: Write failing test**
```powershell
Select-String -Path rules/no-dead-code.md -Pattern "Warnings count as dead-code signals"
```

- [ ] **Step 2: Run test, verify fail**
```text
Expected output: no match before the rule is expanded.
```

- [ ] **Step 3: Expand stack matrix**
```text
Add JS/TS, Python, Go, Rust, PHP/Laravel, Rails, .NET, Java/Spring, mobile, database, queue, and UI route/component examples.
```

- [ ] **Step 4: Validate frontmatter**
```powershell
npm run validate:frontmatter
```

- [ ] **Step 5: No commit yet**
```text
Commit suppressed until final check.
```

---

## Task 7: Brainstorming And Dialogue Contract

**Files:**
- Modify: `skills/brainstorming/SKILL.md`
- Modify: `scripts/lib/supervibe-dialogue-contract.mjs` if existing labels need richer metadata
- Modify: `tests/dialogue-contract.test.mjs` if script changes
- Test: `tests/dialogue-contract.test.mjs`, `npm run validate:question-discipline`

**Estimated time:** 30min (confidence: high)
**Rollback:** `git revert <sha>` after final commit.
**Risks:** R1: skill becomes process-heavy for small tasks; mitigation: keep minimal brainstorm path and add depth only for ambiguous or high-risk work.

- [ ] **Step 1: Write failing test**
```powershell
Select-String -Path skills/brainstorming/SKILL.md -Pattern "transparent interview loop"
```

- [ ] **Step 2: Run test, verify fail**
```text
Expected output: no match before the skill is updated.
```

- [ ] **Step 3: Add user-collaboration loop**
```text
Add visible current-state summary, hard-question queue, decision log, unresolved assumptions, and readiness score before plan handoff.
```

- [ ] **Step 4: Run validators**
```powershell
npm run validate:question-discipline
node --test tests/dialogue-contract.test.mjs
```

- [ ] **Step 5: No commit yet**
```text
Commit suppressed until final check.
```

---

## Task 8: Update And Adapt Workflow Clarity

**Files:**
- Modify: `commands/supervibe-update.md`
- Modify: `commands/supervibe-adapt.md`
- Modify: `skills/adapt/SKILL.md`
- Modify: `scripts/lib/supervibe-state-detector.mjs` if marker wording is stale
- Modify: `README.md`
- Modify: `docs/getting-started.md`
- Test: `tests/supervibe-state-detector.test.mjs`

**Estimated time:** 1h (confidence: medium)
**Rollback:** `git revert <sha>` after final commit.
**Risks:** R1: users confuse plugin update with project artifact sync; mitigation: document two commands and state which files each touches. R2: adapt promise exceeds implementation; mitigation: describe current diff-gated workflow and explicit limitations.

- [ ] **Step 1: Write failing test**
```javascript
// Extend state detector test to assert version marker says /supervibe-adapt
// pulls upstream project artifact updates, not full reinstall or deletion.
```

- [ ] **Step 2: Run test, verify fail if wording is stale**
```powershell
node --test tests/supervibe-state-detector.test.mjs
```

- [ ] **Step 3: Update commands and docs**
```text
Add "Update plugin" then "Adapt project" sequence, direct-update, merge, keep, archive, delete classifications, and no-wipe guarantee.
```

- [ ] **Step 4: Run test, verify pass**
```powershell
node --test tests/supervibe-state-detector.test.mjs
```

- [ ] **Step 5: No commit yet**
```text
Commit suppressed until final check.
```

---

## Task 9: Retrieval Discipline And Audit Visibility

**Files:**
- Modify: `skills/code-search/SKILL.md`
- Modify: `skills/project-memory/SKILL.md`
- Modify: `skills/verification/SKILL.md`
- Modify: `README.md`
- Modify: `docs/getting-started.md`
- Test: `tests/agent-rag-discipline.test.mjs`, `tests/audit-evidence-citations.test.mjs`

**Estimated time:** 30min (confidence: high)
**Rollback:** `git revert <sha>` after final commit.
**Risks:** R1: agents still skip retrieval because commands look provider-specific; mitigation: use skill-first language and resolved plugin root fallback.

- [ ] **Step 1: Write failing test**
```powershell
node --test tests/agent-rag-discipline.test.mjs tests/audit-evidence-citations.test.mjs
```

- [ ] **Step 2: Verify baseline**
```text
Expected output: either pass or expose exact missing retrieval discipline issue.
```

- [ ] **Step 3: Update docs and skills**
```text
State that every non-trivial task starts with project memory and code search; codegraph is mandatory for public-surface refactors; audit command reports actual usage rates.
```

- [ ] **Step 4: Run tests, verify pass**
```powershell
node --test tests/agent-rag-discipline.test.mjs tests/audit-evidence-citations.test.mjs
```

- [ ] **Step 5: No commit yet**
```text
Commit suppressed until final check.
```

---

## Task 10: README First-Run, Agent, Index, And Update Sections

**Files:**
- Modify: `README.md`
- Modify: `docs/getting-started.md`
- Test: `tests/readme-language-switch.test.mjs`, `tests/readme-autonomous-loop-docs.test.mjs`, `tests/agent-roster-docs.test.mjs`

**Estimated time:** 1h (confidence: high)
**Rollback:** `git revert <sha>` after final commit.
**Risks:** R1: README duplicates docs/getting-started; mitigation: README gives short paths and links to detailed docs.

- [ ] **Step 1: Write failing test**
```javascript
// agent-roster-docs.test covers README link and first-run section.
```

- [ ] **Step 2: Run test, verify fail before docs update**
```powershell
node --test tests/agent-roster-docs.test.mjs
```

- [ ] **Step 3: Add README sections**
```text
Add "Start here", "What genesis asks", "Which agents exist", "Index config", and "After plugin update".
```

- [ ] **Step 4: Run tests, verify pass**
```powershell
node --test tests/readme-language-switch.test.mjs tests/readme-autonomous-loop-docs.test.mjs tests/agent-roster-docs.test.mjs
```

- [ ] **Step 5: No commit yet**
```text
Commit suppressed until final check.
```

---

## Task 11: Full Verification

**Files:**
- Modify: no source changes unless verification exposes defects
- Test: all project checks

**Estimated time:** 1h (confidence: medium)
**Rollback:** fix failing task or revert the offending change before release.
**Risks:** R1: full check exposes existing failures; mitigation: capture output and only claim completion after green, or report separate pre-existing failure if baseline evidence exists.

- [ ] **Step 1: Failing-test-first release audit**
```powershell
node --test tests/genesis-desktop-fixture.test.mjs tests/index-config-policy.test.mjs tests/agent-roster-docs.test.mjs tests/supervibe-state-detector.test.mjs
```

Expected output: this targeted failing test regression suite exposes any remaining implementation failure before the full project check; after fixes it passes.

- [ ] **Step 2: Run full check**
```powershell
npm run check
```

- [ ] **Step 3: Fix failures from this change**
```text
Use test output to adjust implementation and rerun failing command.
```

- [ ] **Step 4: Commit remains suppressed**
```text
Commit suppressed until version and changelog are updated.
```

---

## Task 12: Version, Changelog, Memory, Commit, Push

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Create: `.supervibe/memory/solutions/2026-05-02-user-feedback-hardening.md`
- Test: `npm run check`, `git status --short`, `git push`

**Estimated time:** 30min (confidence: high)
**Rollback:** `git revert <sha>` after commit; remote rollback by reverting and pushing a follow-up commit.
**Risks:** R1: version drift across package files; mitigation: use `npm version patch --no-git-tag-version` or equivalent and run version tests. R2: push rejected due remote changes; mitigation: stop and report, do not rebase or force-push without explicit approval.

- [ ] **Step 1: Write failing test**
```powershell
node --test tests/version-surface-sync.test.mjs
```

- [ ] **Step 2: Bump patch version**
```powershell
npm version patch --no-git-tag-version
```

- [ ] **Step 3: Update changelog and memory**
```text
Add release notes and durable learning with evidence, tags, confidence 10.
```

- [ ] **Step 4: Run final verification**
```powershell
npm run check
git status --short
```

- [ ] **Step 5: Commit and push**
```powershell
git add .
git commit -m "fix: harden supervibe onboarding and host portability"
git push origin main
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| 1. Genesis does not show agents or responsibilities | T2, T3, T10 |
| 2. Genesis steps are dry and not collaborative | T3, T7, T10 |
| 3. Claude-only hardcodes mislead providers | T3, T5, T9 |
| 4. Rules do not cover enough real cases | T6 |
| 5. Brainstorming is not proactive enough for 10/10 plans | T7 |
| 6. README lacks first install/setup path | T10 |
| 7. README lacks available agents and responsibilities | T2, T10 |
| 8. AGENTS/CLAUDE/GEMINI style files are too empty | T3, T5, T10 |
| 9. RAG/memory/codegraph cadence and exclude config | T4 |
| 10. Updating installed project artifacts is unclear | T8, T12 |
| 11. Agent-user dialogue must be more transparent | T3, T7 |
| 12. Agents may not use memory/RAG/codegraph | T5, T9, T11 |

### Placeholder scan

- No placeholder markers are intentionally left in this plan.
- All task file paths are concrete.
- All verification commands are concrete.

### Type consistency

- New scripts use Node ESM to match the repo.
- Tests use `node:test`.
- Index config uses JSON under `.supervibe/memory/`.
- Documentation uses Markdown and existing command/skill/rule frontmatter.

---

## Execution Handoff

**Inline batches:** The current session will execute all tasks inline because the user requested commit and push from `main`, and no subagent delegation was explicitly requested.

**Subagent-Driven batches:** No subagents will be spawned in this run. If a future maintainer uses subagents, split as:

- Batch 1 foundation, sequential: T1, T2, T3, T4
- Batch 2 parallel, independent docs/rules/portability: T5 || T6 || T7 || T8 || T9
- Batch 3 sequential verification and release: T10, T11, T12

NEXT_STEP_HANDOFF
Current phase: plan
Artifact: docs/plans/2026-05-02-supervibe-user-feedback-hardening.md
Next phase: implementation
Next command: inline execution in current session
Next skill: supervibe:executing-plans
Stop condition: stop only on verification failure, destructive operation risk, or push rejection
Why: The user explicitly requested plan, re-verification, implementation, version bump, changelog, commit to main, and push.
Question: Execution proceeds after plan validation.
END_NEXT_STEP_HANDOFF
