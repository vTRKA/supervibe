---
name: experiment
namespace: process
description: "Use BEFORE running an A/B test or feature flag rollout to set up hypothesis, success metric, sample size calculation, randomization, and analysis plan. RU: Используется ПЕРЕД запуском A/B-теста или feature-flag rollout — оформляет гипотезу, success-метрику, sample size, рандомизацию и план анализа. Trigger phrases: 'a/b test', 'эксперимент', 'split-test', 'проверим гипотезу'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: plan
prerequisites: []
emits-artifact: requirements-spec
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Experiment

## When to invoke

BEFORE launching an A/B test, multivariate test, gradual rollout, or holdout test. When the question is "should we ship this change?".

NOT for: bug fixes (no need to test), forced rollouts (legal/compliance required).

## Step 0 — Read source of truth (required)

1. Read existing experiments in `docs/experiments/` for format consistency
2. Read analytics platform docs (statistical machinery available)
3. Read prior baseline metrics (current conversion / engagement / revenue)
4. Read feature flag system docs

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

## Procedure

1. **Hypothesis** — "We believe <change> will <effect> because <reason>. We will know this is true when <metric> moves by <delta> within <timeframe>."
2. **Primary metric** — ONE metric, measurable, baseline known
3. **Guardrail metrics** — what should NOT degrade (page-load, error-rate, downstream funnel)
4. **Sample size** — power calc: target effect, baseline, alpha=0.05, power=0.80
5. **Randomization** — unit (user / session / impression), allocation (50/50 default), stratification if needed
6. **Run duration** — based on sample size + traffic; minimum 1 week to capture weekly cycles
7. **Analysis plan** — pre-register: which test, which subgroups, how to handle SRM (sample ratio mismatch)
8. **Write experiment doc** at `docs/experiments/YYYY-MM-DD-<name>.md` with all above
9. **Score** — `supervibe:confidence-scoring` artifact-type=requirements-spec
10. **Implementation** — feature flag, instrumentation, dashboard

## Output contract

Returns experiment doc with:
- Hypothesis (1 sentence)
- Primary metric + delta + timeframe
- Guardrail metrics
- Sample size + duration
- Randomization spec
- Analysis plan (pre-registered)

## Guard rails

- DO NOT: peek at results before sample size reached (inflates false positives)
- DO NOT: choose multiple primary metrics (HARK fishing)
- DO NOT: change variants mid-experiment (resets randomization)
- DO NOT: declare winner with p<0.05 alone (also need practical significance)
- ALWAYS: pre-register analysis plan
- ALWAYS: monitor guardrails during run; stop if regression detected

## Verification

- Experiment doc has all sections
- Sample size calculation shown
- Randomization is reproducible (seed if applicable)
- Analysis plan declares which test, which subgroups

## Related

- Phase 3 `analytics-implementation` agent — instrumentation
- `supervibe:adr` — for permanent decisions resulting from experiment
- `supervibe:incident-response` — if guardrail metric degrades during run
