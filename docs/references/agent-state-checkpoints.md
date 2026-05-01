# Agent State Checkpoints

Agent checkpoints make long-running work resumable without relying on transcript memory alone.

Each checkpoint records:

- Task ID and user intent
- Selected agent
- Retrieval policy
- Memory IDs, RAG chunk IDs and graph symbols
- Approvals and completed side effects
- Verification commands
- Next safe action
- Schema version and redaction status

Resume rules:

- Stale context must be revalidated before continuing.
- Completed write side effects must not be replayed without a matching side-effect ledger entry.
- Missing mandatory context evidence fails checkpoint validation.

Run:

```bash
node --test tests/agent-checkpoint-resume.test.mjs
node scripts/supervibe-status.mjs --checkpoint-diagnostics
```
