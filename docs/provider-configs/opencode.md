# OpenCode Provider Config Template

This template is grounded in the official OpenCode documentation:

- https://opencode.ai/docs/config/
- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/mcp-servers/
- https://opencode.ai/docs/providers/
- https://opencode.ai/docs/plugins/
- https://opencode.ai/config.json

OpenCode uses JSON or JSONC config, Markdown agents, MCP servers, providers and
models, permissions, server settings, watcher ignores, plugins, and schema-backed
validation. Supervibe provider tooling should keep project config in
`opencode.json` and avoid mutating global config unless explicitly requested.

## Scope And Precedence

OpenCode config files are merged rather than replaced. Later sources override
conflicting keys while preserving non-conflicting keys. Standard precedence is:

1. Remote organization config from `.well-known/opencode`
2. Global config in `~/.config/opencode/opencode.json`
3. Custom config from `OPENCODE_CONFIG`
4. Project config in `opencode.json`
5. `.opencode` directories for agents, commands, plugins, and related files
6. Inline config from `OPENCODE_CONFIG_CONTENT`
7. Managed config files
8. macOS managed preferences

Project `opencode.json` has higher standard precedence than global config and
remote organization defaults. Use global config for user-wide providers, models,
and permissions. Use project config for repository-specific settings. Managed
settings are admin-controlled and not user-overridable.

## Schema-Backed Template

OpenCode supports JSON and JSONC. The server/runtime schema is
`https://opencode.ai/config.json`.

<!-- provider-config-template:opencode:schema-backed:start -->
```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-haiku-4-5",
  "provider": {},
  "server": {
    "port": 4096,
    "hostname": "127.0.0.1"
  },
  "watcher": {
    "ignore": ["node_modules/**", "dist/**", ".git/**"]
  },
  "permission": {
    "edit": "ask",
    "bash": "ask",
    "webfetch": "ask"
  },
  "mcp": {},
  "plugin": [],
  "instructions": ["AGENTS.md", "CLAUDE.md", ".cursor/rules/*.md"],
  "agent": {
    "reviewer": {
      "description": "Review code without modifying files.",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-5",
      "permission": {
        "edit": "deny",
        "bash": {
          "*": "ask",
          "git diff*": "allow",
          "git status*": "allow"
        }
      }
    }
  }
}
```
<!-- provider-config-template:opencode:schema-backed:end -->

## Agents

Agents can be configured in `opencode.json` under `agent`, or as Markdown files
under `.opencode/agents/` for project agents and `~/.config/opencode/agents/`
for global agents. The `.opencode` and global config directories use plural
subdirectory names such as `agents/`, `commands/`, `plugins/`, `skills/`,
`tools/`, and `themes/`.

Per-agent permission overrides are supported and should be used to narrow risky
subagents. Review-only agents should deny `edit`; build agents can ask for
`bash`; orchestrators can control which subagents they may invoke through
`permission.task` with glob patterns.

## MCP

MCP servers are configured under the `mcp` option. OpenCode supports local and
remote MCP servers:

- Local: `type: "local"`, `command` array, optional `environment`, `enabled`,
  and `timeout`.
- Remote: `type: "remote"`, `url`, optional `headers`, `oauth`, `enabled`, and
  `timeout`.

MCP tools are available to the LLM alongside built-in tools. Use permissions to
gate MCP tools globally or per agent; wildcard patterns such as `mymcp_*` can
deny or ask for an entire server's tools.

## Permissions

OpenCode allows all operations by default unless `permission` changes behavior.
Permission actions are `ask`, `allow`, and `deny`. Permission keys include
`read`, `edit`, `glob`, `grep`, `list`, `bash`, `task`,
`external_directory`, `todowrite`, `webfetch`, `websearch`, `lsp`, `skill`,
`question`, and `doom_loop`.

Use the last matching rule wins behavior for command patterns. Put broad
patterns such as `*` first and more specific allow or deny rules later.

## Providers And Models

OpenCode uses AI SDK and Models.dev and supports many providers. Add API keys
with `/connect`; credentials are stored in `~/.local/share/opencode/auth.json`.
Configure providers under `provider`, main model under `model`, lightweight
model under `small_model`, and provider allow/deny lists with
`enabled_providers` and `disabled_providers`.

Provider options can include `baseURL`, `timeout`, `chunkTimeout`, and
`setCacheKey`, plus provider-specific options such as AWS Bedrock region or
profile.

## Server, Watcher, Plugins, And Instructions

The `server` option configures `opencode serve` and `opencode web` with fields
such as `port`, `hostname`, `mdns`, `mdnsDomain`, and `cors`.

The `watcher.ignore` option excludes noisy paths from file watching with glob
patterns.

Plugins can be loaded from local files in `.opencode/plugins/` or
`~/.config/opencode/plugins/`, or from npm packages via the `plugin` option.
Plugin events include `file.watcher.updated`, `permission.asked`,
`permission.replied`, `server.connected`, `session.*`, and
`tool.execute.before` / `tool.execute.after`.

The `instructions` option accepts instruction file paths and globs. Use it to
load project guidance without duplicating large host instruction files.

## Provider-Config Doctor Checks

An OpenCode provider-config doctor should verify:

- `opencode.json` or JSONC uses `$schema: "https://opencode.ai/config.json"`.
- `.opencode/agents` project agents and global agents are not conflated.
- MCP entries under `mcp` use valid local or remote shapes.
- Global and per-agent `permission` blocks narrow edit, bash, MCP, and task
  capabilities appropriately.
- `provider`, `model`, `small_model`, `enabled_providers`, and
  `disabled_providers` are intentional.
- `server` and `watcher` settings are explicit for automation.
- Plugins are loaded only from expected `.opencode/plugins/`, global plugin
  directories, or approved npm packages.
- Project/global precedence is documented so project tooling does not overwrite
  user-wide config.
