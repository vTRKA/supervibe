---
name: feature-flag-rollout
namespace: app-excellence
description: >-
  Use BEFORE shipping a risky feature TO design staged rollout (kill-switch /
  percentage / cohort), define rollback criteria, plan flag debt cleanup.
  Triggers: 'feature flag', 'staged rollout', 'постепенный релиз', 'фича-флаг'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: plan
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Feature Flag Rollout

## When to invoke

BEFORE merging the first commit that gates new behaviour behind a flag. BEFORE expanding an existing flag to a wider audience. WHEN an incident requires emergency disable. WHEN flag debt is suspected (flag count rising, cleanup PRs absent).

This skill picks the rollout *shape* (kill-switch, percentage, cohort), defines the *rollback contract*, and locks in a *cleanup deadline*. Without all three, a flag is a long-lived branch in production and accrues debt.

## Step 0 — Read source of truth (required)

1. Read product spec / PRD: identify the blast radius and the success metric.
2. Read the flag platform docs (LaunchDarkly, Unleash, Statsig, ConfigCat, or in-house) for the project — capabilities differ.
3. Inventory existing flags: `grep -r "isEnabled\|flag(\|getVariation\|featureFlag" src/`. Flag count + median age tells you whether debt is already a problem.
4. Read on-call runbook for the affected service — confirm a kill-switch will be reachable during an incident.
5. Read recent post-mortems: any rollout-shaped incident in the last quarter changes defaults.

## Decision tree

```
What is the worst plausible outcome of this flag flipping ON?
  Data corruption / billing error / security regression → KILL-SWITCH only, server-evaluated, default OFF
  User-visible bug for some users                       → PERCENTAGE rollout 1% → 5% → 25% → 50% → 100%
  Different value for different audiences (plan, geo)   → COHORT targeting with explicit segment definition
  Unknown — instrumenting a hypothesis                  → DARK LAUNCH (run new code, ignore output, compare)

Is rollback automated?
  YES → require a synthetic alarm bound to the flag's success metric
  NO  → require a named on-call owner and a tested manual disable path

Is this a long-lived config switch (not a release gate)?
  YES → it is NOT a feature flag; move it to typed config + ADR
  NO  → continue, with cleanup deadline
```

## Procedure

1. **Pick the rollout shape** from the decision tree. Document why the alternatives were rejected — this is the most common audit gap.
2. **Define the success metric** (SLI) and its threshold *before* the flag flips. "We'll watch errors" is not a metric; "p95 checkout latency stays under 800 ms and 5xx rate stays under 0.2% over a 30-min window per stage" is.
3. **Define rollback criteria** as inequalities on the SLI plus a wall-clock budget. Add a *qualitative* tripwire (any P1 incident attributed to this flag = automatic disable).
4. **Stage plan**: list each percentage / cohort step, the soak time, and the metrics gate to advance. Stages must be reversible — never skip a stage forward and never roll forward through a regression.
5. **Test the kill-switch** in staging *before* the production rollout begins. A kill-switch never tested is a kill-switch that won't work.
6. **Cohort stratification** (if cohort-targeted): name the segments, document how membership is derived, and ensure metrics are sliced by segment, not just aggregated.
7. **Cleanup deadline**: open a tracking issue with a hard date (typically 2-6 weeks post-100%). Owner = author. Deletion PR removes both branches of code and the flag definition.
8. **Storage**: flags must live in the flag platform or a versioned config artifact, never in environment variables (no audit trail, no per-user targeting, no instant flip).
9. **Output**: the rollout plan (see Output contract) lives next to the PR description and is referenced from the on-call runbook.
10. **Score** — invoke `supervibe:confidence-scoring` with artifact-type=agent-output; ≥9 required to mark this skill complete.

## Output contract

```
Flag: <name>           Owner: <person>           Cleanup deadline: <YYYY-MM-DD>
Shape: <kill-switch | percentage | cohort | dark-launch>
SLI: <metric + window + threshold>
Stages: 1% (24h) → 5% (48h) → 25% (48h) → 50% (24h) → 100%
Advance gate: <inequality on SLI>
Rollback gate: <inequality on SLI> OR <qualitative tripwire>
Kill-switch: tested-in-staging=<date>; runbook=<link>
Cohorts (if any): <segment name → membership rule>
Cleanup PR: <draft link or tracking issue>
Storage backend: <platform / repo path> (NOT env vars)
```

## Anti-patterns

- **flag-without-cleanup-deadline** — flag survives the feature; future readers can't tell if the OFF branch is still reachable in prod.
- **percentage-rollout-without-metrics** — moving from 1% to 100% on vibes; regressions are noticed by users, not dashboards.
- **kill-switch-without-runbook** — on-call engineer at 3 a.m. can't find the lever; defeats the purpose.
- **flags-stored-in-env-vars** — flip requires a deploy, removes audit trail, prevents per-user targeting.
- **no-cohort-stratification** — aggregate metric looks fine, but enterprise tier is on fire; segment-blind rollouts hide tail regressions.
- **staged-rollout-without-rollback-test** — never verified the disable path; first time it runs is during the incident.

## Verification

- Rollout shape is named and alternatives are explicitly rejected.
- Each stage has soak time and a numeric advance/rollback gate.
- Kill-switch has a recorded staging-test timestamp.
- Cleanup deadline exists as a tracked issue with an owner.
- Storage location is the flag platform, not env vars.
- Cohort membership is derivable and reproducible (no "pick some users at random and pin them").

## Guard rails

- Do not mutate files, provider state, network resources, or external tools unless this skill's procedure and the user approval path allow it.
- Do not skip prerequisites, confidence gates, policy gates, or explicit approval gates.
- Do not claim completion without concrete verification evidence.
- Preserve user-owned content and unrelated worktree changes.

## Related

- `supervibe:test-strategy` — defines the contract test pinned to the OFF branch.
- `supervibe:incident-response` — consumes the kill-switch + runbook designed here.
- `supervibe:adr` — capture the rollout decision as an architecture decision record.
- `supervibe:audit` — periodic flag-debt sweep.
