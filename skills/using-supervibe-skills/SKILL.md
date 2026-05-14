---
name: using-supervibe-skills
namespace: process
description: 'Use when selecting, sequencing, or explaining Supervibe skills for a task. Maps user intent to skill chains without bypassing commands, receipts, RAG, CodeGraph, or confidence gates.'
allowed-tools:
  - Read
  - Bash
phase: planning
prerequisites: []
emits-artifact: skill-routing-plan
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1
last-verified: 2026-05-13T00:00:00.000Z
---

# Using Supervibe Skills

## Overview

Using Supervibe Skills provides a reusable Supervibe operating method for Use when selecting, sequencing, or explaining Supervibe skills for a task. Maps user intent to skill chains without bypassing commands, receipts, RAG, CodeGraph, or confidence gates.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## When to Use

Use this before mixing several Supervibe skills, when a user asks which workflow applies, or when an agent needs to hand off between planning, execution, review, memory, and release skills.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Read the requested command, active plan/graph state, `AGENTS.md`, and the candidate skill files. For session-start or context-bootstrap work, read `docs/session-start-context-policy.md` before choosing a path. If durable artifacts or delegated work are involved, read receipt and agent-invocation rules before choosing a path.

## When not to use

- Do not use this skill to replace `/supervibe-*` commands that own durable workflow state.
- Do not use it to justify inline emulation of an agent, reviewer, worker, or producer.
- Do not use it when one obvious skill already covers a read-only answer.

## Decision tree

```text
Need a plan? -> writing-plans -> requesting-code-review -> autonomous-agent-loop
Need implementation? -> source-driven-development -> executing-plans -> verification
Need parallel work? -> dispatching-parallel-agents -> subagent-driven-development
Need review? -> code-review or doubt-driven-development -> receiving-code-review
Need UI/browser proof? -> browser-runtime-verification -> verification
Need session-start/context bootstrap policy? -> source-driven-development -> verification
Need release? -> pre-pr-check -> finishing-a-development-branch
```

## Procedure

1. Identify the user's artifact target, mutation risk, and whether a command owns the flow.
2. Select the smallest skill chain that preserves source evidence, receipts, and final verification.
3. Put RAG, CodeGraph, and project memory before implementation when the task changes code.
4. For session-start/context bootstrap changes, preserve host-neutral wording, compact-context expectations, non-fatal initialization, runtime cleanup boundaries, and receipt neutrality from `docs/session-start-context-policy.md`.
5. Put reviewers and full tests at the end of graph execution unless the plan explicitly requires an earlier narrow check.
6. Emit a routing plan that names the selected skills, stop conditions, and required verification.

## Common rationalizations

- "This is just routing, so receipts do not matter" - false for durable plans, graph writes, producer outputs, reviewers, and worker claims.
- "One agent can do everything faster" - false when independent work can be delegated without blocking the critical path.
- "The user named a skill, so no source check is needed" - false when the skill depends on current project or provider state.

## Red flags

- A command, producer, reviewer, or worker is named but no runtime receipt can be issued.
- Multiple skills are listed without ownership, order, or stop conditions.
- The selected path skips memory, RAG, CodeGraph, or verification for a code-changing task.
- Session-start output is treated as delegated-work proof or as a replacement for workflow receipts.

## Checklist

- Command owner identified.
- Skill sequence has no duplicate responsibility.
- Required agents/workers/reviewers are real host invocations.
- RAG/CodeGraph/memory requirements are explicit.
- Session-start/context-bootstrap policy remains compact, host-neutral, and non-fatal.
- Final verification command is named.

## Failure modes

- Over-routing: too many skills slow delivery without improving evidence.
- Under-routing: a single generic skill hides required producer or reviewer proof.
- Stale routing: the selected skill chain ignores active graph or provider state.

## Output contract

Return a short routing plan with `selectedSkills`, `commandOwner`, `requiredReceipts`, `verificationCommands`, and `stopConditions`.

## Guard rails

- Do not invent skill ids.
- Do not bypass command-agent-plan for slash-command durable work.
- Do not claim a skill was used unless its workflow evidence exists.

## Verification

- `npm run validate:agent-skill-coverage`
- `npm run validate:skill-content-quality`
- `npm run validate:command-agent-enforcement`
- `node --test tests/session-start-context-policy.test.mjs` when session-start/context bootstrap behavior changes.

## Related

- `supervibe:autonomous-agent-loop`
- `supervibe:dispatching-parallel-agents`
- `supervibe:verification`
- `docs/session-start-context-policy.md`
