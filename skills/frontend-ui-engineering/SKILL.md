---
name: frontend-ui-engineering
namespace: app-excellence
description: "Use WHEN implementing user-facing frontend screens or components to connect design intent, states, accessibility, responsiveness, and runtime proof."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: exec
prerequisites: []
emits-artifact: frontend-ui-implementation-report
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Frontend UI Engineering

## Overview

Frontend UI Engineering guides implementation of real screens and components after the product/design intent is known. It bridges design specs, component libraries, accessibility, responsive behavior, data contracts, state matrices, and browser runtime evidence.

Use it when the question is not just make a prototype but ship a usable UI implementation.

## When to Use

Use before implementing a screen, flow, form, dashboard, component, extension view, desktop shell, or mobile/web UI. Use after `supervibe:prototype-handoff` or design approval when engineering needs to preserve the states, tokens, accessibility, and interactions in code.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read the approved design, screen spec, prototype handoff, PRD, or user request.
2. Read existing component library, token files, route patterns, and nearby UI implementations.
3. Search project memory and Code RAG for prior design or implementation decisions.
4. Confirm API/mock-data contracts with `supervibe:mock-data-contract` or `supervibe:api-and-interface-design` when data shape is unclear.
5. Plan browser/runtime evidence with `supervibe:browser-runtime-verification` before claiming the UI works.

## When not to use

- Do not use for design exploration before the UX direction is known; use design/prototype skills first.
- Do not use for pure backend or CLI work.
- Do not hand-roll core design-system primitives when a local component or library already owns the pattern.
- Do not claim visual or interactive correctness without browser or runtime evidence when the UI can run.

## Decision tree

```text
Is there an approved design or screen contract?
  YES -> implement against it.
  NO  -> route to UX/design/prototype/requirements before coding.

Does existing component library cover the surface?
  YES -> compose existing components and tokens.
  NO  -> create the smallest justified component and document why.

Does the UI fetch, submit, or mutate data?
  YES -> bind states to API/mock contract and test loading/error/empty.
  NO  -> still enumerate static, responsive, focus, and disabled states.
```

## Procedure

1. Enumerate the user flow and every visible state: loading, empty, partial, success, validation error, permission error, network error, disabled, hover, focus, active, and optimistic/stale when relevant.
2. Map data dependencies to API, mock, or fixture contracts; reject implicit shape assumptions.
3. Reuse existing layout, tokens, and components before adding new primitives.
4. Build semantic structure first: headings, landmarks, labels, buttons, links, form controls, tables, dialogs, and live regions.
5. Implement responsive constraints with stable dimensions for fixed-format controls, grids, boards, toolbars, and tiles.
6. Wire interactions and focus behavior: keyboard path, modal focus trap, error focus, escape/close, disabled behavior, and reduced-motion fallback.
7. Add tests at the right layer: unit for pure state, component tests for states/interactions, browser/e2e for critical flows.
8. Check accessibility: roles, labels, contrast, focus visibility, zoom/reflow, screen-reader announcements, and no pointer-only actions.
9. Check performance only from measurements: bundle delta, render hot path, layout shift, image/media loading, and unnecessary client work.
10. Run the local verification commands and browser-runtime checks named in the output contract.
11. Self-review with `supervibe:code-review` and score with `supervibe:confidence-scoring`.

## Common rationalizations

- "The happy path renders, states can come later" fails because loading, empty, and error states are most of the first-session experience.
- "The design is obvious from the screenshot" fails when tokens, focus order, responsive behavior, and motion are not encoded.
- "Tests are enough, no browser pass needed" fails for layout, focus, overflow, runtime console, and responsive behavior.

## Red flags

- UI text overlaps, truncates unexpectedly, or resizes the layout on hover/state changes.
- Interactive element lacks semantic role, label, focus style, or keyboard path.
- Loading state is a spinner where final layout is known and skeleton would preserve context.
- Data shape is inferred from fixture JSON without contract ownership.
- Browser console or network errors are ignored after interaction.

## Checklist

- State matrix complete and implemented.
- Component reuse or new-component justification recorded.
- API/mock contract linked.
- Responsive, accessibility, and reduced-motion behavior checked.
- Tests and browser/runtime evidence named.
- Residual visual or data risks recorded.

## Failure modes

- Prototype fidelity is copied visually but not semantically.
- Component abstractions are added before a second real use.
- CSS fixes one viewport while breaking text fit or focus on another.
- Mock data masks backend contract gaps.

## Output contract

- `surface`: screen, flow, or component name.
- `statesImplemented`: state matrix with proof for each state.
- `contracts`: API/mock/component/token contracts used.
- `changedFiles`: implementation and test files.
- `accessibility`: keyboard, focus, role, label, contrast, reduced-motion evidence.
- `responsive`: viewport checks and known constraints.
- `verificationCommands`: exact test/build/browser commands.
- `runtimeEvidence`: screenshot, DOM, console, network, or degraded reason.
- `residualRisk`: remaining UI, data, or performance risk.

## Guard rails

- Do not bypass design tokens or component-library conventions without a recorded reason.
- Do not add decorative motion that lacks reduced-motion fallback.
- Do not claim done until text fit, focus, console, and network evidence are checked for changed flows.
- Preserve unrelated user changes and avoid broad styling rewrites.

## Verification

- Run the stack's targeted type, unit, lint, and build commands when available.
- Run `supervibe:browser-runtime-verification` for runnable UI changes.
- Run `npm run validate:skill-content-quality` when this skill changes.

## Related

- `supervibe:prototype-handoff`
- `supervibe:component-library-integration`
- `supervibe:ui-review-and-polish`
- `supervibe:browser-runtime-verification`
- `supervibe:mock-data-contract`