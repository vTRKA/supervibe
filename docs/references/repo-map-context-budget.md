# Repo Map Context Budget

The repo map is a deterministic, token-budgeted source of whole-repo context. It is built from the same source inventory policy as the code index, then ranks files by exported symbols, entry points, tests and command/script ownership.

Budget tiers:

- `tiny`: quick routing and status checks
- `standard`: normal agent context
- `deep`: broad implementation planning
- `refactor`: symbol movement and impact analysis

Each selection records selected files, omitted high-rank files and the reason for omission, usually the repo-map token ceiling.

Run:

```bash
node --test tests/repo-map-context-budget.test.mjs
node scripts/supervibe-context-pack.mjs --query "intent router context budget" --explain
```
