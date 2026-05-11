# Visual Explanation Standard

Supervibe agents should not explain complex work only as prose when a compact
visual model would reduce ambiguity. Visual output is a comprehension aid, not
decoration.

## When To Visualize

Use a visual when the artifact contains one of these shapes:

- Workflow or decision path: text-first stage map with readable cards, lanes,
  or steps.
- Actor/system interaction: text-first timeline table or swimlane-style summary.
- Entity lifecycle or status field: text-first state board with labels.
- Architecture boundary or ownership: text-first boundary map with explicit
  owner, trust, and data labels.
- Prioritization, comparison, or evidence matrix: Markdown table when a table is
  clearer than a rendered preview.

Do not add a diagram when a short list is clearer, when the user asked for terse
output, or when the diagram would repeat the same labels without clarifying
dependencies, states, trust boundaries, or release gates.

## Minimum Contract

Every generated visual explanation must include:

- `Visual mode`: text-first summary, table-only, optional browser preview, or fallback export.
- `Preview`: a local HTML path or URL only when browser preview mode is used.
- `Text fallback`: the same states, edges, decisions, and stop conditions in
  plain language.
- `Audience summary`: one beginner-readable explanation and one implementer note
  when the topic is technical.
- Labels on important arrows, transitions, states, owners, and risks.
- No color-only status encoding.
- A node or card budget: about 12 cards before splitting.
- If Mermaid is emitted as fallback/export, it must include `accTitle` and
  `accDescr`.

## Standard Patterns

### Text-First Process

Use a compact text summary first. Prefer a Markdown table, stage map, or
improvised ASCII scheme that fits directly in the chat. Create a small HTML/CSS
packet under `.supervibe/artifacts/visual-explanations/<slug>/index.html` only
when the user benefits from seeing actual UI/prototype/browser evidence.

Required packet sections:

- Header: title, status, artifact source, and date.
- Flow lanes: approved input, decision gate, durable artifact, review or
  execution gate, and stop path.
- Decision cards: continue, revise, defer, and stop choices when a user decision
  is required.
- Evidence strip: memory, RAG, CodeGraph, validator, and confidence evidence.
- Text fallback: compact prose for clients without preview rendering.

Text fallback: approved scope becomes a reviewed plan, then implementation,
verification, release, and post-release learning.

### Table-Only Visual

Use a Markdown table when the user needs comparison more than a diagram:

| Step | Decision | Evidence | Stop condition |
|------|----------|----------|----------------|
| Summary | User understands the proposed artifact | problem, scope, risk | summary rejected |
| Approval | User chooses whether to write documentation | explicit choice | no durable write |
| Artifact | Documentation is written and validated | validator output | validation fails |
| Next action | User chooses plan, revise, research, defer, or stop | next action menu | user stops |

### Mermaid Fallback Or Export

Mermaid is acceptable when the user explicitly asks for raw diagram text or a
renderer-friendly export is needed. Treat it as fallback/export, not the primary
explanation.

```mermaid
flowchart TD
  %% accTitle: Documentation approval path
  %% accDescr: Summary is shown before durable documentation; the user can create, revise, preview, research, or stop before any file is written.
  Summary[Pre-documentation summary] --> Gate{Documentation approval}
  Gate -->|create| Spec[Durable spec]
  Gate -->|revise| Revise[Revise summary]
  Gate -->|preview| Visual[Text-first visual summary]
  Gate -->|research| Evidence[More evidence]
  Gate -->|stop| Stop[No durable documentation]
  Spec --> Post[Post-documentation summary and next actions]
```

Text fallback: show summary, ask for documentation approval, write the spec only
when approved, then summarize the saved artifact and next choices.

## Verification

Before claiming a visual artifact is ready:

- Verify the text-first summary includes a stage map, table, or ASCII scheme.
- If a workflow claimed visual output, run
  `node scripts/validate-visual-explanation-artifacts.mjs --all --require-claimed`
  or validate the explicit file. `--all` without `--require-claimed` is neutral
  when no visual artifacts exist; claimed output with no artifact is a failure.
- If a browser preview packet is used for UI/prototype evidence, verify it has a
  preview URL/path.
- Check that the text fallback names every critical node, edge, decision, and
  stop condition.
- Check that raw Mermaid fallback, when present, includes `accTitle` and
  `accDescr`.
- For UI previews, use Playwright or a local screenshot to verify text does not
  overlap and visual content is not blank.

## Source Basis

- Mermaid accessibility: https://mermaid.js.org/config/accessibility.html
- Mermaid syntax reference: https://mermaid.js.org/intro/syntax-reference.html
