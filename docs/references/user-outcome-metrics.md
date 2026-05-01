# User Outcome Metrics

Supervibe reports user-visible context value, not only internal health.

Metrics:

- Time to first useful context
- Context provenance visibility
- Repair suggestion quality
- Confidence delta after retrieval
- Avoided clarification questions
- Successful resume rate
- User-confirmable citations
- Post-delivery choice clarity
- Approval/refine/alternative/stop completion rate
- No-silent-done violations

Run:

```bash
node --test tests/user-outcome-metrics.test.mjs
node scripts/supervibe-context-pack.mjs --query "why does this project need memory and codegraph" --explain
```
