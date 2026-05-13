# Cursor Provider Config Template

This template is grounded in the official Cursor documentation:

- https://docs.cursor.com/en/context
- https://docs.cursor.com/advanced/model-context-protocol
- https://docs.cursor.com/en/cli
- https://docs.cursor.com/en/cli/using
- https://docs.cursor.com/en/cli/reference/output-format
- https://docs.cursor.com/en/background-agents
- https://docs.cursor.com/account/privacy

Cursor configuration spans project rules, root instruction files, MCP config,
CLI behavior, and optional remote background-agent environments. Supervibe
provider tooling should treat Cursor's foreground CLI and background agents as
different execution surfaces with different safety profiles.

## Rules And Host Instructions

Cursor project rules live in `.cursor/rules`. Each rule is an MDC file with
frontmatter and content. Project rules are version-controlled and scoped to the
codebase. User rules are global settings in the Cursor environment.

Cursor supports four project rule types:

- `Always`: always included in model context.
- `Auto Attached`: included when referenced files match configured globs.
- `Agent Requested`: available to the AI, which decides whether to include it;
  a description is required.
- `Manual`: included only when explicitly referenced with `@ruleName`.

Subdirectories can contain nested `.cursor/rules` directories. Nested rules are
scoped to files under that directory and attach automatically when those files
are referenced. Use scoped Cursor rules for package-specific or subsystem
guidance rather than one broad global rule.

Cursor also reads root `AGENTS.md` and `CLAUDE.md` files in the CLI and applies
them as rules alongside `.cursor/rules`. Preserve user-owned content in these
host instruction files and update only Supervibe managed blocks.

## MCP Config

Project MCP servers are configured in `.cursor/mcp.json`. Global MCP servers
are configured in `~/.cursor/mcp.json`. Cursor supports stdio, SSE, and
Streamable HTTP transports. `mcp.json` values can use variables in `command`,
`args`, `env`, `url`, and `headers`, including `${env:NAME}`, `${userHome}`,
`${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}`, and
`${/}`.

<!-- provider-config-template:cursor:mcp:start -->
```json
{
  "mcpServers": {
    "local-server": {
      "command": "node",
      "args": ["${workspaceFolder}/tools/mcp-server.js"],
      "env": {
        "API_KEY": "${env:API_KEY}"
      }
    }
  }
}
```
<!-- provider-config-template:cursor:mcp:end -->

## CLI Behavior

The Cursor CLI command is `cursor-agent`. Interactive mode asks before terminal
commands. Non-interactive print mode uses `-p` or `--print`, can be combined
with `--output-format`, and has full write access. Treat print mode as
automation with elevated risk.

Supported output formats are `text`, `json`, and `stream-json`. `json` emits one
final result object on success, while `stream-json` emits NDJSON events and is
the default output format for print mode.

Sessions can be resumed with `cursor-agent resume`, listed with
`cursor-agent ls`, or resumed by ID with `--resume`.

## Background Agents

Cursor background agents are asynchronous remote agents. They clone a GitHub
repository, work in an isolated Ubuntu-based remote machine, edit code on a
separate branch, and push the branch to GitHub for handoff.

Background agents are configured with `.cursor/environment.json`, which can be
committed to the repo or stored privately. The file can define:

- `snapshot`: a base environment snapshot selected during setup.
- `install`: a repeatable dependency installation command.
- `start`: optional startup command for services such as Docker.
- `terminals`: long-running commands started in tmux for the agent.

Background agents have internet access and auto-run terminal commands. This is
different from foreground CLI command approval and should be called out in any
provider-config doctor result.

## Remote Execution, Privacy, And Branch Handoff

Background agents require a GitHub connection with read-write access. Cursor
clones the repo, runs in remote infrastructure, and pushes a branch back for the
user to review or take over.

Privacy Mode is available for background agents. Cursor states that it does not
train on code in Privacy Mode and retains code only for running the agent. If a
background agent starts with privacy mode disabled, enabling privacy mode later
does not change that running agent's privacy setting.

For Cursor generally, requests route through Cursor's backend, and codebase
indexing uploads chunks to compute embeddings while plaintext code ceases to
exist after the request.

## Provider-Config Doctor Checks

A Cursor provider-config doctor should verify:

- `.cursor/rules` exists when structured project rules are expected.
- Rule files are focused, scoped, and use `description`, `globs`, and
  `alwaysApply` intentionally.
- Root `AGENTS.md` and `CLAUDE.md` are preserved as user-owned host instruction
  files outside managed blocks.
- `.cursor/mcp.json` uses the documented `mcpServers` shape and avoids
  committed secrets.
- CLI automation treats `cursor-agent -p` full write access as high risk.
- `.cursor/environment.json` is present only when background agents need remote
  execution setup.
- Background-agent docs mention remote execution, internet access, GitHub
  read-write permissions, Privacy Mode, and GitHub branch handoff.
- Scoped Cursor rules are preferred over one large always-on rule when guidance
  applies to only part of the repository.
