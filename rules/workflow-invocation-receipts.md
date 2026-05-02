---
name: workflow-invocation-receipts
description: "Supervibe command flows must prove claimed command, skill, agent, reviewer, worker, validator, or tool invocations with runtime-issued workflow receipts."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-05-03
related-rules: [confidence-discipline, operational-safety, instruction-surface-integrity]
---

# Workflow Invocation Receipts

## Why this rule exists

Workflow emulation is a process bug: an assistant can say a command, skill, agent, reviewer, worker, validator, or tool was invoked when it only read instructions and improvised the result. That creates false evidence, hidden work, and artifacts that bypass user gates.

Concrete consequence of NOT following: a command can claim delegated expert work happened, write durable artifacts, and pass a shape-only validator even though no runtime invocation was recorded.

## When this rule applies

- Any Supervibe slash command.
- Any command flow that claims another Supervibe command, skill, agent, reviewer, worker, validator, or external tool ran.
- Any durable artifact produced from a delegated or staged workflow.

## What to do

- Issue receipts only through `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`.
- Store receipts in the shared workflow location `.supervibe/artifacts/_workflow-invocations/<command>/<handoff-id>/`.
- Keep one shared hash-chain ledger at `.supervibe/memory/workflow-invocation-ledger.jsonl`.
- Link produced artifacts through the colocated `artifact-links.json` file.
- Include command, subject type, subject id, stage, reason, input evidence, output artifacts, timestamps, handoff id, runtime issuer, HMAC signature, canonical hash, and output artifact hashes.
- Run `npm run validate:workflow-receipts` before claiming an invocation or delegated artifact is complete.

## What not to do

- Hand-written receipts are untrusted. Do not hand-write JSON receipts.
- Do not create command-specific receipt runtimes that duplicate the shared workflow receipt runtime.
- Do not claim an agent, skill, reviewer, worker, validator, command, or external tool was invoked when a trusted completed receipt is missing.
- Do not use a receipt to bypass an approval gate; receipts prove invocation provenance, not user approval.

## Enforcement

- Every command file must contain the Workflow Invocation Receipts contract.
- `scripts/validate-command-operational-contracts.mjs` checks all command surfaces for the shared receipt contract.
- `scripts/validate-workflow-receipts.mjs` verifies runtime signatures, ledger chain integrity, output artifact hashes, and artifact links.
- Specialized validators may add domain checks, but they must consume the shared workflow receipts instead of creating a duplicate receipt system.

## Related rules

- `confidence-discipline` - claims require evidence.
- `operational-safety` - hidden delegated work is unsafe.
- `instruction-surface-integrity` - command instructions must not be emulated from unpublished sources.
