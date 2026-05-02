# RAG, Memory And Codegraph Evals

Supervibe context quality is gated separately from source inventory coverage. Release cases must define gold memory IDs, source chunk IDs, graph symbols, citations and token budgets.

Required release thresholds:

- Context recall: at least `0.85`
- Context precision: at least `0.70`
- Citation validity: at least `0.95`
- Graph impact recall: at least `0.90`
- Stale release evidence: `0`
- Retrieval stage coverage: `rewrite`, `exact-symbol`, `fts`, `embedding`,
  `repo-map`, `graph-neighbor`, `dedupe`, and `rerank` must all be present in
  context-pack or `search-code --context` evidence.
- Fallback observability: every empty or low-confidence retrieval result must
  include a fallback reason and a next repair command.
- CodeGraph quality: no generated files indexed as source, no minified top
  symbols, source coverage at release gate, and graph warnings explicitly
  separated from source RAG readiness.

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
- Missing rerank/fallback evidence: update retrieval-pipeline instrumentation
  before tuning prompts.
- Low graph resolution with good source coverage: keep source RAG available,
  then run graph catch-up with `node scripts/build-code-index.mjs --root .
  --resume --graph --max-files 200 --health`.

## Agent-Facing Context Pack Standard

Agent-facing retrieval output must be understandable without opening the DB:

- show the original and rewritten query;
- list selected RAG chunks with file:line citations;
- list entry symbols and graph neighborhood;
- show impact radius for refactor or public-surface work;
- show semantic anchors when present;
- show Retrieval Quality stage counts and fallback reason;
- show Graph Quality Gates with failures, warnings, symbol coverage, and edge
  resolution.

## Source Basis

- OpenAI retrieval docs: https://platform.openai.com/docs/guides/retrieval
- OpenAI evals docs: https://platform.openai.com/docs/guides/evals
- Microsoft GraphRAG overview: https://microsoft.github.io/graphrag/index/overview/
- LightRAG paper: https://arxiv.org/abs/2410.05779
