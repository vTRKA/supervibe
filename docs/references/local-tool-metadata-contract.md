# Local Tool Metadata Contract

Every command, skill and local script exposed to agents gets deterministic metadata:

- Stable name and aliases
- Short description
- Input shape
- Side-effect level
- Approval policy
- Required context sources
- Token-cost hint
- Owner

Safety defaults:

- Writes, migrations, network use, external APIs and private screenshots require explicit user confirmation.
- Read-only diagnostics can run without confirmation but must cite evidence.
- Tool lists are sorted deterministically and can be filtered by intent to reduce prompt size.

Run:

```bash
node --test tests/local-tool-metadata-contract.test.mjs
node scripts/supervibe-status.mjs --capabilities
```
