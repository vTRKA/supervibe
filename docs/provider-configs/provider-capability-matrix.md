# Provider Capability Matrix

This matrix is the cross-provider source of truth for Supervibe provider
configuration work. It is intentionally conservative: project tooling may
generate or validate project-local files, but home/global config writes remain
preview-only unless the user explicitly asks for them.

The executable manifest lives at
`tests/fixtures/provider-configs/provider-capabilities.json`; provider docs and
doctor tests validate against that structured data so Markdown cannot drift
silently from automation policy.
Power recommendations live in `docs/provider-configs/provider-power-presets.md`
and use the same manifest rows.

Checked date for all rows: 2026-05-13.

## Host-Neutral Capability Names

Supervibe agent matching and provider handoff use stable capability names instead
of provider-specific MCP server or tool ids. These names are selectors, not a
claim that the configured host currently exposes the backing tool.

| Capability | Meaning | Common backing surfaces |
| --- | --- | --- |
| `browser` | Browser runtime automation, screenshots, DOM snapshots, and preview QA | Playwright MCP, browser preview tools, provider browser automation |
| `context7` | Current library and framework documentation lookup | Context7 MCP or equivalent provider docs retrieval |
| `figma` | Figma design source extraction and read-only asset/token evidence | Figma MCP, exported Figma files, approved local design exports |
| `firecrawl` | Web research, scraping, and source capture | Firecrawl MCP, provider web search or scrape tools |
| `openai-docs` | OpenAI developer documentation and API reference lookup | OpenAI developer docs MCP, official OpenAI docs retrieval |
| `tauri` | Tauri desktop, webview, IPC, logs, and window testing | Tauri MCP, Tauri CLI/runtime, desktop webview test hooks |

| Provider | Config path | Instructions path | Agents | Memory | MCP | Hooks | Background execution | Permissions | Schema | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Codex | `~/.codex/config.toml`; trusted project `.codex/config.toml` | `AGENTS.md`, `AGENTS.override.md`, `project_doc_max_bytes`, `project_doc_fallback_filenames` | Built-in multi-agent runtime plus `~/.codex/agents/` and `.codex/agents/`; `[agents].max_threads`, `max_depth`, `job_max_runtime_seconds` | `[features].memories`, `[memories]`, local `CODEX_HOME` / `sqlite_home` state | `[mcp_servers.<id>]` stdio or streamable HTTP with enabled/disabled tools, scopes, startup and tool timeouts | `[features].codex_hooks`; inline `[hooks]` or hook files; managed hooks in requirements | Local spawned agent jobs plus experimental `/goal` durable objectives through `[features].goals`; no automatic remote writeback by Supervibe | `approval_policy`, `sandbox_mode`, `default_permissions`, `web_search`, named filesystem and network permission profiles | TOML config reference plus `config-schema.json`; `features.apps`, `features.goals`, `apps._default`, and `tool_suggest.discoverables` are documented config surfaces | https://developers.openai.com/codex/config-reference; https://developers.openai.com/codex/subagents; https://developers.openai.com/codex/use-cases/follow-goals; Checked: 2026-05-13 |
| Claude Code | `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`, managed settings | `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md` | User `~/.claude/agents/` and project `.claude/agents/`; subagent frontmatter can narrow tools | `CLAUDE.md` hierarchy and auto-memory settings; user/project/local scopes are separate | `.mcp.json` for project servers plus user/local MCP entries; managed allow/deny can restrict servers | Settings `hooks` for `PreToolUse`, `PostToolUse`, `SubagentStop`, `SessionStart`, `SessionEnd`, and related events | Local CLI/runtime; Claude Code on the web is separate from project CLI config | `permissions.allow`, `ask`, `deny`, managed-only policy, sandbox settings, sensitive file deny rules | JSON settings with official schema; managed settings have higher precedence | https://code.claude.com/docs/en/settings; https://docs.anthropic.com/en/docs/claude-code/sub-agents; Checked: 2026-05-13 |
| Gemini CLI | `~/.gemini/settings.json`, `.gemini/settings.json`, system defaults and system overrides | `GEMINI.md` via `context.fileName`; hierarchical memory can load global, project, ancestor, and subdirectory files | Preview sub-agents and agent skills are provider features; Supervibe treats them as provider-specific until manifest-backed | Hierarchical `GEMINI.md`; `/memory show`, `/memory refresh`, and configured context loading | `mcpServers` with command/env, `includeTools`, `excludeTools`, timeout and enablement settings | Extensions and extension hooks; command hooks are provider-extension specific | Local CLI sessions with checkpoint/restore; no implicit remote branch handoff | `general.defaultApprovalMode`, `--approval-mode`, trust, sandbox, gitignore/geminiignore, env exclusion | JSON settings schema at Gemini CLI schema URL | https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md; https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md; Checked: 2026-05-13 |
| Cursor | `.cursor/rules`, `.cursor/mcp.json`, `.cursor/environment.json` for background agents, user/global Cursor settings | `AGENTS.md`, `CLAUDE.md`, and `.cursor/rules` MDC files | Foreground agent via `cursor-agent`; background agents run remotely on separate branches | Cursor rules and instruction files supply context; codebase indexing is provider-managed, not Supervibe memory | Project `.cursor/mcp.json` and global `~/.cursor/mcp.json` support stdio/SSE/Streamable HTTP | Rule attachment modes are `Always`, `Auto Attached`, `Agent Requested`, and `Manual`; no project shell hook surface equivalent to Claude hooks | Background agents run remotely, clone GitHub repo, use `.cursor/environment.json`, and push a branch for handoff | Foreground CLI asks interactively; `cursor-agent --print` has full write access; background agents require GitHub read-write access | MDC project rules plus JSON MCP/environment files; no single global config schema for all surfaces | https://docs.cursor.com/en/context; https://docs.cursor.com/en/background-agents; Checked: 2026-05-13 |
| OpenCode | `opencode.json`, `~/.config/opencode/opencode.json`, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT`, managed config | `instructions` array/globs such as `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.md` | `agent` entries in config plus `.opencode/agents/` and global agents; per-agent model and permission overrides | Instructions and compaction config; no Supervibe-owned provider memory file by default | `mcp` local or remote servers with timeout, enablement, headers, OAuth and per-tool permission gating | Plugins can hook `tool.execute.before/after`, `permission.*`, `session.*`, and watcher events | Local `opencode` runtime and optional `opencode serve` / `opencode web`; watcher can react to files | `permission` supports ask/allow/deny for read, edit, bash, webfetch, websearch, task, MCP-like tool patterns, and more | JSON/JSONC config with `$schema: https://opencode.ai/config.json` | https://opencode.ai/docs/config/; https://opencode.ai/docs/agents/; Checked: 2026-05-13 |

## Supervibe Application Rules

- Provider files are adapters, not a license to mutate user home directories.
- Generated home/global changes must be emitted as preview instructions unless
  the user explicitly grants a write path.
- Provider docs and tests must keep source URLs and checked dates so stale
  capability claims are visible.
- Runtime loop scheduling may consume provider limits only after the structured
  manifest in T49A makes those limits machine-readable.
