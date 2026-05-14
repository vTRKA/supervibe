# Skill Template

Copy this template into `skills/<skill-slug>/SKILL.md`, then replace every
placeholder before validation. Placeholders are intentional in this reference
template; shipped skills must not contain unresolved placeholders.

```yaml
---
name: {{SKILL_SLUG}}
namespace: {{NAMESPACE}}
description: "Use WHEN {{SPECIFIC_TRIGGER}} TO {{CONCRETE_PURPOSE}} GATES {{CONFIDENCE_AND_VERIFICATION_GATE}}"
allowed-tools: [{{ALLOWED_TOOLS}}]
phase: {{PHASE}}
prerequisites: [{{PREREQUISITES}}]
emits-artifact: {{ARTIFACT_TYPE}}
confidence-rubric: confidence-rubrics/{{RUBRIC_NAME}}.yaml
gate-on-exit: true
version: 1.0
last-verified: {{YYYY-MM-DD}}
---
```

# {{SKILL_NAME}}

## Overview

{{OVERVIEW}}

## When to Use

- Use when {{WHEN_TO_USE_TRIGGER_1}} requires {{METHOD_OUTCOME}}.
- Use before {{RISK_POINT}} when {{EVIDENCE_OR_DECISION}} must be recorded.
- Use after {{PREREQUISITE_ARTIFACT}} exists and {{NEXT_OUTPUT}} is in scope.

## When not to use

- Do not use when {{MORE_SPECIFIC_OWNER}} owns the work.
- Do not use when required source artifacts are missing; stop and repair or ask
  for input instead.
- Do not use for provider-specific setup unless this is an adapter-specific
  skill.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: read the source of
truth before acting, apply scope safety, preserve retrieval evidence, use real
producer/reviewer/validator paths with runtime receipts when durable workflow
proof is required, verify before completion claims, and keep confidence below
gate when evidence is stale, partial, or delegated without proof.

## Step 0 - Source-of-truth preflight

Before recommendations or edits, read and record the relevant evidence:

- Active host instructions and repository rules: {{HOST_RULE_EVIDENCE}}.
- Project memory: {{MEMORY_EVIDENCE}}.
- Code RAG: {{CODE_RAG_EVIDENCE}}.
- CodeGraph: {{CODEGRAPH_EVIDENCE}}.
- Current artifacts, receipts, plans, schemas, or state files:
  {{CURRENT_ARTIFACTS}}.
- Domain evidence for regulated-trust work when applicable:
  {{DOMAIN_EVIDENCE}}.

If any required source is stale or unavailable, record the fallback and lower
confidence until the gap is repaired.

## Decision tree

```text
Start
  -> Required source evidence missing?
      -> Stop, repair retrieval or ask for the missing artifact.
  -> A more specific skill or command owns the work?
      -> Route there and report the handoff.
  -> Durable producer/reviewer/validator output required?
      -> Use the real runtime path and preserve receipt evidence.
  -> Output can be produced within scope and evidence gate?
      -> Run Procedure and Verification.
  -> Otherwise
      -> Return blockers, residual risk, and next safe action.
```

## Procedure

1. Confirm scope, write set, acceptance criteria, and stop conditions.
2. Complete Step 0 and preserve citations or fallback reasons.
3. Select the active branch from the decision tree.
4. Load only supporting references needed for that branch.
5. Produce or update the artifact named by `emits-artifact`.
6. Check the output against the checklist and failure modes.
7. Run the targeted verification command or manual evidence check.
8. Score confidence with the declared rubric or confidence-scoring path.
9. If confidence is below gate, report blockers, partial evidence, and next
   repair action instead of claiming completion.

## Common rationalizations

- "{{SMALL_CHANGE_EXCUSE}}" is not acceptable because evidence gates still
  apply.
- "{{VALIDATOR_ONLY_EXCUSE}}" is not acceptable because validators do not prove
  intent, scope, or source freshness by themselves.
- "{{HOST_SPECIFIC_SHORTCUT}}" is not acceptable in shared skills.

## Red flags

- Source-of-truth files, memory, RAG, or CodeGraph evidence were skipped without
  a recorded reason.
- The output relies on provider-specific paths, shell hooks, or UI assumptions.
- The skill writes outside its declared scope or emits an artifact without a
  stable output contract.
