---
name: trigger-diagnostics
namespace: process
description: "Use WHEN a Supervibe trigger, command route, or skill handoff did not match, matched the wrong flow, or needs explanation TO diagnose intent, missing artifacts, confidence, blockers, and the next safe action."
allowed-tools: [Read, Grep, Glob, Bash]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1.0
last-verified: 2026-05-02
---

# Trigger Diagnostics

## When to invoke

Use this skill when the user asks why a Supervibe phrase, command, trigger, skill selection, or next-step handoff behaved unexpectedly.

Invoke it for:
- A phrase did not route to the expected command.
- A phrase routed to the wrong skill.
- A route was blocked because required artifacts were missing.
- A route was blocked by safety gates.
- The user asks "why this skill?" or "why did this trigger fail?"
- A command, agent, or skill author needs evidence before changing trigger metadata.

Do not use it as a substitute for execution. This is a read-only diagnostic and explanation skill.

## Step 0 - Read Source Of Truth

Read these files before recommending a route change:
- `scripts/lib/supervibe-trigger-intent-corpus.mjs`
- `scripts/lib/supervibe-trigger-router.mjs`
- `scripts/lib/supervibe-workflow-router.mjs`
- `scripts/lib/supervibe-trigger-diagnostics.mjs`
- `tests/supervibe-trigger-diagnostics.test.mjs`
- The command or skill file referenced by the reported route, if any.

If the user provided recent assistant output, include it as evidence. Trigger diagnostics often depends on whether the previous assistant message emitted a `NEXT_STEP_HANDOFF` block, a plan path, a brainstorm artifact, or an explicit stop condition.

## Decision Tree

```
Did no route match?
  -> classify as corpus gap or keyword gap
  -> recommend adding a fixture only if the phrase is common and unambiguous

Did a route match but artifacts are missing?
  -> report the missing artifact names
  -> ask for exactly one missing artifact or point to its expected path

Did a route match but safety blockers exist?
  -> report each blocker
  -> ask for the explicit gate needed before mutation or execution

Did the wrong skill match?
  -> compare top likely route vs expected route
  -> inspect trigger descriptions and corpus overlaps
  -> propose a metadata or corpus fix with a replay test

Did the route look correct?
  -> explain confidence, command, skill, prerequisites, and next question
```

## Procedure

1. Capture the exact user phrase. Do not paraphrase it before diagnostics.
2. Capture available artifacts:
   - brainstorm summary
   - plan path or plan content
   - reviewed-plan marker
   - epic id or work item id
   - recent `NEXT_STEP_HANDOFF`
   - dirty git state, if it affects safety
3. Run a diagnostic:
   ```bash
   node scripts/lib/supervibe-trigger-diagnostics.mjs
   ```
   If the library is being called from a command wrapper, pass the phrase and artifacts to `diagnoseTriggerRequest()`.
4. Read the returned route:
   - `intent`
   - `command`
   - `skill`
   - `confidence`
   - `matchedPhrase`
   - `missingArtifacts`
   - `safetyBlockers`
   - `nextQuestion`
5. Explain the result in user language. Use one compact evidence block; do not dump the whole corpus.
6. If the user asked to fix the route, make the smallest metadata or corpus change and add/update a replay test.
7. Run:
   ```bash
   node --test tests/supervibe-trigger-diagnostics.test.mjs
   npm run validate:trigger-replay
   npm run validate:artifact-links
   ```
8. Do not claim the trigger is fixed unless those commands pass.

## Output Contract

Return a Markdown diagnostic:

```markdown
# Trigger Diagnostic: <short phrase>

Intent: <intent>
Command: <command>
Skill: <supervibe:skill>
Confidence: <0.00-1.00>
Matched evidence: <matched phrase or route reason>

Missing artifacts:
- <artifact or "none">

Safety blockers:
- <blocker or "none">

Likely cause: <one sentence>
Recommended action: <one action>
Next question: <Step 1/1 question from route>

Verification:
- <command>: PASS|FAIL

Confidence: <N>.<dd>/10
Override: false
Rubric: agent-delivery
```

## User Dialogue Discipline

If more information is needed, ask one question per message:

> **Step N/M:** Which artifact should I use to reproduce the route?
>
> Why: Trigger routing depends on the exact available artifact state, not only the phrase.
> Decision unlocked: This decides whether the issue is a corpus gap, missing-artifact block, or safety gate.
> If skipped: I will diagnose using only the raw phrase and mark artifact-sensitive conclusions as tentative.
>
> - Use recent handoff (recommended) - Best when the issue happened right after a plan, brainstorm, or review output.
> - Use a file path - Best when a saved plan, spec, or work item should drive the route.
> - Phrase only - Fastest, but cannot prove artifact-sensitive blockers.
> - Stop here - Save no changes and return the current uncertainty.
>
> Free-form answer also accepted.

## Anti-patterns

- **Changing triggers without replay evidence**: route metadata changes must have a fixture or test.
- **Ignoring missing artifacts**: a matched route with missing prerequisites is not a router bug.
- **Hiding confidence**: users need to know whether the route was exact, fuzzy, or fallback.
- **Overfitting one phrase**: do not add a narrow phrase that damages adjacent intents.
- **Mutating project state**: diagnostics is read-only unless the user explicitly asks for a fix.

## Verification

- `node --test tests/supervibe-trigger-diagnostics.test.mjs`
- `npm run validate:trigger-replay`
- `npm run validate:artifact-links`

## Related

- `supervibe:workflow-router` internal route sentinel
- `supervibe:requirements-intake` for ambiguous new requests
- `supervibe:requesting-code-review` for plan-review handoffs
- `supervibe:writing-plans` for brainstorm-to-plan transitions
- `scripts/lib/supervibe-trigger-intent-corpus.mjs`
- `scripts/lib/supervibe-trigger-diagnostics.mjs`
