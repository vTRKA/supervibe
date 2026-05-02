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
node --test tests/<name>.test.mjs
node scripts/build-code-index.mjs --root . --force --health --no-embeddings
```

## Working Rules

- Check project memory, code search and code graph before non-trivial code changes.
- For command-like user requests, run `node scripts/supervibe-commands.mjs --match "<user request>"` before broad source search. If the result is `INTENT: missing_slash_command` or `HARD_STOP: true`, report the missing command and stop; do not inspect source files, marketplace command files, or repository paths to emulate it.
- Preserve user-owned sections in host instruction files. Supervibe managed blocks are updated through `scripts/lib/supervibe-context-migrator.mjs`.
- Use host-neutral wording in shared agents, skills and rules. Do not assume any provider-specific folder, instruction file, or plugin root unless the artifact is explicitly adapter-specific.
- Keep generated project state under `.supervibe/memory/`.
- Terminal/file I/O is governed by `rules/terminal-file-io.md`, `.editorconfig`, and `.gitattributes`: write text as UTF-8 with LF, prefer Node `fs.writeFile(..., "utf8")`, and avoid legacy PowerShell redirection for non-ASCII or machine-readable files. Use `Set-Content -Encoding utf8` only when PowerShell writes are unavoidable. Machine-readable approval evidence should use ASCII strings unless preserving exact user text is required.
- Do not claim completion without a verification command.
- Do not revert unrelated user changes.

## Agent And Artifact Map

- Agents: 89 files under `agents/`; human-readable role map in `docs/agent-roster.md`.
- Skills: 55 folders under `skills/`.
- Rules: 28 files under `rules/`.
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
