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
