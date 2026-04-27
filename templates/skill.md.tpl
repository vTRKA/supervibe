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

## Decision tree

```
{{DECISION_TREE}}
```

## Procedure

1. {{STEP_1}}
2. {{STEP_2}}
3. {{STEP_3}}
4. **Score**: invoke evolve:confidence-scoring with artifact={{ARTIFACT_TYPE}}
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
