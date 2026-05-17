---
name: ci-cd-and-automation
namespace: release
description: >-
  Use WHEN setting up or changing CI/CD, release automation, quality gates, workflow scripts, or hook-like automation to keep pipelines reproducible, secret-safe, fast-failing, and rollback-aware.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: release
prerequisites: []
emits-artifact: automation-readiness-plan
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# CI/CD and Automation

## Overview

CI/CD and Automation designs pipelines with explicit quality gates, failure feedback, secret handling, cache policy, rollout controls, and rollback paths. Host hooks are translated into local policy, not copied blindly.

## When to Use

- Creating or modifying CI jobs, release scripts, hooks, validators, deployment automation, scheduled checks, or workflow gates.
- A command must run non-interactively and fail with actionable output.
- Automation touches secrets, publishing, deployment, caches, generated artifacts, registry files, or version surfaces.
- A new quality gate must be part of `npm run check` or an equivalent final gate.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## When not to use

- Do not automate undefined or unsafe work.
- Do not copy host-specific shell hooks into shared policy.
- Do not add network, publish, destructive cleanup, or credential behavior without explicit scope and rollback.
- Do not hide flaky checks behind retries without naming the failure mode.

## Step 0 - Source-of-truth preflight

1. Read existing CI config, package scripts, release docs, validators, hooks, generated files, and security policy.
2. Search memory for pipeline failures, skipped gates, version drift, or release incidents.
3. Identify trigger, environment, permissions, secrets, caches, artifacts, timeout, and failure semantics.
4. Decide whether automation belongs in CI, local script, release gate, host adapter, or manual runbook.
5. Define dry-run and rollback before editing automation.

## Decision tree

```text
Repeated deterministic manual task? -> candidate for automation
Secrets/publishing/destructive side effects? -> require explicit scope, least privilege, dry-run, and rollback
Quality gate affects release readiness? -> wire into final check or documented release gate
Host-specific hook behavior? -> translate into host-neutral policy or adapter-specific file
Failure output not actionable? -> improve diagnostics before adding gate
```

## Procedure

1. Define goal, trigger, owner, and stop condition.
2. Map inputs, outputs, permissions, secrets, caches, artifacts, and timeouts.
3. Choose narrow execution surface: npm script, validator, CI job, release command, host adapter, or manual step.
4. Implement dry-run or read-only mode where possible.
5. Add actionable failure messages and avoid silent fallback.
6. Verify locally with targeted command and, when useful, failure-mode command.
7. Update docs, changelog, registry, or release guidance when behavior changed.
8. Emit automation readiness plan.

## Common rationalizations

- "CI will catch it" fails when the gate is not wired into CI or `npm run check`.
- "The script is only local" fails when local scripts mutate release or user-owned state.
- "Retries make it stable" fails when the root cause is missing isolation.
- "The hook worked upstream" fails because host hooks need local adapter policy.

## Red flags

- Automation writes outside intended workspace or provider config scope.
- Secrets are echoed, committed, or stored in artifacts.
- A failing gate produces vague output or hides the failing command.
- Cache keys can serve stale generated artifacts.
- Rollback is manual with no exact command or artifact.

## Checklist

- Trigger, owner, and execution surface are known.
- Permissions, secrets, caches, artifacts, and timeouts are documented.
- Dry-run, failure output, and rollback are defined.
- Gate is wired into intended validation path.
- Targeted verification output was captured.
- Docs or release notes updated when behavior changed.

## Failure modes

- Pipeline passes locally but fails in CI due environment assumptions.
- Automation hides a flaky dependency and trains maintainers to ignore failures.
- Hook or script mutates user-owned provider config unexpectedly.
- Generated artifacts drift because build is not deterministic or not committed.

## Output contract

Returns `automation-readiness-plan` with:

- `goal`
- `trigger`
- `owner`
- `executionSurface`
- `permissionsAndSecrets`
- `inputsOutputsArtifacts`
- `failureSemantics`
- `dryRunOrRollback`
- `verificationCommand`
- `releaseGateImpact`
- `residualRisk`

## Guard rails

- DO NOT add external side effects without explicit release scope.
- DO NOT store or print secrets.
- DO NOT use destructive cleanup without verified target boundary.
- ALWAYS make failure output actionable.
- ALWAYS wire release-critical gates into documented final validation.

## Verification

- Run `npm run validate:skill-content-quality`.
- Run `npm run validate:agent-skill-coverage` after owner wiring.
- For pipeline changes, run targeted validator plus `npm run check` at final release gate.

## Related

- `supervibe:pre-pr-check`
- `supervibe:finishing-a-development-branch`
- `supervibe:feature-flag-rollout`
