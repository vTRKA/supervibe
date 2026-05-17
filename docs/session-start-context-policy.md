# Session Start Context Policy

Session start is a host-neutral context bootstrap lifecycle. It prepares the
controller with current Supervibe state, concise task-tracker context, and
non-fatal diagnostics before the first user action in a new or resumed session.

## User Outcome

Contributors get enough current context to continue work after startup, resume, clear,
or compact events without depending on one host's hook names or carrying full
conversation history forward.

## Scope Boundary

This policy covers session-start/context-bootstrap behavior in shared
Supervibe runtime code and portable hook configuration. Adapter-specific
surfaces can map their native events to this contract, but shared artifacts
must describe the lifecycle as `session-start` and `context-bootstrap`.

## Bootstrap Contract

The portable contract is:

- Canonical lifecycle: `session-start`.
- Bootstrap intent: `context-bootstrap`.
- Accepted reasons: `startup`, `resume`, `clear`, and `compact`.
- Required host-neutral plugin root environment: `SUPERVIBE_PLUGIN_ROOT`.
- Optional project-root overrides: `SUPERVIBE_PROJECT_ROOT` or
  `SUPERVIBE_PROJECT_DIR`.
- Failure mode: non-fatal diagnostic or quiet no-op when the adapter has not
  supplied the required host-neutral root.

Adapters may keep private host event names, but shared docs, skills, hooks, and
scripts should not require a provider-specific hook environment variable.

## Compact Context

Compact-context resumes must prefer task and evidence summaries over full chat
history. The bootstrap output should stay small and include only:

- active graph and tracker summary;
- top ready, claimed, or blocked work items;
- active plan or registry pointer when available;
- Code RAG/CodeGraph readiness status, not full index payloads;
- repair commands for missing evidence instead of inline rebuild output.

When context pressure is high, the next action is to create or use a
fresh-context handoff packet. The packet must carry task id, acceptance
criteria, verification matrix, compact context pack, policy boundaries, and
required output evidence. It must not copy full conversation history.

## Safe Initialization

Session start must be safe to run across Claude, Codex, Gemini, Cursor,
OpenCode, and future adapters:

- no host-specific environment variable is required by shared hook commands;
- no blocking failure should prevent the user's session from opening;
- expensive rebuilds should be deferred with repair commands when state is
  missing or unhealthy;
- idempotent cleanup is allowed only through runtime cleanup APIs and only for
  Supervibe-owned runtime state;
- background checks must be advisory and must not claim workflow progress.

Allowed bootstrap effects are limited to diagnostics, stale-state notices,
runtime cleanup of stale transient records, cached upgrade checks, mtime scans
for existing indexes, background auto-GC queueing, and compact task-tracker
context. Background auto-GC is detached, lock/throttle guarded, applies only
auto-safe memory, artifact, and artifact-snapshot retention, never archives
active work graphs or the latest rollback snapshot, and can be disabled with
`SUPERVIBE_AUTO_GC=off`. These effects do not complete
work items and do not replace verification.

## Receipt Compatibility

Session-start bootstrap never creates durable workflow proof. It may remind the
controller that workflow receipts are required, but it must not issue receipts,
hand-write receipt JSON, or let hook output substitute for producer, reviewer,
worker, validator, or external-tool receipts.

If a workflow names delegated work, the real host/tool path must still run and
`workflow-receipt.mjs` must issue the receipt at that time.

## Adapter Rules

1. Translate the host event into `session-start` with a reason of `startup`,
   `resume`, `clear`, or `compact`.
2. Set `SUPERVIBE_PLUGIN_ROOT` before invoking shared hook code.
3. Keep provider-specific environment and settings names inside adapter-owned
   docs or runtime code.
4. If an adapter cannot support session start, fail closed for required
   bootstrap proof and surface a diagnostic.
5. Preserve compact-context mode after a host compaction event.

## Verification

Targeted policy checks:

```bash
node --test tests/session-start-context-policy.test.mjs
npm run validate:artifact-links
npm run validate:skill-content-quality
```

## Related

- [Host Neutral Hook Portability](host-neutral-hook-portability.md)
- [Autonomous Loop Production Readiness](autonomous-loop-production-readiness.md)
- [Workflow Hardening](supervibe-workflow-hardening.md)
