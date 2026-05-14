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
last-verified: 2026-05-14T00:00:00.000Z
---

# Browser Runtime Verification

## Overview

Browser Runtime Verification proves browser-facing behavior in a real browser or
preview runtime. It captures devtools-class evidence for console output,
network requests, DOM state, accessibility, performance, screenshots,
interaction paths, responsive viewports, and process cleanup. Use it to reject
false confidence from compile-only checks, static screenshots, or unit tests
that never hydrate the page.

This skill emits a `browser-runtime-report` using
`references/templates/browser-runtime-report.md`. Evidence is partial until the
report names the command, URL, viewport coverage, console errors, failed
requests, screenshots, accessibility notes, cleanup state, and verdict.

## When to Use

- Use after UI, browser-extension, prototype, preview-server, accessibility,
  performance, or client-side interaction changes that can fail only at runtime.
- Use when a user workflow, loading state, empty state, error state, focus path,
  responsive layout, canvas, asset, route, or browser API needs visual or DOM
  proof.
- Use before claiming release readiness for browser-facing work when console,
  network, accessibility, or cleanup evidence must be recorded.
- Use after the start command, target URL, route, browser/device coverage, and
  security boundary are known or can be read from source artifacts.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Source-of-truth preflight

Before opening a browser, read and record:

- The app or preview start command, expected URL, route, browser, viewport
  policy, and cleanup expectation.
- The user workflow, state model, and acceptance criteria for normal, loading,
  empty, error, disabled, and permission-denied states.
- The accessibility contract: keyboard path, focus order, accessible names,
  landmark or heading structure, contrast concerns, and screen-reader-relevant
  state announcements.
- The runtime data boundary: whether the route touches authentication,
  authorization, admin controls, payment, production data, PII, extension
  permissions, regulated records, or third-party accounts.
- The evidence surface: screenshots, DOM snapshot, console log, failed network
  requests, performance timing, interaction trace, and process cleanup proof.
- For non-trivial Supervibe changes, project memory, Code RAG or code search,
  and CodeGraph status or fallback evidence required by repository policy.

If the source of truth is missing, stale, or unsafe to inspect, return
`BLOCKED` or `PARTIAL` with the missing artifact and do not invent browser
evidence.

## When not to use

- Do not use browser runtime checks as a substitute for unit or integration tests.
- Do not open authentication, admin, payment, PII, credential, billing,
  healthcare, financial, legal, government, or production pages unless explicit
  user scope, test credentials, data minimization, and redaction requirements
  are present.
- Do not enter real passwords, tokens, 2FA codes, payment cards, private user
  data, recovery codes, or secrets into a browser session.
- Do not grant browser-extension, camera, microphone, clipboard, file-system,
  geolocation, notification, or cross-origin permissions outside a sandboxed
  test profile and explicit permission boundary.
- Do not use production accounts, admin consoles, live payments, or real PII for
  screenshot or network evidence when a stub, fixture, test tenant, or local
  route can prove the same behavior.
- Do not keep preview daemons running after evidence capture unless the user asked for a live URL.

## Decision tree

```text
Start
  -> Target is auth, admin, payment, PII, production, or extension permission?
      -> Stop unless explicit scope, sandbox/test account, redaction, and cleanup are defined.
  -> Browser route cannot be started or URL is unknown?
      -> Return BLOCKED with the missing command, route, or environment.
  -> Visual layout changed?
      -> Capture desktop and narrow screenshots, DOM snapshot, and overlap/clipping notes.
  -> Interaction changed?
      -> Exercise click/type/keyboard path and inspect console plus network after each step.
  -> Data loading changed?
      -> Record request status, loading state, empty state, error state, and retry behavior.
  -> Accessibility changed or user input is present?
      -> Verify keyboard path, focus, accessible names, state announcements, and contrast notes.
  -> Performance-sensitive, canvas-heavy, or animation-heavy change?
      -> Record load timing, long task/render evidence, blank canvas checks, and asset failures.
  -> Browser extension or browser API changed?
      -> Verify manifest/permission boundary, test profile, service worker or background console, and denied-permission state.
  -> Evidence captured?
      -> Stop preview/browser helpers or explicitly report live process ownership.
```

## Procedure

1. Confirm scope, start command, URL, route, test data, browser profile,
   viewport list, unsafe-content boundary, and expected cleanup state.
2. Start or reuse only the documented preview command. Record the command, PID
   or process ownership when available, base URL, route, browser, and timeout.
