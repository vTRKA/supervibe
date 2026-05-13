---
name: browser-runtime-verification
namespace: verification
description: >-
  Use after browser or UI changes to capture runtime proof with console,
  network, DOM, performance, accessibility, screenshot, and interaction evidence.
allowed-tools:
  - Bash
  - Read
phase: review
prerequisites: []
emits-artifact: browser-runtime-report
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1
last-verified: 2026-05-13T00:00:00.000Z
---

# Browser Runtime Verification

## When to invoke

Use after UI, browser-extension, prototype, preview-server, accessibility, performance, or client-side interaction changes.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Read the app start command, preview-server policy, target routes, expected browsers, and any design/prototype acceptance criteria. Confirm the test server is intentional and stop idle servers after verification.

## When not to use

- Do not use browser runtime checks as a substitute for unit or integration tests.
- Do not open production admin, payment, PII, or credential pages without explicit scope.
- Do not keep preview daemons running after evidence capture unless the user asked for a live URL.

## Decision tree

```text
Visual layout changed? -> screenshot + DOM snapshot + responsive viewport check
Interaction changed? -> click/type path + console/network errors
Data loading changed? -> network request/response status + empty/error states
Accessibility changed? -> keyboard path + accessible names + contrast notes
Performance-sensitive? -> load timing + long task/render evidence
Extension/browser API changed? -> permission boundary + console + manifest route
```

## Procedure

1. Start or reuse the documented preview command and record the URL.
2. Capture console errors, failed network requests, and the target DOM state.
3. Exercise the primary workflow, including keyboard or focus path when relevant.
4. Capture screenshots for at least one desktop and one narrow viewport when visual layout changed.
5. Stop any preview or browser helper process that is no longer needed.

## Common rationalizations

- "The component compiled, so the browser is fine" - false when hydration, assets, routes, or permissions can fail at runtime.
- "A screenshot is enough" - false for interactive flows, network failures, and accessibility regressions.
- "Leave the server running for later" - false unless the user needs a live session.

## Red flags

- Console errors, 4xx/5xx requests, blank canvases, missing assets, or text overlap.
- Evidence only shows the happy viewport while mobile/desktop constraints changed.
- Browser permissions or cross-origin calls are unreviewed.

## Checklist

- URL and command recorded.
- Console and network inspected.
- Primary interaction exercised.
- Screenshot or DOM evidence captured.
- Background preview/browser processes stopped or explicitly reported.

## Failure modes

- False pass from static HTML without JS hydration.
- Missed regressions from testing one viewport only.
- Process leak from preview daemons left after verification.

## Examples

- A Next.js form change requires route load, submit interaction, console/network scan, and screenshot evidence.
- A Chrome extension popup change requires manifest permission review, popup interaction, and service-worker console evidence.

## Output contract

Return `url`, `commands`, `viewports`, `consoleErrors`, `failedRequests`, `screenshots`, `accessibilityNotes`, `processCleanup`, and `verdict`.

## Guard rails

- Do not collect secrets or private user data.
- Do not rely on screenshot-only proof for behavior changes.
- Do not leave idle preview processes consuming memory.

## Verification

- `npm run validate:skill-content-quality`
- `npm run validate:agent-skill-coverage`

## Related

- `supervibe:preview-server`
- `supervibe:verification`
- `supervibe:ui-review-and-polish`
