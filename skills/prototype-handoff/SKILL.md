---
name: prototype-handoff
namespace: process
description: >-
  Use after a prototype is explicitly approved to package a stack-agnostic
  development handoff bundle with approval, token, component, viewport, mock,
  and backend-integration evidence.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: handoff
prerequisites:
  - prototype-approved
emits-artifact: handoff-bundle
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 1.3
last-verified: 2026-05-14T00:00:00.000Z
---

# Prototype Handoff

## Overview

This skill packages an approved native HTML/CSS/JS prototype into a
ready-for-development bundle at
`.supervibe/artifacts/prototypes/<slug>/handoff/`. The bundle is stack-agnostic:
it tells downstream framework developers what to build, which tokens and
components were approved, and which evidence must carry forward.

The release boundary is `approved prototype + final tokens`. The handoff has one
single source of truth: the approved prototype directory plus the final
design-system token snapshot. Stop when competing prototypes remain active for
the same surface.

Detailed bundle layouts, inventory JSON examples, adapter notes, README
templates, and data-fed evidence matrices live in
[Loop Evidence Patterns](../../references/skills/loop-evidence-patterns.md#prototype-handoff-evidence-patterns).

## When to Use

Use after `supervibe:prototype`, `supervibe:landing-page`, or `/supervibe-design`
Stage 8 produces a prototype and the user explicitly approves it with
`.supervibe/artifacts/prototypes/<slug>/.approval.json` containing
`status: "approved"`.

Do not use for draft prototypes, under-review prototypes, production deployment,
or framework implementation. Production work belongs to the chosen stack
developer after handoff.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read `.supervibe/artifacts/prototypes/<slug>/.approval.json`; STOP unless
   `status === "approved"`.
2. Read `<slug>/config.json` for target, viewports, interaction depth, and data
   mode.
3. Read `.supervibe/artifacts/prototypes/_design-system/manifest.json` and
   confirm final token state matches approval metadata.
4. Check alternatives and sibling candidates; STOP if more than one active source
   remains for the same surface.
5. For data-fed prototypes, read `mocks/mock-contract.json`,
   `mock-scenarios.json`, `api-fixtures/`, and `backend-integration.md`; STOP if
   the contract is missing.
6. Inventory every prototype file needed to list components, tokens, viewports,
   mocks, and reviews.

## Decision tree

```
Approval marker missing or not approved
  -> STOP and route back to prototype approval.

Design system is missing, candidate, or newer than approval
  -> STOP or ask for re-approval against the final token snapshot.

Multiple candidate prototypes remain active
  -> STOP until one approved source remains and the others are parked/rejected.

Data-fed prototype lacks mock or backend contract evidence
  -> STOP and route through mock-data contract production before handoff.

Target needs a platform adapter
  -> write stack-agnostic bundle plus target-specific adapter notes.
```

## Procedure

1. Validate approval, final tokens, selected prototype, and absence of active
   competing alternatives.
2. Create or refresh `.supervibe/artifacts/prototypes/<slug>/handoff/`.
3. Copy approved prototype files verbatim. Do not improve, restyle, or rewrite
   the approved source during handoff.
4. Write `README.md` with approval metadata, viewports, design-system version,
   consumption instructions, and production verification checklist.
5. Write `components-used.json` with component names, design-system references,
   occurrences, variants, sizes, and file/line citations.
6. Write `tokens-used.json` grouped by token category and record any raw values
   that bypass tokens.
7. Write `viewport-spec.json` and target-aware adapter notes. Keep
   `stack-agnostic.md` present for every target; add platform adapter files when
   config target requires them.
8. For data-fed prototypes, copy mocks unchanged into `handoff/mocks/` and write
   `backend-integration.md` with contract status, endpoint mapping, scenario
   coverage, backend questions, switch-to-live rule, and contract drift rule.
9. Bind executable producer output with runtime workflow receipts when the owning
   workflow requires them.
10. Score against `confidence-rubrics/prototype.yaml`; require at least 9 before
    claiming ready-for-development.

## When not to use

- Do not bypass the command or workflow that owns durable handoff artifacts.
- Do not run without approved prototype evidence and final token evidence.
- Do not use handoff to replace framework implementation or specialist review.

## Common rationalizations

- "The prototype looks final, so approval metadata is unnecessary" - reject;
  approval JSON is the gate.
- "A framework hint is useful, so generate framework code now" - reject; handoff
  is stack-agnostic and framework implementation is downstream.
- "Minor visual fixes during copy are harmless" - reject; the approved prototype
  must be copied verbatim.

## Red flags

- Handoff files differ from approved prototype source without a recorded
  re-approval.
- `tokens-used.json` contains raw values that are not investigated.
- Data-fed handoff claims backend readiness without contract, scenarios,
  fixtures, and backend integration notes.
- Multiple active prototype alternatives remain for the same surface.

## Checklist

- Approval marker and final token state confirmed.
- One selected prototype source remains active.
- Approved files copied verbatim into `handoff/`.
- Components, tokens, viewports, adapter notes, reviews, and mocks inventoried.
- Confidence score and receipt evidence recorded when required.

## Failure modes

- Handoff freezes a stale design-system snapshot without warning.
- Stack-specific implementation leaks into the stack-agnostic bundle.
- Data fixtures drift during copy and no longer match prototype fetch behavior.
- Downstream developer cannot trace a component or token to file/line evidence.

## Output contract

Fields: `Source`, `Bundle`, `Components`, `Tokens`, `Viewports`, `Mock data`,
`Stack-agnostic adapter hints`, `Reviews carry-over`, `Status`, `Confidence`,
`Override`, and `Rubric`.

`Status` may be `ready-for-development` only when approval, final tokens,
inventory, target adapter, data-fed evidence, verification, and confidence gates
pass.

## Guard rails

- Do not run on unapproved prototypes.
- Do not run without final tokens.
- Do not modify the source prototype during handoff.
- Do not pick a framework or generate framework code.
- Do not claim backend-ready data integration without mock and backend contract
  evidence.
- Do not delete the source prototype; handoff is a copy, not a move.

## Verification

- `.supervibe/artifacts/prototypes/<slug>/handoff/` exists with README,
  approved source copy, `components-used.json`, `tokens-used.json`,
  `viewport-spec.json`, `stack-agnostic.md`, and required adapter/mock files.
- `components-used.json` enumerates at least one component per page when pages
  contain design-system components.
- `tokens-used.json.rawValues.{hex,px,cubicBezier}` are empty or explicitly
  investigated.
- Design-system version and final token state match approval metadata.
- Data-fed handoff includes `handoff/mocks/`, mock contract files, and backend
  integration notes that call out contract drift handling.

## Supporting references

- [Prototype handoff evidence patterns](../../references/skills/loop-evidence-patterns.md#prototype-handoff-evidence-patterns)
  - bundle tree, JSON examples, README fields, adapter matrix, and backend
  contract details.

## Related

- `supervibe:prototype` and `supervibe:landing-page` - produce source prototypes.
- `supervibe:brandbook` - produces the design system.
- `supervibe:tokens-export` - downstream token conversion.
- `supervibe:mock-data-contract` - mock scenarios and backend integration.
- `<stack>-developer` agents - consume the bundle.