- Verification is described generically instead of naming the command or manual
  evidence.
- Confidence is claimed at or above gate while evidence is stale or partial.

## Checklist

- Scope and stop conditions are explicit.
- Step 0 evidence was read or a fallback was recorded.
- Decision-tree branch is named in the output.
- Supporting references were loaded only when needed.
- Output contract fields are complete.
- Guard rails were checked.
- Verification command or manual evidence was inspected.
- Confidence score and residual risks are stated.

## Failure modes

- Stale retrieval evidence causes outdated recommendations. Detect with status
  output, timestamps, or retrieval warnings; recover by rebuilding or reporting
  partial confidence.
- Hidden branch logic causes inconsistent agent behavior. Detect when the
  procedure has conditional prose not represented in the decision tree; recover
  by adding the branch.
- Monolithic skill content hides the actual method. Detect large inline
  checklists or examples; recover by moving material to supporting references.
- Host-specific leakage breaks another adapter. Detect provider names, local
  absolute paths, or copied shell hooks; recover by moving them to adapter docs.
- Completion is claimed without proof. Detect missing verification output,
  confidence score, or required receipt; recover by running the real gate.

## Examples

### Positive

{{POSITIVE_EXAMPLE}}

### Negative

{{NEGATIVE_EXAMPLE}}

## Output contract

Return this shape:

```text
STATUS: PASS|FAIL|BLOCKED|PARTIAL
ARTIFACTS:
- {{ARTIFACT_PATH_OR_NONE}}
EVIDENCE:
- {{EVIDENCE_CITATION_OR_FALLBACK}}
DECISION_BRANCH: {{DECISION_BRANCH}}
VERIFICATION:
- {{VERIFICATION_COMMAND_OR_CHECK}} => {{VERIFICATION_RESULT}}
CONFIDENCE: {{CONFIDENCE_SCORE}}/10
BLOCKERS:
- {{BLOCKER_OR_NONE}}
RISKS:
- {{RESIDUAL_RISK_OR_NONE}}
NEXT_ACTION: {{NEXT_SAFE_ACTION_OR_NONE}}
```

## Guard rails

- DO NOT: claim completion without verification evidence and confidence status.
- DO NOT: copy upstream prose, host-specific hooks, or long generic checklists
  into this skill.
- DO NOT: expand scope beyond the declared write set or artifact contract.
- ALWAYS: keep shared skills host-neutral unless the skill is explicitly
  adapter-specific.
- ALWAYS: record stale, missing, or partial evidence instead of hiding it.
- ALWAYS: use real producers, reviewers, validators, and workflow receipts when
  the workflow requires durable proof.

## Verification

This skill is verified by:

- `npm run validate:skill-content-quality`
- {{TARGETED_TEST_OR_VALIDATOR}}
- Manual inspection that the trigger, Step 0 evidence, decision tree, output
  contract, guard rails, and confidence gate match `docs/skill-anatomy.md`.

## Related

- `docs/skill-anatomy.md`
- `docs/references/skill-expert-operating-standard.md`
- `references/skill-baseline/skill-anatomy-baseline.md`
- {{RELATED_SKILL_AGENT_RULE_COMMAND_VALIDATOR_OR_RUBRIC}}

## Supporting references

Use this section only when the active branch needs more detail than belongs in
`SKILL.md`.

- {{REFERENCE_PATH}} - {{WHEN_TO_LOAD_IT}}

Progressive-disclosure rules:

- Keep long checklists, examples, comparison tables, and templates in
  `references/`, `references/templates/`, or skill-local `references/`.
- Load supporting references only for the branch selected by the decision tree.
- Summarize omitted context when it was intentionally left unread.
- A `SKILL.md` over 30,000 bytes needs supporting references or an explicit
  accepted exemption.

## Exemption rules

- `gate-on-exit: false` is allowed only for a support skill that still explains
  its confidence-scoring fallback and requires verification evidence before
  completion claims.
- Missing source evidence is never a silent exemption. Report a blocker or
  partial confidence state.
- Host-specific automation belongs in adapter docs, commands, or rules unless
  this skill is adapter-specific.
- Durable producer, worker, reviewer, external-tool, or validator claims need
  runtime-issued receipts when the workflow requires them.
