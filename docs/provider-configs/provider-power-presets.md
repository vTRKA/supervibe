# Provider Power Presets

Checked: 2026-05-13.

These presets translate provider configuration surfaces into user outcomes:
stronger reasoning, faster startup, smarter context, safer tools, better
memory, more parallelism, and clearer observability. Every recommendation is
preview-only. Supervibe may display a patch or checklist, but it must not write
home/global provider config automatically.

Risk labels:

- `safe-default`: conservative setting that can be suggested broadly.
- `balanced`: useful for most active development after project trust checks.
- `max-power`: higher cost, latency, or concurrency; requires explicit review.
- `experimental`: documented outside the stable schema or preview/provider
  feature surface.
- `manual-only`: can affect remote execution, secrets, enterprise policy, or
  user-owned config and must remain instructions-only.

## Codex

| Outcome | Setting | Label | Preview | Source |
| --- | --- | --- | --- | --- |
| more parallelism | `features.multi_agent`, `agents.max_threads`, `agents.max_depth`, `agents.job_max_runtime_seconds` | `max-power` | Enable multi-agent, cap threads at 8, keep depth at 1, and keep worker runtime bounded. | https://developers.openai.com/codex/config-reference |
| live provider evidence | `web_search` | `max-power` | Set `web_search = "live"` for autonomous provider/config loops so fresh documentation is available by default. | https://developers.openai.com/codex/config-reference |
| stronger reasoning | `review_model`, `plan_mode_reasoning_effort`, `model_context_window`, `model_auto_compact_token_limit` | `balanced` | Use reviewer model and context limits to avoid weak reviews and premature compaction. | https://developers.openai.com/codex/config-reference |
| smarter context | `tool_output_token_limit`, `project_doc_max_bytes`, `project_doc_fallback_filenames`, `AGENTS.md` | `balanced` | Bound tool output, load project docs deliberately, and preserve instruction fallbacks. | https://developers.openai.com/codex/config-reference |
| better memory | `features.memories`, `[memories]`, `sqlite_home`, history persistence | `balanced` | Enable memory use/generation and keep local state under a known `sqlite_home`. | https://developers.openai.com/codex/config-reference |
| safer noninteractive loop | `approval_policy`, `sandbox_mode`, `default_permissions`, MCP scopes/timeouts | `safe-default` | Use `approval_policy = "never"` only with workspace sandbox, scoped permissions, secret denials, and preview-only config writes. | https://developers.openai.com/codex/config-reference |
| plugin/app discovery | `features.apps`, `apps._default`, `tool_suggest.discoverables` | `experimental` | Enable schema-backed app discovery and suggest `supervibe@supervibe-marketplace`; do not add an unlisted top-level plugin boolean. | https://developers.openai.com/codex/config-reference |
| clearer observability | telemetry, notifications, history persistence, hooks | `safe-default` | Use local logs/history and notifications without leaking raw prompts by default. | https://developers.openai.com/codex/config-reference |
| durable goals | `features.goals` | `experimental` | Set `goals = true` under `[features]` so `/goal` can run durable long-running objectives; preserve any existing user value. | https://developers.openai.com/codex/use-cases/follow-goals |
| built-in agents | worker/explorer roles and `spawn_agents_on_csv` | `manual-only` | Use only through real Codex spawn ids and runtime receipts. | https://developers.openai.com/codex/subagents |

## Claude Code

| Outcome | Setting | Label | Preview | Source |
| --- | --- | --- | --- | --- |
| smarter context | `CLAUDE.md`, `.claude/CLAUDE.md`, imports, memory hierarchy | `safe-default` | Preserve user-owned host instructions and update only managed blocks. | https://code.claude.com/docs/en/settings |
| more parallelism | `.claude/agents/`, user subagents, project subagents, separate subagent context | `balanced` | Prefer project subagents with narrow tools and explicit descriptions. | https://docs.anthropic.com/en/docs/claude-code/sub-agents |
| safer tools | permissions allow/ask/deny, MCP approval, managed settings | `safe-default` | Deny sensitive paths and avoid weakening enterprise policy. | https://code.claude.com/docs/en/settings |
| clearer observability | `SubagentStart`, `SubagentStop`, `PreToolUse`, `PostToolUse`, agent hooks | `balanced` | Use hooks for deterministic policy and status, not broad automation. | https://code.claude.com/docs/en/settings |
| manual boundary | managed settings and enterprise policy | `manual-only` | Document precedence and never overwrite admin/user global config. | https://code.claude.com/docs/en/settings |

