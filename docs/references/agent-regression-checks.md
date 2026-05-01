# Agent Regression Checks

Local regression checks cover agent behavior that should not regress between releases:

- Memory-required planning
- Codegraph-required refactors
- RAG-required unfamiliar code work
- Tool-choice routing
- Handoff and delivery boundaries
- Unsafe context refusal and approval safety
- Bypass explanation quality

The default runner is deterministic and does not require manual pasted agent output:

```bash
node --test tests/agent-regression-checks.test.mjs
npm run regression:run
```

Manual historical phase capture remains available with `node scripts/regression-suite.mjs <phase>`.
