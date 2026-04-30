---
name: browser-feedback
namespace: evolve
description: "Use WHEN browser-feedback system-reminder appears with click-region context AND active prototype or presentation is open in preview server TO triage the comment, route to designer/deck/layout agent, and respond. Closes the user→browser→agent loop in real time. RU: используется КОГДА появляется system-reminder с browser-feedback и в preview server открыт прототип или презентация — классифицирует комментарий, перенаправляет к нужному дизайнеру, deck-builder или верстальщику и отвечает. Закрывает петлю user→browser→agent в реальном времени. Trigger phrases: 'browser-feedback received', 'кликнул на компонент', 'из браузера пришло', 'feedback overlay'."
allowed-tools: [Read, Edit, Bash, Grep]
phase: feedback
prerequisites: []
emits-artifact: feedback-resolution
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-28T00:00:00.000Z
---

# Browser Feedback

## Design Intelligence Preflight

When feedback affects design quality, run project memory, code search, and internal `supervibe:design-intelligence` lookup before proposing fixes. Findings should cite token, UX, accessibility, chart, or stack evidence when lookup influenced the recommendation.

## When to invoke
Trigger source: `<system-reminder>` containing `[evolve] browser-feedback received:`. The reminder includes prototypeSlug, viewport, selector, comment, type, suggested-agent, entry-id.

If user invokes manually with no pending feedback, run `cat .claude/memory/feedback-queue.jsonl | tail -10` to surface recent entries.

Feedback entries have lifecycle state in `.claude/memory/feedback-status.json`. The UserPromptSubmit hook resurfaces unresolved entries until they are marked `resolved` or `rejected`.

## Step 0 — Read source of truth
- Read full feedback entry: `jq -c "select(.id==\"<id>\")" .claude/memory/feedback-queue.jsonl`
- Read artifact config: `prototypes/<slug>/config.json` or `presentations/<slug>/deck.json`
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
| presentation slide/story/export | `presentation-deck-builder` | `presentations/<slug>/deck.json` + preview |

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
   d. Write `prototypes/<slug>/feedback-resolutions/<id>.md` or `presentations/<slug>/feedback-resolutions/<id>.md` with: original comment, classification, change made, file:line refs, before/after summary.
6. Mark the entry `in_progress` when work starts:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/feedback-status.mjs" --progress <id>
   ```
7. Print feedback prompt to user:
   ```
   ✅ Принять изменения — закрыть feedback entry
   ✎ Доработать — что ещё поменять
   🔀 Альтернатива — другой подход
   🛑 Откатить — вернуть как было
   ```
8. If the user accepts the fix, mark it resolved:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/feedback-status.mjs" --resolve <id> --resolution prototypes/<slug>/feedback-resolutions/<id>.md
   ```
   If the user rejects or parks it, use `--reject <id>` and include the reason in the resolution record.

## Output contract
- `prototypes/<slug>/feedback-resolutions/<id>.md` or `presentations/<slug>/feedback-resolutions/<id>.md` — resolution record
- `.claude/memory/feedback-status.json` updated to `resolved`, `rejected`, or `in_progress`
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
- `asking-multiple-questions-at-once` — bundling >1 question into one user message. ALWAYS one question with `Шаг N/M:` progress label.
- `advancing-without-feedback-prompt` — concluding without printing the resolution feedback block.

## Verification
- Check the matching `feedback-resolutions/<id>.md` exists under `prototypes/<slug>/` or `presentations/<slug>/`.
- Run `node "$CLAUDE_PLUGIN_ROOT/scripts/feedback-status.mjs" --list` and confirm accepted entries no longer appear as open.
- Reload browser preview; confirm visual change matches comment intent.
- `git diff` shows minimal change scope (no scope-creep).

## Related
- `scripts/preview-server.mjs` — emits feedback over WebSocket into `.claude/memory/feedback-queue.jsonl`
- `scripts/hooks/user-prompt-submit-feedback.mjs` — UserPromptSubmit hook surfaces new entries as `additionalContext` on every prompt
- `scripts/lib/feedback-cursor.mjs` — tracks last-seen offset
- `agents/_design/creative-director.md`, `agents/_design/prototype-builder.md`, `agents/_design/presentation-deck-builder.md`
