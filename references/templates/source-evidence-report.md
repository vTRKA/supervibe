# Source Evidence Report Template

Use this template when an output depends on project memory, Code RAG,
CodeGraph, official documentation, domain standards, tests, generated artifacts,
or reviewer evidence. The report separates what was checked from what remains
unknown, so agents and skills do not turn weak retrieval into strong claims.

## Report Metadata

| Field | Required content |
| --- | --- |
| Title | Short evidence report name. |
| Status | Complete, partial, stale, blocked, or not applicable. |
| Request | User request, work item, plan section, or reviewer question being answered. |
| Scope | Files, symbols, artifacts, commands, docs, domains, or decisions covered. |
| Produced by | Agent, skill, worker, reviewer, command workflow, or maintainer role. |
| Produced at | ISO-8601 date and timezone from the active workflow context. |

## Evidence Questions

Write the questions that evidence must answer before recommendations or
completion claims:

- What existing project pattern or decision applies to this work?
- Which files, symbols, artifacts, validators, or workflows are affected?
- Which current external facts, standards, or official docs matter?
- Which evidence source could change the conclusion if it is missing or stale?
- Which maturity, security, or completion claim must be avoided until evidence
  is stronger?

## Evidence Table

| ID | Source type | Source | Freshness | What it proves | Limit |
| --- | --- | --- | --- | --- | --- |
| E1 | Project memory | Memory entry path or search result summary. | Fresh, stale, unavailable, or not needed. | Prior decision, incident, pattern, accepted gap, or no-match signal. | Missing entries, broad query, or stale timestamp. |
| E2 | Code RAG or source search | File path, line, symbol, or search query. | Current, stale, unavailable, or fallback. | Local implementation pattern, validator behavior, contract, or related artifact. | Ranking noise, generated content, or unindexed file. |
| E3 | CodeGraph | Caller, callee, neighbor, impact, ownership, or no-anchor result. | Current, stale, unavailable, or not applicable. | Structural relationship, blast radius, ownership, or graph warning. | Language gap, unresolved edge, or no semantic anchor. |
| E4 | Official docs or standard | Link, version, date, or cached source. | Current, dated, unavailable, or not needed. | Current API, security, legal, platform, or domain fact. | Changelog risk, regional variation, or missing primary source. |
| E5 | Verification | Command, test, validator, log, screenshot, or reviewer output. | Current run, prior run, blocked, or not applicable. | Behavior proof, validation result, or review decision. | Partial coverage or environment gap. |

Use [Source-Driven Official Doc Cache](../source-driven-official-doc-cache.md)
when current external documentation must be cached or freshness-aware.

## Coverage Summary

| Coverage area | Status | Evidence IDs | Notes |
| --- | --- | --- | --- |
| Memory | Covered, partial, unavailable, or not applicable. | E1. | Record no-match as evidence when the query ran. |
| Code search or RAG | Covered, partial, unavailable, or not applicable. | E2. | Record query and key local files. |
| CodeGraph | Covered, partial, unavailable, or not applicable. | E3. | Required for structural certainty, refactors, ownership, and blast radius claims. |
| External source | Covered, partial, unavailable, or not applicable. | E4. | Required for facts that may change or regulated-trust domains. |
| Verification | Covered, partial, unavailable, or blocked. | E5. | Required before completion claims. |

## Conflicts And Resolution

Record conflicting sources and the decision rule used:

- Conflict: name the sources and what disagrees.
- Preferred source: choose the newer official source, runtime behavior, local
  validator, accepted ADR, or user constraint.
- Reason: explain why the preferred source controls this workflow.
- Follow-up: name any repair, doc update, validator change, or reviewer check.

## Omitted Or Unavailable Evidence

List evidence that was intentionally omitted or unavailable:

| Source | Reason | Effect on confidence | Next action |
| --- | --- | --- | --- |
| Project memory, CodeGraph, official docs, tests, reviewer, or artifact. | Out of scope, unavailable, stale, access blocked, no semantic anchor, or not needed. | No effect, lowers confidence, blocks claim, or requires review. | Repair index, ask user, run command, add reviewer, or proceed with fallback. |

## Confidence Boundary

State the strongest claim supported by the evidence:

- Supported claim: the recommendation, decision, review, or completion claim
  evidence can support.
- Unsupported claim: any 10/10 maturity, structural certainty, security
  clearance, compatibility, or completion claim that evidence does not support.
- Residual risk: remaining uncertainty, owner, and trigger for revisiting.

## Handoff

Attach this report to [Architecture Decision Record](adr.md), [Migration And
Deprecation](migration-deprecation.md), [Security Review](security-review.md),
or [Worker Handoff](worker-handoff.md) when downstream roles need the same
source coverage. The handoff must preserve evidence IDs and confidence limits.

## Completion Checklist

- Evidence questions are explicit.
- Memory, Code RAG or search, CodeGraph, external source, and verification
  coverage are recorded or marked not applicable with reason.
- Freshness and limitations are stated for each evidence row.
- Conflicts are resolved with a source-priority reason.
- Unsupported claims are named before final recommendations.
