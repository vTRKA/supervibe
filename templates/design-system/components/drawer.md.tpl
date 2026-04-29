# Drawer

## Anatomy

- trigger
- overlay
- panel
- header
- body
- footer
- close button

## States

- closed
- opening
- open
- closing
- focus-trapped

## Variants

- left
- right
- bottom
- persistent desktop sidebar

## Tokens

- `--z-modal`
- `--color-overlay`
- `--color-background`
- `--shadow-xl`
- `--duration-considered`
- `--ease-out-*`

## Accessibility

- Focus is trapped while modal drawer is open.
- Escape closes unless destructive workflow prevents it.
- Focus returns to trigger on close.
- Reduced motion removes slide distance.
