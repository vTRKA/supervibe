---
name: browser-feedback
namespace: supervibe
description: >-
  Use WHEN browser-feedback system-reminder appears with click-region context
  AND active prototype, mockup, or presentation is open in preview server TO
  triage the comment, route to designer/deck/layout agent, and respond. Closes
  the user-to-browser-to-agent loop in real time. Triggers: 'browser-feedback
  received', 'кликнул на компонент', 'из браузера пришло', 'feedback overlay'.
allowed-tools:
  - Read
  - Edit
  - Bash
  - Grep
phase: feedback
prerequisites: []
emits-artifact: feedback-resolution
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-28T00:00:00.000Z
---

# Browser Feedback

## Design Intelligence Preflight

When feedback affects design quality, run project memory, code search, and internal `supervibe:design-intelligence` lookup before proposing fixes. Findings should cite token, UX, accessibility, chart, or stack evidence when lookup influenced the recommendation.

## When to invoke
Trigger source: `<system-reminder>` containing `[supervibe] browser-feedback received:`. The reminder includes prototypeSlug, viewport, selector, comment, type, suggested-agent, entry-id. Slugs can be plain prototype slugs, `mockup:<slug>`, or `presentation:<slug>`.

Design previews must expose the visible `Feedback` button from the preview overlay. If the user says there was no button, treat that as a preview setup bug: restart `supervibe:preview-server --root .supervibe/artifacts/prototypes/<slug>/ --daemon` without `--no-feedback`, verify `#supervibe-fb-toggle` appears in served HTML, and only then continue design review.

If user invokes manually with no pending feedback, run `node "<resolved-supervibe-plugin-root>/scripts/feedback-status.mjs" --list` first, then inspect `.supervibe/memory/feedback-queue.jsonl` if needed. This keeps the loop usable in IDEs that do not surface hook reminders automatically.

Feedback entries have lifecycle state in `.supervibe/memory/feedback-status.json`. The UserPromptSubmit hook resurfaces unresolved entries until they are marked `resolved` or `rejected`.

Browser feedback entries are not lifecycle approval. A resolved browser feedback entry does not approve the artifact, export a deck, or create a handoff; the surrounding delivery flow must still ask its explicit approve/revise/alternative/stop question.

## Step 0 — Read source of truth
- Read full feedback entry: `jq -c "select(.id==\"<id>\")" .supervibe/memory/feedback-queue.jsonl`
- Read artifact config: `.supervibe/artifacts/prototypes/<slug>/config.json`, `.supervibe/artifacts/mockups/<slug>/config.json`, or `.supervibe/artifacts/presentations/<slug>/deck.json`
- Read prototype/deck preview HTML at the indicated viewport
- Read DS manifest if comment mentions colour/typography/spacing

## Decision tree

| Comment type | Suggested agent | Acts on |
|---|---|---|
| visual (colour/contrast/typography) | `creative-director` | tokens or per-prototype overrides |
| motion (timing/easing) | `creative-director` | motion.css or per-prototype overrides |
| layout (spacing/order/alignment) | `prototype-builder` | HTML/CSS structure |
| copy (text/voice) | `copywriter` (if in stack) or prototype-builder | content/copy.md |
| a11y (focus/contrast/aria) | `prototype-builder` + `accessibility-reviewer` | HTML attributes + CSS |
| mockup visual/layout | `prototype-builder` or `creative-director` | `.supervibe/artifacts/mockups/<slug>/` |
| presentation slide/story/export | `presentation-deck-builder` | `.supervibe/artifacts/presentations/<slug>/deck.json` + preview |

## Procedure

1. Read entry — confirm prototypeSlug/artifact slug + region.selector still exists at that path.
2. Classify — pick agent per decision tree.
3. If `type=visual` or `motion`:
   - Dispatch `creative-director` with the entry attached.
   - Director decides: token change (DS-wide) OR per-prototype override.
4. If `type=layout`, `a11y`, `copy`:
   - Dispatch `prototype-builder` with the entry.
5. The dispatched agent must:
   a. Reproduce the issue at the named viewport.
   b. Apply minimal change.
   c. Trigger preview hot-reload (no manual restart needed).
   d. Write `.supervibe/artifacts/prototypes/<slug>/feedback-resolutions/<id>.md`, `.supervibe/artifacts/mockups/<slug>/feedback-resolutions/<id>.md`, or `.supervibe/artifacts/presentations/<slug>/feedback-resolutions/<id>.md` with: original comment, classification, change made, file:line refs, before/after summary.
6. Mark the entry `in_progress` when work starts:
   ```bash
   node "<resolved-supervibe-plugin-root>/scripts/feedback-status.mjs" --progress <id>
   ```
7. Print feedback prompt to user:
   ```
   Accept changes - close feedback entry
   Revise - what else should change
   Alternative - another approach
   Revert - restore the previous state
   ```
8. If the user accepts the fix, mark it resolved:
   ```bash
   node "<resolved-supervibe-plugin-root>/scripts/feedback-status.mjs" --resolve <id> --resolution .supervibe/artifacts/prototypes/<slug>/feedback-resolutions/<id>.md
   ```
   If the user rejects or parks it, use `--reject <id>` and include the reason in the resolution record.

## Output contract
- `.supervibe/artifacts/prototypes/<slug>/feedback-resolutions/<id>.md`, `.supervibe/artifacts/mockups/<slug>/feedback-resolutions/<id>.md`, or `.supervibe/artifacts/presentations/<slug>/feedback-resolutions/<id>.md` — resolution record
- `.supervibe/memory/feedback-status.json` updated to `resolved`, `rejected`, or `in_progress`
- Modified prototype files OR design-system overrides
- Confidence footer:

```
Confidence: <N>.<dd>/10
Override: <true|false>
Rubric: agent-delivery
```

## Anti-patterns
- `silent-resolution` — applying change without writing resolution record.
- `wrong-scope-fix` — changing tokens for a per-prototype need (cascading visual change to other prototypes).
- `asking-multiple-questions-at-once` — bundling >1 question into one user message. ALWAYS one question with `Step N/M:` progress label.
- `advancing-without-feedback-prompt` — concluding without printing the resolution feedback block.

## Verification
- Check the matching `feedback-resolutions/<id>.md` exists under `.supervibe/artifacts/prototypes/<slug>/`, `.supervibe/artifacts/mockups/<slug>/`, or `.supervibe/artifacts/presentations/<slug>/`.
- Run `node "<resolved-supervibe-plugin-root>/scripts/feedback-status.mjs" --list` and confirm accepted entries no longer appear as open.
- Reload browser preview; confirm visual change matches comment intent.
- `git diff` shows minimal change scope (no scope-creep).

## Guard rails

- Do not mutate files, provider state, network resources, or external tools unless this skill's procedure and the user approval path allow it.
- Do not skip prerequisites, confidence gates, policy gates, or explicit approval gates.
- Do not claim completion without concrete verification evidence.
- Preserve user-owned content and unrelated worktree changes.

## Related
- `scripts/preview-server.mjs` — emits feedback over WebSocket into `.supervibe/memory/feedback-queue.jsonl`
- `scripts/hooks/user-prompt-submit-feedback.mjs` — UserPromptSubmit hook surfaces new entries as `additionalContext` on every prompt
- `scripts/lib/feedback-cursor.mjs` — tracks last-seen offset
- `agents/_design/creative-director.md`, `agents/_design/prototype-builder.md`, `agents/_design/presentation-deck-builder.md`
