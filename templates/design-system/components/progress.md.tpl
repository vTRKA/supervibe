# Progress

## Anatomy

- track
- indicator
- label
- value text

## States

- indeterminate
- determinate
- success
- error
- paused

## Variants

- bar
- circular
- step progress
- inline upload progress

## Tokens

- `--color-muted`
- `--color-primary-*`
- `--color-success`
- `--color-danger`
- `--duration-quick`

## Accessibility

- Use native `<progress>` where possible.
- Expose `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` when custom.
- Indeterminate progress has a textual status nearby.
