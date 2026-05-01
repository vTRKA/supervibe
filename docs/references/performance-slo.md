# Performance, Token And Resource SLOs

Release gates track bounded local cost:

- Context-pack p50/p95 latency
- Index rebuild time
- Watcher CPU budget
- `code.db` size growth
- Memory graph size
- Tokens per context tier
- Retrieval top-k cost
- Eval run time

SLO failures must explain whether the fix is query narrowing, budget tier change, index repair or an accepted quality tradeoff.

Run:

```bash
node --test tests/performance-slo.test.mjs
node scripts/supervibe-status.mjs --performance-slo
```
