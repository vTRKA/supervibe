# Reusable Output And Handoff Template Index

Use this index when an agent, skill, command workflow, or reviewer needs a
portable output shape instead of inventing a local report format. These
templates are reference material for durable or handoff-oriented work; they do
not replace runtime validation, receipts, or the source-of-truth checks required
by the active workflow.

## Template Map

| Template | Use when | Primary output | Handoff companion |
| --- | --- | --- | --- |
| [Architecture Decision Record](adr.md) | A reference-only engineering decision needs long-term rationale outside active product workflow surfaces. | Decision, options, consequences, rollout, rollback, and verification evidence. | [Worker Handoff](worker-handoff.md) when another worker implements or reviews the decision. |
| [Browser Runtime Report](browser-runtime-report.md) | UI, prototype, preview, or browser behavior needs runtime proof across states or viewports. | Server/page state, browser checks, screenshots or DOM evidence, blockers, and residual risk. | [Source Evidence Report](source-evidence-report.md) when runtime findings depend on source or docs. |
| [Doubt Review Prompt](doubt-review-prompt.md) | A reviewer or worker must challenge assumptions before accepting a claim. | Doubts, proof target, counterfactual checks, verification, and confidence boundary. | [Reviewer Output](reviewer-output.md) for independent review results. |
| [Incident Report](incident-report.md) | A failure, security issue, outage, data-risk event, or workflow incident needs triage and mitigation evidence. | Impact, timeline, cause, mitigation, follow-ups, owners, and verification. | [Postmortem](postmortem.md) when the incident needs deeper learning. |
| [Migration And Deprecation](migration-deprecation.md) | Existing behavior, files, APIs, commands, schema, prompts, or artifacts must move from one contract to another. | Compatibility plan, deprecation schedule, migration steps, communication plan, and rollback. | [Architecture Decision Record](adr.md) when the migration chooses between competing designs. |
| [Postmortem](postmortem.md) | A completed incident or failed workflow needs root-cause learning and prevention work. | Timeline, contributing factors, corrective actions, owners, and validation plan. | [Incident Report](incident-report.md) for the operational event record. |
| [Release Readiness](release-readiness.md) | A branch, feature, workflow, or command surface is approaching release or handoff. | Gate status, approvals, rollback, support owner, risks, and final commands. | [Worker Handoff](worker-handoff.md) when another owner ships or reviews. |
| [Reviewer Output](reviewer-output.md) | A formal reviewer must return machine-checkable findings and verdict. | Scope, findings, severity, evidence, requested fixes, confidence, and verdict. | [Doubt Review Prompt](doubt-review-prompt.md) for adversarial checks before verdict. |
| [Security Review](security-review.md) | A change touches secrets, identity, permissions, data exposure, dependencies, network access, execution boundaries, or release risk. | Scope, threat model, findings, required fixes, verification, and residual risk. | [Source Evidence Report](source-evidence-report.md) when claims depend on external standards or current upstream behavior. |
| [Source Evidence Report](source-evidence-report.md) | A workflow needs auditable memory, Code RAG, CodeGraph, official docs, or domain evidence before recommendations or completion claims. | Evidence table, coverage, freshness, conflicts, omitted evidence, and confidence boundary. | Any template that needs source-backed claims. |
| [Worker Handoff](worker-handoff.md) | Work moves between parallel workers, reviewers, validators, or workflow phases. | Context packet, write scope, completed work, remaining work, verification evidence, blockers, and next action. | All templates in this index. |

## Selection Rules

1. Choose the narrowest template that matches the artifact being produced.
2. Attach a [Source Evidence Report](source-evidence-report.md) when a claim
   depends on project memory, Code RAG, CodeGraph, official documentation,
   domain standards, or stale-index fallback.
3. Add a [Worker Handoff](worker-handoff.md) whenever another role must continue
   the work without re-reading broad context.
4. Use [Security Review](security-review.md) for regulated-trust or release-risk
   work even when security is not the main task title.
5. Use [Migration And Deprecation](migration-deprecation.md) when compatibility,
   transition timing, user communication, or cleanup sequencing matters.
6. Use [Architecture Decision Record](adr.md) only as reference material when future maintainers need long-term rationale.

## Common Evidence Contract

Every template in this set should record these fields when they apply:

| Field | Required content |
| --- | --- |
| Scope | Files, artifacts, commands, runtime state, or product surface covered by the output. |
| Source evidence | Project memory, code-search, Code RAG, CodeGraph, docs, standards, test output, or explicit fallback. |
| Decision or finding | The accepted decision, finding, risk, or handoff state in concrete terms. |
| Verification | Exact command, manual inspection, reviewer output, or reason verification could not run. |
| Residual risk | Known remaining risk, owner, and next safe action. |
| Confidence boundary | Why the output is complete, partial, blocked, or below a maturity claim. |

Do not treat a template as proof by itself. Runtime-issued workflow receipts,
reviewer invocations, validators, and external-tool evidence remain governed by
the active workflow policy.

## Related References

- [Canonical Agent Anatomy](../../docs/agent-anatomy.md) defines agent evidence,
  output, skill, and verification expectations.
- [Skill Anatomy](../../docs/skill-anatomy.md) defines reusable skill structure
  and progressive disclosure rules.
- [Workflow Hardening](../../docs/supervibe-workflow-hardening.md) explains
  prompt slicing, handoff context, and evidence prioritization.
- [Scope Safety Standard](../../docs/references/scope-safety-standard.md)
  explains how to include, defer, reject, or spike extra scope.
- [Agent Template](agent-template.md) and [Skill Template](skill-template.md)
  remain the canonical starter references for new agent and skill files.
