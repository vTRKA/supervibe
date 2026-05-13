# Internal Notes: /supervibe-loop

The public command lives at `commands/supervibe-loop.md`. This internal note
records implementation boundaries for maintainers: the loop is bounded,
cancellable, policy-gated, and must not be used as hidden background automation.

## Parser Contract

- Primary inputs: `--request`, `--plan`, `--from-prd`, `--resume`, `--status`,
  `--stop`.
- Diagnostics: `--readiness`, `graph`, `--graph`, `doctor`, `prime`,
  `archive`, `export`, `import`.
- Execution modes: `--dry-run`, `--guided`, `--manual`, `--fresh-context`.
  Bare loop runs default to provider-recommended real execution; use `--dry-run`
  only for explicit preview/compatibility artifacts.
- `--fresh-context --tool codex|claude|gemini|opencode` selects an adapter.
  Bare provider loops may enable visible spawn and permission-prompt bridge
  defaults, but external execution still requires adapter policy, side-effect
  tracking, context-forking task packets, and runtime spawn receipts. Command
  docs must not imply hidden unattended execution.
- `--provider-matrix` prints the shared host capability matrix. Unsupported
  fresh-context requests for package-only hosts must block readiness and
  degrade to guided/manual mode instead of silently falling back to a different
  provider.
- `--commit-per-task` is opt-in and must never be enabled by default.
- Worktree runs may be scoped with `--assigned-task`, `--assigned-tasks`,
  `--assigned-write-set`, `--assigned-wave`, and `--session-id`. Session
  registry writes must use the lock-protected file upsert path.

## Status Text Contract

Status output must include the exact stop reason, active gates, readiness gaps
where available, graph counts, adapter availability, provider continuation mode,
and next safe action. The output is plain text so it works in no-tty sessions
and logs.
