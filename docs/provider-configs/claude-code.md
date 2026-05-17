# Claude Code Provider Config Template

This template is grounded in the official Anthropic Claude Code documentation:

- https://docs.anthropic.com/en/docs/claude-code/settings
- https://docs.anthropic.com/en/docs/claude-code/mcp
- https://docs.anthropic.com/en/docs/claude-code/sub-agents
- https://docs.anthropic.com/en/docs/claude-code/hooks
- https://docs.anthropic.com/en/docs/claude-code/memory
- https://docs.anthropic.com/en/docs/claude-code/team

Claude Code configuration is split between JSON settings, MCP server config,
Markdown memory files, subagent definitions, and optional managed enterprise
policy. Supervibe provider tooling should patch only the project-owned files it
manages and must preserve user-owned host instructions outside managed blocks.

## Scope And Precedence

Claude Code applies settings in this order, highest precedence first:

1. Enterprise managed policy settings in `managed-settings.json`
2. Command-line arguments
3. Local project settings in `.claude/settings.local.json`
4. Shared project settings in `.claude/settings.json`
5. User settings in `~/.claude/settings.json`

Use `.claude/settings.json` for team-shared provider defaults that belong in
source control. Use `.claude/settings.local.json` for user-specific approvals,
experiments, or machine-local paths; Claude Code configures git to ignore that
file when it creates it.

Enterprise managed settings are deployed outside the project and override user
and project settings. Official paths include:

- macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`
- Linux and WSL: `/etc/claude-code/managed-settings.json`
- Windows: `C:\ProgramData\ClaudeCode\managed-settings.json`

## Settings JSON

`settings.json` configures permissions, environment variables, hooks, model
selection, tool behavior, MCP approval, and other runtime options. Keep project
settings conservative and prefer deny rules for sensitive material.

<!-- provider-config-template:claude-code:project-settings:start -->
```json
{
  "permissions": {
    "allow": [
      "Bash(npm run check)",
      "Bash(node --test tests/*.test.mjs)"
    ],
    "ask": [
      "Bash(git push:*)",
      "Bash(npm publish:*)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Bash(curl:*)"
    ],
    "additionalDirectories": [],
    "defaultMode": "default"
  },
  "enabledMcpjsonServers": [],
  "env": {},
  "hooks": {}
}
```
<!-- provider-config-template:claude-code:project-settings:end -->

## MCP

Claude Code can read project-scoped MCP servers from `.mcp.json`. Project
servers are shareable, but Claude Code prompts before using them for security.
Values in `.mcp.json` can use environment-variable expansion so teams can share
server definitions without committing secrets.

Use `enabledMcpjsonServers` in settings when an enterprise or project policy
needs to approve specific `.mcp.json` server names. Hooks see MCP tools with
names like `mcp__<server>__<tool>`, which can be matched in hook rules.

## Subagents

Subagents are Markdown files with YAML frontmatter:

- Project subagents: `.claude/agents/`
- User subagents: `~/.claude/agents/`

Project subagents take precedence when names conflict. Each subagent needs a
`name` and `description`; `tools` is optional and inherits the main thread tools
when omitted, including configured MCP tools. Use specific `tools` only when the
subagent should have narrower access than the main agent.

## Hooks

Hooks live in Claude Code settings files under the `hooks` key. Supported events
include `PreToolUse`, `PostToolUse`, `Notification`, `UserPromptSubmit`,
`Stop`, `SubagentStop`, `PreCompact`, `SessionStart`, and `SessionEnd`.

Use hooks for deterministic policy and context injection, not for broad shell
automation. Hook commands run on the local machine, so keep commands explicit,
reviewable, and scoped to project-safe paths.

## Permissions

Permissions are configured under `permissions.allow`, `permissions.ask`, and
`permissions.deny`. Use `permissions.deny` to make sensitive files invisible to
Claude Code, replacing deprecated ignore-pattern style configuration.

For enterprise deployments, managed policy can disable bypass permissions mode
and can enforce allow, ask, and deny rules that project files cannot override.

When the user explicitly requests no-prompt local automation, Genesis and Adapt may
add missing user-scope defaults to `~/.claude/settings.json`: set
`permissions.defaultMode` to `bypassPermissions` and
`permissions.skipDangerousModePermissionPrompt` to `true`. Preserve existing
values and never write these defaults into project `.claude/settings*.json`.

## Memory Files

Claude Code loads memory from `CLAUDE.md` files. Memory files are instructions
and project context, not settings JSON. They can exist at organization, user,
project, local-project, and nested subtree scopes. Claude Code also discovers
nested `CLAUDE.md` files under the current working directory.

Supervibe must preserve user-owned host instructions. When updating a
`CLAUDE.md` file, modify only Supervibe managed blocks and leave any surrounding
human-authored content untouched. Prefer the repository context migrator for
managed block updates instead of rewriting the whole file.

## Shared Supervibe Test Policy

For non-trivial test creation or expansion, including `tests/*.test.mjs` in Node projects, route test design or review through `qa-test-engineer` and any relevant domain specialist. Controller-authored tests are diagnostic until specialist review covers happy path, failure path, boundary/null, regression, and provider/host variants where applicable.

## Provider-Config Doctor Checks

A Claude Code provider-config doctor should verify:

- `.claude/settings.json` exists or can be generated as the shared project
  settings file.
- `.claude/settings.local.json` is treated as local and not auto-committed.
- `.mcp.json` server names match any `enabledMcpjsonServers` policy.
- `.claude/agents/` subagents have valid frontmatter and appropriately narrow
  tools.
- Hooks are declared in settings JSON and target known hook events.
- Permissions deny sensitive files such as `.env` and `secrets/**`.
- Managed settings are documented as higher precedence and not overwritten by
  project tooling.
- `CLAUDE.md` is updated only through managed blocks so user-owned host
  instructions are preserved.
