# Brandbook Reference Examples

This file is the one-hop reference for `skills/brandbook/SKILL.md`. Keep
copyable examples and templates here; keep gates and lifecycle rules in the
skill entrypoint.

## Target Baseline Prompt

```markdown
**Step 0/N: Target.**
Which platform is the design system targeting?

- web - browser website or SaaS app
- chrome-extension - popup/options/side-panel
- electron - desktop app renderer
- tauri - desktop webview renderer
- mobile-native - iOS and Android handoff
- mixed - web baseline plus one surface override
```

Load `templates/brandbook-target-baselines/<target>.md` from the plugin root
after the answer. For `mixed`, load `web.md` first and then the secondary
surface deltas.

## Preference Coverage Matrix

| Axis | Accepted sources | Notes |
| --- | --- | --- |
| visual direction and tone | user, explicit-default | never inferred |
| audience and trust posture | user, explicit-default | regulated domains need evidence |
| information density | user, explicit-default | affects spacing and component size |
| typography personality | user, explicit-default | include language coverage |
| palette mood | user, explicit-default | include semantic colors |
| motion intensity | user, explicit-default | map to motion tiers |
| component feel | user, explicit-default | flat, tactile, dense, editorial, etc. |
| reference borrow/avoid | user, explicit-default | old artifacts need scope answer |

`first_user_design_gate_ack=true` is required before durable candidate tokens in
new product, new direction, or rebrand runs.

## Reference Scope Prompt

```markdown
**Step N/M: Reference scope.**
How should I use the referenced site, screenshot, Figma, PDF, or old prototype?

- Functional inventory only
- Information architecture
- Visual inspiration
- Authoritative brand source
- Ignore it
- Stop
```

Record the answer in the reference borrow/avoid axis before reading or using the
reference.

## Candidate Sandbox Layout

```text
.supervibe/artifacts/prototypes/_design-system/
  .candidates/<run-id>/
    tokens.css
    motion.css
    voice.md
    accessibility.md
    components/
    manifest.json
    design-flow-state.json
    styleboard.html
  .candidates/_archive/
  .scratch/<run-id>/
```

Only the active candidate is eligible for producer promotion. Rejected
alternatives stay in `.alternatives/` or `.candidates/_archive/`.

## Candidate Manifest Example

```json
{
  "version": "1.0.0",
  "status": "candidate",
  "tokensState": "candidate",
  "prototypeUnlock": "blocked-until-design-system-approved",
  "sections": {
    "palette": "candidate",
    "typography": "candidate",
    "spacing-density": "candidate",
    "radius-elevation": "candidate",
    "motion": "candidate",
    "component-set": "candidate",
    "copy-language": "candidate",
    "accessibility-platform": "candidate"
  },
  "extensionPolicy": "extensions require user approval; ad-hoc tokens forbidden in prototypes"
}
```

## Approved Flow State Example

```json
{
  "creative_direction": { "status": "selected" },
  "design_system": {
    "status": "approved",
    "approved_at": "2026-05-14T00:00:00.000Z",
    "approved_by": "user",
    "approved_sections": [
      "palette",
      "typography",
      "spacing-density",
      "radius-elevation",
      "motion",
      "component-set",
      "copy-language",
      "accessibility-platform"
    ],
    "feedback_hash": "sha256-or-message-evidence"
  }
}
```

Do not set approved status without showing the review packet/styleboard and
recording explicit user approval for required sections.

## Section Approval Marker

```json
{
  "schemaVersion": 1,
  "section": "typography",
  "status": "candidate",
  "source": "user|explicit-default|producer",
  "rationale": "Body text needs dense app readability with Cyrillic coverage.",
  "evidence": [
    ".supervibe/artifacts/brandbook/direction.md",
    ".supervibe/artifacts/prototypes/_design-system/styleboard.html"
  ],
  "canReviseLater": true,
  "updatedAt": "2026-05-14T00:00:00.000Z"
}
```

