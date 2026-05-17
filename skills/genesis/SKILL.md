---
name: genesis
namespace: process
description: 'Use WHEN bootstrapping host-aware Supervibe scaffold for a new or existing project to compose stack-pack into target with confidence-gate ≥9. Triggers: ''scaffolding'', ''первичный setup'', ''init проекта'', ''genesis''.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites:
  - requirements-spec
emits-artifact: scaffold-bundle
confidence-rubric: confidence-rubrics/scaffold.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Genesis

## Overview

Genesis provides a reusable Supervibe operating method for Use WHEN bootstrapping host-aware Supervibe scaffold for a new or existing project to compose stack-pack into target with confidence-gate ≥9. Triggers: 'scaffolding', 'первичный setup', 'init проекта', 'genesis'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## When to Use

WHEN target project has no host-specific Supervibe scaffold OR no managed routing block in the selected host instruction file AND user wants Supervibe scaffolding. Triggered by `/supervibe-genesis` command.

## Shared Dialogue Contract

Lifecycle: `detected -> profile-review -> dry-run -> approved -> applied -> artifact/app/deploy verification`. Persist state in `.supervibe/memory/genesis/state.json` before every lifecycle transition. State must use layered fields: `artifactVerified`, `agentReceiptsVerified`, `appVerified`, and `deployVerified`.

Every interactive step asks one question at a time using `Step N/M` or `Step N/M`. Each question lists the recommended/default option first, gives a one-line tradeoff summary for every option, allows a free-form answer, and names the stop condition.

Default behavior: choose the safest minimal profile, no add-ons, dry-run only until the user approves. Free-form path: the user can name exact agents, rules, host files, or stack constraints instead of choosing a listed profile.

Executable path: `node scripts/supervibe-genesis.mjs --dry-run --target <project>`
is the deterministic runner for dry-run/state output; `--apply` is the only
mode that writes project scaffold files. It accepts `--profile`, `--addons`,
`--host`, `--stack-tags`, `--request`, `--generate-apps`, `--verify-apps`,
`--app-choice`, and `--json`. State writes to
`.supervibe/memory/genesis/state.json` are allowed during dry-run so
interrupt/resume has a durable checkpoint; host adapter agents/rules/skills,
settings, instructions, and stack scaffold files remain blocked until explicit
approval or `--apply`.

User-facing transparency is required. The dry-run must show selected agent groups and a one-line responsibility for each selected agent using `scripts/lib/supervibe-agent-roster.mjs` / `docs/agent-roster.md`; never show only opaque agent ids.

After every material delivery, ask one explicit next-step question about the scaffold decision. Use `buildPostDeliveryQuestion({ intent: "genesis_setup" }, { locale })` when tooling is available. Visible labels must be language-matched and domain-specific; keep internal action ids only in saved state. Never show both English and Russian in the same visible option. Never use a generic next-step prompt for Genesis.

English visible labels:
- Apply scaffold - recommended only when the dry-run host, profile, agents, rules and files look correct; write the scaffold and run index/status checks.
- Adjust install plan - user gives one focused host, profile, add-on, stack-pack, agent or rule change; rebuild dry-run without writing files.
- Compare another set - produce another profile, host or agent/rule set with explicit tradeoffs before any write.
- Review dry-run deeper - run status, audit or confidence scoring before applying the scaffold.
- Stop without installing - persist current dry-run state and exit without changing the project.

Russian visible labels are supplied by
`scripts/lib/supervibe-dialogue-contract.mjs` to keep this skill contract
ASCII-safe for validators. The ru locale must map to the same scaffold-specific
actions above and must not fall back to generic apply/revise wording.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read stack-fingerprint from `supervibe:stack-discovery`
   - On empty projects, merge explicit stack tags or request text from the user
     before falling back to manifest-only detection.
   - Resolve frontend target with `scripts/lib/frontend-target-resolver.mjs`
     before dry-run output. `next-app` means Next.js + React + TS + Tailwind
     with Turbopack, `vite-spa` means standalone React/Vite, and
     `monorepo-two-frontends` means separate explicit app dirs. If Next.js and
     Vite appear together without an explicit separate target, default to
     `next-app`, mark `vite` as an ignored stack tag for app generation, and
     still show the alternative choices.
2. Read `stack-packs/` to find matching pack
3. Read `templates/` for host instruction and settings templates
4. Run `node scripts/supervibe-status.mjs --host-diagnostics` or call `scripts/lib/supervibe-host-detector.mjs` logic before selecting an output layout. Host precedence is explicit override (`SUPERVIBE_HOST`) -> active runtime/current chat -> filesystem markers.
4. Read target project's existing files (NEVER overwrite)

## Decision tree

```
Match exact pack?
├─ YES (e.g., laravel-nextjs-postgres-redis) → use directly
└─ NO → composition algorithm:
    1. Find base pack with max overlap; do not select Redis unless stack
       evidence or an explicit add-on names Redis.
    2. Pull atomic packs from stack-packs/_atomic/ for missing slots
    3. Merge: union(agents-attach), union(rules-attach), merge(scaffold)
    4. Confidence-score the composed bundle
    5. If <9 → ask user to confirm or fall back to closest match
```

## Procedure

1. Resolve stack-pack from fingerprint
   - For `Next.js + Vite`, use the shared frontend target resolver before
     stack-pack/app generation. Next 16 uses Turbopack by default for
     `next dev` and `next build`; never generate Vite inside a single Next app
     unless the user explicitly chooses a separate frontend.
