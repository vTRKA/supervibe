---
name: {{NAME}}
namespace: {{NAMESPACE}}
description: "Use {{TRIGGER}} {{TRIGGER_PHRASE}} TO {{PURPOSE}} GATES {{GATE}}"
allowed-tools: [{{TOOLS}}]
phase: {{PHASE}}
prerequisites: [{{PREREQUISITES}}]
emits-artifact: {{ARTIFACT_TYPE}}
confidence-rubric: confidence-rubrics/{{RUBRIC_NAME}}.yaml
gate-on-exit: true
version: 1.0
last-verified: {{TODAY}}
---

# {{NAME}}

## When to invoke

{{WHEN_TO_INVOKE}}

## Step 0 — Read source of truth (MANDATORY)

Before doing anything, read:
- {{SOURCE_FILE_1}}
- {{SOURCE_FILE_2}}

## Retrieval and evidence policy

- For non-trivial planning, implementation, refactor, architecture, or production work, run `supervibe:project-memory` before proposing decisions.
- For unfamiliar code or code changes, run `supervibe:code-search` before broad file reads.
- Use CodeGraph for rename, move, delete, extract, public API, dependency-impact, and multi-file refactor work.
- If `node scripts/search-code.mjs --context "<task>"` is used, preserve the RAG Retrieval Quality, CodeGraph Quality Gates, citations, fallback reason, and graph warnings in the output.
- Cite memory IDs, source file:line references, graph symbols, and verification commands in the evidence ledger.

## Operational quality bar

- Define ready/done criteria for any skill that coordinates more than one step, agent, file, approval, or artifact.
- Add a Continuation Contract when the skill could otherwise stop after a first stage, first result, or first approval gate.
- Keep worker handoffs self-contained: objective, approved scope, read context, write set, acceptance criteria, verification, stop conditions, and output contract.
- Do not claim completion without verification evidence, confidence score, and explicit blocker/partial state when confidence is below the gate.

## Visual explanation policy

Use a visual only when it reduces ambiguity for the user or downstream agent. Prefer:

- Mermaid `flowchart` for process and decision flow.
- Mermaid `sequenceDiagram` for actor/system handoffs.
- Mermaid `stateDiagram-v2` for lifecycle states.
- Tables when exact comparison matters more than topology.

Every Mermaid diagram must include `accTitle`, `accDescr`, and a text fallback. Do not use color as the only signal.

## Decision tree

```
{{DECISION_TREE}}
```

## Procedure

1. {{STEP_1}}
2. {{STEP_2}}
3. {{STEP_3}}
4. **Score**: invoke supervibe:confidence-scoring with artifact={{ARTIFACT_TYPE}}
5. If score <9: identify gaps, return to relevant step
6. If score ≥9 OR override invoked: emit artifact

## Output contract

Returns: {{OUTPUT_FORMAT}}

## Guard rails

- DO NOT: {{GUARD_RAIL_1}}
- DO NOT: {{GUARD_RAIL_2}}
- ALWAYS: {{ALWAYS_RULE}}

## Verification

This skill's output is verified by:
- {{VERIFICATION_METHOD}}
