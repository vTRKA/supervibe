# Prototype Reference Examples

This file is the one-hop reference for `skills/prototype/SKILL.md`. Keep
copyable layouts, JSON examples, capability plan fields, and verification
snippets here; keep lifecycle gates in the skill entrypoint.

## Prototype Directory Layout

```text
.supervibe/artifacts/prototypes/<slug>/
  config.json
  index.html
  pages/
  styles/
    reset.css
    system.css
    pages.css
  scripts/
  mocks/
    mock-contract.json
    mock-scenarios.json
    api-fixtures/
  assets/
  decisions/
    prototype-capability-plan.md
  variants/
  _reviews/
  .approval.json
```

`config.json` must exist before HTML, CSS, or JS prototype files are written.

## Config Examples

Web:

```json
{
  "target": "web",
  "viewports": [375, 1440],
  "runtime": "browser",
  "constraints": ["responsive", "no-production-framework"],
  "interaction": "click-through",
  "approval": "draft"
}
```

Chrome extension:

```json
{
  "target": "chrome-extension",
  "viewports": [
    { "name": "popup", "width": 360, "height": 600 },
    { "name": "options", "width": 1024, "height": 768 },
    { "name": "side-panel", "width": 400, "height": 800 }
  ],
  "runtime": "browser-extension",
  "constraints": ["extension-csp", "no-inline-handlers"],
  "interaction": "realistic",
  "approval": "draft"
}
```

Mobile-native simulation:

```json
{
  "target": "mobile-native",
  "viewports": [
    { "name": "iphone-15", "width": 393, "height": 852 },
    { "name": "pixel-8", "width": 412, "height": 915 }
  ],
  "runtime": "html-simulation",
  "constraints": ["native-handoff-required"],
  "interaction": "visual-only",
  "approval": "draft"
}
```

## Capability Plan Fields

Use `decisions/prototype-capability-plan.md` for anything beyond
`native-static`.

Required fields:
- `mode`: enhanced-native, bundled-dependency, framework-sandbox, or handoff-only.
- `purpose`: what fidelity the prototype must prove.
- `toolOrLibrary`: browser API, local asset approach, or approved dependency.
- `nativeAlternativeRejected`: why HTML/CSS/WAAPI/Canvas/SVG alone is not enough.
- `artifactScope`: files that will use the capability.
- `licenseSecurityPosture`: local bundle, license, no blind CDN, security note.
- `bundlePerformanceBudget`: expected size and runtime impact.
- `accessibilityFallback`: keyboard, screen-reader, and reduced-feature behavior.
- `reducedMotionFallback`: disabled, shortened, static poster, or storyboard.
- `verificationCommands`: exact commands or browser checks.

## Capability Plan Skeleton

```markdown
# Prototype Capability Plan

Mode: bundled-dependency
Tool or library: <name and version/source>
Artifact scope: .supervibe/artifacts/prototypes/<slug>/

## Purpose
<why the effect is necessary for approval>

## Native Alternative Rejected
<why native CSS/WAAPI/Canvas/SVG is insufficient>

## License and Security
<local bundle path, license, no remote runtime import>

## Performance Budget
<bundle size, frame budget, viewport budget>

## Accessibility Fallback
<keyboard/screen-reader behavior>

## Reduced Motion Fallback
<static, shortened, or disabled behavior>

## Verification
- <command or browser check>
```

## Design-System Import Pattern

```css
@import url("../../_design-system/tokens.css");
@import url("../../_design-system/motion.css");

:root {
  color-scheme: light;
}

body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-body);
}
```

Do not copy token values into prototype styles. If the value is missing, use a
brandbook extension.

## Dependency Audit Commands

Remote runtime dependencies should normally return zero hits:

```bash
grep -rE "(unpkg|cdn|jsdelivr|https://.*\\.(js|css)|node_modules)" .supervibe/artifacts/prototypes/<slug>/
grep -rE "import .* from|require\\(" .supervibe/artifacts/prototypes/<slug>/
```

Every non-zero hit must be documented in the capability plan and reviewer notes.

## Token Literal Audit

```bash
grep -rE "#[0-9a-fA-F]{3,8}|rgb\\(|rgba\\(|hsl\\(|hsla\\(" .supervibe/artifacts/prototypes/<slug>/styles/
```

