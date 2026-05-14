---
name: presentation-deck
namespace: process
description: 'Use WHEN the user asks to create, revise, approve, or export a presentation deck to build a storyboard, HTML slide preview, feedback loop, approved PPTX, and Google Drive handoff. Trigger phrases: ''make a presentation'', ''prepare pitch deck'', ''create pptx'', ''deck for investors'', ''presentation mockup''.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
  - WebFetch
phase: exec
prerequisites:
  - brief-or-source-materials
emits-artifact: presentation
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-29T00:00:00.000Z
---

# Presentation Deck

## Overview

Presentation Deck provides a reusable Supervibe operating method for Use WHEN the user asks to create, revise, approve, or export a presentation deck to build a storyboard, HTML slide preview, feedback loop, approved PPTX, and Google Drive handoff. Trigger phrases: 'make a presentation', 'prepare pitch deck', 'create pptx', 'deck for investors', 'presentation mockup'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
Build a presentation deck through the same visible review loop as design prototypes: brief, storyboard, HTML preview, browser feedback, approval, `.pptx` export, and Google Drive handoff.

## Design Intelligence Preflight

Before storyboard or visual direction, run project memory, code search, and internal `supervibe:design-intelligence` lookup for slide strategy, layout, copy, chart, typography, color, background, brand, and token evidence. Presentation-director owns narrative; presentation-deck-builder owns implementation.

## Local Design Expert Reference

Read `docs/references/design-expert-knowledge.md` before deck structure or visual direction. Start with Design Pass Triage from the `Eight-Pass Expert Routine` and classify deck-owned passes as `required | reuse | delegated | skipped | N/A`. For decks inside an approved design system, reuse preference and visual-system decisions unless the deck requires a new audience posture, brand reset, or missing token/asset extension. If the system is candidate or needs_revision, resume design-system approval before treating it as reusable. Run the relevant product/audience fit, local evidence lookup, reference scan, storyboard/flow, responsive slide preview, quality review, and feedback/approval passes. External references are supplemental; use the internet only for current references or official platform evidence after local data has been checked.

## When to Use

Use after `/supervibe-presentation` or whenever the user asks for a pitch deck, report deck, product demo deck, sales deck, training deck, or a `.pptx` deliverable. This skill is for presentation artifacts, not production UI.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth (required)

Before storyboard, preview, or export, read source materials, existing
presentation artifacts, approved design-system state, project memory, design
intelligence evidence, open browser feedback, and media capability output. If a
deck already has approval or unresolved feedback, resume that state instead of
starting a parallel deck.

## Decision tree

```
Deck brief lacks audience, desired action, source material, language, or length
  -> Ask one focused Step N/M question before storyboard.

Approved design system exists
  -> Reuse tokens and visual language; request a design-system extension for missing deck needs.

Deck has unresolved feedback or an approval marker
  -> Resume that state instead of starting a parallel deck.

User requests PPTX export before preview approval
  -> Block export and route through preview approval.

Requested media exceeds local capabilities
  -> Offer storyboard frames, animated HTML, poster sequences, SVG/Lottie specs, or static alternatives.
```

## Hard constraints

1. **Review before export.** A `.pptx` is produced only after the user approves the HTML slide preview or an existing deck spec.
2. **One question at a time.** If audience, outcome, source materials, length, or language is unclear, ask one focused question with `Step N/M:`.
3. **Design-system reuse.** If `.supervibe/artifacts/prototypes/_design-system/manifest.json` is approved, use its tokens and component language. If deck visuals require new tokens, request a design-system extension instead of inventing a parallel style.
4. **Reference-aware.** Use web/reference research when the deck category benefits from current visual examples. Record URLs and extraction notes in `.supervibe/artifacts/presentations/<slug>/references.md`.
5. **Media capability-aware.** Before promising video, GIF, or generated motion deliverables, run `node "<resolved-supervibe-plugin-root>/scripts/detect-media-capabilities.mjs" --json`. If video tooling is unavailable, use storyboard frames, animated HTML preview, poster-frame sequences, SVG/Lottie specs, or static visual metaphors.
6. **Feedback is stateful.** Read open feedback with `npm run feedback:status`, resolve each item with `node scripts/feedback-status.mjs --resolve <id> --resolution <path>`, and do not rework already resolved feedback unless the user reopens it.

## Directory layout

```text
.supervibe/artifacts/presentations/<slug>/
  brief.md
  references.md
  storyboard.md
  deck.json
  preview/index.html
  assets/
  _reviews/
  feedback-resolutions/
  export/
  google-drive-handoff.md
```

## Procedure

