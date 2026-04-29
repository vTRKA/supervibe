# Command Palette

## Anatomy

- overlay
- dialog
- search input
- result list
- result item
- shortcut hint
- empty state

## States

- closed
- open
- searching
- empty
- keyboard-highlighted
- loading

## Variants

- global command palette
- scoped picker
- launcher-only

## Tokens

- `--z-modal`
- `--color-background`
- `--color-border`
- `--color-ring`
- `--space-*`
- `--shadow-xl`

## Accessibility

- Dialog uses focus trap and returns focus to trigger.
- Search input has accessible label.
- Results expose active descendant or roving tabindex.
- Escape closes; ArrowUp/ArrowDown moves; Enter selects.
