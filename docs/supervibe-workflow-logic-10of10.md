# Supervibe Workflow Logic 10/10 Maturity

This document defines the workflow-logic 10/10 maturity gate introduced by:

```bash
node scripts/validate-workflow-logic-10of10.mjs
```

The gate is intentionally stricter than a formatting validator. It refuses a
10/10 claim unless the workflow has current evidence for project memory, Code
RAG, CodeGraph, workflow receipts, task graph proof, agent lease behavior,
routing, and review coverage. The script prints human-readable terminal output
by default and machine-readable JSON with `--json`.

Package script wiring exposes development and release profiles separately:

```bash
npm run validate:workflow-logic-10of10:dev
npm run validate:workflow-logic-10of10:release
```

## Usage

Development profile:

```bash
node scripts/validate-workflow-logic-10of10.mjs --profile development
```

Release profile:

```bash
node scripts/validate-workflow-logic-10of10.mjs --profile release
```

JSON output:

```bash
node scripts/validate-workflow-logic-10of10.mjs --profile development --json
```

Plan-bound review proof:

```bash
node scripts/validate-workflow-logic-10of10.mjs --profile release --plan .supervibe/artifacts/plans/<plan>.md
```

## Output Contract

Terminal output starts with `SUPERVIBE_WORKFLOW_LOGIC_10OF10` and includes:

- `PROFILE`: `development` or `release`.
- `PASS`: true only when every required dimension passes.
- `STRICT_10_OF_10_READY`: true only when score is exactly `10/10` and there
  are no blockers.
- `SCORE`: weighted score out of 10.
- `REQUIRED_EVIDENCE`: required evidence domains.
- `GATE_SCOPE`, `TARGETED_ONLY`, `FULL_SUITE_ALLOWED`,
  `RELEASE_FULL_CHECK_REQUIRED`, `FINAL_ONLY_VERIFICATION`,
  `FINAL_ONLY_WORKFLOW_TYPES`, `DEVELOPMENT_TESTS_ALLOWED`,
  `DEVELOPMENT_VALIDATORS_ALLOWED`,
  `RELEASE_FINAL_VALIDATION_REQUIRED`, `VERIFICATION_POLICY`,
  `ACTIVE_GRAPH_REQUIRED`, and `ACTIVE_REVIEW_REQUIRED`.
- one line per dimension with score, pass/fail state, and evidence summary.
- blocker lines with next actions for every failed dimension.

JSON output uses the same report shape:

```json
{
  "schemaVersion": 1,
  "kind": "supervibe-workflow-logic-10of10",
  "profile": "development",
  "score": 10,
  "maxScore": 10,
  "pass": true,
  "status": "10-of-10-ready",
  "strictTenOfTenReady": true,
  "requiredEvidence": ["memory", "rag", "codegraph", "receipts", "graph-proof", "agent-lease", "routing", "review", "verification-policy"],
  "gateProfile": {},
  "dimensions": [],
  "blockers": []
}
```

## Scoring Model

The model has nine required dimensions. A 10/10 claim is valid only when every
required dimension passes; partial scores are diagnostic, not permission to
claim maturity.

| Dimension | Weight | Required evidence |
| --- | ---: | --- |
| `memory` | 1.00 | `.supervibe/memory/index.json` exists and contains enough high-confidence entries tagged for workflow, RAG, CodeGraph, receipts, routing, review, loop, agents, or memory. |
| `rag` | 1.00 | Code RAG index exists, source coverage is ready, and `MISSING_OR_STALE: 0` is proven through `build-code-index --list-missing`. |
| `codegraph` | 1.25 | CodeGraph strict index health is ready and no stale source blocks graph trust. |
| `receipts` | 1.25 | Workflow receipt validation passes, producer receipt validation passes, and trusted host-agent receipt plus invocation counts satisfy the active profile. |
| `graph-proof` | 1.25 | Task graph maturity passes, source plan snapshots exist, strict completion evidence exists, and release profile also requires active graph proof. |
| `agent-lease` | 1.00 | Claim TTL, approval lease checks, host-invocation-bound heartbeat, stale recovery, write-set locks, and lease tests are present; release profile also blocks stale active claims. |
| `routing` | 1.25 | Command-agent enforcement passes, task graph command/trigger routing cases pass, and ready-task dispatch allows one agent while preserving real-agent proof when agents are used. |
| `review` | 1.00 | Development profile requires plan-review validator/template capability; release profile requires trusted active or plan-bound review proof. |
| `gate-profile` | 1.00 | Plan, graph, and task workflows expose the final-only verification policy: no development tests or validators, with tests and validators deferred to the final release gate; release profile also requires recorded passing full-check graph evidence. |

## Gate Profiles

### Development

Development is task-local. It is for child workers and scoped implementation
slices.

- `GATE_SCOPE: task-local`
- `TARGETED_ONLY: false`
- `FULL_SUITE_ALLOWED: false`
- `RELEASE_FULL_CHECK_REQUIRED: false`
- `FINAL_ONLY_VERIFICATION: true`
- `FINAL_ONLY_WORKFLOW_TYPES: plan,graph,task`
- `DEVELOPMENT_TESTS_ALLOWED: false`
- `DEVELOPMENT_VALIDATORS_ALLOWED: false`
- `RELEASE_FINAL_VALIDATION_REQUIRED: false`
- `ACTIVE_GRAPH_REQUIRED: false`
- `ACTIVE_REVIEW_REQUIRED: false`

A development pass means the local workflow logic is mature enough to continue
scoped work, not that the repository is release-ready. For plan, graph, and
task workflows, tests and validators are not scheduled during development;
they remain deferred to the final release handoff.

### Release

Release is for final phase or release handoff.

- `GATE_SCOPE: phase-or-release-gate`
- `TARGETED_ONLY: false`
- `FULL_SUITE_ALLOWED: true`
- `RELEASE_FULL_CHECK_REQUIRED: true`
- `FINAL_ONLY_VERIFICATION: true`
- `FINAL_ONLY_WORKFLOW_TYPES: plan,graph,task`
- `DEVELOPMENT_TESTS_ALLOWED: false`
- `DEVELOPMENT_VALIDATORS_ALLOWED: false`
- `RELEASE_FINAL_VALIDATION_REQUIRED: true`
- `ACTIVE_GRAPH_REQUIRED: true`
- `ACTIVE_REVIEW_REQUIRED: true`

A release pass means the same core evidence is present plus active graph proof,
trusted review evidence, no stale active claims, and a passing final validation
entry recorded at graph/release scope.

## Operational Notes

This validator is read-only. It does not issue receipts, repair ledgers, rebuild
Code RAG, mutate CodeGraph, claim work items, update routing, or edit package
metadata.

Common repair commands stay owned by their existing runtimes:

```bash
node scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress
node scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health
node scripts/workflow-receipt.mjs recovery-status
npm run validate:workflow-receipts
node scripts/supervibe-task-graph-maturity.mjs --require-active-graph
node scripts/validate-plan-review-artifacts.mjs --plan <plan> --require-active-review
```

Use the blocker `NEXT_ACTION` lines from the validator as the repair queue. Do
not replace failed evidence with a manual 10/10 statement.