1. **Intake.** Capture deck type, audience, desired action, source materials, language, slide count, deadline, and final destination. Ask one missing item at a time.
2. **Research.** Search project memory and local design intelligence first; when useful, use the web for 5-10 current references. Record what to borrow and what to avoid.
3. **Design alignment.** Reuse `.supervibe/artifacts/prototypes/_design-system/` if present. If missing, ask whether to run `/supervibe-design` first or create a presentation-only direction.
4. **Storyboard.** Write slide-by-slide intent: title, message, evidence, visual, speaker note, and transition.
5. **Deck spec.** Fill `deck.json` using `templates/presentation/deck-spec.json`.
6. **HTML preview.** Build `preview/index.html` so the user can inspect slides in a browser with the feedback overlay.
7. **Preview server.** Start `node scripts/preview-server.mjs --root .supervibe/artifacts/presentations/<slug>/preview --label "<slug> deck" --daemon`.
8. **Feedback prompt.** After sharing the URL, ask:

```markdown
**Presentation preview ready:** http://localhost:NNNN
**State:** draft

What do we do next?

- ✅ **Approve** - lock deck content and visuals, then export `.pptx`
- ✎ **Revise** - tell me what to change; I will update the preview and mark feedback items
- 🔀 **Alternative** - create another visual/story direction with explicit tradeoffs
- 📊 **Deep review** - run copy, polish, and accessibility reviewers
- 🛑 **Stop** - keep as draft
```

The browser feedback overlay is supplemental. Browser feedback comments are revision inputs, not approval signals. Wait for explicit choice. PPTX export stays blocked until `.approval.json` is written after the user approves.

9. **Revision loop.** Apply feedback in small rounds. For browser feedback, write a resolution note under `feedback-resolutions/<id>.md` and mark the item resolved.
10. **Approval marker.** On explicit approval, write `.supervibe/artifacts/presentations/<slug>/.approval.json` with status, approvedAt, approvedBy, slide count, feedback rounds, and preview URL.
11. **PPTX export.** Run `node scripts/build-presentation.mjs --input .supervibe/artifacts/presentations/<slug>/deck.json --output .supervibe/artifacts/presentations/<slug>/export/<slug>.pptx`.
12. **Google Drive handoff.** Fill `google-drive-handoff.md` from the template. If an authenticated Drive integration exists in the host project, use it; otherwise prepare a drive-ready manifest with file path, title, owner, folder target, and upload steps.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

## Output contract

```markdown
=== Presentation Deck ===
Slug:           <slug>
Location:       .supervibe/artifacts/presentations/<slug>/
Slides:         <count>
Preview URL:    http://localhost:NNNN
Approval:       draft | approved
Export:         .supervibe/artifacts/presentations/<slug>/export/<slug>.pptx | pending
Drive handoff:  .supervibe/artifacts/presentations/<slug>/google-drive-handoff.md | pending

Confidence: <N>.<dd>/10
Override:   <true|false>
Rubric:     prototype
```

## Anti-patterns

- `asking-multiple-questions-at-once` - bundling audience, goal, style, assets, and deadline into one message.
- `advancing-without-feedback-prompt` - exporting `.pptx` without giving the user the approve/revise/alternative/deep-review/stop choice.
- `random-regen-instead-of-tradeoff-alternatives` - creating a new deck direction without naming what changes and what it gives up.
- `pptx-before-approval` - producing the final deck before the preview is accepted.
- `parallel-design-system` - inventing a separate deck visual system when an approved project design system exists.
- `promising-video-without-capability-check` - committing to video export without checking available local tools.
- `reference-copying` - copying a deck's layout or brand wholesale instead of extracting patterns.

## Guard rails

- Do not mutate files, provider state, network resources, or external tools unless this skill's procedure and the user approval path allow it.
- Do not skip prerequisites, confidence gates, policy gates, or explicit approval gates.
- Do not claim completion without concrete verification evidence.
- Preserve user-owned content and unrelated worktree changes.

## Related

- `supervibe:_design:presentation-director` - story, audience, visual references, and design direction.
- `supervibe:_design:presentation-deck-builder` - deck spec, preview, feedback revisions, PPTX export, and Drive handoff.
- `supervibe:_design:creative-director` - brand and visual direction.
- `supervibe:_design:copywriter` - headline, narrative, and speaker-note copy.
- `supervibe:_design:ui-polish-reviewer` - visual QA for final slides.
- `supervibe:_design:accessibility-reviewer` - contrast, readable type, and reduced-motion checks.

## Verification

- `deck.json` validates against the supported structure.
- HTML preview loads through `supervibe-preview` and accepts browser feedback.
- Every open feedback item is pending, in progress, resolved, or rejected.
- Approval marker exists before `.pptx` export.
- Exported `.pptx` exists and begins with ZIP magic bytes `PK`.
- Google Drive handoff file points at the exported `.pptx` and names the target owner/folder.
