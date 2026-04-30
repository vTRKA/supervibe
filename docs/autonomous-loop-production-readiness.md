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
