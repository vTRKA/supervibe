# Codex Provider Config Template

This template is grounded in the official Codex configuration documentation:

- https://developers.openai.com/codex/config-basic
- https://developers.openai.com/codex/config-advanced
- https://developers.openai.com/codex/config-reference
- https://developers.openai.com/codex/config-sample
- https://developers.openai.com/codex/subagents
- https://developers.openai.com/codex/guides/agents-md

Codex reads user-level configuration from `~/.codex/config.toml` and project
configuration from `.codex/config.toml`. Project `.codex/` layers load only when
the project is trusted. Home config writes are preview-only for Supervibe
provider-config tooling: generate the patch or instructions for
`~/.codex/config.toml`, but do not automatically apply changes outside the
workspace.

## Scope And Precedence

Codex resolves configuration with CLI flags and `--config` overrides first,
then profiles, then trusted project `.codex/config.toml` files from the project
root down to the current directory, then `~/.codex/config.toml`, then system
configuration and built-in defaults. Use this template as a schema-backed
starting point for either the home file or a project-local file, but keep
project paths relative to the `.codex/` directory that owns the config.

Trust is explicit. If a project is untrusted, Codex skips project-local
`.codex/config.toml`, project hooks, and project rules. User and system layers
still load. To record trust in config, use the schema-backed `projects` table.

## Schema-Backed Template

The following block contains only keys represented in the official Codex config
reference or sample configuration. It is safe for a provider-config doctor to
use as the automatic apply candidate after normal path and trust checks.

<!-- provider-config-template:codex:schema-backed:start -->
```toml
# Codex config.toml schema-backed template.
# Add this to ~/.codex/config.toml for personal defaults, or to
# <repo>/.codex/config.toml for trusted project-local overrides.

model = "gpt-5.5"
model_provider = "openai"
approval_policy = "never"
sandbox_mode = "workspace-write"
web_search = "live"
default_permissions = ":workspace"
project_doc_max_bytes = 32768
project_doc_fallback_filenames = []

[features]
apps = true
multi_agent = true
memories = true
shell_snapshot = true
codex_hooks = true
goals = true

[agents]
max_threads = 8
max_depth = 1
job_max_runtime_seconds = 1800

[history]
persistence = "save-all"
max_bytes = 104857600

[memories]
generate_memories = true
use_memories = true
disable_on_external_context = false

[apps._default]
enabled = true
destructive_enabled = false
open_world_enabled = true
default_tools_enabled = true
default_tools_approval_mode = "auto"

[[tool_suggest.discoverables]]
type = "plugin"
id = "supervibe@supervibe-marketplace"

[sandbox_workspace_write]
writable_roots = []
network_access = false
exclude_tmpdir_env_var = false
exclude_slash_tmp = false

[permissions.workspace.filesystem]
":project_roots" = { "." = "write", "**/*.env" = "none" }
glob_scan_max_depth = 3

[permissions.workspace.network]
enabled = false
mode = "limited"

[mcp_servers.openaiDeveloperDocs]
url = "https://developers.openai.com/mcp"
enabled = true
startup_timeout_sec = 10
tool_timeout_sec = 60

[projects."/absolute/path/to/project"]
trust_level = "trusted"
```
<!-- provider-config-template:codex:schema-backed:end -->

## Multi-Agent Configuration

Codex subagent workflows are enabled by default in current Codex releases and
can be controlled with `[features].multi_agent`. The multi-agent tooling can
spawn, steer, wait for, and close subagent threads when the user explicitly asks
for subagent work. Subagents inherit the active sandbox and approval policy, and
live runtime overrides from the parent turn are reapplied when a child agent is
spawned.

Use `[agents]` for global limits:

- `agents.max_threads` caps concurrently open agent threads. Codex defaults to
  `6` when unset; Supervibe pins the provider template to `8` to use the
  maximum planned local worker wave while still respecting Codex's explicit
  cap.
- `agents.max_depth` caps nested spawning and defaults to `1`.
- `agents.job_max_runtime_seconds` sets the default worker timeout for
  `spawn_agents_on_csv`; when unset, the tool falls back to 1800 seconds.

