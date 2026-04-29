---
description: >-
  Run a bounded Supervibe autonomous agent loop over a plan or request with
  policy gates, preflight intake, confidence scoring, status, resume, and stop
  controls. Trigger phrases: '/supervibe-loop', 'run autonomous loop',
  'validate integrations with agents'.
---

# /supervibe-loop

Run a bounded autonomous loop for a user plan or open request. The command is
observable, cancellable, policy-gated, and blocked below a 9/10 task score.

## Invocation

```bash
/supervibe-loop --plan docs/plans/payment-integration.md
/supervibe-loop --request "validate code and fix integration bugs"
/supervibe-loop --request "finish onboarding design and wire it into app" --max-loops 20
/supervibe-loop --resume .claude/memory/loops/<run-id>/state.json
/supervibe-loop --status --file .claude/memory/loops/<run-id>/state.json
/supervibe-loop --stop <run-id>
```

## Contract

- Build a task queue from a plan or request.
- Run preflight for scope, autonomy, budget, environment, MCP/tool permissions,
  access needs, and approval boundaries.
- Dispatch specialist chains by task type.
- Keep structured handoffs, scores, audit events, side-effect ledger entries,
  and a final report under `.claude/memory/loops/<run-id>/`.
- Treat task score below 9.0 as incomplete.
- Stop for policy, budget, missing access, production approval, cancellation,
  state migration, or side-effect reconciliation.

## Safety Boundaries

- No provider bypass, rate-limit bypass, hidden background automation, or broad
  shell allowlist.
- No production deploy, destructive migration, credential mutation, remote
  server mutation, billing, account, or DNS action without explicit approval.
- Secrets are requested as references only, never raw values.
- The stop command only terminates loop-owned processes tracked by the
  side-effect ledger.

## Local CLI

```bash
npm run supervibe:loop -- --dry-run --request "validate integrations"
```
