# RAG, Memory And Codegraph Evals

Supervibe context quality is gated separately from source inventory coverage. Release cases must define gold memory IDs, source chunk IDs, graph symbols, citations and token budgets.

Required release thresholds:

- Context recall: at least `0.85`
- Context precision: at least `0.70`
- Citation validity: at least `0.95`
- Graph impact recall: at least `0.90`
- Stale release evidence: `0`

Run:

```bash
node --test tests/context-quality-eval.test.mjs
node scripts/supervibe-context-eval.mjs --case-file tests/fixtures/scenario-evals/supervibe-user-flows.json
```

Failures should route to the owning layer:

- Low memory recall: rebuild or curate memory.
- Low source precision: adjust retrieval and generated-file filtering.
- Low graph impact recall: repair symbol extraction or repo-map expansion.
- Invalid citations: fix evidence ledger or redaction metadata.