Custom agents live under `~/.codex/agents/` for personal roles or
`.codex/agents/` for trusted project roles. Each custom agent TOML file must
define `name`, `description`, and `developer_instructions`; optional settings
such as `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, and
`skills.config` inherit from the parent session when omitted.

## Memories

Memories are controlled by `[features].memories`, which is stable and defaults
to `false` in the official feature table. After enabling the feature, tune the
`[memories]` table:

- `generate_memories` controls whether new threads become memory-generation
  inputs.
- `use_memories` controls whether Codex injects existing memories into future
  sessions.
- `disable_on_external_context` keeps threads that used external context such as
  MCP tool calls or web search out of memory generation when set to `true`.

## History

Codex stores local state under `CODEX_HOME`, which defaults to `~/.codex`.
History persistence writes session transcripts to `history.jsonl` when enabled.
Use `[history].persistence = "none"` to disable local history, or keep
`"save-all"` and set `[history].max_bytes` to cap the file size.

## MCP

MCP servers are configured under `[mcp_servers.<id>]`. The config reference
supports stdio servers with `command`, `args`, `env`, `env_vars`, and `cwd`, and
streamable HTTP servers with `url`, `bearer_token_env_var`, `http_headers`, and
`env_http_headers`. Shared operational keys include `enabled`, `required`,
`startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools`, `disabled_tools`,
`scopes`, and `oauth_resource`.

## Web Search

Prefer the top-level `web_search` key. Supported modes are:

- `"cached"`: upstream Codex default for local tasks; uses an
  OpenAI-maintained index rather than fetching live pages.
- `"live"`: fetches the most recent data, equivalent to `--search`.
- `"disabled"`: removes the web search tool.

Supervibe pins the managed Codex template to `web_search = "live"` for
autonomous provider/configuration loops so provider evidence is fresh by
default. This is additive only: provider-config tooling must not overwrite an
existing user-owned `web_search` value.

The legacy feature flags `features.web_search`, `features.web_search_cached`,
and `features.web_search_request` are deprecated in the official config
reference. The `tools.web_search` object can additionally tune search context,
allowed domains, and approximate location when that granularity is needed.

## Apps And Plugin Suggestions

Codex exposes schema-backed app/connector controls through `[features].apps`,
`[apps.<id>]`, `[apps._default]`, and `tool_suggest` entries. Supervibe enables
the app surface in the template and records `supervibe@supervibe-marketplace`
as a discoverable plugin suggestion instead of adding an unlisted top-level
plugin boolean. Destructive app tools stay disabled by default, and
provider-config tooling still operates in preview-only mode for home config.

## Goals

Codex `/goal` is an experimental CLI workflow for durable long-running
objectives. The official "Follow a goal" use-case page says it can be enabled
from `/experimental` or by adding `goals = true` under `[features]` in
`config.toml`. Supervibe therefore includes `features.goals = true` in the
Codex project template and provider-config applier, while still preserving any
existing user-owned `[features]` values.

## Permissions And Sandbox

Use `approval_policy`, `approvals_reviewer`, and `sandbox_mode` together.
Schema-backed sandbox modes are `read-only`, `workspace-write`, and
`danger-full-access`. Prefer `workspace-write` for implementation work and keep
`sandbox_workspace_write.network_access = false` unless the task requires
network access.

Supervibe-managed noninteractive loop defaults use `approval_policy = "never"`
so workers do not stall on repeated prompts. The safety tradeoff is that this
must be paired with `sandbox_mode = "workspace-write"`, scoped
`default_permissions`, secret read denials, and preview-only provider-config
application. Existing user-owned approval policies are never overwritten by
genesis/adapt/provider doctor flows.

Use `default_permissions` for reusable permission profiles. Built-in profile
names are `:read-only`, `:workspace`, and `:danger-no-sandbox`; custom names
must have matching `[permissions.<name>]` tables. Custom filesystem profiles can
grant `read`, `write`, or `none` for absolute paths, globs, and special tokens
such as `:project_roots`. Custom network profiles can enable limited or full
network access and domain rules.

## Project Instructions

Codex reads `AGENTS.md` before work starts. Global guidance comes from
`~/.codex/AGENTS.override.md` or `~/.codex/AGENTS.md`. Project guidance is
discovered from the project root down to the current directory, with
`AGENTS.override.md` taking precedence over `AGENTS.md` in each directory.
`project_doc_max_bytes` controls the maximum combined instruction bytes, and
`project_doc_fallback_filenames` adds alternate instruction filenames.

## Experimental Keys

`features.goals` is documented by the official Codex "Follow a goal" use-case
page as the config-file switch for `/goal`:

```yaml
key: features.goals
sourceKind: codex-use-case-doc
schemaStatus: documented-experimental
automaticApply: true
reason: Enable durable `/goal` workflows for long-running objectives while
  preserving any existing user-owned value.
```

Unlisted top-level booleans such as `plugins = true` remain excluded from
automatic apply; Supervibe uses schema-backed app/tool-suggestion surfaces for
plugin discovery instead.
