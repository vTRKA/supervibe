---
name: genesis
namespace: process
description: "Use WHEN bootstrapping host-aware Supervibe scaffold for a new or existing project to compose stack-pack into target with confidence-gate ≥9. RU: Используется КОГДА разворачиваешь host-aware scaffold для нового или существующего проекта — собирает stack-pack в таргет с confidence-gate ≥9. Trigger phrases: 'scaffolding', 'первичный setup', 'init проекта', 'genesis'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: [requirements-spec]
emits-artifact: scaffold-bundle
confidence-rubric: confidence-rubrics/scaffold.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Genesis

## When to invoke

WHEN target project has no host-specific Supervibe scaffold OR no managed routing block in the selected host instruction file AND user wants Supervibe scaffolding. Triggered by `/supervibe-genesis` command.

## Shared Dialogue Contract

Lifecycle: `detected -> profile-review -> dry-run -> approved -> applied -> verified`. Persist state in `.supervibe/memory/genesis/state.json` before every lifecycle transition.

Every interactive step asks one question at a time using `Step N/M` or `Шаг N/M`. Each question lists the recommended/default option first, gives a one-line tradeoff summary for every option, allows a free-form answer, and names the stop condition.

Default behavior: choose the safest minimal profile, no add-ons, dry-run only until the user approves. Free-form path: the user can name exact agents, rules, host files, or stack constraints instead of choosing a listed profile.

User-facing transparency is required. The dry-run must show selected agent groups and a one-line responsibility for each selected agent using `scripts/lib/supervibe-agent-roster.mjs` / `docs/agent-roster.md`; never show only opaque agent ids.

After every material delivery, ask one explicit next-step question about the scaffold decision. Use language-matched, domain-specific labels; keep internal action ids only in saved state. Never use a generic next-step prompt for Genesis.
- Apply scaffold / Применить scaffold - recommended only when the dry-run host, profile, agents, rules and files look correct; write the scaffold and run index/status checks.
- Adjust install plan / Изменить план установки - user gives one focused host, profile, add-on, stack-pack, agent or rule change; rebuild dry-run without writing files.
- Compare another set / Сравнить другой набор - produce another profile, host or agent/rule set with explicit tradeoffs before any write.
- Review dry-run deeper / Проверить dry-run глубже - run status, audit or confidence scoring before applying the scaffold.
- Stop without installing / Остановиться без установки - persist current dry-run state and exit without changing the project.

## Step 0 — Read source of truth (required)

1. Read stack-fingerprint from `supervibe:stack-discovery`
2. Read `stack-packs/` to find matching pack
3. Read `templates/` for host instruction and settings templates
4. Run `node scripts/supervibe-status.mjs --host-diagnostics` or call `scripts/lib/supervibe-host-detector.mjs` logic before selecting an output layout. Host precedence is explicit override (`SUPERVIBE_HOST`) -> active runtime/current chat -> filesystem markers.
4. Read target project's existing files (NEVER overwrite)

## Decision tree

```
Match exact pack?
├─ YES (e.g., laravel-nextjs-postgres-redis) → use directly
└─ NO → composition algorithm:
    1. Find base pack with max overlap
    2. Pull atomic packs from stack-packs/_atomic/ for missing slots
    3. Merge: union(agents-attach), union(rules-attach), merge(scaffold)
    4. Confidence-score the composed bundle
    5. If <9 → ask user to confirm or fall back to closest match
```

## Procedure

1. Resolve stack-pack from fingerprint
2. Compose if no exact match
   - Prefer `stack-packs/tauri-react-rust-postgres/pack.yaml` when fingerprint contains Tauri 2, React/Vite, Rust and SQLx/Postgres evidence.
3. Resolve install profile before copying agents:
   - `minimal` (recommended): orchestrator, repo-researcher, code-reviewer, quality-gate-reviewer, root-cause-debugger, selected stack developer(s), selected stack architect(s)
   - `product-design`: minimal + product, UX, copy, prototype, presentation, accessibility, polish
   - `full-stack`: all stack-pack groups
   - `research-heavy`: minimal + researcher agents for uncertain stack, stale best practices, security or dependency discovery
   - `custom`: user explicitly selects groups or individual agents
