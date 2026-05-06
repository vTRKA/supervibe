# Skill Expert Operating Standard

This is the shared quality bar for Supervibe skills. A skill is not just a
checklist; it is an operating method that helps agents behave like senior
specialists with evidence, boundaries, and repeatable outputs.

## Required Behavior

- Start from source of truth: host instructions, project memory, Code RAG, Code
  Graph, state files, receipts, and domain artifacts when relevant.
- Apply `docs/references/agent-modern-expert-standard.md` and translate modern
  standards into concrete acceptance criteria, tests, observability, rollback,
  and residual risk instead of generic best-practice prose.
- Apply `docs/references/scope-safety-standard.md` before expanding scope.
- Keep continuation explicit for multi-stage work: ready state, done state,
  persisted state path, next action, stop condition, and recovery command.
- Use real producers for producer-owned durable outputs. Controller drafts are
  diagnostics only; agent, worker, reviewer, executable skill producer, and
  external tool claims need runtime receipts.
- Preserve retrieval evidence in handoffs: memory ids, source file:line,
  graph symbols, retrieval quality, fallback reason, and verification commands.
- Verify before completion claims and keep confidence below the gate when
  evidence is stale, partial, or delegated without proof.

## Skill Authoring Implications

- Every skill must have Step 0, a decision tree, procedure, output contract,
  guard rails, verification, and related links.
- High-risk skills need continuation contracts and receipt/provenance language.
- Design-facing skills must use design intelligence, regulated-trust evidence,
  preview/review gates, and approval state before durable handoff.
- Code-facing skills must require Code RAG before unfamiliar code changes and
  Code Graph before rename, move, delete, extract, or public API changes.
- Release-facing skills must include package/version alignment, release
  security, install integrity, dependency provenance, and rollback evidence.
