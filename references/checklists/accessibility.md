# Accessibility Reference Pack

Use this when work changes UI, generated screens, docs-as-UI, forms, controls,
navigation, or visual review criteria.

## Gates

- Verify keyboard reachability, focus order, visible focus, accessible names,
  semantic roles, contrast, zoom/reflow, reduced motion, and error announcement.
- Treat blocked keyboard paths, hidden text overlap, unlabeled controls, and
  unreadable contrast as release blockers for the affected screen.
- Check loading, empty, disabled, validation, error, and success states, not only
  the default state.
- Require domain-specific clarity for regulated or high-trust workflows where
  copy ambiguity can cause user harm.

## Evidence

- Record viewport, browser/tool, interaction path, and the state being checked.
- Prefer DOM/accessibility-tree evidence for names and roles; use screenshots
  for layout, overlap, and contrast findings.
- For forms, record the invalid input and the announced or visible error.
- For exceptions, state impacted users, affected task, mitigation, and owner.

## Failure Modes

- Visual-only controls with no accessible name or keyboard action.
- Focus trapped, lost after navigation, or hidden behind sticky/floating UI.
- Responsive layouts that pass desktop but overlap or clip at mobile/zoom.
- Color-only status, motion-only feedback, or errors announced only visually.

## Acceptance Check

- A keyboard-only user can complete the primary affected workflow.
- Screen-reader names/roles/states match the visible intent of controls.
- Text remains readable and non-overlapping across required viewports and states.