2. Compose if no exact match
   - Prefer `stack-packs/tauri-react-rust-postgres/pack.yaml` when fingerprint contains Tauri 2, React/Vite, Rust and SQLx/Postgres evidence.
3. Resolve install profile before copying agents:
   - `minimal` (recommended): orchestrator, repo-researcher, rules-curator, memory-curator, code-reviewer, quality-gate-reviewer, root-cause-debugger, selected stack developer(s), selected stack architect(s)
   - `product-design`: minimal + product, UX, copy, prototype, accessibility, polish
   - `full-stack`: all stack-pack groups
   - `research-heavy`: minimal + researcher agents for uncertain stack, stale best practices, security or dependency discovery
   - `custom`: user explicitly selects groups or individual agents
4. Resolve selectable agent groups with `scripts/lib/supervibe-agent-recommendation.mjs`; show why each group is recommended and which specialists are available, missing or deferred.
5. Resolve optional add-ons before copying agents. Default: `none`.
   - `security-audit`: adds the `/supervibe-security-audit` chain agents.
   - `ai-prompting`: adds `prompt-ai-engineer` for prompts, agent instructions, intent routing, prompt evals, and prompt-injection hardening.
   - `project-adaptation`: adds `rules-curator`, `memory-curator`, and `repo-researcher` when the user explicitly asks to adapt project rules or agents and close coverage gaps.
   - `github-actions`: creates `.github/workflows/supervibe-ci.yml`; base scaffold creates no CI workflow.
   - `gitlab-ci`: creates `.gitlab-ci.yml`; base scaffold creates no CI workflow.
   - `ci-ready`: creates provider-neutral CI readiness notes without choosing a provider.
   - `network-ops`: adds `network-router-engineer`; high-risk and never default.
   - `custom`: user explicitly selects add-on agents.
6. Resolve the host adapter from the active host instruction files and folders (the active host instruction file, `.claude`, `AGENTS.md`, `.codex`, `.cursor/rules`, `GEMINI.md`, `.gemini`, `opencode.json`) plus active CLI hints.
7. If multiple adapters are plausible, ask one host-selection question and do not write until answered.
8. For each profile-selected and add-on-selected `agents-attach` / `agent-addons` entry → copy agent file to the selected adapter's agents folder.
9. For each `rules-attach` → copy rule file to the selected adapter's rules folder, including upstream `related-rules` closure or explicitly marked external links.
10. Copy support skills referenced by selected agents or the bootstrap/adapt flow to the selected adapter's skills folder.
10a. Generate or update the selected adapter's settings file only if supported.
10b. Provider runtime config writes are user-provider-home scoped only: add missing settings to the selected provider home, preserve existing values, and never create or modify project runtime config files in provider-named folders or provider-shaped root config files.
11. Generate or update the selected adapter's instruction file through `scripts/lib/supervibe-context-migrator.mjs`, using managed block markers and preserving user-owned content.
11b. Create Supervibe-owned state under `.supervibe/memory/` only, including `.supervibe/memory/index-config.json` and `.supervibe/memory/.supervibe-version`. Do not create the legacy Claude memory path unless the user explicitly asks for migration.
9. Copy `husky/`, `commitlint.config.js`, `lint-staged.config.js` from pack
10. Generate base root policy files (`.editorconfig`, `.gitattributes`, managed `.gitignore`, `.nvmrc`) and placeholder dirs (backend/, frontend/, .supervibe/artifacts/prototypes/, docs/). Do not call them Laravel/Next/Vite skeletons until the separate approved `generate-apps` step runs real scaffolders.
11. Run `post-genesis-actions` from manifest (composer install, npm install, prepare hooks) only when the user approved those app-level commands.
11b. Keep CI optional. Do not create `.github/workflows/` unless the user chose a CI add-on.
11a. If the dry-run has `missingArtifacts`, list gaps, ask user to confirm or remediate before any write.
12. Confidence-score(scaffold-bundle) ≥9
13. Run `supervibe hook session-start` from the target project root before the final `/supervibe-status` check. This runtime-owned hook bootstraps missing Code RAG/CodeGraph and runs the mtime scan without making downstream agents own index repair. If status still reports a blocker, record it as a controller/runtime maintenance task and use the explicit status repair command outside the normal agent workflow.
13a. If full CodeGraph bootstrap is too slow or blocked, use the bounded source-readiness fallback: `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress`. Treat a graph warning as separate from source RAG readiness when `SUPERVIBE_CODE_INDEX_FRESHNESS` is ready, and record graph repair as follow-up instead of blocking scaffold success.
13b. Keep app builds separate from genesis success. Only run `npm run build` or equivalent when the user explicitly asks or the stack-pack marks it as a required post-genesis check. If it fails in existing project code, report `Project verification failed after genesis` with command, exit code, and repo-relative error paths only; do not include absolute local paths, project names, or call it unrelated without a captured pre-genesis baseline.
13c. For Next.js app generation, use `create-next-app --disable-git` whenever the target is already a Supervibe root or workspace. Record `bundler=turbopack` for `next-app`. After any approved framework scaffolder succeeds from an empty placeholder, remove nested app `.git`, archive generated app-local host files under `.supervibe/memory/genesis/`, and update genesis state with `appGenerated=true`. Set `appVerified=true` only after explicit app lint/build verification passes.
13d. Keep `agentReceiptsVerified` and the agent smoke test as a separate `--verify-agents` gate. Bootstrap dry-run/apply/generate-apps may succeed without claiming real-agent runtime completion.
14. If <9 → list gaps, ask user to confirm or remediate

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

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
