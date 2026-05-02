---
description: "Create and iterate presentation decks with Supervibe designers: brief -> storyboard -> HTML slide preview -> feedback -> approved PPTX -> Google Drive handoff."
---

# /supervibe-presentation

Brief: User-facing command for presentation work. It routes the request to presentation agents, keeps the same review loop as design prototypes, and only exports `.pptx` after the deck is approved.

## Continuation Contract

Do not stop after storyboard or first slide. A `/supervibe-presentation <brief>` invocation should continue through the deck pipeline from objective, storyboard, deck JSON, HTML preview, review, and feedback prompt unless the user explicitly stops/pauses, a required brief field blocks the next artifact, or export/upload requires explicit approval.

Intermediate story and slide decisions can be recorded as delegated decisions when the brief and recommended/default path are clear. The explicit approval gate is for final deck approval before PPTX export, not for every slide or section.

## Usage

| Form | Behavior |
| --- | --- |
| `/supervibe-presentation <brief>` | Create or continue a deck from a natural-language brief. |
| `/supervibe-presentation --revise <slug>` | Load feedback for `presentations/<slug>/` and revise the approved draft. |
| `/supervibe-presentation --export <slug>` | Export `presentations/<slug>/deck.json` to `presentations/<slug>/export/<slug>.pptx`. |
| `/supervibe-presentation --drive <slug>` | Prepare a Google Drive handoff manifest after PPTX export. |

## What I do when invoked

1. Parse the user's request into a single deck objective: sales, investor, product demo, internal update, training, proposal, report, or custom.
2. Ask one clarification at a time if the brief is missing audience, outcome, deadline, source materials, or export requirement.
3. Dispatch:
   - `supervibe:_design:presentation-director` for story arc, slide architecture, visual reference scan, and design-system alignment.
   - `supervibe:_design:presentation-deck-builder` for HTML slide preview, feedback revisions, PPTX export, and Google Drive handoff.
   - Existing `creative-director`, `ux-ui-designer`, `copywriter`, `ui-polish-reviewer`, and `accessibility-reviewer` when the deck needs brand, screen, copy, visual QA, or accessibility depth.
4. Create or reuse `presentations/<slug>/`:
   - `brief.md`
   - `storyboard.md`
   - `deck.json`
   - `preview/index.html`
   - `assets/`
   - `_reviews/`
   - `feedback-resolutions/`
   - `export/`
   - `google-drive-handoff.md`
5. Start preview with `node scripts/preview-server.mjs --root presentations/<slug>/preview --label "<slug> deck"`.
6. Prompt the user for explicit feedback choice after the preview and reviews exist: approve, revise, alternative, deeper review, or stop.
7. On approval, run `node scripts/build-presentation.mjs --input presentations/<slug>/deck.json --output presentations/<slug>/export/<slug>.pptx`.
8. If Google Drive is requested, fill `templates/presentation/google-drive-handoff.md.tpl` with target folder, file name, owner, exported PPTX path, and upload instructions.

## Clarifying question format

Ask only one question per message:

```markdown
**Step 1/5: deck outcome.**
What must this presentation make the audience do?

- Approve budget - strongest for investor or internal decision decks
- Understand product - strongest for demo or onboarding decks
- Buy / book a call - strongest for sales and proposal decks

Free-form answer also accepted.
```

## Exit states

- `draft` - preview exists, feedback still open.
- `approved` - user accepted the deck content and visuals.
- `exported` - `.pptx` exists and passed smoke check.
- `drive-ready` - Google Drive handoff manifest exists.

Do not skip from `draft` to `exported`. PPTX export must happen after explicit approval.