Candidate markers are progress evidence, not approval.

## Token Coverage Checklist

Minimum token coverage:
- Color ramps: primary, secondary, accent, neutral, success, warning, danger,
  info, surface, overlay.
- Semantic aliases: background, foreground, muted, border, ring, focus, link,
  selection, chart-1 through chart-8.
- Theme modes: light, dark, and high-contrast when target requires it.
- Typography: display, body, mono, sizes, line-height, tracking, language
  fallback, license.
- Spacing: `--space-0` through `--space-32`, layout aliases, control sizes,
  hit targets, icon sizes, max widths.
- Radius/elevation: none, sm, md, lg, xl, pill, component aliases, shadow/border
  treatments, z-index tiers.
- Motion: duration tiers, approved easings, named keyframes, reduced-motion
  strategy.

## Component Spec Template

```markdown
# Button

## Anatomy
- root
- leading icon
- label
- trailing icon

## States
- idle
- hover
- active
- focus-visible
- disabled
- loading
- success
- error

## Variants
- primary
- secondary
- ghost
- danger
- sm / md / lg

## Tokens
- color: --color-action-bg, --color-action-fg
- radius: --radius-control
- spacing: --space-control-x, --space-control-y
- motion: --duration-quick, --ease-out-quad

## Accessibility
- role/button semantics
- visible focus indicator
- disabled state announced
- loading state has status text when async
```

## Starter Component Catalog

Start with the components the target needs:
- Controls: button, input, select, textarea, checkbox, radio, toggle, slider,
  segmented control.
- Feedback: alert, banner, toast, inline error, loading overlay, skeleton,
  progress, confirmation dialog.
- Navigation: topbar, sidebar, nav, breadcrumb, tabs, pagination, stepper,
  command palette.
- Disclosure: modal, drawer, sheet, popover, tooltip, accordion, dropdown menu.
- Data display: card, metric card, data table, chart shell, timeline, activity
  feed, empty state, status indicator.
- Media/layout: avatar, image frame, gallery, split pane, dashboard grid,
  settings shell.

If a component library is selected, document inherited defaults and owned
overrides. Do not leave library defaults visually ungoverned.

## Styleboard Minimum Evidence

`styleboard.html` should show:
- Palette swatches with contrast notes.
- Typography samples across display/body/mono and language coverage.
- Density examples for the target viewport.
- Button, form control, table, card, nav, dialog, and toast examples.
- Motion notes and reduced-motion policy.
- Component feel examples and state comparisons.
- Accessibility/platform assumptions.

Markdown summaries alone are not enough for visual-system approval.

## Producer Command Shape

```bash
node scripts/brandbook-producer.mjs run \
  --source .supervibe/artifacts/prototypes/_design-system/.candidates/<run-id> \
  --handoff <handoff-id> \
  --slug <prototype-slug> \
  --target <target>
```

The producer owns prepare, write-temp, validate, promote, receipt, and planner
refresh. If it fails, leave files in scratch and report the failed phase.

## Extension Record

```markdown
# Design System Extension: settings-filter-row

Status: proposed
Target: web
Reason: Settings prototype needs a compact filter row component not present in
the approved component set.

## Proposed Change
- Add component spec: components/filter-row.md
- Reuse existing spacing and input tokens.
- Add no new colors.

## Impact
- Prototype: .supervibe/artifacts/prototypes/settings/
- Downstream: React implementation can map to existing form primitives.

## Approval
- approve extension
- revise extension
- stop
```

## Alternative Template

```markdown
# Alternative: High-contrast editorial

Changed axes:
- palette
- hierarchy
- typography
- density

Gains:
- stronger trust and scanability

Gives up:
- softer consumer friendliness

Borrow:
- high-contrast editorial hierarchy

Avoid:
- same shell with new colors only
```

Distinct alternatives must differ on at least three axes across palette,
typography, motion, imagery, hierarchy, density, composition, and interaction.
