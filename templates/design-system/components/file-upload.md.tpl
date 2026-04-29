# File Upload

## Anatomy

- drop zone
- browse button
- file list
- progress item
- remove button
- validation message

## States

- idle
- drag-over
- uploading
- uploaded
- invalid file
- upload failed
- disabled

## Variants

- single file
- multiple files
- image-only
- document-only

## Tokens

- `--color-border`
- `--color-ring`
- `--color-success`
- `--color-danger`
- `--space-*`

## Accessibility

- Browse control is a labelled input or button connected to input.
- Drop zone has keyboard alternative.
- Upload progress is announced via `aria-live`.
- Errors name accepted type and size limits.
