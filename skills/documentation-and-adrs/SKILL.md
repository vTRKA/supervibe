---
name: documentation-and-adrs
namespace: development
description: >-
  Use WHEN a decision, API, workflow, migration, or operational behavior needs durable documentation to record why it exists, what changed, alternatives, verification, and future review triggers.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: planning
prerequisites: []
emits-artifact: decision-record
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Documentation and Decision Records

## Overview

Documentation and decision records record durable why so future agents and maintainers do not rediscover it. It keeps public docs synchronized with behavior and verifies docs against source.

## When to Use

- Architecture, API, workflow, release, security, performance, or compatibility decisions create future constraints.
- User-facing docs, API docs, setup instructions, migration guides, runbooks, or host adapter behavior change.
- A code comment is needed to preserve non-obvious intent.
- Existing docs drift from source, tests, registry, or version surfaces.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## When not to use

- Do not document obvious private implementation details.
- Do not create a decision record for every small local choice.
- Do not document unimplemented behavior unless marked proposed.
- Do not use comments to compensate for code that should be simplified.

## Step 0 - Source-of-truth preflight

1. Read request, changed code or proposed decision, existing docs, changelog, README, registry, and tests.
2. Search memory for prior decisions and rejected alternatives.
3. Identify audience: user, maintainer, operator, integrator, reviewer, or future agent.
4. Classify artifact: decision record, public docs, API docs, runbook, migration guide, inline comment, release note, or no-docs rationale.
5. Choose verification: grep, test, validator, link check, registry build, or source citation.

## Decision tree

```text
Future constraint? -> decision record
User/operator/integrator must act? -> public docs, migration guide, or runbook
Public API shape changed? -> API docs plus contract verification
Only obvious local code changed? -> no-docs rationale
Docs mention commands, paths, versions, or counts? -> verify against source
```

## Procedure

1. Define documentation purpose and audience.
2. Read source behavior and existing docs before writing.
3. Record context, decision, alternatives, consequences, and verification.
4. Link to source files, commands, or validators instead of duplicating large output.
5. Update adjacent docs, changelog, registry, or README surfaces when behavior is user-facing or operational.
6. Run relevant validator or grep check and capture output.
7. Emit decision record or no-docs rationale.

## Common rationalizations

- "The code is the docs" fails for public contracts, migrations, operations, and decisions.
- "Update docs later" fails when users or agents need the doc now.
- "A decision record is bureaucracy" fails when the decision constrains future choices.
- "A comment explains it" fails if the code can be simpler.

## Red flags

- Docs contain stale versions, counts, paths, commands, or aliases.
- Decision record captures chosen option but not rejected alternatives.
- Public API changes without docs or no-docs rationale.
- Docs describe behavior no validator or source file supports.

## Checklist

- Audience and artifact type are explicit.
- Source behavior was read before writing.
- Prior decisions were checked when relevant.
- Alternatives and consequences are recorded.
- Links, paths, commands, counts, and versions were verified.

## Failure modes

- Documentation drift after registry or version rebuild.
- Future agents reverse a decision because why was missing.
- Noisy docs hide important constraints.
- Internal rationale leaks into public guidance.

## Output contract

Returns `decision-record` with:

- `artifactType`
- `audience`
- `context`
- `decision`
- `alternatives`
- `consequences`
- `updatedDocs`
- `verificationCommand`
- `noDocsRationale`
- `reviewTrigger`
- `residualRisk`

## Guard rails

- DO NOT document guessed behavior.
- DO NOT copy large generated output into prose docs.
- DO NOT expose internal task ids or temporary paths in public guidance.
- ALWAYS verify commands, paths, counts, versions, and links before release.
- ALWAYS record rejected alternatives for durable decisions.

## Verification

- Run `npm run validate:skill-content-quality`.
- Run `npm run validate:artifact-links` after changing references.
- Run `npm run validate:text-encoding`, registry build, or targeted tests when paths, versions, or generated surfaces change.

## Related

- `supervibe:source-driven-development`
- `supervibe:writing-plans`
- `supervibe:deprecation-and-migration`
