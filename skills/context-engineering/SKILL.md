---
name: context-engineering
namespace: process
description: "Use WHEN preparing context for non-trivial work to build a minimal, sourced, freshness-aware context packet before deciding or editing."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: brainstorm
prerequisites: []
emits-artifact: context-packet
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Context Engineering

## Overview

Context Engineering is the discipline of selecting, structuring, and compressing only the evidence needed for a decision, plan, implementation, review, or handoff. It complements local `project-memory`, `code-search`, CodeGraph, MCP discovery, and source-driven workflows by turning raw retrieval into a small packet with provenance and uncertainty.

The goal is not more context. The goal is enough current evidence to act without hiding assumptions.

## When to Use

Use before non-trivial planning, implementation, review, handoff, maturity claims, design decisions, provider/API work, or any task that spans multiple files or agents. Use when a subagent, reviewer, or future session needs the same compact source map.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read the user request, `AGENTS.md`, and any active plan, graph, design, release, or workflow state.
2. Run project memory for prior decisions and record top matches or explicit no-hit terms.
3. Run Code RAG with `node scripts/search-code.mjs --context "<task>" --limit 12` when repo behavior matters.
4. Use CodeGraph for symbols, public interfaces, ownership, or blast-radius claims.
5. Use official or primary sources when provider, dependency, legal, security, health, finance, or standards behavior may have changed.

## When not to use

- Do not use as a substitute for reading the actual files being edited.
- Do not use to bury the user in retrieval dumps.
- Do not use to claim a specialist, reviewer, worker, validator, or command ran without a runtime receipt.
- Do not continue when required indexes are stale below the policy gate; repair or report the degraded reason.

## Decision tree

```text
What decision needs context?
  Read-only answer -> memory/source snippets plus uncertainty may be enough.
  Code change      -> memory + Code RAG + file reads; CodeGraph if structural.
  Public contract  -> add source-driven docs and interface evidence.
  UI/design        -> add design intelligence, accessibility, and browser evidence.
  Release/security -> add checks, rollback, audit, and provenance evidence.

Is there too much context?
  YES -> summarize into facts, assumptions, risks, and open questions.
  NO  -> include citations and next action.
```

## Procedure

1. Name the decision, artifact, or edit the context packet must support.
2. Collect sources in priority order: active user request, project memory, local source, CodeGraph, tests, docs, official external sources, then lower-confidence references.
3. Filter aggressively: keep only facts that affect scope, correctness, compatibility, risk, verification, or ownership.
4. Separate facts from assumptions. Facts need citations; assumptions need a confidence level and a verification path.
5. Record freshness: current command output, commit/date, stale warning, source date, or unknown.
6. Compress into a packet with `mustKnow`, `decisionsAlreadyMade`, `openQuestions`, `risks`, `ownedWriteSet`, and `verification`.
7. Link to one-hop references instead of pasting long docs.
8. Hand off to the next skill or agent with stop conditions and confidence boundary.
9. Score with `supervibe:confidence-scoring` when the context packet gates downstream work.

## Common rationalizations

- "I read enough files already" fails when the handoff cannot name which facts came from memory, source, graph, or assumptions.
- "More context is safer" fails when irrelevant dumps hide the one compatibility or verification fact that matters.
- "The index is good enough" fails when status reports stale source rows, missing graph readiness, or partial evidence for the exact task.

## Red flags

- Packet mixes facts and guesses without labels.
- Source citations point to paths that were not read in this turn.
- Context omits active graph, plan, receipt, or wizard state for durable work.
- External guidance is used without date, source quality, or official-doc preference.
- The next agent would need to rediscover the same top files before acting.

## Checklist

- Decision target and owned scope are named.
- Memory, Code RAG, CodeGraph, source, receipts, and verification needs are decided.
- Facts, assumptions, risks, and open questions are separated.
- Freshness and degraded evidence are explicit.
- Packet is short enough to be useful in a handoff.

## Failure modes

- Context packet becomes a research report instead of an action packet.
- Old memory overrides current source.
- External best practices override local project rules.
- Missing evidence is silently omitted, inflating confidence.

## Output contract

- `decisionTarget`: what this context supports.
- `mustKnow`: 3-8 cited facts.
- `decisionsAlreadyMade`: prior decisions and memory ids.
- `assumptions`: assumptions with confidence and verification path.
- `openQuestions`: blockers or non-blocking unknowns.
- `riskMap`: correctness, compatibility, security, release, UI, or performance risks.
- `ownedWriteSet`: files or surfaces expected to change, or `none`.
- `verificationCommands`: exact commands needed before completion.
- `confidenceBoundary`: why confidence is allowed or capped.

## Guard rails

- Keep context minimal and sourced.
- Prefer current local source over stale memory; prefer official sources over summaries for changing APIs.
- Do not use context packets as durable producer proof without receipts.
- Preserve privacy and never include secrets, tokens, or private raw logs unless required and redacted.

## Verification

- `node scripts/supervibe-status.mjs --index-health --no-gc-hints`
- `node scripts/search-code.mjs --context "<task>" --limit 12` when code evidence matters.
- `npm run validate:skill-content-quality` when this skill or its routing docs change.

## Related

- `supervibe:project-memory`
- `supervibe:code-search`
- `supervibe:source-driven-development`
- `supervibe:using-supervibe-skills`
- `supervibe:mcp-discovery`