4. Resolve selectable agent groups with `scripts/lib/supervibe-agent-recommendation.mjs`; show why each group is recommended and which specialists are available, missing or deferred.
5. Resolve optional add-ons before copying agents. Default: `none`.
   - `security-audit`: adds the `/supervibe-security-audit` chain agents.
   - `ai-prompting`: adds `prompt-ai-engineer` for prompts, agent instructions, intent routing, prompt evals, and prompt-injection hardening.
   - `project-adaptation`: adds `rules-curator`, `memory-curator`, and `repo-researcher` when the user explicitly asks to adapt project rules or agents and close coverage gaps.
   - `network-ops`: adds `network-router-engineer`; high-risk and never default.
   - `custom`: user explicitly selects add-on agents.
6. Resolve the host adapter from the active host instruction files and folders (the active host instruction file, `.claude`, `AGENTS.md`, `.codex`, `.cursor/rules`, `GEMINI.md`, `.gemini`, `opencode.json`) plus active CLI hints.
7. If multiple adapters are plausible, ask one host-selection question and do not write until answered.
8. For each profile-selected and add-on-selected `agents-attach` / `agent-addons` entry → copy agent file to the selected adapter's agents folder.
9. For each `rules-attach` → copy rule file to the selected adapter's rules folder.
10. Copy support skills referenced by selected agents or the bootstrap/adapt flow to the selected adapter's skills folder.
10a. Generate or update the selected adapter's settings file only if supported.
11. Generate or update the selected adapter's instruction file through `scripts/lib/supervibe-context-migrator.mjs`, using managed block markers and preserving user-owned content.
11b. Create Supervibe-owned state under `.supervibe/memory/` only, including `.supervibe/memory/index-config.json` and `.supervibe/memory/.supervibe-version`. Do not create the legacy Claude memory path unless the user explicitly asks for migration.
9. Copy `husky/`, `commitlint.config.js`, `lint-staged.config.js` from pack
10. Generate skeleton dirs (backend/, frontend/, prototypes/, docs/)
11. Run `post-genesis-actions` from manifest (composer install, npm install, prepare hooks)
11a. If the dry-run has `missingArtifacts`, list gaps, ask user to confirm or remediate before any write.
12. Confidence-score(scaffold-bundle) ≥9
13. Run `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --force --health` from the target project root before the final `/supervibe-status` check. For large projects, execute the command with no fixed total timeout; heartbeat/progress lines are the liveness evidence and `.supervibe/memory/code-index.lock` prevents duplicate indexers. If the run is interrupted or embeddings/graph are too slow, inspect gaps with `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --list-missing`, then run `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --max-files 200 --health --no-embeddings` as a BM25 source-readiness fallback. In this fallback, graph work is skipped unless `--graph` is explicitly passed. Graph warning output does not fail genesis when source RAG coverage is healthy; use `--strict-index-health` only for explicit graph audits.
13a. Keep app builds separate from genesis success. Only run `npm run build` or equivalent when the user explicitly asks or the stack-pack marks it as a required post-genesis check. If it fails in existing project code, report `Project verification failed after genesis` with command, exit code, and repo-relative error paths only; do not include absolute local paths, project names, or call it unrelated without a captured pre-genesis baseline.
14. If <9 → list gaps, ask user to confirm or remediate

## Output contract

Returns:
- Generated host adapter folders, settings and instruction file for Claude, Codex, Cursor, Gemini or OpenCode
- Selected install profile, selected add-ons, final agent list, and role/responsibility summary for each selected agent
- Selected rules, selected support skills, stack-pack scaffold artifacts, and missingArtifacts
- Husky + commitlint + lint-staged configs
- Project skeleton dirs
- Confidence score
- Path to `supervibe:stack-discovery` fingerprint used

## Guard rails

- DO NOT: overwrite existing files (check before each Write; if exists → ask user merge/skip/replace)
- DO NOT: install deps without user confirm (some packs require massive installs)
- DO NOT: run migrations or seed data
- DO NOT: commit on user's behalf
- ALWAYS: confidence-gate before claiming done
- ALWAYS: log composition decisions if pack was composed

## Verification

- All files in pack manifest present in target
- Settings.json has full deny-list
- Selected host instruction file has a Supervibe managed routing block
- `node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs` shows Code RAG + Graph initialized from `.supervibe/memory/code.db` and index config refresh interval `5m`
- No legacy Claude memory path was created by default
- Husky configured

## Related

- `supervibe:stack-discovery` — produces input
- `stack-packs/` — pack definitions
- `templates/` — generators
