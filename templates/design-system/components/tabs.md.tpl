# Tabs

## Anatomy

```
[ tablist
    [ tab ] [ tab ] [ tab ]
]
[ tabpanel (one visible) ]
[ tabpanel (hidden) ]
[ tabpanel (hidden) ]
```

Slots:
- `tablist` — required, container with `role="tablist"`
- `tab` — required, `<button role="tab">` per option
- `tabpanel` — required, `<div role="tabpanel">` per tab; only the active panel is visible

## Variants

| Variant | Visual treatment | Use case |
|---------|-----------------|----------|
| `underline` | Active tab gets bottom border `--color-action` | Page-level section nav |
| `enclosed` | Active tab joins panel border, others tinted | Settings panes, IDE-like UIs |
| `pill` | Active tab is filled pill, others ghost | Filter switching, segmented control feel |

## Sizes

| Size | Padding (y / x) | Type ramp | Min height |
|------|-----------------|-----------|-----------|
| `sm` | space-1 / space-3 | text-sm | 32px |
| `md` (default) | space-2 / space-4 | text-base | 40px |
| `lg` | space-3 / space-5 | text-md | 48px |

## States

| State | Visual treatment |
|-------|-----------------|
| `tab idle` | Color `--color-fg-muted` |
| `tab :hover` | Color `--color-fg` |
| `tab [aria-selected="true"]` | Color `--color-fg`, variant-specific accent |
| `tab :focus-visible` | 2px outline `--color-action`, offset 2px |
| `tab [disabled]` | Opacity 0.5, cursor not-allowed |

## Tokens consumed

- Color: `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-action`, `--color-action-fg`, `--color-bg-subtle`
- Spacing: `--space-1` through `--space-5`
- Radius: `--radius-md`, `--radius-pill` (pill variant)
- Type: `--text-sm` / `--text-base` / `--text-md`, `--font-body`, `--weight-medium`
- Motion: `--duration-quick`, `--ease-out-quad`

## Accessibility

- `role="tablist"` on container; `role="tab"` on each button; `role="tabpanel"` on each panel.
- Each tab has `aria-controls="<panel-id>"`; each panel has `aria-labelledby="<tab-id>"`.
- Active tab: `aria-selected="true"` + `tabindex="0"`. Inactive tabs: `aria-selected="false"` + `tabindex="-1"` (roving tabindex).
- Keyboard:
  - Left/Right arrows move between tabs (or Up/Down for vertical orientation)
  - Home jumps to first, End to last
  - Tab key moves focus OUT of the tablist into the active panel
- If panels contain heavy content, `tabindex="0"` on the panel makes it focusable for keyboard users.
- Tabs that hide critical content from search engines should be reconsidered — server-render all panels and progressively enhance.

## Native HTML reference

```html
<div class="tabs tabs-underline tabs-md">
  <div class="tablist" role="tablist" aria-label="Account sections">
    <button id="tab-profile" class="tab" role="tab" aria-selected="true"
            aria-controls="panel-profile" tabindex="0">Profile</button>
    <button id="tab-billing" class="tab" role="tab" aria-selected="false"
            aria-controls="panel-billing" tabindex="-1">Billing</button>
    <button id="tab-team" class="tab" role="tab" aria-selected="false"
            aria-controls="panel-team" tabindex="-1">Team</button>
  </div>

  <div id="panel-profile" class="tabpanel" role="tabpanel" aria-labelledby="tab-profile" tabindex="0">
    <p>Profile content...</p>
  </div>
  <div id="panel-billing" class="tabpanel" role="tabpanel" aria-labelledby="tab-billing" tabindex="0" hidden>
    <p>Billing content...</p>
  </div>
  <div id="panel-team" class="tabpanel" role="tabpanel" aria-labelledby="tab-team" tabindex="0" hidden>
    <p>Team content...</p>
  </div>
</div>
```

## CSS reference

```css
.tabs { display: flex; flex-direction: column; gap: var(--space-3); }
.tablist { display: flex; gap: var(--space-1); border-bottom: 1px solid var(--color-border); }
.tab {
  background: none;
  border: 0;
  font-family: var(--font-body);
  font-weight: var(--weight-medium);
  color: var(--color-fg-muted);
  cursor: pointer;
  position: relative;
  transition: color var(--duration-quick) var(--ease-out-quad);
}
.tabs-md .tab { padding: var(--space-2) var(--space-4); font-size: var(--text-base); min-height: 40px; }
.tab:hover { color: var(--color-fg); }
.tab[aria-selected="true"] { color: var(--color-fg); }
.tab:focus-visible { outline: 2px solid var(--color-action); outline-offset: 2px; border-radius: var(--radius-md); }
.tab[disabled] { opacity: 0.5; cursor: not-allowed; }

/* underline variant */
.tabs-underline .tab[aria-selected="true"]::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -1px;
  height: 2px; background: var(--color-action);
}
/* pill variant */
.tabs-pill .tablist { border: 0; gap: var(--space-1); padding: var(--space-1); background: var(--color-bg-subtle); border-radius: var(--radius-pill); }
.tabs-pill .tab { border-radius: var(--radius-pill); }
.tabs-pill .tab[aria-selected="true"] { background: var(--color-action); color: var(--color-action-fg); }
/* enclosed variant */
.tabs-enclosed .tab[aria-selected="true"] { background: var(--color-bg); border: 1px solid var(--color-border); border-bottom-color: var(--color-bg); border-radius: var(--radius-md) var(--radius-md) 0 0; margin-bottom: -1px; }

.tabpanel { padding: var(--space-3) 0; }
.tabpanel[hidden] { display: none; }
.tabpanel:focus-visible { outline: 2px solid var(--color-action); outline-offset: 2px; border-radius: var(--radius-md); }
```

## Anti-patterns

- Tabs that hide content also needed for SEO / search — server-render all panels, progressively enhance
- `<a href>` tabs that change URL without page navigation — use `<button>` or design as anchor-link sections
- All tabs with `tabindex="0"` — breaks roving tabindex pattern, Tab cycles inside tablist forever
- Different number of tabs vs panels — broken `aria-controls` references
- Vertical tabs that don't reorder for narrow viewports — horizontal scroll instead

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
