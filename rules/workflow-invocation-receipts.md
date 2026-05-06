---
name: workflow-invocation-receipts
description: "Supervibe command flows must prove claimed command, skill, agent, reviewer, worker, validator, or tool invocations with runtime-issued workflow receipts."
applies-to: [any]
mandatory: true
version: 1.2
last-verified: 2026-05-06
related-rules: [command-agent-orchestration, confidence-discipline, operational-safety, instruction-surface-integrity]
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
- Use executable skill producers when a workflow provides one. For example, `/supervibe-design` Stage 2 brandbook outputs are promoted by `node <resolved-supervibe-plugin-root>/scripts/brandbook-producer.mjs run ...`, which writes durable files and issues the `supervibe:brandbook` skill receipt. The controller may prepare scratch input, but it must not hand-promote durable skill output and then launder it with a receipt.
- Store receipts in the shared workflow location `.supervibe/artifacts/_workflow-invocations/<command>/<handoff-id>/`.
- Keep one shared hash-chain ledger at `.supervibe/memory/workflow-invocation-ledger.jsonl`; the runtime serializes receipt issue with `.supervibe/memory/workflow-invocation-ledger.lock`, so do not bypass it with parallel hand-written appends.
- Receipt issue is idempotent for the same receipt path: rerunning a stage may replace that receipt's ledger entry and compact/rebuild the chain, but it must not leave stale duplicate ledger entries that make validation fail.
- Link produced artifacts through the colocated `artifact-links.json` file.
- Include command, subject type, subject id, stage, reason, input evidence, output artifacts, timestamps, handoff id, canonical runtime timestamp, runtime issuer, HMAC signature, canonical hash, and output artifact hashes.
- Reject mutable or log-like output artifacts before writing a receipt. Files such as `.jsonl`, `.log`, lock/key files, `.supervibe/memory/agent-invocations.jsonl`, and live mutable memory indexes are input evidence or runtime state, not durable producer outputs. Use stable per-agent output JSON or summary artifacts such as `.supervibe/artifacts/_agent-outputs/<invocation-id>/agent-output.json` and `summary.md`.
- Run `npm run validate:workflow-receipts` before claiming an invocation or delegated artifact is complete.
- Treat `PASS: true` with `COVERAGE_STATUS: not-started-*` as "nothing was
  available to validate", not as evidence that agents or receipts ran.
- Match the receipt subject to the claimed producer. A command receipt proves the command ran; it does not prove a specialist agent, reviewer, worker, validator, skill, or external tool produced the artifact.
- For `subjectType=agent`, `subjectType=worker`, or `subjectType=reviewer`, include `hostInvocation.source` and `hostInvocation.invocationId` from a real host agent run (for example the Task hook entry in `.supervibe/memory/agent-invocations.jsonl` or a host trace file). Runtime receipt issue must fail when this proof is missing. The invocation logger also writes `.supervibe/artifacts/_agent-outputs/<invocation-id>/agent-output.json` and `summary.md`; receipts should expose that stable evidence path when available.
- Run `npm run validate:agent-producer-receipts` before claiming any agent, worker, or reviewer output. This validator maps durable outputs to exact producers and verifies that agent-like receipts point to real host invocation evidence.
- Run any domain-specific receipt validator required by the workflow, such as `node scripts/validate-design-agent-receipts.mjs` for `/supervibe-design`, before claiming a delegated workflow is complete.
- For multi-validator workflows, prefer `node <resolved-supervibe-plugin-root>/scripts/supervibe-workflow-validate.mjs --workflow <command> --slug <slug>` so receipt, producer, encoding, source-resolver, and domain checks are reported together.
- If a receipt becomes stale after legitimate mutable state changes, use `workflow-receipt.mjs recovery-status` to summarize last trusted stage, dirty/untrusted receipts, and next safe action. Validators must print a concrete `NEXT_SAFE_ACTION` such as `node scripts/workflow-receipt.mjs rebuild-ledger --prune-stale`. Use `workflow-receipt.mjs reissue`, `workflow-receipt.mjs prune-stale --apply`, or `workflow-receipt.mjs rebuild-ledger --prune-stale` to repair runtime state. Manual ledger reconstruction is forbidden.

## What not to do

- Hand-written receipts are untrusted. Do not hand-write JSON receipts.
- Do not create command-specific receipt runtimes that duplicate the shared workflow receipt runtime.
- Do not claim an agent, skill, reviewer, worker, validator, command, or external tool was invoked when a trusted completed receipt is missing.
- Do not substitute a command receipt for a missing specialist receipt. If a specialist agent, worker, or reviewer was unavailable, stop before the agent-required durable artifact; do not mark the stage complete as `degraded-manual`. Manual drafts may be saved only as non-agent drafts with visible quality impact.
- Do not use a receipt to bypass an approval gate; receipts prove invocation provenance, not user approval.

## Examples

### Bad

```text
Receipt: command /supervibe-design completed
Claim: ux-ui-designer produced the styleboard
Output: .supervibe/artifacts/prototypes/app/styleboard.md
```

The command receipt proves only the command stage. It does not prove the
designer agent ran, and it cannot substitute for an agent, worker, reviewer, or
executable skill producer receipt.

### Good

```bash
node scripts/agent-invocation.mjs log --agent ux-ui-designer --host codex \
  --host-invocation-id <runtime-id> --task "styleboard direction" \
  --confidence 9 --issue-receipt --command /supervibe-design \
  --stage styleboard --handoff-id <slug> \
  --input-evidence .supervibe/memory/design-wizard/<slug>.runtime.json \
  --output-artifacts .supervibe/artifacts/_agent-outputs/<runtime-id>/agent-output.json
npm run validate:workflow-receipts
npm run validate:agent-producer-receipts
```

The claim is now tied to a host invocation id, stable agent output artifact,
workflow receipt, producer validator, and ledger chain.

## Enforcement

- Every command file must contain the Workflow Invocation Receipts contract.
- Every command file must reference the shared Command Agent Orchestration
  contract; command-specific prose must not replace the executable profile map.
- `scripts/validate-command-operational-contracts.mjs` checks all command surfaces for the shared receipt contract.
- `scripts/validate-workflow-receipts.mjs` verifies runtime signatures, ledger chain integrity, output artifact hashes, and artifact links.
- `scripts/validate-agent-producer-receipts.mjs` verifies global producer contracts and rejects agent, worker, or reviewer receipts that lack real host invocation proof.
- Specialized validators may add domain checks, but they must consume the shared workflow receipts instead of creating a duplicate receipt system.

## Related rules

- `confidence-discipline` - claims require evidence.
- `operational-safety` - hidden delegated work is unsafe.
- `instruction-surface-integrity` - command instructions must not be emulated from unpublished sources.
