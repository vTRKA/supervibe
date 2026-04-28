# Navigation

## Anatomy

```
[ skip-link ]
[ <nav>
    [ logo? ] [ link ] [ link ] [ link ] [ menu-trigger? (mobile) ]
  ]
[ drawer (mobile, off-canvas) ]
[ breadcrumbs (page-level) ]
```

Slots:
- `skip-link` — required, first focusable element on page, jumps to `<main>`
- `nav` — required `<nav>` landmark with `aria-label`
- `link` — `<a>` per destination, `aria-current="page"` on the active one
- `menu-trigger` — mobile hamburger button that opens the drawer
- `drawer` — mobile off-canvas surface containing the same links
- `breadcrumbs` — separate `<nav aria-label="Breadcrumb">` showing path

## Variants

| Variant | Use case |
|---------|----------|
| `horizontal` | Desktop top-bar navigation |
| `vertical` | Sidebar navigation (apps, dashboards) |
| `drawer` | Mobile off-canvas, opened by hamburger |
| `breadcrumbs` | Page-level path indicator |

## States

| State | Visual treatment |
|-------|-----------------|
| `link idle` | Color `--color-fg-muted` |
| `link :hover` | Color `--color-fg` + underline / bg shift per variant |
| `link [aria-current="page"]` | Color `--color-fg`, accent (underline / bg / border-left) |
| `link :focus-visible` | 2px outline `--color-action`, offset 2px |
| `link [aria-disabled="true"]` | Opacity 0.5, cursor not-allowed |

## Tokens consumed

- Color: `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-bg`, `--color-bg-elevated`, `--color-bg-subtle`, `--color-action`, `--color-overlay`
- Spacing: `--space-2` through `--space-6`
- Radius: `--radius-md`
- Type: `--text-sm` / `--text-base`, `--font-body`, `--weight-medium`
- Shadow: `--shadow-md`
- Motion: `--duration-quick`, `--duration-base`, `--ease-out-quad`
- Z-index: `--z-nav`, `--z-drawer`

## Accessibility

- `<nav>` element MUST be used — `<div>` does not announce as a landmark.
- Multiple navs require disambiguating `aria-label` ("Primary", "Footer", "Breadcrumb").
- Skip link MUST be the first focusable element, visible on focus, jumps to `<main id="main">`.
- Active link gets `aria-current="page"` (not just CSS class).
- Mobile drawer:
  - Trigger button: `aria-controls="drawer-id"`, `aria-expanded="true|false"`
  - Drawer open: focus moves into drawer, ESC closes, focus returns to trigger
  - Backdrop click closes
  - Body scroll locked while open
- Breadcrumbs: ordered list, current page is the last item with `aria-current="page"`, separators are decorative (`aria-hidden`).

## Native HTML reference

```html
<a class="skip-link" href="#main">Skip to content</a>

<header class="nav-header">
  <nav class="nav nav-horizontal" aria-label="Primary">
    <a class="nav-logo" href="/">Brand</a>
    <ul class="nav-list">
      <li><a class="nav-link" href="/products">Products</a></li>
      <li><a class="nav-link" href="/pricing" aria-current="page">Pricing</a></li>
      <li><a class="nav-link" href="/about">About</a></li>
    </ul>
    <button class="nav-trigger" type="button"
            aria-controls="mobile-drawer" aria-expanded="false" aria-label="Open menu">
      <svg aria-hidden="true">...</svg>
    </button>
  </nav>
</header>

<aside id="mobile-drawer" class="nav-drawer" hidden>
  <button class="nav-drawer-close" type="button" aria-label="Close menu">×</button>
  <nav aria-label="Mobile">
    <ul class="nav-list nav-list-vertical">
      <li><a class="nav-link" href="/products">Products</a></li>
      <li><a class="nav-link" href="/pricing" aria-current="page">Pricing</a></li>
      <li><a class="nav-link" href="/about">About</a></li>
    </ul>
  </nav>
</aside>

<nav class="breadcrumbs" aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li aria-hidden="true" class="breadcrumb-sep">/</li>
    <li><a href="/docs">Docs</a></li>
    <li aria-hidden="true" class="breadcrumb-sep">/</li>
    <li><a href="/docs/nav" aria-current="page">Navigation</a></li>
  </ol>
</nav>
```

## CSS reference

```css
.skip-link { position: absolute; top: 0; left: 0; padding: var(--space-2) var(--space-3); background: var(--color-action); color: var(--color-action-fg); transform: translateY(-100%); z-index: 9999; }
.skip-link:focus { transform: translateY(0); }

.nav { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-4); background: var(--color-bg); border-bottom: 1px solid var(--color-border); }
.nav-list { display: flex; gap: var(--space-2); list-style: none; padding: 0; margin: 0; flex: 1; }
.nav-list-vertical { flex-direction: column; align-items: stretch; }
.nav-link { display: inline-flex; align-items: center; min-height: 40px; padding: var(--space-2) var(--space-3); color: var(--color-fg-muted); text-decoration: none; font-family: var(--font-body); font-size: var(--text-base); border-radius: var(--radius-md); transition: color var(--duration-quick) var(--ease-out-quad), background-color var(--duration-quick) var(--ease-out-quad); }
.nav-link:hover { color: var(--color-fg); background: var(--color-bg-subtle); }
.nav-link[aria-current="page"] { color: var(--color-fg); font-weight: var(--weight-medium); background: var(--color-bg-subtle); }
.nav-link:focus-visible { outline: 2px solid var(--color-action); outline-offset: 2px; }
.nav-trigger { display: none; background: none; border: 0; padding: var(--space-2); cursor: pointer; color: var(--color-fg); }
@media (max-width: 720px) { .nav-list { display: none; } .nav-trigger { display: inline-flex; } }
.nav-drawer { position: fixed; inset: 0; background: var(--color-bg-elevated); padding: var(--space-4); z-index: var(--z-drawer); box-shadow: var(--shadow-md); overflow-y: auto; }
.nav-drawer[hidden] { display: none; }

.breadcrumbs ol { display: flex; gap: var(--space-2); list-style: none; padding: 0; margin: 0; flex-wrap: wrap; font-size: var(--text-sm); }
.breadcrumbs a { color: var(--color-fg-muted); text-decoration: none; }
.breadcrumbs a[aria-current="page"] { color: var(--color-fg); }
.breadcrumb-sep { color: var(--color-fg-muted); }
```

## Anti-patterns

- Wrapping nav links in `<div>` instead of `<nav>` — no landmark, screen reader users can't jump
- Active state via class only, no `aria-current="page"` — invisible to assistive tech
- Mobile drawer without focus trap — Tab leaks behind the drawer
- Skip link that is `display: none` until focus — screen readers may skip; use transform instead
- Breadcrumbs without `aria-label="Breadcrumb"` — duplicate "navigation" landmark with no disambiguation

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