3. Load the route and wait for the intended non-loading state. Capture initial
   console errors, page errors, failed requests, missing assets, redirects,
   hydration warnings, service-worker errors, and blank canvas indicators.
4. Inspect DOM state for the main route region, critical selectors, visible
   text, form state, disabled controls, current route, modal/dialog state,
   overflow, clipping, and evidence that the page is not a stale shell.
5. Exercise the primary user workflow with realistic click, type, submit,
   navigation, hover, drag, or keyboard steps. Re-check console and network
   after the interaction, not only after first load.
6. Verify state coverage for loading, empty, error, disabled, denied,
   validation-failure, and recovery states that are in scope. If a state cannot
   be reached safely, record why and lower the verdict to `PARTIAL`.
7. Verify the accessibility contract: keyboard reachability, visible focus,
   accessible names for controls, role or landmark structure, heading order,
   error announcement or association, color/contrast notes, and no focus traps.
8. Capture screenshots for each required viewport. At minimum, use one desktop
   viewport and one narrow/mobile viewport when layout, responsive behavior, or
   visual state changed.
9. Capture performance evidence when relevant: load duration, long tasks,
   repeated re-render indicators, layout shift, oversized assets, animation
   jank, memory pressure, or a clear "not applicable" reason.
10. Fill `references/templates/browser-runtime-report.md` with command, URL,
    viewport, console errors, failed requests, DOM/accessibility/performance
    evidence, screenshots, cleanup, residual risk, and verdict.
11. Close browser pages/contexts and stop preview or helper processes unless the
    user requested a live URL. Report any remaining process, profile, cache,
    test data, account session, or artifact cleanup explicitly.

## User workflow and state contract

- Name the primary workflow as user-visible steps, not implementation internals:
  open route, inspect initial state, interact, submit or navigate, verify
  result, and recover from failure.
- For loading states, show that the page either resolves to usable content or
  reports a bounded error; indefinite spinners are failures unless expected and
  timed.
- For empty states, verify the message, available action, disabled controls,
  and whether console/network output explains the absence of data.
- For error states, verify status copy, retry or escape path, focus behavior,
  network status, console output, and that sensitive details are not exposed.
- For accessibility, every interactive path must have keyboard reachability,
  visible focus, meaningful control names, appropriate roles, and no content
  hidden only by visual styling while remaining confusing to assistive tech.

## Common rationalizations

- "The component compiled, so the browser is fine" is false because hydration,
  route guards, missing assets, browser APIs, and permissions fail only in the
  runtime.
- "A screenshot is enough for this behavior change" is false because click,
  type, keyboard, network, console, and accessibility failures can be invisible
  in a still image.
- "Only the desktop viewport matters because the user did not mention mobile"
  is false when responsive CSS, wrapping, overflow, or fixed toolbars changed.
- "The API returned 200 in a terminal, so data loading is proven" is false until
  the browser request, CORS behavior, empty state, and error state are observed.
- "It is behind auth, so verification can be skipped" is false; either use a
  scoped test account/sandbox or report a security-boundary blocker.
- "Leave the preview server running for the next worker" is false unless the
  active workflow explicitly asks for a live URL and the process owner is named.

## Red flags

- Console errors, page errors, unhandled promise rejections, hydration warnings,
  blank canvases, failed source maps that hide real stack traces, or service
  worker errors remain unexplained.
- Network evidence has 4xx/5xx requests, CORS failures, opaque blocked
  responses, redirected assets, missing fonts, slow critical requests, or
  production endpoints in a local test.
- DOM evidence shows duplicate IDs, hidden-but-focusable controls, stale route
  shells, clipped text, overlapping elements, disabled actions without reason,
  or missing empty/error state content.
- Accessibility evidence omits keyboard traversal, focus order, accessible
  names, form error association, heading structure, or visible focus for a
  changed interactive path.
- Screenshot evidence covers only a happy path or one viewport while responsive
  constraints, wrapping, sticky headers, modals, or sidebars changed.
- Cleanup evidence is missing, or a preview server, browser profile, extension
  permission, authenticated session, fixture record, or downloaded file remains
  active without a named owner.

## Checklist

- Command, URL, browser, route, timeout, and environment were recorded.
- Unsafe content boundary was checked for auth, admin, payment, PII,
  production, and extension permissions before browser interaction.
- Console errors, page errors, and failed requests were captured before and
  after relevant interactions.
- DOM state and user-visible state coverage include normal, loading, empty,
  error, disabled, and recovery states when in scope.
