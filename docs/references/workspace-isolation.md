# Workspace Isolation

Every context item carries namespace metadata:

- `workspaceId`
- `projectRoot`
- `sourceKind`
- `visibility`
- `importedFrom`

Context retrieval denies cross-project results unless the source is global plugin knowledge or an explicit approved import. This prevents project-private memory, RAG chunks, graph symbols, checkpoints, diagnostics and feedback from leaking between workspaces.

Run:

```bash
node --test tests/workspace-isolation.test.mjs
node scripts/supervibe-status.mjs --workspace-isolation
```
