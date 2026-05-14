# Skill Anatomy

This is the canonical Supervibe anatomy for reusable skills. It aligns the
local skill baseline with Supervibe validation rules so future authors,
reviewers, and validators can reason from one contract.

## Canonical sources

- `references/skill-baseline/skill-anatomy-baseline.md` records local baseline
  facts, section names, and portability constraints.
- `tests/fixtures/skill-anatomy-baseline.json` is the machine-readable
  fixture that current validators use to derive required anatomy.
- `scripts/validate-skill-content-quality.mjs` is the hard local content gate
  for shipped `skills/<name>/SKILL.md` files.
- `docs/references/skill-expert-operating-standard.md` is the shared quality
  bar every Supervibe skill must cite.
- `references/templates/template-index.md` lists reusable durable output and
  handoff templates that skills can load by active branch.
- `references/templates/skill-template.md` is the canonical authoring template
  for new or normalized skills.

Use the local baseline as evidence, not as copied prose. Shared Supervibe
skills must remain host-neutral and must model upstream hook behavior as
portable policy, validator behavior, receipts, or adapter-specific docs.

## What a skill is

A skill is a reusable operating method. It tells an agent how to perform a class
of work with evidence, gates, and repeatable outputs. It is not a role prompt,
not a command manual, and not a place to store long reference material.

A strong skill is:

- Triggered by explicit conditions, not by vague "when needed" phrasing.
- Scoped to one reusable method or bounded capability.
- Evidence-first: it reads the source of truth before recommendations or edits.
- Host-neutral: it does not depend on one provider, chat UI, shell hook, or
  adapter path unless the skill itself is adapter-specific.
- Validator-friendly: it uses stable headings, clear output fields, and
  concrete verification commands.
- Compact: long checklists, examples, and domain tables live in one-hop
  reference files and are loaded only when needed.

## Frontmatter contract

Every shipped `SKILL.md` must declare these fields:

```yaml
---
name: skill-slug
namespace: process
description: "Use WHEN a specific trigger occurs TO perform a concrete method GATES confidence and verification evidence"
allowed-tools: [Read, Grep, Bash]
phase: plan
prerequisites: []
emits-artifact: artifact-type
confidence-rubric: confidence-rubrics/artifact-type.yaml
gate-on-exit: true
version: 1.0
last-verified: YYYY-MM-DD
---
```

Field rules:

- `name` is the folder slug and should use lowercase hyphenated words.
- `namespace` classifies the skill, usually `process`, `capability`, or
  `evolution`.
- `description` must name the trigger, the purpose, and the gate. Use the
  pattern `Use WHEN|BEFORE|AFTER ... TO ... GATES ...`.
- `allowed-tools` must be a non-empty, least-privilege list.
- `phase` must identify the primary lifecycle phase.
- `prerequisites` lists required inputs or prior artifacts.
- `emits-artifact` names the artifact or report the skill returns.
- `confidence-rubric` points to the scoring rubric used before exit.
- `gate-on-exit` defaults to `true`; exemptions must be explicit and rare.
- `version` and `last-verified` make freshness auditable.

## Required section order

New and normalized skills should use this order. Current validation enforces a
subset from the local baseline fixture plus the local expert-standard
section; future validators should treat this list as the canonical target.

1. `# <Skill Name>`
2. `## Overview`
3. `## When to Use`
4. `## When not to use`
5. `## Expert Operating Standard`
6. `## Step 0 - Source-of-truth preflight`
7. `## Decision tree`
8. `## Procedure`
9. `## Common rationalizations`
10. `## Red flags`
11. `## Checklist`
12. `## Failure modes`
13. `## Examples`
14. `## Output contract`
15. `## Guard rails`
16. `## Verification`
17. `## Related`
18. `## Supporting references` when progressive disclosure is needed
19. `## Exemption rules` when the skill intentionally departs from defaults

Keep the exact required heading names stable. Validators should prefer exact
heading checks for required anatomy and should allow optional sections only
after the required contract is present.

## Section intent

### Overview

State the skill's purpose, the class of work it handles, the primary artifact it
emits, and the confidence gate. Keep this short enough that an agent can decide
whether the method is relevant without reading the whole file.

### When to Use

List concrete triggers. Good triggers include user phrases, command states,
artifact states, validation failures, risk signals, or lifecycle transitions.
Avoid broad labels such as "for planning" unless the trigger says what planning
state exists and what decision is needed.

### When not to use

Name boundaries and safer alternatives. Include cases where a command, agent,
reviewer, validator, or more specific skill owns the work. If evidence is
missing, say whether the skill should stop, ask for input, or run a repair step.

### Expert Operating Standard

Cite `docs/references/skill-expert-operating-standard.md` and summarize the
local obligations: source-of-truth preflight, scope safety, retrieval evidence,
real producer receipts for delegated durable outputs, verification before
completion claims, and confidence below gate when evidence is partial.

### Step 0 - Source-of-truth preflight

