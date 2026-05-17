---
name: deprecation-and-migration
namespace: release
description: >-
  Use WHEN sunsetting, replacing, or migrating APIs, commands, skills, configs, data shapes, or user workflows to preserve compatibility, communicate clearly, stage rollout, and prove safe removal.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: release
prerequisites: []
emits-artifact: migration-plan
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Deprecation and Migration

## Overview

Deprecation and Migration turns removal into a staged compatibility plan. It identifies consumers, classifies impact, writes migration steps, preserves rollback, communicates sunset, and verifies old and new paths.

## When to Use

- Removing, renaming, replacing, or narrowing APIs, commands, config, schemas, skills, agents, rules, files, docs, or workflows.
- Migration changes data shape, runtime behavior, host adapter behavior, release surfaces, or compatibility guarantees.
- Old code looks unused but may be referenced by users, generated artifacts, hooks, marketplace metadata, or external consumers.
- A deprecation notice, migration guide, or dual-run period is required.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## When not to use

- Do not use for purely additive changes.
- Do not justify immediate removal without consumer evidence.
- Do not replace API contract review, release governance, or data migration review when those own the risk.
- Do not hide breaking behavior behind a patch version or vague changelog note.

## Step 0 - Source-of-truth preflight

1. Read the current contract, docs, changelog, tests, generated artifacts, and release policy.
2. Search consumers in code, configs, docs, scripts, agents, skills, rules, registry surfaces, and manifests.
3. Check memory for deprecation windows, compatibility promises, and migration incidents.
4. Classify the change as additive, deprecating, breaking, or removal.
5. Identify rollback and dual-run feasibility before editing.

## Decision tree

```text
No consumer-impact evidence? -> stop and search consumers
Purely additive? -> use release notes or normal review
Deprecating but old path remains? -> add notice, guide, owner, and sunset criteria
Breaking or removal? -> require staged rollout, compatibility bridge, rollback, and verification
Regulated/security/data risk? -> escalate to owning specialist
```

## Procedure

1. Define old surface and new surface.
2. Map consumers and classify impact.
3. Choose migration path: bridge, flag, dual read/write, versioned endpoint, shim, codemod, docs-only, or hard stop.
4. Write communication plan with changelog, guide, owner, dates, and support channel.
5. Define staged rollout and rollback.
6. Patch only the approved stage.
7. Verify old and new paths and emit migration plan.

## Common rationalizations

- "Nobody uses this" fails without code, config, docs, and generated-consumer search.
- "It is internal" fails when internal consumers need compatibility and notice.
- "A changelog is enough" fails for breaking changes needing examples and rollback.
- "Remove the shim now" fails until removal criteria are satisfied.

## Red flags

- A field, command, skill, rule, path, or endpoint disappears with no migration guide.
- Version, docs, registry, and tests disagree about current surface.
- Rollback depends on manually restoring deleted state.
- Consumers lack before/after examples.

## Checklist

- Old and new surfaces are named.
- Consumers were searched and impact classified.
- Deprecation window or removal rationale is explicit.
- Migration guide and changelog decision are recorded.
- Rollback and verification commands are named.
- Removal criteria are measurable.

## Failure modes

- Silent breaking change reaches users before docs or version surfaces update.
- Migration succeeds in code but generated clients, registry entries, or adapters still reference old surface.
- Compatibility shim stays forever without removal criteria.
- Rollback cannot restore data or behavior.

## Output contract

Returns `migration-plan` with:

- `oldSurface`
- `newSurface`
- `changeClass`
- `consumerEvidence`
- `migrationSteps`
- `communicationPlan`
- `rolloutPlan`
- `rollbackPlan`
- `verificationCommands`
- `removalCriteria`
- `residualRisk`

## Guard rails

- DO NOT remove first and document later.
- DO NOT call a breaking change additive.
- DO NOT skip consumer search for internal APIs or generated artifacts.
- ALWAYS preserve rollback or mark irreversible risk.
- ALWAYS update release notes when users or operators must act.

## Verification

- Run `npm run validate:skill-content-quality`.
- Run `npm run validate:agent-skill-coverage` after owner wiring.
- For API or release surfaces, run relevant contract, changelog, registry, and package/version validators before release.

## Related

- `supervibe:feature-flag-rollout`
- `supervibe:finishing-a-development-branch`
- `supervibe:error-envelope-design`
