# Gemini CLI Provider Config Template

This template is grounded in the official Google Gemini CLI documentation:

- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/index.md

Gemini CLI uses layered JSON settings, `GEMINI.md` hierarchical memory, MCP
server configuration, extensions, policy and approval controls, and optional
checkpointing. Supervibe provider tooling should generate project-local config
only unless a user explicitly requests instructions for global configuration.

## Scope And Precedence

Gemini CLI applies configuration in this order, lowest precedence first:

1. Built-in defaults
2. System defaults file
3. User settings file
4. Project settings file
5. System settings file
6. Environment variables and `.env` files
7. Command-line arguments

JSON settings files live at:

- System defaults: `/etc/gemini-cli/system-defaults.json`,
  `C:\ProgramData\gemini-cli\system-defaults.json`, or
  `/Library/Application Support/GeminiCli/system-defaults.json`
- User settings: `~/.gemini/settings.json`
- Project settings: `.gemini/settings.json`
- System overrides: `/etc/gemini-cli/settings.json`,
  `C:\ProgramData\gemini-cli\settings.json`, or
  `/Library/Application Support/GeminiCli/settings.json`

Editors can validate settings against
`https://raw.githubusercontent.com/google-gemini/gemini-cli/main/schemas/settings.schema.json`.

## Settings JSON

Settings are organized under top-level category objects such as `general`,
`ui`, `tools`, `mcpServers`, `telemetry`, `privacy`, `model`, `context`, and
`advanced`.

<!-- provider-config-template:gemini-cli:project-settings:start -->
```json
{
  "$schema": "https://raw.githubusercontent.com/google-gemini/gemini-cli/main/schemas/settings.schema.json",
  "general": {
    "defaultApprovalMode": "default",
    "checkpointing": {
      "enabled": true
    },
    "plan": {
      "enabled": true
    }
  },
  "privacy": {
    "usageStatisticsEnabled": false
  },
  "context": {
    "fileName": ["GEMINI.md"],
    "includeDirectories": [],
    "loadFromIncludeDirectories": false,
    "fileFiltering": {
      "respectGitIgnore": true,
      "respectGeminiIgnore": true
    }
  },
  "mcpServers": {},
  "advanced": {
    "excludedEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
  }
}
```
<!-- provider-config-template:gemini-cli:project-settings:end -->

## GEMINI.md Memory

`GEMINI.md` files provide hierarchical instructional memory. The `/memory`
command can list, show, refresh, and add memory. `/memory refresh` reloads all
configured `GEMINI.md` files from global, project and ancestor directories, and
subdirectories.

Project memory belongs in the repository as `GEMINI.md` or another configured
`context.fileName`. Global memory belongs under the user's Gemini CLI home and
must not be modified automatically by project tooling. Use `/init` to generate a
starter project `GEMINI.md`, then preserve user-owned sections when adding
managed Supervibe blocks.

## Checkpointing

Enable checkpointing with `general.checkpointing.enabled`. When configured,
Gemini CLI creates recoverable snapshots around file-modifying tool calls, and
the `/restore` command can list or restore checkpoints for a tool call.

## MCP Servers

MCP servers are configured under `mcpServers` in settings JSON. The command
surface includes `gemini mcp` and interactive `/mcp` subcommands for auth,
enable, disable, list, reload, and schema inspection. Server entries can include
tool filters such as `includeTools` and `excludeTools`; exclusions take
precedence over inclusions.

## Extensions

Extensions are managed with `gemini extensions` commands. The CLI supports
`install` from Git URLs or local paths, `enable`, `disable`, linking for local
development, validating an extension, and updating one or all extensions.

At runtime, `--extensions` selects extensions for a session and `gemini -e none`
disables all extensions for that session.

## Approval Modes

The default approval mode is `general.defaultApprovalMode`. Supported persisted
values are `default`, `auto_edit`, and `plan`. `yolo` auto-approval is available
only through `--approval-mode=yolo` or the deprecated `--yolo` flag, not through
the persisted default setting.

Use `plan` for read-only planning. Use `auto_edit` only when edit tools may be
approved automatically. Keep `default` for shared project settings unless a
team policy explicitly requires a stricter mode.

## Session Output Format

The CLI supports `--output-format` with `text`, `json`, and `stream-json`.
This is useful for Supervibe automation that needs machine-readable session
output. The same CLI reference documents session controls such as `--resume`,
`--list-sessions`, and `--delete-session`.

## Security Settings

Security-relevant settings and flags include:

- `privacy.usageStatisticsEnabled` for usage-statistics collection.
- `context.fileFiltering.respectGitIgnore` and
  `context.fileFiltering.respectGeminiIgnore` for file discovery boundaries.
- `advanced.excludedEnvVars` for variables excluded from project `.env` loading.
- Best-effort environment-variable redaction during tool execution.
- `--sandbox`, `GEMINI_SANDBOX`, and custom `.gemini/sandbox.Dockerfile` for
  sandboxed execution.
- Folder trust controls via `/permissions trust` and
  `GEMINI_CLI_TRUST_WORKSPACE`.

## Provider-Config Doctor Checks

A Gemini CLI provider-config doctor should verify:

- `.gemini/settings.json` is valid JSON and uses known top-level categories.
- `GEMINI.md` is treated as project memory and global memory is not rewritten.
- `general.checkpointing.enabled` is explicit when restore support is expected.
- `mcpServers` entries define commands, args, env, tool filters, and enablement
  intentionally.
- Extension use is either documented in settings or constrained by CLI flags.
- Approval mode is one of `default`, `auto_edit`, or `plan` in settings.
- Automation uses `--output-format text`, `json`, or `stream-json`.
- Privacy, file filtering, env exclusion, sandbox, and trust settings are
  reviewed before unattended execution.
