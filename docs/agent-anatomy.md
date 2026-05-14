# Canonical Agent Anatomy

This document is the source of truth for Supervibe agent structure. Use it when
creating, strengthening, reviewing, or normalizing files under `agents/`.

Related source:

- `docs/agent-authoring.md` - quick authoring guide and current validator notes.
- `references/templates/agent-template.md` - copyable canonical starter.
- `scripts/validate-agent-content-quality.mjs` - hard gate for required depth.
- `scripts/validate-agent-skill-coverage.mjs` - hard gate for skill ownership and
  `## Skills` explanations.

## Goals

An agent is a bounded specialist that makes decisions and produces evidence in a
known role. A good agent file must make these things unambiguous:

- when the agent should be invoked;
- what it is allowed to decide or change;
- which skills it uses and why;
- which memory, RAG, Code Graph, and project evidence it must check;
- which runtime path owns durable producer, reviewer, worker, or external-tool
  work;
- what proof is required before the agent can claim done.

Agents are not generic prompt bundles. They are operational contracts.

## Required Frontmatter

Every shipped agent needs complete frontmatter. Keep values concrete and scoped.

```yaml
---
name: <agent-slug>
namespace: <namespace>
description: >-
  Use WHEN <specific trigger> TO <role outcome> GATES <evidence or score>.
persona-years: 15
capabilities:
  - <capability>
stacks:
  - any
requires-stacks: []
optional-stacks: []
tools:
  - Read
  - Grep
  - Glob
  - Bash
skills:
  - supervibe:project-memory
  - supervibe:code-search
  - supervibe:verification
  - supervibe:<specialist-skill>
verification:
  - <verification-command-or-check>
  - <second-verification-command-or-check>
anti-patterns:
  - <concrete-failure-mode>
  - <concrete-failure-mode>
  - <concrete-failure-mode>
  - <concrete-failure-mode>
version: 1.0
last-verified: 2026-05-13T00:00:00.000Z
verified-against: HEAD
effectiveness:
  last-task: null
  outcome: null
  iterations: 0
---
```

Minimum frontmatter policy:

- `persona-years` must be `15` or higher for shipped agents.
- `skills` must contain at least 4 skill ids.
- `verification` must contain at least 2 concrete checks.
- `anti-patterns` must contain at least 4 concrete failure modes.
- `tools` must be the smallest set needed for the role.
- `description` must include a specific trigger and purpose, not "helps with".

## Required Body Sections

The body must be deep enough to guide real work without relying on hidden
assumptions. The current hard gate expects these sections or equivalent signals:

- `## Persona`
- `## 2026 Expert Standard`
- `## Scope Safety`
- `## Invocation Boundary`
- `## RAG + Memory pre-flight`
- `## Code Graph Policy`
- `## Decision tree`
- `## Procedure`
- `## Anti-patterns`
- `## User dialogue discipline`
- `## Verification`
- `## Output contract`
- `## Skills`
- `## Project Context`

The cache-friendly preferred order keeps stable sections before volatile project
context. `## Project Context` should normally remain last because strengthening
runs update it with repo-specific paths and evidence.

## Persona

The persona is not biography filler. It defines the judgment model the agent
uses when evidence is incomplete or tradeoffs conflict.

Include:

- concrete systems, incidents, or workflows the persona has shipped or repaired;
- one core principle;
- ordered priorities, such as correctness before speed;
- a mental model for how the domain fails in practice;
- explicit discomforts and scars that prevent naive advice.

Avoid:

- "senior expert in X" without shipped systems;
- generic virtues like "writes clean code";
- claims that imply authority without evidence;
- personas that would make the same decision in every stack or product context.

## 2026 Expert Standard

Agents must link and apply `docs/references/agent-modern-expert-standard.md`.
This means the agent:

- checks project memory and current source evidence before major claims;
- uses official docs, standards, or source repositories for facts that can
  change;
- turns advice into contracts, tests, telemetry, rollout, rollback, and
  residual-risk evidence where relevant;
- treats 10/10 maturity as evidence-bound, not rhetorical.

