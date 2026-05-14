---
name: experiment
namespace: process
description: >-
  Use BEFORE running an A/B test or feature flag rollout to set up hypothesis,
  success metric, sample size calculation, randomization, and analysis plan.
  Triggers: 'a/b test', 'эксперимент', 'split-test', 'проверим гипотезу'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: plan
prerequisites: []
emits-artifact: requirements-spec
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Experiment

## Overview

This skill produces a pre-registered experiment contract for deciding whether a
change should ship, roll back, or require another iteration. It turns a product
or engineering question into a hypothesis, metric, scope, stop condition,
rollback path, and decision record before exposure begins.

Experiments are only trustworthy when the decision rules are written before the
data is inspected. This skill therefore prioritizes source evidence, metric
freshness, guardrails, and reversible rollout mechanics over ad hoc analysis.

## When to Use

BEFORE launching an A/B test, multivariate test, gradual rollout, or holdout test. When the question is "should we ship this change?".

NOT for: bug fixes (no need to test), forced rollouts (legal/compliance required).

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read existing experiments in `.supervibe/artifacts/experiments/` for format consistency
2. Read analytics platform docs (statistical machinery available)
3. Read prior baseline metrics (current conversion / engagement / revenue)
4. Read feature flag system docs
5. Read the product decision, risk notes, incident history, and rollout/rollback
   constraints for the affected surface
6. Confirm instrumentation freshness: metric definition, event ownership,
   known gaps, and the latest baseline retrieval timestamp

## Decision tree

```
Experiment type?
├─ A/B (one variant vs control) → sample size formula, two-tail
├─ Multivariate (3+ variants) → larger sample, multiple comparison correction
├─ Gradual rollout (no control) → not an experiment, monitoring only
└─ Holdout (most users get feature, holdout doesn't) → power calc against holdout size

Success metric type?
├─ Binary (converted / not) → proportion test (chi-square / Z-test)
├─ Continuous (revenue, time-on-site) → t-test or Mann-Whitney
└─ Count (events per user) → Poisson / negative binomial
```

## Experiment contract

Every experiment artifact must define:

- `hypothesis`: one falsifiable sentence linking the change, expected effect,
  reason, primary metric, minimum detectable effect, and timeframe.
- `metric`: one primary metric with owner, definition, baseline, freshness,
  data source, expected direction, and practical-significance threshold.
- `scope`: population, eligibility rules, exclusion rules, randomization unit,
  allocation, platforms/regions/plans included, and out-of-scope surfaces.
- `stopCondition`: planned stop based on sample size and duration, safety stop
  based on guardrails, and validity stop for instrumentation failure or sample
  ratio mismatch.
- `rollback`: owner, trigger, feature flag or release mechanism, data/schema
  recovery notes, communication path, and maximum time to disable.
- `decisionRecord`: where the pre-registration and final decision live, who can
  approve ship/iterate/rollback, and what evidence is required.

## Procedure

1. **Hypothesis** — "We believe <change> will <effect> because <reason>. We will know this is true when <metric> moves by <delta> within <timeframe>."
2. **Primary metric** — ONE metric, measurable, baseline known
3. **Guardrail metrics** — what should NOT degrade (page-load, error-rate, downstream funnel)
4. **Sample size** — power calc: target effect, baseline, alpha=0.05, power=0.80
5. **Randomization** — unit (user / session / impression), allocation (50/50 default), stratification if needed
6. **Run duration** — based on sample size + traffic; minimum 1 week to capture weekly cycles
7. **Analysis plan** — pre-register: which test, which subgroups, how to handle SRM (sample ratio mismatch)
8. **Write experiment doc** at `.supervibe/artifacts/experiments/YYYY-MM-DD-<name>.md` with all above
9. **Score** — `supervibe:confidence-scoring` artifact-type=requirements-spec
10. **Implementation** — feature flag, instrumentation, dashboard

Additional required procedure controls:

- **Scope** - define population, eligibility, exclusions, platform/region,
  randomization unit, allocation, owner, and out-of-scope surfaces.
- **Stop conditions** - define planned stop, safety stop, and validity stop
  before launch.
- **Rollback path** - define feature flag/off switch, data recovery, owner,
  communication path, and maximum disable time.
- **Decision record** - pre-register the experiment doc before exposure and
  append the final decision: `ship`, `iterate`, `rollback`, or `inconclusive`.
- **Freshness** - record baseline retrieval timestamp and metric definition
  owner; stale metrics block launch.

## Examples

- Valid: A checkout experiment with hypothesis, one conversion metric, fresh
  baseline, user-level randomization, 14-day planned stop, error-rate guardrail,
  feature-flag rollback, and decision record path.