Step 0 is mandatory and must happen before recommendations or edits. It should
name the exact evidence classes for this skill:

- Active host instructions and repository rules.
- Project memory entries relevant to the task.
- Code RAG results before unfamiliar code changes.
- CodeGraph evidence before rename, move, delete, extract, public API, or
  dependency-impact work.
- Existing artifacts, plans, receipts, validators, schemas, or state files.
- Domain evidence for regulated-trust areas such as legal, finance, health,
  government, security, privacy, or safety-sensitive workflows.

If retrieval is stale or unavailable, the skill must record that fact, use the
best available fallback, and keep confidence below the gate when the gap matters.

### Decision tree

Expose branching logic as an ASCII tree, table, or ordered if/then list. Do not
hide important branches in prose. Include stop conditions, escalation paths,
repair paths, and the branch that handles partial evidence.

### Procedure

Use numbered steps. The procedure should be executable by a future agent without
guessing the order of operations. Include where to read evidence, when to ask
for input, when to invoke real producers or validators, when to write artifacts,
and when to score confidence.

### Common rationalizations

List tempting but invalid excuses the agent must reject, such as "the change is
small so evidence is unnecessary" or "the validator probably covers this." This
section helps reviewers detect self-justifying shortcuts.

### Red flags

List signs that the skill is being misused or that execution quality is low:
missing source evidence, stale indexes, unowned artifacts, broad write scope,
provider-specific assumptions, skipped verification, copied checklist filler,
or unsupported completion claims.

### Checklist

Provide a compact execution or review checklist. It should cover evidence,
scope, decisions, artifacts, verification, confidence, and residual risks. Put
long checklist libraries in supporting references.

### Failure modes

Name common ways the method fails and how to detect or recover from each one.
Prefer observable signals over generic warnings. Include validation drift,
receipt gaps, stale retrieval, insufficient examples, and host-specific leakage
when relevant.

### Examples

Include at least one concise positive example for critical skills. Add negative
examples only when they clarify boundaries. Keep examples short; move large
worked examples to references.

### Output contract

Specify the exact shape returned by the skill. The contract should include
fields such as status, artifact paths, evidence citations, decisions made,
verification commands, confidence score, blockers, residual risks, and next
actions. Use stable field names when downstream tooling may parse the output.

### Guard rails

Use explicit `DO NOT:` and `ALWAYS:` bullets. Guard rails should constrain
dangerous behavior, not restate the procedure. Include provider neutrality,
scope boundaries, evidence requirements, and completion-claim rules.

### Verification

Name the targeted commands, inspections, or review gates that prove the skill
ran correctly. Verification must be specific enough that another agent can run
it. If a validator is not available, specify the manual evidence check and why
confidence remains below the normal gate.

### Related

Link related skills, agents, rules, commands, validators, and reference docs.
Use host-neutral names. Do not imply a provider-specific folder or plugin root
unless the artifact is adapter-specific.

### Supporting references

Use this section when the skill would otherwise become monolithic. A `SKILL.md`
over 30,000 bytes must either use one-hop supporting references or document an
accepted exemption. References should live under `references/`,
`references/templates/`, or a skill-local `references/` folder and should be
loaded only when needed.

### Exemption rules

Exemptions are allowed only when they preserve auditability:

- `gate-on-exit: false` is allowed only for a support skill that explains its
  confidence-scoring fallback and still requires verification evidence before
  completion claims.
- Missing source evidence is not an exemption. It is a blocker or a partial
  confidence state.
- Host-specific hooks, paths, or UI steps must move to adapter-specific docs or
  commands unless the skill itself is adapter-specific.
- Large reference material must move to supporting references. Do not inflate
  `SKILL.md` with copied checklists or upstream prose.
- Durable producer, worker, reviewer, external-tool, or validator claims need
  runtime-issued receipts where the workflow requires them.

## Progressive-disclosure policy

Skills should load the smallest evidence set that can support the decision:

1. Read the task contract and active host instructions.
2. Read current artifacts and prerequisites named by the skill.
3. Query project memory, Code RAG, and CodeGraph when the task risk requires it.
4. Load supporting references only for the active branch.
5. Preserve omitted-context notes when the agent deliberately leaves material
   unread because it is out of scope.

This keeps the skill useful in constrained context windows while still leaving a
clear audit trail for validators.

## Validator guidance

Future validators should:

- Read required anatomy from `tests/fixtures/skill-anatomy-baseline.json`
  and merge Supervibe-local requirements such as `Expert Operating Standard`.
- Treat required headings as stable anchors and report the missing heading by
  code, file, and message.
- Strip fenced code before scanning for copied template placeholders.
- Require frontmatter fields, non-empty `allowed-tools`, confidence gating, and
  explicit output contracts.
- Flag monolithic skills unless they use `Supporting references` or a documented
  exemption.
- Avoid enforcing host-specific tool names beyond the local schema.
- Keep baseline facts separate from copied prose or host-specific hooks.
