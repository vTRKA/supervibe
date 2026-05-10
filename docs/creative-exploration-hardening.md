# Creative Exploration Hardening

This contract exists to prevent multi-variant design runs from passing through
word-only evidence.

## Required Order

1. Extract old prototype semantics with `npm run design:old-prototype-extractor -- --input <file-or-dir>`.
2. Produce at least five direction specs before writing HTML.
3. Each direction spec must include an ownable moment, non-standard UX model,
   hard constraints, forbidden shell patterns, navigation model, composer model,
   and agent-state model.
4. Record an explicit user or design gate approval.
5. Only then write prototype artifacts.

## Enforced Evidence

- `npm run validate:creative-exploration` blocks prototype artifacts before the
  semantic map, five direction specs, and approval gate exist.
- `npm run validate:design-variant-set` computes DOM layout fingerprints from
  actual variant HTML and rejects duplicated layout shells even when the manifest
  claims different axes.
- Feedback overlays must dispatch a payload containing the variant
  `feedbackTargetId`; marker-only overlays are invalid.
- Optional `screenshot-similarity.json` evidence can add perceptual similarity
  checks; if it is absent, computed DOM evidence remains the enforced fallback.
- `npm run supervibe:agent-run -- ...` rejects `prompt-role-only` execution as
  real specialist work.
- `npm run supervibe:cleanup` stops registered runtime processes and preview
  servers from one command, while host-managed subagents remain explicitly
  marked for host shutdown.

## Active Maturity

Repository-level design maturity can still be 10/10 when the framework is
healthy. Active run maturity is stricter: use
`node scripts/supervibe-design-maturity.mjs --active --slug <slug>` to require
scoped design receipts and the concrete variant-set validator before claiming
the current run is complete.
