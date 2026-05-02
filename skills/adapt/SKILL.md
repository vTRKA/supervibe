---
name: adapt
namespace: process
description: "Use WHEN stack changed (new modules, renamed files, removed files, new major dependencies) to sync agents/skills with new state. RU: Используется КОГДА стек изменился (новые модули, переименования, удаления, новые зависимости) — синхронизирует агентов/скиллы с новым состоянием. Trigger phrases: 'sync проектные агенты', 'подтяни upstream', 'обнови агентов под новый стек', 'adapt'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Adapt

## When to invoke

- New directory in `src/modules/` or `src/commands/`
- New major dependency in package.json/composer.json/Cargo.toml
- Files renamed/deleted that artifacts reference
- User runs `/supervibe-adapt`
- Plugin updated and project-level installed agents/rules/skills need refresh without manual deletion

## Shared Dialogue Contract

Lifecycle: `scan -> plan -> review -> approved -> applied -> verified`. Persist state in `.supervibe/memory/adapt/state.json` before every lifecycle transition.

Every interactive step asks one question at a time using `Step N/M` or `Шаг N/M`. Each question lists the recommended/default option first, gives a one-line tradeoff summary for every option, allows a free-form answer, and names the stop condition.

Default behavior: produce a dry-run adaptation plan and do not edit artifacts until approval. Free-form path: the user can name exact agents, rules, skills, paths, or stack changes to include or exclude.

After every material delivery, ask one explicit next-step question about the adaptation plan. Use language-matched, domain-specific labels; keep internal action ids only in saved state.
- Apply adaptation / Применить адаптацию - recommended when the dry-run adaptation plan looks right; apply the selected artifact updates.
- Adjust adaptation plan / Изменить план адаптации - user gives one focused agent, rule, skill, path or stack change; rebuild the dry-run without writing files.
- Compare another scope / Сравнить другой scope - produce another adaptation scope with explicit tradeoffs.
- Review adaptation deeper / Проверить адаптацию глубже - run audit or confidence scoring before applying.
- Stop without adapting / Остановиться без адаптации - persist current state and exit without changing project artifacts.

## Step 0 — Read source of truth (required)

1. Read `registry.yaml` for current state
2. Run `git diff <verified-against>..HEAD --stat` to find changes
3. Read changed manifest files for new deps
4. Run or consult `node scripts/supervibe-status.mjs --capabilities` so proposed agent, rule and skill updates are grounded in the capability registry.
5. Resolve the active host adapter before reading or planning writes; use the same precedence as genesis: explicit override -> active runtime/current chat -> filesystem markers.

## Procedure

1. **Diff analysis** — what changed since last `verified-against` commit
2. **Stale references** — grep deleted/renamed paths in artifacts; update or flag
3. **New modules** — determine which agent should cover; update Project Context
4. **New deps**:
   - Minor (new lib in existing stack) → update agent context
   - Major (new framework / new layer) → suggest `supervibe:genesis` for new component
5. **Deleted files** — remove references from artifacts
6. **Host context migration** — if the active host instruction file, `AGENTS.md`, `GEMINI.md`, `.cursor/rules` or `opencode.json` changes, use `scripts/lib/supervibe-context-migrator.mjs` dry-run planning and never overwrite user-owned sections.
7. **Capability registry** — propose affected agents, rules and skills together, including registry evidence and confidence for each linked artifact.
8. **Version marker** — after approved writes, update `.supervibe/memory/.supervibe-version` so future sessions know the project artifacts match the plugin version.
8. **User-requested project fit** - when the user asks to adapt rules or agents to the project, compare stack tags, selected install profile, existing host artifacts, and capability registry links; then produce an add/keep/defer plan with reasons.
9. **Bump versions** + update `last-verified` + `verified-against`
10. Run `supervibe:audit` to verify clean state

## Output contract

Returns:
- List of updated artifacts
- List of project-fit agent/rule/skill recommendations with evidence
- List of suggestions (where genesis is needed for major changes)
- Pre/post audit diff

## Guard rails

- DO NOT: delete agents/skills (rename/archive instead)
- DO NOT: tell the user to delete all generated project artifacts after plugin updates; use diff-gated adapt instead
- DO NOT: invent new agent (suggest genesis for new components)
- ALWAYS: re-audit after adapt to verify clean

## Verification

- Confirm every emitted artifact exists and matches the Output contract.
- Run the validator, test, dry-run, or audit command named by this skill when one exists.
- Include concrete command/output evidence before claiming the skill completed successfully.
- If verification cannot run, state the blocker and keep confidence below the passing gate.

## Related

- `supervibe:audit` — pre + post check
- `supervibe:genesis` — invoked for new major components
