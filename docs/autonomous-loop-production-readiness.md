# Autonomous Loop Production Readiness

Production-intent work may be prepared autonomously. Production mutation is
approval-gated and must stop unless an exact approval lease covers the specific
action, target environment, tools, and timebox.

## Production-Prep Completion Contract

A production-prep run can complete when it produces all of the following:

- Requirements summary and explicit out-of-scope boundaries.
- Implementation evidence or a clear no-code-change statement.
- Focused tests plus CI or local equivalent output.
- Supply-chain checks for package manager, lockfile, dependency drift, and
  vulnerability exceptions.
- Security/privacy review notes for secrets, credentials, PII, logging, and
  third-party tools.
- Build/package/deploy-prep evidence without remote mutation unless approved.
- Rollback plan with owner, trigger, command or manual steps, and data safety
  notes.
- Smoke-check plan for the target environment.
- Observability plan covering logs, metrics, alerts, dashboards, and who watches
  first-hour signals.
- Documentation/operator notes for the changed behavior.
- Approval boundary statement listing exactly which production, remote,
  credential, billing, DNS, account, access-control, or destructive actions
  remain blocked.
- Unresolved gate list with gate IDs, blockers, owner, and next action.

## Hard Stops

The loop must stop before any of these actions without an exact approval lease:

- Production deploy or rollback.
- Destructive migration or irreversible data mutation.
- Credential creation, rotation, deletion, or raw secret handling.
- Remote server mutation, DNS, account, billing, or access-control change.
- External tracker write or MCP write when the adapter policy is unknown.
- Provider permission bypass, sandbox bypass, hidden background execution, or
  unsafe all-tools mode.

## Provider Permission Audit

Every non-dry autonomous run must include a provider permission audit in
`preflight.json`, `state.json`, status output, and the final report. The audit
must show:

- Effective permission mode and whether provider bypass remains disabled.
- Denied tool classes and prompt-required tool classes.
- Dangerous provider flags that were rejected.
- Network, MCP, remote mutation, and sensitive-file approval state.
- Rate-limit or retry-after state and the next safe action.

The audit fails closed when permission state is unknown. External fresh-context
adapters require visible spawn approval and a permission prompt bridge for
non-interactive execution. Raw secret values are never written to logs, reports,
memory, exported bundles, or the side-effect ledger.

## Provider Capability Matrix

Every loop preflight must include the shared provider capability matrix and the
selected provider's continuation mode. The matrix covers Claude, Codex, Cursor,
Gemini, OpenCode, and Copilot so command behavior does not depend on stale
per-command assumptions.

- Claude: fresh-context adapter plus Stop/SubagentStop/TeammateIdle hook
  continuation where the host exposes hooks.
- Codex: fresh-context adapter plus Supervibe file state as the portable
  baseline and native goal workflows when the installed Codex build supports
  them.
- Gemini and OpenCode: fresh-context adapters with Supervibe file-state
  continuation.
- Cursor and Copilot: guided/manual execution until a portable fresh-context
  adapter exists.

If a user requests `--fresh-context` for a host without a fresh-context adapter,
readiness must block on `tool-access`, the preflight confidence must cap below
9/10, and the next safe action must be guided or manual execution for that
provider.

## Evidence Requirements

| Area | Required evidence |
| --- | --- |
| Build/test | CI result or local equivalent command output with timestamp or artifact path |
| Supply chain | lockfile status, dependency audit, license/provenance note, exception list |
| Smoke checks | exact checks, expected result, rollback trigger, owner |
| Observability | dashboards/log queries/alerts or a documented local equivalent |
| Rollback | commands or manual steps, expected duration, data safety statement |
| Gates | every open gate listed in state and final report |
| Side effects | side-effect ledger reconciled, with rollback/cleanup for non-dry-run work |

## Approval Boundary Statement

Every production-prep final report must include a statement in this shape:

```text
Production readiness is complete for <scope>.
The loop did not perform production mutation.
Blocked actions: <list>.
Required approval lease before mutation: <environment>, <tool/action>,
<duration>, <rollback owner>, <verification command>.
```

## Safe Resume

If production-prep blocks, `prime` must show the exact ready front, open gates,
approval boundary, and next safe action. `doctor` must be able to diagnose stale
claims, unresolved side effects, missing artifacts, and graph blockers before a
fresh agent resumes.

Worker and reviewer attempts must have a bounded no-progress timeout. When the
timeout fires, the controller stops the adapter when possible, records a stalled
attempt with `no_progress_timeout`, releases or fails the claim, and resumes via
a changed retry, smaller batch, or explicit blocker. Repeating the same stuck
worker/reviewer wait is not valid progress.

Heavy verification commands are final-epic gates, not per-task loop checks.
Commands such as `npm run check`, `npm test`, `npm run check:release-strict`,
`npm run validate:epic-completion`, broad `node --test`, and known global
quality sweeps must be deferred while any epic work remains open. For plan,
graph, and task development, all tests and validators are final release-gate
work: workers must report them as deferred release-gate commands in loop state,
not run targeted tests, lightweight validators, or readiness validators during
development. The deferred commands run only after the epic is complete or when
explicitly allowed by a final verification mode.

Continuation trigger phrases in Russian and English must read
`.supervibe/memory/active-workflow.json`
before the command catalog. If active state is valid, the router must execute the
recorded next command. If active state is absent or invalid, it must route to
`/supervibe-loop --resume-dispatch` so the runtime either dispatches the next
next ready task dispatch or reports that no active graph exists, instead of guessing a
producer command. After a loop-ready plan is approved, the default next command is
atomization; after atomization, the default next command is `/supervibe-ui` so
the user can inspect epic and task progress before execution continues.
