---
name: browser-feedback
namespace: evolve
description: "Use WHEN browser-feedback system-reminder appears with click-region context AND active prototype is open in preview server TO triage the comment, route to designer or layout agent, and respond. Closes the user→browser→agent loop in real time. RU: используется КОГДА появляется system-reminder с browser-feedback и в preview server открыт прототип — классифицирует комментарий, перенаправляет к нужному дизайнеру или верстальщику и отвечает. Закрывает петлю user→browser→agent в реальном времени. Trigger phrases: 'browser-feedback received', 'кликнул на компонент', 'из браузера пришло', 'feedback overlay'."
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

## When to invoke
Trigger source: `<system-reminder>` containing `[evolve] browser-feedback received:`. The reminder includes prototypeSlug, viewport, selector, comment, type, suggested-agent, entry-id.

If user invokes manually with no pending feedback, run `cat .claude/memory/feedback-queue.jsonl | tail -10` to surface recent entries.

## Step 0 — Read source of truth
- Read full feedback entry: `jq -c "select(.id==\"<id>\")" .claude/memory/feedback-queue.jsonl`
- Read prototype config: `prototypes/<slug>/config.json`
- Read prototype HTML at the indicated viewport
- Read DS manifest if comment mentions colour/typography/spacing

## Decision tree

| Comment type | Suggested agent | Acts on |
|---|---|---|
| visual (colour/contrast/typography) | `creative-director` | tokens or per-prototype overrides |
| motion (timing/easing) | `creative-director` | motion.css or per-prototype overrides |
| layout (spacing/order/alignment) | `prototype-builder` | HTML/CSS structure |
| copy (text/voice) | `copywriter` (if in stack) or prototype-builder | content/copy.md |
| a11y (focus/contrast/aria) | `prototype-builder` + `accessibility-reviewer` | HTML attributes + CSS |

## Procedure

1. Read entry — confirm prototypeSlug + region.selector still exists at that path.
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
   d. Write `prototypes/<slug>/feedback-resolutions/<id>.md` with: original comment, classification, change made, file:line refs, before/after summary.
6. Print feedback prompt to user:
   ```
   ✅ Принять изменения — закрыть feedback entry
   ✎ Доработать — что ещё поменять
   🔀 Альтернатива — другой подход
   🛑 Откатить — вернуть как было
   ```

## Output contract
- `prototypes/<slug>/feedback-resolutions/<id>.md` — resolution record
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
- Check `prototypes/<slug>/feedback-resolutions/<id>.md` exists.
- Reload browser preview; confirm visual change matches comment intent.
- `git diff` shows minimal change scope (no scope-creep).

## Related
- `scripts/preview-server.mjs` — emits feedback over WebSocket into `.claude/memory/feedback-queue.jsonl`
- `scripts/hooks/user-prompt-submit-feedback.mjs` — UserPromptSubmit hook surfaces new entries as `additionalContext` on every prompt
- `scripts/lib/feedback-cursor.mjs` — tracks last-seen offset
- `agents/_design/creative-director.md`, `agents/_design/prototype-builder.md`
