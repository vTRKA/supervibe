---
description: >-
  Use WHEN checking Codex, Cursor, Gemini, OpenCode, Copilot, Claude Code, IDE
  registration, plugin manifests, local CLI availability, or host compatibility
  TO produce a read-only multi-host doctor report with exact repair actions.
---

# /supervibe-doctor

Checks whether the installed Supervibe package is ready for each supported
host. The command is read-only: it inspects manifests, command availability,
local registration files, host docs, and fresh-context adapter support.

## Invocation

```bash
/supervibe-doctor
/supervibe-doctor --host codex
/supervibe-doctor --host codex,cursor,opencode
/supervibe-doctor --host all --strict
/supervibe-doctor --host gemini --json
```

Equivalent local command:

```bash
npm run supervibe:doctor -- --host all
```

## What It Checks

- Package version and host manifest version sync.
- Codex, Claude, Cursor, Gemini, and OpenCode manifest shape.
- OpenCode plugin source, skill registration hook, and bootstrap injection.
- Gemini `GEMINI.md` context and tool-name mapping.
- CLI command visibility on `PATH`.
- Local registration files such as `~/.codex/plugins/supervibe` and
  `~/.gemini/GEMINI.md`.
- Whether `/supervibe-loop --fresh-context --tool <host>` supports the host.

## Modes

Default mode treats missing local CLIs and host registrations as warnings,
because not every developer has every host installed.

`--strict` is for release or local installation verification. It turns missing
CLI binaries and registration files into failures.

`--json` prints the same report in machine-readable form for CI or diagnostics.

## Safety Boundaries

- Read-only: do not install, unlink, rewrite, or register host files.
- Repair actions are printed as explicit next commands; the user decides whether
  to run them.
- Local paths and host registrations are diagnostic evidence, not mutation
  targets for this command.

## Output Contract

```text
SUPERVIBE_HOST_DOCTOR
Root:    <plugin-root>
Version: <package-version>
Mode:    standard|strict
Overall: PASS|FAIL (<score>/10)

CODEX - Codex CLI: PASS (9.5/10)
  OK manifest: .codex-plugin/plugin.json is valid JSON
  OK manifest-version: manifest version matches package 2.0.11
  WARN local-registration: ~/.codex/plugins/supervibe was not found
     next: Run install.sh/install.ps1 or link the repo to ~/.codex/plugins/supervibe.
```

Confidence: N/A    Rubric: read-only-research

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-doctor` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, required agents, and durable-write permission before any agent-owned artifact is produced.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
