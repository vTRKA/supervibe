---
description: "Score an artifact against its confidence rubric. Usage: /evolve-score <artifact-type> [path]. Example: /evolve-score requirements-spec docs/specs/2026-04-27-foo.md"
---

# /evolve-score

Run the `evolve:confidence-scoring` skill against a specified artifact.

## Argument parsing

- `$1` = artifact-type (requirements-spec | implementation-plan | agent-output | scaffold-bundle | framework-self | prototype | research-output | agent-quality | skill-quality | rule-quality | brandbook)
- `$2` = optional path to artifact file (if omitted, prompt the user OR infer from the most recently produced artifact in the conversation)

## What I do when invoked

1. Resolve the artifact-type and path.
2. Verify the rubric file exists at `$CLAUDE_PLUGIN_ROOT/confidence-rubrics/<artifact-type>.yaml`.
   - If missing → respond with valid type list.
3. Load the artifact (Read tool on path).
4. Invoke skill `evolve:confidence-scoring` with artifact-type and content.
5. Display the structured score result (status, score, dimensions, gaps, remediation) to the user.
6. Do NOT take any further action — this is an inspection command, not a remediation command.

## Examples

- `/evolve-score requirements-spec docs/specs/2026-04-27-billing-design.md`
- `/evolve-score framework-self`
- `/evolve-score skill-quality skills/confidence-scoring/SKILL.md`
- `/evolve-score brandbook prototypes/_brandbook/index.html`
