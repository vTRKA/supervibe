# Modal (Dialog)

## Anatomy

```
[ backdrop ]
[ <dialog>
    [ header [ heading ] [ close-button ] ]
    [ body ]
    [ footer-actions ]
  ]
```

Slots:
- `backdrop` — ::backdrop pseudo on native `<dialog>`, dims the page
- `dialog` — required, native `<dialog>` element
- `heading` — required, `<h2>` in header, referenced by `aria-labelledby`
- `close-button` — required icon button at top-right (`aria-label="Close"`)
- `body` — required scrollable content area
- `footer-actions` — optional button row (Confirm / Cancel)

## Variants

| Variant | Use case | Width |
|---------|----------|-------|
| `xs` | Confirm dialogs (Yes/No) | min(360px, 90vw) |
| `md` (default) | Form / settings dialog | min(560px, 90vw) |
| `lg` | Multi-step / table content | min(840px, 90vw) |
| `fullscreen` | Mobile or content-heavy flows | 100vw / 100vh |

## States

| State | Visual treatment |
|-------|-----------------|
| `closed` | `<dialog>` has no `open` attribute, not in DOM-rendered flow |
| `opening` | `dialog.showModal()` called; `data-state="opening"`; transition fade-in 150ms |
| `open` | `data-state="open"`; focus trapped inside |
| `closing` | `data-state="closing"`; transition fade-out 100ms; then `dialog.close()` |

## Tokens consumed

- Color: `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-bg-elevated`, `--color-action`, `--color-overlay`
- Spacing: `--space-3` through `--space-6`
- Radius: `--radius-lg`
- Type: `--text-base`, `--text-lg`, `--font-body`, `--font-display`
- Shadow: `--shadow-xl`
- Motion: `--duration-quick`, `--duration-base`, `--ease-out-quad`
- Z-index: `--z-modal`

## Accessibility

- Use the **native `<dialog>`** element with `dialog.showModal()` — provides focus trap, inert background, and ESC handling for free.
- `aria-labelledby` MUST point to the heading id; `aria-modal="true"` is implied by `showModal()`.
- Close button MUST have `aria-label` (icon-only) and be reachable in tab order.
- ESC closes the dialog (native behavior) — never prevent it without a strong reason.
- Return focus to the trigger element on close (tracked manually before `showModal()`).
- First focusable element receives focus on open — use `autofocus` on the primary action (or close button if no primary).
- Body scroll: native `<dialog>` makes the rest of the page inert, but you may also set `body { overflow: hidden }` to prevent scroll-chaining on iOS.
- Never stack modals — if a confirmation is needed within a modal, replace contents instead of opening a second.

## Native HTML reference

```html
<button class="btn btn-primary" type="button" data-modal-open="settings">Settings</button>

<dialog id="settings" class="modal modal-md" aria-labelledby="settings-title">
  <header class="modal-header">
    <h2 id="settings-title" class="modal-heading">Settings</h2>
    <button class="modal-close" type="button" aria-label="Close" data-modal-close>
      <svg aria-hidden="true">...</svg>
    </button>
  </header>
  <div class="modal-body">
    <p>Update your preferences below.</p>
  </div>
  <footer class="modal-footer">
    <button class="btn btn-ghost" type="button" data-modal-close>Cancel</button>
    <button class="btn btn-primary" type="submit" autofocus>Save</button>
  </footer>
</dialog>
```

## CSS reference

```css
.modal {
  padding: 0;
  border: 0;
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  color: var(--color-fg);
  font-family: var(--font-body);
  box-shadow: var(--shadow-xl);
  max-height: min(90vh, 720px);
  width: min(560px, 90vw);
  overflow: hidden;
  display: flex; flex-direction: column;
}
.modal::backdrop {
  background: var(--color-overlay);
  backdrop-filter: blur(2px);
}
.modal-md  { width: min(560px, 90vw); }
.modal-lg  { width: min(840px, 90vw); }
.modal-xs  { width: min(360px, 90vw); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--color-border); }
.modal-heading { font-family: var(--font-display); font-size: var(--text-lg); margin: 0; }
.modal-close { background: none; border: 0; padding: var(--space-2); cursor: pointer; color: var(--color-fg-muted); border-radius: var(--radius-md); }
.modal-close:hover { color: var(--color-fg); background: var(--color-bg-subtle); }
.modal-close:focus-visible { outline: 2px solid var(--color-action); outline-offset: 2px; }
.modal-body { padding: var(--space-5); overflow-y: auto; flex: 1; }
.modal-footer { display: flex; justify-content: flex-end; gap: var(--space-2); padding: var(--space-4) var(--space-5); border-top: 1px solid var(--color-border); }
@media (max-width: 480px) {
  .modal-fullscreen { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
}
```

## Anti-patterns

- `<div role="dialog">` without focus trap, ESC handler, or background inert — fails WCAG 2.4.3 + 2.1.2
- Stacking modals — second modal traps focus from first, both close paths confused
- Horizontal scroll inside the dialog body — unexpected, fails responsive intent
- Auto-closing modals on outside click without a visible close button — destroys keyboard parity
- Modal that hides critical content the user needed to reference — non-modal patterns (drawer, side panel) are often better

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