Expected result is zero for prototype-owned styles unless a literal appears in a
comment or a documented generated artifact. Use `var(--token)` for design values.

## Data-Fed Mock Contract

`mocks/mock-contract.json`:

```json
{
  "schemaVersion": 1,
  "status": "prototype-only",
  "owner": "prototype",
  "piiPolicy": "synthetic-only",
  "driftRule": "backend schema wins at implementation handoff",
  "endpoints": [
    {
      "id": "billing-summary",
      "method": "GET",
      "path": "/mocks/api-fixtures/billing-summary.success.json",
      "scenarios": ["success", "loading", "empty", "error"]
    }
  ]
}
```

`mocks/mock-scenarios.json`:

```json
{
  "schemaVersion": 1,
  "scenarios": [
    { "id": "success", "fixture": "api-fixtures/billing-summary.success.json" },
    { "id": "empty", "fixture": "api-fixtures/billing-summary.empty.json" },
    { "id": "error", "fixture": "api-fixtures/billing-summary.error.json" }
  ]
}
```

Every local `fetch()` target should map to this contract.

## Variant Manifest

```json
{
  "schemaVersion": 1,
  "slug": "billing-overview",
  "variants": [
    {
      "id": "baseline",
      "path": "variants/baseline/index.html",
      "feedbackTargetId": "billing-overview-baseline",
      "changedAxes": ["hierarchy", "density", "interaction"],
      "differsBecause": "Prioritizes table scanning over card summaries.",
      "gains": "faster audit workflow",
      "givesUp": "less editorial warmth"
    },
    {
      "id": "guided",
      "path": "variants/guided/index.html",
      "feedbackTargetId": "billing-overview-guided",
      "changedAxes": ["composition", "motion", "copy"],
      "differsBecause": "Turns renewal tasks into a guided flow.",
      "gains": "clearer next action",
      "givesUp": "lower information density"
    }
  ]
}
```

Do not ship a root tab switcher as the primary artifact for requested distinct
variants.

## Preview Server Pattern

```bash
node scripts/preview-server.mjs \
  --root .supervibe/artifacts/prototypes \
  --label <slug> \
  --daemon
```

If serving a single prototype root, verify the server maps `/_design-system/*`
to the sibling shared folder. Do not use `--no-feedback` for prototype previews.

## Preview Verification Checklist

- Preview URL opens at the prototype path.
- Visible Feedback button or `#supervibe-fb-toggle` exists.
- Shared `tokens.css` and `motion.css` return HTTP 200.
- Mobile viewport has no horizontal overflow.
- Desktop viewport uses the declared layout, not a stretched mobile shell.
- Reduced motion disables or shortens non-essential movement.
- Keyboard navigation reaches interactive controls.
- If data-fed, each scenario can be selected or demonstrated.

## Approval Marker

```json
{
  "status": "approved",
  "approvedAt": "2026-05-14T00:00:00.000Z",
  "approvedBy": "user",
  "viewports": [375, 1440],
  "designSystemVersion": "git-sha-or-artifact-hash",
  "previewUrl": "http://localhost:3047/<slug>/",
  "feedbackRounds": 2,
  "approvalScope": "full"
}
```

Write this only after explicit user approval. Then update `config.json` to
`"approval": "approved"` and stop before handoff.

## Feedback Gate

```markdown
**Prototype ready:** http://localhost:<port>/<slug>/
**Viewports:** 375px mobile, 1440px desktop
**State:** draft

What should happen next?

- Approve - save approval marker and prepare for handoff.
- Revise - describe the change and apply one iteration.
- Alternative - produce two distinct directions with benchmark axes.
- Stop - keep as draft and resume later.
```

The browser overlay is supplemental; this chat-level gate controls lifecycle.

## Common Prototype Bugs

- Missing `config.json` before file writes.
- Reusing an old artifact without artifact-mode approval.
- CSS literal colors and spacing values instead of tokens.
- CDN scripts added for convenience.
- Prototype imports `node_modules/` paths that cannot serve in preview.
- Data fixtures created without mock contracts.
- Preview URL delivered without feedback overlay.
- Approval marker written after vague approval rather than explicit user signal.
- Variants differ only by palette or typography.
