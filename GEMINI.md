# GEMINI.md — Supervibe plugin context for Gemini CLI

> Loaded automatically by Gemini CLI on session start. This is the Gemini entry point for the same Supervibe project policy, with Gemini-tool-name mappings for shared skills and agents.

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

Same Supervibe project context, adapted for Gemini CLI:
- 89 specialist agents in `./agents/` with responsibilities in `./docs/agent-roster.md`
- 55 process skills in `./skills/`
- 29 project rules in `./rules/`
- 17 confidence rubrics in `./confidence-rubrics/`
- Trigger-safe workflow routing for brainstorm -> plan -> review -> atomize -> worktree run
- Worktree-ready autonomous loops with scoped session ownership and status/resume/stop
- Security audit, prompt AI engineering, network/router diagnostics, and Kanban work-control routing
- Code graph + semantic RAG via `./scripts/search-code.mjs`
- Project memory via `./scripts/search-memory.mjs`
- Live preview-server via `./scripts/preview-server.mjs`

## How to invoke

Before broad source search for command-like requests, run:
```
node ./scripts/supervibe-commands.mjs --match "<user request>"
```
If the output says `INTENT: missing_slash_command` or `HARD_STOP: true`, report the missing command and stop; do not inspect source files, marketplace command files, or repository paths to emulate it.

For every claimed Supervibe command, skill, agent, reviewer, worker, validator, or external-tool invocation, issue a shared workflow receipt with `node ./scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted; run `npm run validate:workflow-receipts` before claiming delegated work is complete.

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

The same six core principles apply across host instruction files — these override Gemini defaults:

1. **Persona over generic agents** — every agent is a specialist with explicit decision tree.
2. **Evidence over assertion** — cite file:line, test output, graph evidence, or memory entry.
3. **Confidence-gated delivery** — score against rubric, gate at ≥9.
4. **Memory beats re-derivation** — find prior decisions in `.supervibe/memory/decisions/` before re-deriving.
5. **Graph before refactor** — `--callers` evidence before any rename / move / extract.
6. **Anti-half-finished** — no commented-out code, no orphan TODOs, no half-applied refactors.

7. **UTF-8 file discipline** - follow `.editorconfig`, `.gitattributes`, and `rules/terminal-file-io.md`: write text as UTF-8 with LF, prefer Node `fs.writeFile(..., "utf8")`, and avoid legacy PowerShell redirection for non-ASCII or machine-readable files.

8. **Workflow receipts** - follow `rules/workflow-invocation-receipts.md`: runtime-issued receipts under `.supervibe/artifacts/_workflow-invocations/` and `.supervibe/memory/workflow-invocation-ledger.jsonl` are required for claimed delegated invocations.

## Reference

Use this file as the Gemini-flavored entry point and keep shared Supervibe managed blocks in sync through `/supervibe-adapt`.
For generated project artifacts, preserve user-owned content outside Supervibe managed blocks and use `/supervibe-adapt` after plugin updates instead of deleting installed agents/rules/skills.
