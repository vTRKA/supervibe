---
name: shipping-and-launch
namespace: app-excellence
description: "Use WHEN preparing a feature, package, plugin, or workflow for release to prove launch readiness, rollback, monitoring, and support ownership."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: release
prerequisites: []
emits-artifact: launch-readiness-plan
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Shipping And Launch

## Overview

Shipping And Launch is the final readiness workflow before a feature, package, plugin, workflow, or user-facing change is released. It brings together acceptance, verification, docs, migration, feature flags, monitoring, rollback, communication, support ownership, and post-launch cleanup.

## When to Use

Use before release handoff, production rollout, package publish, plugin update, changelog publication, major user-facing feature launch, or final merge when the change has operational/support impact.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read the approved scope, task graph, PRD, plan, changelog, package metadata, and release target.
2. Search project memory for prior release, rollback, incident, versioning, package, or support decisions.
3. Run Code RAG for release surfaces: package, registry, docs, commands, agents, skills, validators, and host instructions.
4. Inspect `git status --short --branch` and preserve unrelated changes.
5. Read feature flag, CI/CD, deprecation, and branch finishing policies when relevant.

## When not to use

- Do not use before implementation and targeted checks are complete unless producing an advisory checklist.
- Do not publish, tag, push, deploy, or mutate external state without explicit authority.
- Do not call a release ready when broad gates are skipped without an explicit degraded/advisory label.
- Do not replace `finishing-a-development-branch`, `pre-pr-check`, or release-governance agents when those own the flow.

## Decision tree

```text
Is the change user-facing, package-facing, operational, or support-impacting?
  NO  -> pre-pr-check may be enough.
  YES -> continue.

Are acceptance criteria and targeted verification complete?
  NO  -> block launch and return missing evidence.
  YES -> continue.

Does rollout need staged exposure or kill switch?
  YES -> invoke feature-flag-rollout and require rollback test.
  NO  -> still define revert or disable path.
```

## Procedure

1. Confirm release scope, target audience, target branch/version, and authority level.
2. Verify acceptance criteria are complete and linked to command or test evidence.
3. Check version and package surfaces: manifests, locks, plugin registry, changelog, docs, install instructions, and generated metadata.
4. Check docs and migration needs: user docs, API docs, ADRs, deprecation notes, release notes, and known limitations.
5. Define rollout: all-at-once, percentage, cohort, dark launch, canary, package publish, or internal-only; justify choice.
6. Define rollback: revert commit, disable flag, republish, yank, migration rollback, config rollback, or support workaround.
7. Define monitoring: metrics, logs, dashboards, alerts, smoke checks, support channels, and owner.
8. Define communication: changelog entry, release note, user/support announcement, partner notice, and timing.
9. Define post-launch follow-up: cleanup flags, remove compatibility code, watch metrics, close tasks, and memory writeback only for durable learning.
10. Run authorized final verification and re-check git status.
11. Score with `supervibe:confidence-scoring`; below the gate, mark `BLOCKED` or `ADVISORY`.

## Common rationalizations

- "Tests passed, so we can ship" fails when rollback, monitoring, support owner, or docs are missing for launch-impacting work.
- "No one needs release notes" fails when users, support, or future maintainers need to understand behavior change.
- "Rollback is just revert" fails when data migrations, generated clients, package publish, or external consumers are involved.

## Red flags

- Changelog claims behavior not covered by verification.
- No owner watches metrics or support after launch.
- Version, package, registry, docs, or lockfile surfaces disagree.
- Feature flag has no cleanup deadline or tested disable path.
- Launch plan ignores active dirty worktree or unrelated changes.

## Checklist

- Scope, audience, and authority confirmed.
- Acceptance and targeted verification complete.
- Version, docs, changelog, migration, and package surfaces checked.
- Rollout, rollback, monitoring, support owner, and communication plan recorded.
- Post-launch cleanup and residual risk explicit.

## Failure modes

- Release is treated as a merge event instead of an operational change.
- Broad final gate is skipped but final answer says ready.
- Rollback depends on untested manual steps.
- Support learns about the change from users.

## Output contract

- `decision`: RELEASE, BLOCK, or ADVISORY.
- `scope`: change, audience, target version/branch, authority.
- `acceptanceEvidence`: criteria and verification outputs.
- `surfaceChecks`: package, registry, docs, changelog, migration, host instructions.
- `rollout`: shape, stages, gates, owner.
- `rollback`: exact command or action and time budget.
- `monitoring`: metrics, alerts, smoke checks, support channel.
- `communication`: release notes and stakeholder/user messaging.
- `postLaunch`: cleanup, watch window, memory writeback decision.
- `residualRisk`: skipped or degraded evidence.

## Guard rails

- Do not claim release-ready without command evidence.
- Do not mutate external release state without explicit authority.
- Keep fixes scoped to current-change failures unless the user expands scope.
- Preserve unrelated worktree changes and report them.

## Verification

- `git status --short --branch`
- Targeted checks from the plan plus `npm run check` before release handoff unless explicitly scoped narrower.
- Release/package validators named by the owning workflow.
- `npm run validate:skill-content-quality` when this skill changes.

## Related

- `supervibe:feature-flag-rollout`
- `supervibe:finishing-a-development-branch`
- `supervibe:pre-pr-check`
- `supervibe:git-workflow-and-versioning`
- `supervibe:ci-cd-and-automation`