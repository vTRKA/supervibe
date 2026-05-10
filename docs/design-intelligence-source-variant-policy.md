# Design Intelligence Source Variant Policy

Design-intelligence data is treated as a local evidence pack. Agents must not
depend on upstream folder names, package names, or repository URLs when reading
the manifest. The manifest exposes host-neutral source paths and enough
checksum, row-count, and rationale metadata to prove local coverage.

## Required Manifest Fields

Every domain in `skills/design-intelligence/data/manifest.json` must include:

- `sourceVariant`: one of the allowed source-variant dispositions.
- `canonicalChoice`: the reason the local runtime CSV is the canonical data.
- `adaptationRationale`: what changed, what was merged, or why no content
  adaptation was needed.
- `sourceVariants`: the covered source variants with neutral path, row count,
  sha256 checksum, disposition, and rationale.

`scripts/validate-design-source-coverage.mjs` enforces this contract. A domain
without an imported-runtime variant matching `importedPath`, `rows`, and
`sha256` is not considered covered.

## Adapted Variant Rules

- Merge source variants only when the merged runtime CSV is a strict coverage
  improvement, such as web plus native app-interface practices.
- Prefer the larger structured source when it is a valid superset, such as icon
  guideline rows or modern landing patterns.
- Normalize terminology only when retrieval aliases preserve previous names in
  searchable fields.
- Treat formatting-only differences as format-normalized, not as content
  divergence.
- Keep excluded low-signal files listed in `excludedAssets` with a rationale.

## Agent Usage

Design-facing agents should cite runtime domains and row evidence rather than
source repository details. When a brief depends on platform fit, they should
check product, style, color, typography, UX, app-interface, stack, and relevant
collateral domains before committing to a visual direction.
