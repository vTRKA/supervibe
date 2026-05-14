# Internal Skill Baseline Refresh

Use this procedure to refresh the local skill-anatomy baseline without adding third-party repository names, URLs, command aliases, or host-specific implementation details to release-facing files.

## Steps

1. Start from approved research notes, local audit artifacts, and current Supervibe validators.
2. Update `tests/fixtures/skill-anatomy-baseline.json`, `references/skill-baseline/skill-anatomy-baseline.md`, `references/skill-baseline/skill-equivalence-map.md`, and `.supervibe/artifacts/evidence/agent-skill-normalization-gap-inventory.json` only with internalized facts, section names, local mappings, owners, and verification commands.
3. Keep reference-pack entries repository-relative, forward-slash paths only. Never store temporary checkout paths, drive-letter paths, user home paths, or provider-specific setup paths.
4. Mark stale baseline evidence with `staleReason` when approved research, local validators, or local skill anatomy no longer agree.
5. Verify with `node --test tests/skill-anatomy-baseline.test.mjs tests/canonical-lifecycle-skill-coverage.test.mjs` and `npm run validate:artifact-links`.

## Copying Boundary

Allowed: internalized counts, section names, reference-pack categories, local skill mappings, owner tasks, verification commands, and gap analysis.

Not allowed: third-party prose, direct shell-hook implementation, host-specific marketplace instructions as local policy, imported lifecycle aliases, or examples without a local Supervibe contract and verifier.

## Access Gate

If baseline evidence is stale or unavailable, record a local blocker and stop the refresh instead of guessing counts. Do not fetch or vendor third-party repositories as part of normal release work.