## Scope Safety

Agents must link and apply `docs/references/scope-safety-standard.md`.
Before expanding scope, the agent records:

- the user outcome or production risk improved by the addition;
- evidence that the addition belongs now;
- complexity, security, privacy, performance, QA, support, and release impact;
- whether the addition is included, deferred, rejected, spiked, or needs one
  user question.

Scope expansion without evidence is an anti-pattern.

## Invocation Boundary

This section prevents agents from claiming work that only a runtime, command, or
named specialist can produce.

### Direct Invocation

Direct invocation is valid when the agent trigger matches the user request or a
workflow dispatches the agent by name for its owned role. The agent may:

- perform its documented read, analysis, implementation, or review task;
- use only the tools allowed in frontmatter and task policy;
- produce its output contract with evidence and confidence;
- request runtime-issued receipts when the workflow requires invocation proof.

### Command-Owned Invocation

Command-owned invocation applies when a Supervibe command, loop, plan executor,
or other durable workflow owns the lifecycle. In that mode:

- the command owns routing, state transitions, durable artifacts, and receipts;
- the agent performs only the named specialist role it was invoked for;
- producer, reviewer, worker, validator, or external-tool claims must be bound
  to runtime evidence from the owning workflow;
- an inline draft from the controller is diagnostic only until the real runtime
  path produces proof.

### Prohibited Usage

Agents must not:

- emulate a named producer, reviewer, worker, validator, or external tool when a
  real host or runtime path exists;
- let a command receipt or skill receipt substitute for a required specialist
  invocation receipt;
- hand-write workflow receipts, ledgers, or external-tool proof;
- claim delegated work is complete without runtime-issued evidence;
- make provider-specific folder or host assumptions unless the artifact is
  explicitly adapter-specific.

If the only available answer would violate the boundary, the agent must stop and
report the missing runtime path or missing receipt.

## RAG + Memory Pre-Flight

Non-trivial agent work starts with retrieval evidence. The agent records:

- project memory query or reason memory was unavailable;
- Code RAG or code-search query used to find local patterns;
- relevant files, artifacts, prior decisions, and known gaps discovered;
- whether index health was ready, partial, stale, or unavailable.

If memory, RAG, or index status is not ready, the agent may still work when the
task is narrow, but it must lower confidence or state residual risk. It must not
claim 10/10 maturity while required memory/RAG evidence is unknown.

## Code Graph Policy

Use Code Graph evidence whenever the task touches structure, ownership,
callers/callees, dependency direction, refactors, public contracts, or blast
radius claims.

The agent records:

- graph readiness status;
- caller, callee, neighbor, or ownership query used;
- affected symbols or modules;
- unresolved-edge or stale-index warnings that matter;
- repair command if the graph is not ready and the task requires it.

If the Code Graph is stale or unavailable, do not invent structural certainty.
Use direct source reads and code search as fallback, then mark confidence and
residual risk accordingly.

## Decision Tree

Every agent needs explicit branching logic. Use a compact tree or if/then table.
At minimum cover:

- proceed directly when the trigger, scope, tools, and evidence are sufficient;
- ask one question when one missing fact changes the outcome;
- stop when required runtime proof, approval, or source evidence is missing;
- route to another agent, command, skill, or reviewer when ownership differs;
- decline scope expansion when evidence does not justify it.

The decision tree is the first place future maintainers should look to understand
how the agent avoids overreach.

## Procedure

The procedure is the operational path. It must be specific enough that two
different hosts can execute the same role with comparable evidence.

Required procedure shape:

1. Read task constraints, write scope, host policy, and relevant project rules.
2. Run memory/RAG pre-flight and Code Graph checks when applicable.
3. Confirm invocation boundary: direct, command-owned, or prohibited.
4. Map the work to accepted scope and skills.
5. Execute the role-specific analysis or change.
6. Collect evidence: files, commands, graph results, receipts, screenshots, or
   reviewer output as applicable.
7. Run verification commands from frontmatter or explain why a command is not
   applicable.
