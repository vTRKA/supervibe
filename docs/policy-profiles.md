# Supervibe Policy Profiles

Policy profiles are local project governance settings for autonomous loop runs.
They are not provider bypass settings and cannot weaken built-in deny rules.

## Built-In Profiles

- `solo-local`: local owner workflow with manual commits and no production mutation.
- `guided`: default guided worker profile for local implementation and tests.
- `contributor`: review-gated local writes, metadata branch sync, and worktree-first operation.
- `maintainer`: broader local maintenance permissions with release/security review gates.
- `CI-readonly`: no mutation, no network, no MCP write, no prompts.
- `CI-verify`: local artifact writes only under configured output directories.
- `release-prep`: release audits and local package checks without remote mutation.
- `enterprise-restricted`: read-only observer defaults with network and mutation denied.

## Local Profile File

Project-local overrides can live at `.supervibe/policy-profile.json`:

```json
{
  "extends": "guided",
  "name": "guided",
  "allowedTools": ["read", "tests"],
  "deniedTools": ["remote-mutation"],
  "reviewRequirements": ["maintainer-review"],
  "evidenceRequirements": ["focused-tests", "side-effect-ledger"]
}
```

Denied tools always win over allowed tools. Managed deny rules also win over
project-local profile overrides. Profile validation rejects secret-like fields
such as `token`, `password`, `secret`, `apiKey`, and raw credential values.

## Approval Receipts

Approval receipts are scoped, expiring JSONL records under
`.claude/memory/policy/approval-receipts.jsonl`. A receipt records the action,
exact target, scope, approver label, creation time, expiry, related task/run,
and allowed side effects. Receipts never store raw credentials.

Expired or scope-mismatched receipts fail closed and produce a next safe action.
Risky side effects can reference `approvalReceiptId` in the side-effect ledger,
and final acceptance includes receipt summaries.

## Commands

```bash
/supervibe-status --policy
/supervibe-status --role
/supervibe-loop --policy-profile guided --request "validate integrations"
/supervibe-loop --approval-receipts
/supervibe-loop --policy-doctor
/supervibe-loop --policy-doctor --fix-derived
```

CI profiles are no-tty safe. Approval-dependent actions become blocked states
with exact required approval instead of interactive prompts.
