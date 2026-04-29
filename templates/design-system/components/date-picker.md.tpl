# Date Picker

## Anatomy

- input
- calendar popover
- month navigation
- weekday header
- day grid
- selected day
- range endpoints
- helper/error text

## States

- closed
- open
- focused
- selected
- range selecting
- disabled date
- invalid date

## Variants

- single date
- date range
- date and time

## Tokens

- `--color-background`
- `--color-border`
- `--color-ring`
- `--color-primary-*`
- `--space-*`
- `--radius-*`

## Accessibility

- Input has visible label and programmatic label.
- Calendar grid exposes current month and selected date.
- Arrow keys navigate days; PageUp/PageDown navigate months when implemented.
- Invalid dates link to error text with `aria-describedby`.
