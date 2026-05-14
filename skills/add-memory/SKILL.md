---
name: add-memory
namespace: process
description: >-
  Use AFTER completing significant work (feature shipped, bug fixed, decision
  made, incident resolved) to add a memory entry capturing the learning for
  future agents. Triggers: 'добавь в память', 'save decision', 'сохрани
  решение', 'запиши learning'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/memory-entry.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Add Memory

## Overview

This skill turns completed, verified work into durable project memory. A memory
entry is for future retrieval: it should help a later agent make a better
decision, avoid a repeated failure, or apply a proven project pattern without
reconstructing the whole history.

Memory is not a scratchpad, task log, or place to store uncertain claims. Add a
memory entry only when the learning is stable enough to survive beyond the
current session and is backed by source evidence that another agent can inspect.

## When to Use

AFTER:
- Non-trivial decision made (architecture choice, library choice, pattern adoption) → `decisions/`
- Reusable pattern established (extracted/refactored to standard form) → `patterns/`
- Incident resolved (with postmortem) → `incidents/`
- Cross-cutting learning emerged (gotcha, surprise, team agreement) → `learnings/`
- Tricky problem solved with non-obvious approach → `solutions/`

NOT for: routine commits, doc edits, trivial bug fixes.

## What belongs in memory

Store only high-signal knowledge with durable retrieval value:

- Architecture, workflow, provider, or tooling decisions that future work must
  respect.
- Project-specific implementation patterns that are repeated or easy to
  misuse.
- Incidents, regressions, or integration failures with verified cause,
  remediation, and prevention notes.
- Non-obvious solutions to problems that took meaningful investigation.
- Durable user or team preferences when they are explicitly stated and relevant
  to future project work.
- Constraints discovered from project memory, Code RAG, Code Graph, tests,
  command output, or source files that should influence later tasks.

## What must not be stored

Never store:

- Secrets, tokens, credentials, API keys, private keys, cookies, or session
  identifiers.
- Sensitive personal data, private user data, or unnecessary identifying
  details.
- Raw proprietary or copyrighted material copied from outside the project when
  a short citation or link would be enough.
- Speculation, hypotheses, unverified claims, or "seems like" observations.
- Routine task status, transient TODOs, command transcripts, or noisy logs that
  belong in the current task handoff.
- Duplicates of existing entries; update links or supersession metadata instead.
- Content that belongs to another durable producer, such as a design artifact,
  command receipt, reviewer report, or workflow state file.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read existing entries in target category to avoid duplication
2. Read project's `.supervibe/memory/index.json` for tag conventions (use existing tags where possible)
3. Read `confidence-rubrics/memory-entry.yaml` for quality bar
4. Query project memory and inspect Code RAG/Code Graph readiness when the
   proposed entry depends on source behavior or cross-file relationships
5. Record the exact retrieval path, source files, command outputs, memory ids,
   graph symbols, or fallback reason that justify the entry

## Decision tree

```
Category selection:
├─ "Why we chose X over Y" → decisions/
├─ "How we always do Z" → patterns/
├─ "What broke and how we fixed" → incidents/
├─ "Surprising thing about project/stack" → learnings/
└─ "Specific problem + specific solution" → solutions/

Confidence self-assessment:
├─ Verified through testing + review → 9-10
├─ Worked but not deeply tested → 7-8
├─ Hypothetical / one-off → ≤6 (don't add to memory)
```

## Freshness, tags, and supersession

- Freshness is evidence-based. Each entry must state when the source was
  observed and what would make it stale.
- Use `freshness: fresh | aging | stale | superseded` when the project memory
  schema already supports it; otherwise include a `Freshness` body section with
  `retrievedAt`, `lastVerified`, and `recheckWhen`.
- Tags must come from `.supervibe/memory/index.json` whenever possible. Choose
  3-7 lowercase tags covering subsystem, artifact type, workflow phase, and
  risk area; avoid one-off synonyms.
- If a new tag is unavoidable, explain why the existing vocabulary is
  insufficient in the entry body.
- Preserve history. Do not delete old entries during normal memory addition.
  Use `supersedes`, `supersededBy`, `contradicts`, and bidirectional `related`
  links so retrieval can show the lifecycle.
- A superseding entry must say what changed, what still applies from the older
  entry, and which evidence proves the replacement.

## Retrieval proof

Every memory entry must include a retrieval-proof block or section with:

- `queries`: memory/search queries or source paths used to check for duplicates.
- `sources`: file paths, command outputs, receipts, artifact paths, or external
  docs that support the claim.
- `memoryEvidence`: related memory ids read before writing the new entry.
- `codeEvidence`: Code RAG result and Code Graph readiness or a fallback reason.
- `retrievedAt`: ISO timestamp for volatile evidence.
- `limits`: what was not checked and how that affects confidence.

## Procedure

