# Temporal Project Knowledge Graph

The project knowledge graph links durable memory to code and workflow evidence.

Node types:

- Decisions, learnings, incidents, solutions
- Agents
- Tags
- Files
- Symbols
- Release evidence and corrections as they enter memory

Edge types:

- `created-by`
- `tagged`
- `mentions-file`
- `contains-symbol`
- `supersedes`
- `contradicts`

Temporal fields `validFrom`, `validTo`, `supersedes` and `sourceCitation` keep current-fact queries from hiding history permanently. `search-memory --graph --include-history` shows graph provenance alongside memory results.

Run:

```bash
node --test tests/project-knowledge-graph.test.mjs
node scripts/search-memory.mjs --query "feedback websocket" --graph --include-history
```
