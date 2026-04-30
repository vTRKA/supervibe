---
name: genesis
namespace: process
description: "Use WHEN bootstrapping .claude/ scaffold for a new or existing project to compose stack-pack into target with confidence-gate ≥9. RU: Используется КОГДА разворачиваешь .claude/ scaffold для нового или существующего проекта — собирает stack-pack в таргет с confidence-gate ≥9. Trigger phrases: 'scaffolding', 'первичный setup', 'init проекта', 'genesis'."
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

WHEN target project has no `.claude/agents/` OR no routing table in `CLAUDE.md` AND user wants Supervibe scaffolding. Triggered by `/supervibe-genesis` command.

## Step 0 — Read source of truth (required)

1. Read stack-fingerprint from `supervibe:stack-discovery`
2. Read `stack-packs/` to find matching pack
3. Read `templates/` for CLAUDE.md / settings.json templates
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
3. Resolve install profile before copying agents:
   - `minimal` (recommended): orchestrator, repo-researcher, code-reviewer, quality-gate-reviewer, root-cause-debugger, selected stack developer(s), selected stack architect(s)
   - `product-design`: minimal + product, UX, copy, prototype, presentation, accessibility, polish
   - `full-stack`: all stack-pack groups
   - `custom`: user explicitly selects groups or individual agents
4. Resolve optional add-ons before copying agents. Default: `none`.
   - `security-audit`: adds the `/supervibe-security-audit` chain agents.
   - `ai-prompting`: adds `prompt-ai-engineer` for prompts, agent instructions, intent routing, prompt evals, and prompt-injection hardening.
   - `network-ops`: adds `network-router-engineer`; high-risk and never default.
   - `custom`: user explicitly selects add-on agents.
5. For each profile-selected and add-on-selected `agents-attach` / `agent-addons` entry → copy agent file to `<target>/.claude/agents/<namespace>/<name>.md`
6. For each `rules-attach` → copy rule file to `<target>/.claude/rules/<name>.md`
7. Generate `<target>/.claude/settings.json` from `templates/settings/_base.json` + per-stack additions
8. Generate `<target>/CLAUDE.md` from `templates/claude-md/<pack>.md.tpl` filled with discovery data and the selected profile/add-ons
9. Copy `husky/`, `commitlint.config.js`, `lint-staged.config.js` from pack
10. Generate skeleton dirs (backend/, frontend/, prototypes/, docs/)
11. Run `post-genesis-actions` from manifest (composer install, npm install, prepare hooks)
12. Confidence-score(scaffold-bundle) ≥9
13. If <9 → list gaps, ask user to confirm or remediate

## Output contract

Returns:
- Generated `.claude/agents/`, `.claude/rules/`, `.claude/settings.json`, `CLAUDE.md`
- Selected install profile, selected add-ons, and final agent list
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
- CLAUDE.md has routing table
- Husky configured

## Related

- `supervibe:stack-discovery` — produces input
- `stack-packs/` — pack definitions
- `templates/` — generators