## Gemini CLI

| Outcome | Setting | Label | Preview | Source |
| --- | --- | --- | --- | --- |
| smarter context | `GEMINI.md`, `AGENTS.md`, `context.fileName`, include directories | `safe-default` | Load hierarchical memory deliberately and keep include directories explicit. | https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md |
| better memory | `/memory show`, `/memory refresh`, hierarchical memory | `balanced` | Refresh memory before long loops and surface memory state in status. | https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md |
| safer tools | approval modes, sandbox, policy engine, env exclusion | `safe-default` | Keep persisted approval mode conservative; use `yolo` only as a CLI-only manual override. | https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md |
| clearer observability | telemetry, checkpointing, `--output-format`, tool output summarization | `balanced` | Enable checkpointing and machine-readable output for recoverable sessions. | https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md |
| hidden capability | preview sub-agents, agent skills, extension hooks, max session turns | `experimental` | Treat preview agents and extension hooks as provider-specific until manifest-backed. | https://github.com/google-gemini/gemini-cli/blob/main/docs/index.md |

## Cursor

| Outcome | Setting | Label | Preview | Source |
| --- | --- | --- | --- | --- |
| smarter context | `.cursor/rules`, user rules, `AGENTS.md`, scoped Cursor rules | `safe-default` | Prefer scoped rules over one large always-on rule. | https://docs.cursor.com/en/context |
| more parallelism | background agents, `.cursor/environment.json`, GitHub branch handoff | `manual-only` | Remote background execution requires explicit GitHub/privacy review. | https://docs.cursor.com/en/background-agents |
| faster startup | install/start/terminal commands in `.cursor/environment.json` | `balanced` | Keep setup repeatable but do not auto-create remote environments. | https://docs.cursor.com/en/background-agents |
| safer tools | MCP, privacy mode, foreground CLI approval, `cursor-agent --print` risk | `safe-default` | Treat print mode as full-write automation and keep secrets out of MCP config. | https://docs.cursor.com/advanced/model-context-protocol |
| model power | Max Mode model constraint | `manual-only` | Surface as a user choice because it changes cost/model behavior. | https://docs.cursor.com/en/context |

## OpenCode

| Outcome | Setting | Label | Preview | Source |
| --- | --- | --- | --- | --- |
| more parallelism | `agent.<name>`, mode `subagent`, per-agent model, `agent.<name>.steps` | `balanced` | Use per-agent steps and Supervibe wave caps instead of an unlimited thread model. | https://opencode.ai/docs/agents/ |
| stronger reasoning | model, small_model, temperature, provider options | `balanced` | Route review/build agents to appropriate models without changing global auth. | https://opencode.ai/docs/providers/ |
| smarter context | instructions, compaction, LSP, watcher | `safe-default` | Load instruction globs and keep compaction/watchers explicit. | https://opencode.ai/docs/config/ |
| safer tools | permissions, MCP per-agent enablement, enabled/disabled providers | `safe-default` | Deny edits for reviewers and ask for bash/task/web tools by default. | https://opencode.ai/docs/config/ |
| clearer observability | plugins, plugin hooks, watcher events, server settings | `balanced` | Use plugin hooks for status and permission events after explicit approval. | https://opencode.ai/docs/plugins/ |
| manual boundary | project/global config merge and auth provider setup | `manual-only` | Never overwrite global `~/.config/opencode` or provider auth files automatically. | https://opencode.ai/docs/config/ |
