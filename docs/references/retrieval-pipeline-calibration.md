# Retrieval Pipeline Calibration

The retrieval pipeline records each stage so quality failures can be routed to the right layer.

Stages:

- Query rewrite
- Exact symbol lookup
- FTS candidates
- Embedding candidates
- Repo-map expansion
- Graph-neighbor expansion
- Dedupe
- Rerank
- Fallback reason

Calibration tracks top-k, min score, freshness penalty, generated-file penalty, multilingual rewrite and contradiction-warning thresholds.

Run:

```bash
node --test tests/retrieval-pipeline-calibration.test.mjs
node scripts/supervibe-context-eval.mjs --case-file tests/fixtures/scenario-evals/supervibe-user-flows.json --explain
```