1. **Step 0** — read existing entries
2. **Choose category** (decision tree)
3. **Generate slug** from topic (kebab-case, ≤50 chars)
4. **Create file** at `.supervibe/memory/<category>/[<date>-]<slug>.md` (date prefix for time-sensitive types)
5. **Fill frontmatter**:
   ```yaml
   ---
   id: <slug>
   type: <category-singular>
   date: YYYY-MM-DD
   tags: [<3-7 tags from project vocabulary>]
   related: [<other entry IDs if applicable>]
   supersedes: [<older entry IDs if replacing guidance>]
   supersededBy: []
   freshness: fresh
   retrievedAt: <ISO timestamp>
   agent: <which agent or "user">
   confidence: <0-10 self-score>
   ---
   ```
6. **Write body** with mandatory sections:
   - **Context** (what situation led to this)
   - **What** (the decision/pattern/incident/learning/solution)
   - **Why** (rationale)
   - **How to apply** (concrete usage / when to invoke this knowledge)
   - **Freshness** (`lastVerified`, `recheckWhen`, stale triggers)
   - **Retrieval proof** (queries, sources, memory evidence, code evidence, limits)
   - **References** (links to specs, PRD decision sections, code, PRs)
   Before scoring, apply storage exclusions: remove secrets, sensitive data,
   raw logs, speculation, duplicate text, and unrelated task status.
7. **Score** with `supervibe:confidence-scoring` (memory-entry rubric ≥9 required)
8. **Trigger `scripts/build-memory-index.mjs`** to update `index.json`
9. **Cross-link** — update `related:` in any related entries (bidirectional)
10. **Lifecycle metadata** — add `supersedes:`, `supersededBy:` or `contradicts:` when this entry replaces or conflicts with earlier memory. Contradictions are review candidates, not automatic deletes.

## Examples

- Valid: A provider-config decision that cites the user request, the edited
  config file, the validation command, and the older memory entry it supersedes.
- Valid: An incident memory that names the failed workflow command, root cause,
  fix, prevention step, and a freshness trigger for the affected script.
- Invalid: "The tests passed today" without a reusable decision, source path,
  or future retrieval value.
- Invalid: A copied terminal transcript containing tokens, raw logs, or
  speculation that has not been verified.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.
- Do not use it as a private notes store for the current task; use the task
  handoff or plan artifact instead.
- Do not add memory when the only evidence is an unverified model inference.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.
- "Future agents might want this someday" - reject unless the entry has a
  specific future retrieval use and source proof.
- "The old entry is wrong, so delete it" - reject; supersede and cross-link
  unless a memory curator explicitly owns deletion.
- "This tag is close enough" - reject if it hides subsystem, artifact, or risk
  classification needed for retrieval.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.
- Entry has no retrieval proof, duplicate search, or source references.
- Tags are ad-hoc, too broad, or missing the affected subsystem.
- New guidance contradicts older memory without `supersedes`, `supersededBy`, or
  `contradicts` metadata.
- Memory captures a volatile external fact without `retrievedAt` and a recheck
  trigger.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.
- Belongs-in-memory test passed.
- Must-not-store exclusions checked.
- Tags reused from project vocabulary or justified.
- Freshness and stale triggers documented.
- Supersession and related links updated when applicable.
- Retrieval proof is sufficient for another agent to reproduce the claim.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.
- Memory becomes a noisy task diary, lowering recall quality.
- Sensitive or private data is stored because raw logs were pasted.
- Stale advice wins retrieval because newer entries did not supersede older
  ones.
- Ad-hoc tags make the entry invisible to normal project-memory queries.

## Output contract

Returns:
- `path`: created memory file path
- `category`: selected memory category
- `id`: stable memory id/slug
- `tags`: final tag list
- `freshness`: freshness status and stale trigger
- `supersedes`: entries replaced, if any
- `relatedUpdated`: cross-links updated count
- `retrievalProof`: duplicate-search queries, source references, memory ids,
  Code RAG/Code Graph status, and limits
- `indexUpdated`: index rebuild confirmation
- `confidence`: memory-entry rubric score

## Guard rails

- DO NOT: add memory for trivial things (lowers signal-to-noise)
- DO NOT: duplicate existing entries — search first via `supervibe:project-memory`
- DO NOT: use ad-hoc tags — reuse project vocabulary (read index.json tags)
- DO NOT: add memory with confidence <9 (hallucination/noise risk)
- DO NOT: store secrets, sensitive personal data, raw command logs, or
  unverified claims.
- DO NOT: delete historical entries as part of normal add-memory work.
- ALWAYS: add memory at end of significant tasks (otherwise lost)
- ALWAYS: rebuild index after add
- ALWAYS: preserve historical entries; use curator lifecycle fields instead of deleting stale memory by default
- ALWAYS: include retrieval proof and freshness metadata.

## Verification

- File exists at expected path
- Frontmatter complete and valid
- Memory-entry rubric score ≥9
- Index regenerated
- Duplicate search and related-entry review are recorded.
- Tags are present in memory index vocabulary or justified.
- Freshness metadata and stale trigger exist.
- Supersession links are bidirectional when replacing older guidance.
- Retrieval proof includes source references and limitations.

## Related

- `supervibe:project-memory` — search/read companion
- `agents/_meta/memory-curator` — maintains hygiene
- `supervibe:_core:quality-gate-reviewer` — invokes this at end of significant tasks