8. Emit the output contract with confidence, override status, rubric, residual
   risk, and next action.

Do not bury required evidence in prose. Name the exact artifacts.

## Skills Block Semantics

Skills appear in two places:

- frontmatter `skills` is machine-readable routing and ownership evidence;
- body `## Skills` explains how the agent applies each skill during work.

The two must match. Every frontmatter skill id must appear in `## Skills` with a
role-specific explanation. Decorative skill tags are invalid.

Skill policy:

- at least 4 skills total;
- at least 2 foundational skills from memory, search, verification, review,
  confidence, or TDD discipline;
- at least 1 specialist skill that matches the agent's actual job;
- `supervibe:verification` whenever the agent can claim done;
- `supervibe:confidence-scoring` when the agent emits a scored artifact;
- no unknown skill ids and no duplicate ids.

A good `## Skills` entry names when the skill is invoked and what evidence it
adds. A weak entry only repeats the skill name.

## Verification Expectations

Verification must be planned before the agent claims success.

Include:

- exact commands or checks the agent runs;
- expected artifacts or signals from those commands;
- fallback evidence when a command cannot be run;
- residual risk when verification is partial;
- final confidence only after verification evidence is known.

For agent content changes, relevant gates include:

- `npm run validate:agent-content-quality`
- `npm run validate:agent-skill-coverage`
- `npm run validate:agent-empirical-hardening`
- `npm run validate:agent-section-order`
- `npm run validate:agent-tool-use-matrix`

Run only the commands required by the active task and user constraints.

## Output Contract

Every agent must define an exact output shape. The canonical footer is mandatory
for scored artifacts:

```text
Confidence: <N>.<dd>/10
Override: <true|false>
Rubric: <rubric-id>
```

Read-only research agents that cannot produce a meaningful score may use:

```text
Confidence: N/A
Override: false
Rubric: read-only-research
```

The output contract should also name evidence, decisions, blocked items, and
next actions in a stable format that downstream workflows can parse.

## Anti-Patterns

Every agent must include concrete anti-patterns with reasoning. Common examples:

- `generic-persona` - the agent claims expertise without shipped systems or
  domain-specific failure modes.
- `scope-creep` - the agent adds features or policy beyond accepted scope.
- `receipt-emulation` - the agent hand-writes or substitutes runtime proof.
- `skill-as-decoration` - frontmatter skills are not explained in `## Skills`.
- `graph-certainty-without-graph` - the agent claims blast-radius certainty
  without Code Graph evidence or a stated fallback.
- `verification-after-claim` - the agent says done before running or explaining
  verification.
- `host-specific-shared-agent` - shared content assumes one provider or folder
  layout.

## Host-Neutral Wording

Shared agents must use provider-neutral language:

- say "host", "runtime", "tool", "agent", "command", and "workflow" unless the
  artifact is adapter-specific;
- avoid hardcoded provider folders, product names, and command syntax in shared
  agents;
- describe capability and evidence requirements rather than one host's UI;
- keep adapter-specific instructions in adapter-specific files.

## Graph Evidence Packet

When graph evidence applies, the agent output or durable artifact should include:

```text
Graph evidence:
- Readiness: <ready|partial|stale|unavailable>
- Query: <callers|callees|neighbors|ownership> <symbol-or-path>
- Findings: <affected modules, callers, contracts>
- Warnings: <unresolved edges, stale index, missing language support>
- Fallback: <source reads or code-search evidence if graph was not ready>
```

This packet keeps structural confidence auditable.

## Maintainer Checklist

Before shipping a new or rewritten agent:

- frontmatter fields are complete and scoped;
- body has all required sections;
- persona is concrete and domain-specific;
- invocation boundary distinguishes direct, command-owned, and prohibited use;
- memory/RAG and Code Graph policy are explicit;
- `## Skills` explains every frontmatter skill id;
- output contract ends with the canonical footer;
- anti-patterns are concrete and role-specific;
- verification commands are named and runnable in the intended context;
- shared wording is host-neutral;
- relevant validators pass or residual risk is recorded.
