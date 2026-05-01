# Context Intelligence Contract

Context assembly must expose source-specific evidence instead of hiding memory,
RAG and codegraph behind one opaque result.

Required sources:

- `memory`: prior decisions, incidents, learnings and corrections.
- `rag`: cited source chunks from the code index.
- `codegraph`: symbol neighborhood and impact radius.
- `host`: active provider instruction files and rule surfaces resolved by the host adapter.

Every context pack reports:

- source status: included, skipped or blocked;
- reason and item count for each source;
- citations for included items;
- freshness and confidence;
- token budget with overflow flag.

CLI:

```bash
node scripts/supervibe-context-pack.mjs --query "genesis host adapter codegraph" --json
```
