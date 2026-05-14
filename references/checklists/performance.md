# Performance Reference Pack

Use this when work changes hot paths, startup, indexing, UI responsiveness,
memory use, concurrency, or claims a performance improvement.

## Gates

- Name the user-visible metric: latency, throughput, memory, CPU, startup time,
  build time, index time, or queue depth.
- Establish baseline only when claiming improvement or changing a known hot path.
- Keep correctness gates first; performance wins cannot excuse failed behavior.
- Block completion if a claimed improvement has no measurement or the measured
  delta is within noise.

## Evidence

- Record command, dataset or fixture size, machine/runtime context, iteration
  count, and before/after values.
- Include p50/p95 or min/median/max when latency is user-facing or variable.
- For memory, record peak RSS or heap metric and the input size that produced it.
- For concurrency, record worker count, queue depth, timeout/retry behavior, and
  whether work is bounded.

## Failure Modes

- Optimizing a path that is not in the measured workflow.
- Comparing different data sets, cache states, Node versions, or environment
  flags.
- Hiding work in background processes without lifecycle cleanup.
- Improving average latency while worsening tail latency, memory, or failure
  retry load.

## Acceptance Check

- The metric maps to a user or operator outcome and has reproducible evidence.
- Any regression is named, justified, and bounded by an owner-approved tradeoff.
- The final report separates measured facts from hypotheses and follow-up ideas.
