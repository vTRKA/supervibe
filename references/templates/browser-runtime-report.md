# Browser Runtime Report Template

Use this template when `browser-runtime-verification` emits a
`browser-runtime-report`. The report should be short enough to hand off, but it
must preserve the runtime evidence needed to evaluate browser behavior,
security boundaries, accessibility, responsive layout, performance, screenshots,
and cleanup.

## Report Metadata

| Field | Required content |
| --- | --- |
| Status | PASS, FAIL, PARTIAL, or BLOCKED. |
| Request | User request, work item, route, PR, or acceptance item being verified. |
| Command | Exact start, preview, or test command used, including relevant flags. |
| URL | Base URL and route path opened in the browser. |
| Browser | Browser, profile, tool, and permission mode. |
| Produced by | Agent, skill, reviewer, worker, or maintainer role. |
| Produced at | ISO-8601 date and timezone from the active workflow context. |

## Boundary Check

| Boundary | Status | Evidence | Decision |
| --- | --- | --- | --- |
| Authentication | In scope, out of scope, sandboxed, redacted, or blocked. | Test account, local fixture, omitted, or blocker. | Proceed, proceed with redaction, partial, or blocked. |
| Admin | In scope, out of scope, sandboxed, redacted, or blocked. | Test tenant, mock admin route, omitted, or blocker. | Proceed, proceed with redaction, partial, or blocked. |
| Payment | In scope, out of scope, sandboxed, redacted, or blocked. | Test payment mode, fixture, omitted, or blocker. | Proceed, proceed with redaction, partial, or blocked. |
| PII | In scope, out of scope, sandboxed, redacted, or blocked. | Synthetic data, redaction, omitted, or blocker. | Proceed, proceed with redaction, partial, or blocked. |
| Production | In scope, out of scope, read-only, redacted, or blocked. | Environment, tenant, no-write proof, or blocker. | Proceed, proceed with redaction, partial, or blocked. |
| Extension permissions | In scope, out of scope, sandboxed, denied, or blocked. | Test profile, manifest, permission prompt, or blocker. | Proceed, proceed with redaction, partial, or blocked. |

## Viewports

| Viewport | Size | Route/state | Screenshot | Result |
| --- | --- | --- | --- | --- |
| Desktop | Width x height. | Normal, loading, empty, error, modal, or interaction state. | Path or artifact ID. | Pass, fail, partial, or blocked with note. |
| Narrow/mobile | Width x height. | Normal, loading, empty, error, modal, or interaction state. | Path or artifact ID. | Pass, fail, partial, or blocked with note. |

## Console Errors

| Severity | Message summary | When observed | Impact | Resolution |
| --- | --- | --- | --- | --- |
| Error, warning, pageerror, unhandled rejection, or none. | Redacted summary, not secret-bearing logs. | Initial load, interaction step, reload, or cleanup. | User-visible impact or no impact. | Fixed, existing, ignored with reason, or blocker. |

## Failed Requests

| Method | URL or endpoint | Status/error | When observed | User impact |
| --- | --- | --- | --- | --- |
| GET, POST, asset, websocket, preflight, or none. | Redacted URL or route. | 4xx, 5xx, CORS, timeout, blocked, redirected, slow, or none. | Initial load, submit, navigation, retry, or background. | Blank state, degraded state, no impact, or blocker. |

## DOM And State Evidence

Record the rendered state, not only source expectations:

- Route and main visible region:
- Critical selectors or accessible elements:
- Normal state:
- Loading state:
- Empty state:
- Error state:
- Disabled or permission-denied state:
- Recovery or retry state:
- Overflow, clipping, overlap, blank canvas, stale shell, or missing asset notes:

## Interaction Paths

| Step | Action | Expected result | Observed result | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Click, type, submit, keyboard, hover, drag, navigate, or reload. | User-visible result. | Actual result. | Console/network/DOM/screenshot note. |

Include keyboard-only coverage for changed interactive paths. If a path cannot
be exercised safely, mark the report `PARTIAL` or `BLOCKED` and explain why.

## Accessibility Notes

| Area | Evidence | Issue or result |
| --- | --- | --- |
| Keyboard reachability | Tab order, shortcuts, dialogs, menus, forms, or skip path. | Pass, fail, partial, or not applicable. |
| Focus visibility | Focus ring, trap behavior, return focus, or hidden focus target. | Pass, fail, partial, or not applicable. |
| Accessible names | Buttons, links, inputs, icons, controls, and landmark names. | Pass, fail, partial, or not applicable. |
| Roles and headings | Landmarks, headings, dialogs, menus, tables, and live regions. | Pass, fail, partial, or not applicable. |
| Error announcement | Form error association, alert/live region, and recovery path. | Pass, fail, partial, or not applicable. |
| Contrast and state visibility | Text, disabled state, selected state, focus state, and overlays. | Pass, fail, partial, or not applicable. |

## Performance Notes

Record evidence only at the depth required by the change:

- Load or interaction timing:
- Long task, layout shift, re-render, animation, canvas, or memory notes:
- Slow, repeated, or oversized requests:
- Reason performance was not applicable:

## Screenshots

| Screenshot | Viewport | State | What it proves | Limit |
| --- | --- | --- | --- | --- |
| Path or artifact ID. | Desktop, narrow/mobile, or custom. | Normal, loading, empty, error, modal, interaction, or denied. | Layout, state, no overlap, no clipping, asset rendered, or interaction result. | What the screenshot does not prove. |

Screenshots do not prove behavior by themselves. Tie each behavior claim to a
DOM, console, network, accessibility, or interaction note.

## Cleanup

| Item | Evidence | Remaining risk |
| --- | --- | --- |
| Preview process | Stopped, reused with owner, or intentionally left live. | None, live URL owner, port conflict, or blocker. |
| Browser context/profile | Closed, reset, sandbox retained with owner, or blocked. | Session, permission, cache, download, or extension risk. |
| Test data/session | Removed, fixture-only, no data written, or blocked. | Orphaned record, auth session, PII, payment, or admin risk. |
| Artifacts | Screenshot/log path, redacted, retained, or deleted. | Secret/PII exposure, stale artifact, or none. |

## Verdict

State one decision:

- PASS: required browser runtime evidence is complete, unsafe boundaries were
  respected, and cleanup is complete or intentionally owned.
- FAIL: a blocking console, network, DOM, accessibility, performance,
  responsive, interaction, or cleanup problem was observed.
- PARTIAL: browser evidence was useful but a state, viewport, boundary, or
  source could not be verified safely.
- BLOCKED: command, URL, credentials, sandbox, permission, route, environment,
  or safety boundary prevented valid browser verification.

Include residual risk, owner, and next safe action:

| Verdict | Residual risk | Owner | Next action |
| --- | --- | --- | --- |
| PASS, FAIL, PARTIAL, or BLOCKED. | Known remaining risk or none. | Person, agent, worker, or command owner. | Fix, rerun, ask for access, repair environment, or no action. |

## Completion Checklist

- Command, URL, browser, viewport, and route are recorded.
- Unsafe content boundaries are explicit before evidence collection.
- Console errors and failed requests are captured or marked none.
- DOM, interaction, user workflow, and state coverage are recorded.
- Accessibility notes cover keyboard, focus, names, roles/headings, state
  announcement, and contrast where relevant.
- Performance evidence or not-applicable reason is recorded.
- Screenshots are tied to viewport, state, and behavior limits.
- Cleanup records processes, browser context, sessions/test data, and artifacts.
- Verdict matches the weakest required evidence area.
