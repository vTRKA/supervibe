# GEMINI.md — Supervibe plugin context for Gemini CLI

> Loaded automatically by Gemini CLI on session start. Mirrors `CLAUDE.md` but with Gemini-tool-name mappings so skills and agents authored against Claude Code tools work unchanged.

## Tool name mapping (Gemini CLI ↔ Claude Code)

When Supervibe skills or agents reference these Claude Code tools, use the Gemini CLI equivalents:

| Claude Code | Gemini CLI |
|-------------|-----------|
| `Read` | `read_file` |
| `Write` | `write_file` |
| `Edit` | `replace` |
| `Glob` | `glob` |
| `Grep` | `search_file_content` |
| `Bash` | `run_shell_command` |
| `WebFetch` | `web_fetch` |
| `WebSearch` | `google_web_search` |
| `Task` (subagent dispatch) | direct invocation — Gemini CLI does not have first-class subagents yet; treat skill content as inline instructions |
| `TodoWrite` | inline task list in response |

When Supervibe agents/skills reference Claude Code tools by name, mentally substitute via this table. Output contracts and confidence-scoring stay identical.

## What Supervibe provides

Same as `CLAUDE.md`:
- 83 specialist agents in `./agents/`
- 51 process skills in `./skills/`
- 25 project rules in `./rules/`
- 16 confidence rubrics in `./confidence-rubrics/`
- Trigger-safe workflow routing for brainstorm -> plan -> review -> atomize -> worktree run
- Worktree-ready autonomous loops with scoped session ownership and status/resume/stop
- Security audit, prompt AI engineering, network/router diagnostics, and Kanban work-control routing
- Code graph + semantic RAG via `./scripts/search-code.mjs`
- Project memory via `./scripts/search-memory.mjs`
- Live preview-server via `./scripts/preview-server.mjs`

## How to invoke

Reference any agent by file path:
```
Use the agent at ./agents/_core/code-reviewer.md to review my last change.
```

Run code search:
```
node ./scripts/search-code.mjs --query "auth flow"
node ./scripts/search-code.mjs --callers "processPayment"
```

Run memory search:
```
node ./scripts/search-memory.mjs --query "idempotency"
```

## Invocation discipline

The same six core principles from `CLAUDE.md` apply — these override Gemini defaults:

1. **Persona over generic agents** — every agent is a specialist with explicit decision tree.
2. **Evidence over assertion** — cite file:line, test output, graph evidence, or memory entry.
3. **Confidence-gated delivery** — score against rubric, gate at ≥9.
4. **Memory beats re-derivation** — find prior decisions in `.supervibe/memory/decisions/` before re-deriving.
5. **Graph before refactor** — `--callers` evidence before any rename / move / extract.
6. **Anti-half-finished** — no commented-out code, no orphan TODOs, no half-applied refactors.

## Reference

Read `CLAUDE.md` for full system context. This file is the Gemini-flavored entry point only.
