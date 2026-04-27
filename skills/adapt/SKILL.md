---
name: adapt
namespace: process
description: "Use WHEN stack changed (new modules, renamed files, removed files, new major dependencies) to sync agents/skills with new state"
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
- User runs `/evolve-adapt`

## Step 0 — Read source of truth (MANDATORY)

1. Read `registry.yaml` for current state
2. Run `git diff <verified-against>..HEAD --stat` to find changes
3. Read changed manifest files for new deps

## Procedure

1. **Diff analysis** — what changed since last `verified-against` commit
2. **Stale references** — grep deleted/renamed paths in artifacts; update or flag
3. **New modules** — determine which agent should cover; update Project Context
4. **New deps**:
   - Minor (new lib in existing stack) → update agent context
   - Major (new framework / new layer) → suggest `evolve:genesis` for new component
5. **Deleted files** — remove references from artifacts
6. **Bump versions** + update `last-verified` + `verified-against`
7. Run `evolve:audit` to verify clean state

## Output contract

Returns:
- List of updated artifacts
- List of suggestions (where genesis is needed for major changes)
- Pre/post audit diff

## Guard rails

- DO NOT: delete agents/skills (rename/archive instead)
- DO NOT: invent new agent (suggest genesis for new components)
- ALWAYS: re-audit after adapt to verify clean

## Related

- `evolve:audit` — pre + post check
- `evolve:genesis` — invoked for new major components
