# AGENTS.md - Supervibe Contributor Context

This repository is the Supervibe Framework: a multi-host AI development plugin for Claude Code, Codex, Gemini, Cursor and OpenCode. It ships specialist agents, skills, rules, Code RAG, Code Graph, project memory and confidence gates.

Read `README.md` for user-facing setup. This file is the Codex entry point; Claude, Gemini, Cursor, and OpenCode have their own host instruction surfaces managed through Supervibe blocks.

## Setup

- Runtime: Node.js 22.5+ with `node:sqlite`.
- Package manager: npm.
- No Docker or native compile step is required for normal development.
- Large assets under `models/` and `grammars/` may require Git LFS in a fresh checkout.

Useful commands:

```bash
npm ci
npm run supervibe:status
npm run check
node --test tests/<name>.test.mjs
node scripts/build-code-index.mjs --root . --force --health --no-embeddings
```

## Working Rules

- Check project memory, code search and code graph before non-trivial code changes.
- Preserve user-owned sections in host instruction files. Supervibe managed blocks are updated through `scripts/lib/supervibe-context-migrator.mjs`.
- Use host-neutral wording in shared agents, skills and rules. Do not assume any provider-specific folder, instruction file, or plugin root unless the artifact is explicitly adapter-specific.
- Keep generated project state under `.supervibe/memory/`.
- Do not claim completion without a verification command.
- Do not revert unrelated user changes.

## Agent And Artifact Map

- Agents: 89 files under `agents/`; human-readable role map in `docs/agent-roster.md`.
- Skills: 54 folders under `skills/`.
- Rules: 26 files under `rules/`.
- Confidence rubrics: 17 YAML files under `confidence-rubrics/`.
- Commands: 19 files under `commands/`.
- Core libraries: `scripts/lib/`.
- Tests: `tests/*.test.mjs`.

## Verification Expectations

For narrow changes, run the targeted `node --test` command that covers the edited module. Before release or commit, run:

```bash
npm run check
```

If `npm run check` fails, report the failing command and keep the fix scoped to failures caused by the current change unless the user explicitly asks for broader cleanup.
