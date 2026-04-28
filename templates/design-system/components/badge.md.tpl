# Badge

## Anatomy

```
[ icon? ] [ text ]
```

Slots:
- `icon` — optional, decorative (`aria-hidden`); 12-14px
- `text` — required for `count` and `label` variants; absent for `dot`

## Variants

| Variant | Use case | Markup |
|---------|----------|--------|
| `count` | Numeric indicator (unread, cart items) | `<span>5</span>` |
| `dot` | Presence / unread without number | `<span aria-hidden="true"></span>` (paired with `aria-label` on parent) |
| `label` | Status label ("New", "Beta", "Archived") | `<span>New</span>` |

## Tone

| Tone | Background | Foreground | Use case |
|------|-----------|-----------|----------|
| `neutral` (default) | `--color-bg-subtle` | `--color-fg` | Generic label |
| `info` | `--color-info-subtle` | `--color-info-fg` | Informational status |
| `success` | `--color-success-subtle` | `--color-success-fg` | Active, complete |
| `warning` | `--color-warning-subtle` | `--color-warning-fg` | Pending, attention |
| `danger` | `--color-danger-subtle` | `--color-danger-fg` | Error, deprecated |

## Sizes

| Size | Padding (y / x) | Type ramp | Min height |
|------|-----------------|-----------|-----------|
| `sm` | space-0 / space-1 | text-xs | 16px |
| `md` (default) | space-1 / space-2 | text-sm | 20px |

Dot variant: 8×8 (sm) / 10×10 (md), padding none.

## States

Static element — no states. If badge is interactive (rare, e.g., dismissible chip), see `skills/component-library-integration/SKILL.md` for chip pattern; that's a different component.

## Tokens consumed

- Color: `--color-fg`, `--color-bg-subtle`, `--color-info-subtle`, `--color-info-fg`, `--color-success-subtle`, `--color-success-fg`, `--color-warning-subtle`, `--color-warning-fg`, `--color-danger-subtle`, `--color-danger-fg`
- Spacing: `--space-0`, `--space-1`, `--space-2`
- Radius: `--radius-pill`
- Type: `--text-xs`, `--text-sm`, `--font-body`, `--weight-medium`

## Accessibility

- **Decorative badges** (purely visual, the meaning duplicates adjacent text): wrap with `aria-hidden="true"` so screen readers don't announce noise.
- **Meaningful badges** that convey state not present elsewhere:
  - For text labels: the visible text is the accessible name — no extra ARIA needed.
  - For dots / counts attached to another control: put the description on the parent. Example: `<button aria-label="Inbox, 5 unread"><span aria-hidden="true">5</span></button>`
- Color alone MUST NOT carry meaning — pair tone with text or icon (WCAG 1.4.1).
- Touch target: badges are usually decorative and don't need to be 44×44; if they ARE interactive (chip), they do.
- Contrast: `<tone>-subtle` background paired with `<tone>-fg` foreground must meet 4.5:1 for text-bearing badges.

## Native HTML reference

```html
<!-- Label badge (status) -->
<span class="badge badge-md badge-success">Active</span>
<span class="badge badge-md badge-warning">Beta</span>
<span class="badge badge-md badge-danger">Deprecated</span>

<!-- Count badge attached to a button -->
<button class="btn btn-ghost" type="button" aria-label="Inbox, 5 unread">
  <svg aria-hidden="true">...</svg>
  <span class="badge badge-sm badge-danger" aria-hidden="true">5</span>
</button>

<!-- Dot variant (presence) -->
<span class="avatar">
  <img src="..." alt="Jane Doe" />
  <span class="badge badge-dot badge-success" aria-hidden="true"></span>
</span>

<!-- Badge with icon -->
<span class="badge badge-md badge-info">
  <svg class="badge-icon" aria-hidden="true">...</svg>
  New
</span>
```

## CSS reference

```css
.badge {
  display: inline-flex; align-items: center; gap: var(--space-1);
  font-family: var(--font-body); font-weight: var(--weight-medium);
  border-radius: var(--radius-pill);
  white-space: nowrap;
  background: var(--color-bg-subtle); color: var(--color-fg);
}
.badge-sm { padding: 0 var(--space-1); font-size: var(--text-xs); min-height: 16px; }
.badge-md { padding: var(--space-1) var(--space-2); font-size: var(--text-sm); min-height: 20px; }

.badge-info    { background: var(--color-info-subtle);    color: var(--color-info-fg);    }
.badge-success { background: var(--color-success-subtle); color: var(--color-success-fg); }
.badge-warning { background: var(--color-warning-subtle); color: var(--color-warning-fg); }
.badge-danger  { background: var(--color-danger-subtle);  color: var(--color-danger-fg);  }

.badge-dot { width: 10px; height: 10px; padding: 0; min-height: 0; border-radius: var(--radius-pill); }
.badge-sm.badge-dot { width: 8px; height: 8px; }

.badge-icon { width: 14px; height: 14px; }
```

## Anti-patterns

- Decorative badge announced by screen readers — count badge next to a button label that already says "5 unread" double-announces
- Color-only tone — red badge with no text/icon fails WCAG 1.4.1 for color-blind users
- Badge inside a `<button>` interactive layer that itself is also clickable — use one or the other
- Tone mismatch — `danger` background on a "Success" label confuses semantics
- Tiny `text-xs` count badges with low-contrast pairing — fail 4.5:1 contrast

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
