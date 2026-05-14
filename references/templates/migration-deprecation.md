# Migration And Deprecation Template

Use this template when an agent, skill, command, artifact, API, schema, prompt,
rule, file layout, or runtime contract moves from an old behavior to a new
behavior. The goal is to make transition state explicit, keep compatibility
auditable, and prevent cleanup from racing ahead of evidence.

## Migration Metadata

| Field | Required content |
| --- | --- |
| Title | Short migration or deprecation name. |
| Status | Planned, active, paused, completed, reverted, or blocked. |
| Owner | Responsible role or workflow. |
| Scope | Old and new files, commands, APIs, artifacts, prompts, rules, or schemas. |
| Decision source | ADR, plan, issue, user request, reviewer finding, or validator failure. |
| Start criteria | Evidence required before migration work begins. |
| Exit criteria | Evidence required before old behavior can be removed. |

## Current State Evidence

Record the facts that prove the migration is needed:

- Old contract: current behavior, file path, command, API, schema, prompt, or
  artifact expectation.
- New contract: target behavior and owner.
- Consumers: known callers, agents, skills, commands, users, validators, tests,
  adapters, or generated artifacts that depend on the old contract.
- Retrieval evidence: project memory, Code RAG, CodeGraph, source reads,
  official docs, or explicit fallback.
- Drift signal: broken validation, duplicate patterns, obsolete docs, security
  finding, user confusion, or operational risk.

## Compatibility Contract

| Consumer group | Compatibility promise | Required evidence | Removal condition |
| --- | --- | --- | --- |
| Existing workflows | Old input remains accepted during migration, or a documented error is returned. | Test, validator, source read, or reviewer evidence. | New path has adoption evidence and no active blockers. |
| New workflows | New input is documented and validated before old path removal. | Template, docs, tests, or artifact examples. | Validator enforces the new contract. |
| External or adapter-specific users | Host-neutral contract remains stable; adapter details stay in adapter-owned docs. | Adapter matrix, docs, or explicit non-applicability note. | Adapter owner approves removal or impact is proven absent. |

## Deprecation Schedule

Use concrete dates or workflow phases. Avoid open-ended cleanup language.

| Phase | Trigger | Allowed behavior | Required communication | Verification |
| --- | --- | --- | --- | --- |
| Announce | Decision accepted and migration plan approved. | Old and new behavior both documented. | Changelog, docs, command output, or workflow status. | Link and content check. |
| Dual support | New behavior is available. | Old behavior remains supported with warning when appropriate. | Migration note where users or agents encounter the old path. | Tests cover both paths. |
| Removal ready | Adoption and validation evidence exists. | Old behavior can be rejected or removed. | Release note or maintainer notice. | Removal gate passes. |
| Complete | Old behavior no longer reachable. | New contract is canonical. | Final status update. | Targeted validation passes. |

## Migration Steps

1. Confirm write scope, owner, and stop conditions.
2. Read source evidence and record stale or missing index status.
3. Add the new contract without removing old behavior unless the plan allows a
   breaking change.
4. Add compatibility tests, examples, validators, or docs for both paths.
5. Mark old behavior as deprecated using the project-approved mechanism.
6. Run targeted verification and record exact command results.
7. Hand off remaining cleanup with owner, trigger, and rollback action.

## Communication Plan

- Audience: agents, skills, commands, maintainers, users, adapters, or release
  owners affected by the migration.
- Message location: docs, changelog, command output, warning text, plan artifact,
  or workflow state.
- Required wording: state old contract, new contract, migration deadline or
  phase, and where to report blockers.
- Forbidden wording: avoid provider-specific assumptions in shared content and
  avoid unsupported maturity claims.

## Rollback Plan

- Rollback trigger: failed validator, compatibility break, reviewer blocker,
  incident signal, or user-impact evidence.
- Rollback action: restore old behavior, disable new path, revert routing, or
  pause removal.
- Data or artifact recovery: describe how generated artifacts, caches, indexes,
  or state files are preserved or rebuilt.
- Owner: role responsible for deciding and executing rollback.

## Verification

Record targeted proof, not broad release checks unless required by the task:

- Commands run: exact command and result.
- Tests or fixtures touched: paths and expected behavior.
- Manual inspection: files, generated artifacts, logs, or UI states checked.
- Link checks: every Markdown or artifact link added by the migration resolves.
- Residual gaps: evidence that was unavailable and why migration can proceed or
  must stay blocked.

## Handoff

Use [Worker Handoff](worker-handoff.md) for parallel implementation or cleanup.
Use [Architecture Decision Record](adr.md) when migration direction depends on a
choice between competing contracts. Use [Security Review](security-review.md)
when the migration touches secrets, permissions, privacy, execution boundaries,
or regulated data.

## Completion Checklist

- Old and new contracts are both named.
- Consumers and validators are identified.
- Compatibility promise and removal condition are explicit.
- Schedule has concrete triggers.
- Rollback action is practical and owned.
- Targeted verification has been run or a blocker is recorded.