- Valid: A holdout test for an already-enabled feature where the holdout size,
  ethical constraint, guardrail thresholds, and final ship/rollback criteria are
  pre-registered.
- Invalid: "Try the new onboarding and see if engagement improves" because it
  lacks a primary metric, baseline, scope, stop condition, and decision record.
- Invalid: A gradual rollout with no control group represented as an experiment;
  treat it as monitored rollout unless a holdout or randomized control exists.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.
- Do not use it when the change is mandatory and cannot be randomized or rolled
  back; use rollout monitoring instead.
- Do not use it when there is no measurable decision metric or no ethical way to
  expose users to variants.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.
- "We can decide after looking at the dashboard" - reject; decision rules must
  be pre-registered before exposure.
- "Traffic is low, so stop when it looks obvious" - reject; stop conditions must
  be planned around sample size, duration, and guardrails.
- "Rollback is just turning it off" - reject unless owner, mechanism, data
  recovery, and maximum disable time are documented.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.
- Hypothesis names a feature but no falsifiable metric movement.
- Primary metric lacks baseline, owner, freshness timestamp, or data source.
- Scope omits eligibility/exclusion rules or randomization unit.
- Stop condition only says "when significant" or "after enough users".
- Rollback depends on a deploy or manual guesswork during an incident.
- Decision record has no final decision field or approver.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.
- Hypothesis, metric, scope, stop condition, rollback, and decision record are
  filled before exposure.
- Baseline metric freshness and source are documented.
- Guardrails have thresholds and monitoring owner.
- Analysis plan declares test, subgroups, SRM handling, and peeking policy.
- Confidence score on `confidence-rubrics/requirements.yaml` is high enough to
  pass the gate.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.
- Experiment launches with no way to distinguish product impact from sampling
  or instrumentation error.
- Peeking, metric switching, or subgroup fishing turns the decision record into
  post-hoc justification.
- Guardrail regressions are noticed late because safety stops were not wired to
  monitoring.
- Rollback is defined only for UI exposure while data/schema side effects remain
  unrecoverable.

## Output contract

Returns experiment doc with:
- `hypothesis`: one falsifiable sentence with change, effect, reason, metric,
  delta, and timeframe
- `metric`: primary metric definition, baseline, freshness, source, owner,
  expected direction, and practical-significance threshold
- `scope`: population, eligibility, exclusions, platforms/regions/plans,
  randomization unit, allocation, and out-of-scope surfaces
- `guardrails`: metrics that must not degrade and thresholds for each
- `sampleSize`: calculation inputs, alpha, power, minimum detectable effect, and
  expected duration
- `stopCondition`: planned, safety, and validity stop rules
- `rollback`: owner, disable mechanism, recovery steps, communication path, and
  maximum time to rollback
- `analysisPlan`: statistical test, subgroup plan, SRM handling, missing-data
  handling, and peeking policy
- `decisionRecord`: pre-registration path, final decision field, approver, and
  evidence required for `ship`, `iterate`, `rollback`, or `inconclusive`

## Guard rails

- DO NOT: peek at results before sample size reached (inflates false positives)
- DO NOT: choose multiple primary metrics (HARK fishing)
- DO NOT: change variants mid-experiment (resets randomization)
- DO NOT: declare winner with p<0.05 alone (also need practical significance)
- DO NOT: launch without explicit scope, stop condition, rollback owner, and
  decision record path.
- DO NOT: keep running after a safety stop, severe SRM, or instrumentation gap
  invalidates the data.
- ALWAYS: pre-register analysis plan
- ALWAYS: monitor guardrails during run; stop if regression detected
- ALWAYS: record baseline metric freshness and data source before exposure.
- ALWAYS: append the final decision and evidence to the decision record.

## Verification

- Experiment doc has all sections
- Sample size calculation shown
- Randomization is reproducible (seed if applicable)
- Analysis plan declares which test, which subgroups
- Hypothesis is falsifiable and tied to one primary metric.
- Metric baseline, source, owner, and freshness timestamp are recorded.
- Scope names population, eligibility, exclusions, allocation, and out-of-scope
  surfaces.
- Planned, safety, and validity stop conditions are explicit.
- Rollback owner, trigger, disable path, and maximum rollback time are recorded.
- Decision record path exists and contains pre-registration fields.

## Related

- Phase 3 `analytics-implementation` agent — instrumentation
- `supervibe:prd` — for permanent decisions resulting from experiment
- `supervibe:incident-response` — if guardrail metric degrades during run