- Primary mouse/touch and keyboard interaction paths were exercised.
- Accessibility notes cover focus, names, roles/headings, announcements, and
  contrast or state visibility concerns.
- Screenshots cover each required viewport, including desktop and narrow/mobile
  when layout changed.
- Performance evidence or a not-applicable reason is recorded.
- Cleanup names closed browser contexts, stopped processes, removed sessions or
  test data, and any intentionally live URL.
- Verdict is `PASS`, `FAIL`, `PARTIAL`, or `BLOCKED` and matches the evidence.

## Failure modes

- False pass from static HTML or server-rendered shell without JavaScript
  hydration. Detect with console, route state, critical interaction, and DOM
  evidence; recover by rerunning with scripts enabled and interaction proof.
- False pass from screenshot-only evidence for a behavior change. Detect missing
  click/type/keyboard steps and post-interaction console/network checks; recover
  by exercising the workflow.
- Missed responsive regression from one viewport. Detect absent desktop or
  narrow screenshots, overflow notes, or viewport sizes; recover with named
  viewport coverage.
- Hidden data failure from checking terminal output instead of browser network.
  Detect missing failed-request table, CORS status, or empty/error state notes;
  recover by inspecting browser network events.
- Unsafe evidence collection exposes credentials or private data. Detect real
  account, production, admin, payment, PII, or extension permission use without
  scope; recover by stopping, redacting artifacts, and switching to a sandbox.
- Process leak from preview daemons or browser helpers left after verification.
  Detect missing PID/process cleanup evidence; recover by stopping owned
  processes or reporting a live URL owner.

## Examples

- A Next.js form change on `/checkout/test` requires `npm run dev`, route load,
  typed validation failure, successful submit with fixture data, console and
  network scan, desktop plus mobile screenshots, and cleanup of the preview
  process.
- A browser extension popup change requires a sandbox browser profile,
  manifest permission review, popup click path, denied-permission state,
  background or service-worker console evidence, screenshot, and removal of the
  loaded extension profile.
- A data table change requires loading, empty, error, and populated states;
  failed request capture; keyboard navigation through rows and actions; DOM
  overflow checks; and a verdict that downgrades to `PARTIAL` if the error
  state cannot be reached.
- Anti-example: do not report a single desktop screenshot as proof for a
  responsive menu interaction when no click path, keyboard path, console scan,
  network scan, or cleanup evidence was recorded.

## Output contract

Return a `browser-runtime-report` with these fields:

- `status`: `PASS`, `FAIL`, `PARTIAL`, or `BLOCKED`.
- `command`: exact start or preview command used, or the blocker preventing it.
- `url`: base URL and route verified.
- `browser`: browser, profile, tool, and permission boundary.
- `viewports`: named viewport sizes, state checked, and outcome.
- `consoleErrors`: console errors, page errors, warnings that matter, or `none`.
- `failedRequests`: failed/blocked/slow/redirected requests, status, and impact.
- `domState`: route, critical selectors, visible state, overflow, and clipping.
- `interactionPaths`: user workflow steps and post-step observations.
- `stateCoverage`: normal, loading, empty, error, disabled, denied, and recovery
  state evidence or reason omitted.
- `accessibilityNotes`: keyboard, focus, names, roles/headings, announcements,
  and contrast notes.
- `performanceNotes`: timing, long tasks, layout shift, assets, animation, or
  not-applicable reason.
- `screenshots`: screenshot paths or artifact IDs with viewport and state.
- `cleanup`: stopped processes, closed browser contexts, removed sessions/test
  data, live URL owner, and remaining cleanup risk.
- `verdict`: evidence-backed decision, residual risk, and confidence boundary.

## Guard rails

- Do not collect secrets or private user data.
- Do not rely on screenshot-only proof for behavior changes.
- Do not leave idle preview processes consuming memory.
- Do not browse production, admin, payment, PII, credential, or extension
  permission surfaces without explicit scope and sandbox controls.
- Do not hide failed console/network/accessibility evidence behind a passing
  visual verdict.
- Do not claim 10/10 runtime certainty when memory, Code RAG, CodeGraph,
  browser evidence, or cleanup evidence is stale, unavailable, or partial.
- Always redact or omit sensitive values from screenshots, logs, reports, and
  copied network payloads.

## Verification

- `npm run validate:skill-content-quality`
- `npm run validate:artifact-links` when the report template or markdown links
  change.

## Related

- `supervibe:preview-server`
- `supervibe:verification`
- `supervibe:ui-review-and-polish`
- `supervibe:browser-feedback`
- `references/templates/browser-runtime-report.md`
