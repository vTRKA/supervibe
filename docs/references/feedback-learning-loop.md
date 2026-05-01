# Feedback Learning Loop

User corrections enter a reviewed queue instead of becoming durable memory immediately.

States:

- `new`
- `triaged`
- `accepted`
- `rejected`
- `promoted-to-memory`
- `promoted-to-eval`
- `resolved`

Accepted feedback creates memory candidates and eval candidates. High-severity or repeated feedback also creates blocking regression fixtures. Rejected or stale feedback is archived with a reason.

Run:

```bash
node --test tests/feedback-learning-loop.test.mjs
node scripts/regression-suite.mjs --feedback-learning-smoke
```
