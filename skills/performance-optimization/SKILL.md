---
name: performance-optimization
namespace: verification
description: >-
  Use WHEN performance is a requirement or suspected regression to measure first, profile the bottleneck, apply the smallest fix, and prove before/after numbers with a regression guard.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: review
prerequisites: []
emits-artifact: performance-evidence-report
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Performance Optimization

## Overview

Performance Optimization prevents guess-based tuning. It requires a metric, baseline, profile or trace, scoped change, after measurement, and regression guard before improvement claims.

## When to Use

- The user reports slow behavior, performance budget failure, high resource use, or build/runtime latency.
- Review or release readiness depends on a performance claim.
- Browser-facing changes need console, network, DOM, screenshot, or performance evidence.
- Optimization could affect correctness, caching, concurrency, memory, network, database, or bundle size.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## When not to use

- Do not optimize without a user-visible or operational metric.
- Do not trade correctness, privacy, security, accessibility, or maintainability for speed without owner approval.
- Do not rely on one noisy local run for release claims.
- Do not add caching or parallelism without invalidation and failure semantics.

## Step 0 - Source-of-truth preflight

1. Read the complaint, SLO, budget, acceptance criteria, or review finding.
2. Locate existing benchmarks, telemetry, profiler hooks, browser runtime checks, CI budgets, and memory.
3. Define one primary metric and one guard metric before changing code.
4. Identify environment, dataset, warmup, viewport, browser, traffic shape, or workload.
5. Record what cannot be measured and cap confidence.

## Decision tree

```text
No metric or user impact? -> stop and ask for metric
Baseline unavailable? -> capture baseline before editing
Browser/UI path? -> use browser-runtime-verification
Backend/data/build path? -> use profiler, benchmark, trace, or timing command
Bottleneck unknown? -> profile before patching
After numbers improve and guard remains healthy? -> emit report
```

## Procedure

1. State the performance hypothesis and expected metric movement.
2. Run baseline measurement and preserve command, environment, and output.
3. Profile or trace the path to identify the bottleneck.
4. Select the smallest fix for the measured bottleneck.
5. Verify correctness with tests or a targeted guard.
6. Re-run the same measurement and compare with baseline.
7. Add or name a regression guard.
8. Emit the performance evidence report.

## Common rationalizations

- "This should be faster" fails without before/after measurements.
- "Caching is always good" fails without invalidation and memory impact.
- "The profiler is overkill" fails when the suspected hotspot is unproven.
- "Local numbers are enough" fails unless noise and environment are documented.

## Red flags

- The fix changes semantics, ordering, security checks, or accessibility state.
- The benchmark does not exercise the complained-about path.
- Browser optimization lacks console, network, asset, viewport, or performance evidence.
- The report uses p50 when tail latency or Core Web Vitals are the risk.

## Checklist

- Primary metric and guard metric are defined.
- Baseline command and output are captured.
- Bottleneck evidence is present.
- Correctness guard passed.
- After measurement used the same method as baseline.
- Regression guard or residual risk is explicit.

## Failure modes

- Faster local path hides slower cold start, memory use, or tail latency.
- Memoization or caching returns stale or cross-tenant data.
- Bundle changes improve one route while hurting first load elsewhere.
- Benchmark drift makes future regressions invisible.

## Output contract

Returns `performance-evidence-report` with:

- `metric`
- `guardMetric`
- `baselineCommand`
- `baselineOutput`
- `profileEvidence`
- `changeSummary`
- `afterCommand`
- `afterOutput`
- `regressionGuard`
- `residualRisk`

## Guard rails

- DO NOT patch before measuring.
- DO NOT weaken security or correctness for speed.
- DO NOT claim improvement from a different workload than baseline.
- ALWAYS record environment and dataset assumptions.
- ALWAYS add or name a regression guard.

## Verification

- Run `npm run validate:skill-content-quality`.
- Run `npm run validate:agent-skill-coverage` after owner wiring.
- For browser work, run the route-specific `browser-runtime-verification` evidence path.

## Related

- `supervibe:browser-runtime-verification`
- `supervibe:test-strategy`
- `supervibe:experiment`
