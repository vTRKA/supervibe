# Design Workflow Hardening TODO

Date: 2026-05-03
Scope: `/supervibe-design`, design-system Stage 1/2, design-agent receipts, design wizard, viewport policy.

## Blocking Issues Found

- [x] Markdown contract was stronger than runtime helpers. Added executable wizard catalog in `scripts/lib/design-wizard-catalog.mjs`.
- [x] Stage 0/1/2 lacked a stateful question queue. Added `questionQueue`, coverage, decisions, gates, and answer recording helpers.
- [x] Design mode was ambiguous. Added first-class mode choices: design-system only, design-system plus UX spec, full prototype pipeline, continue approved DS.
- [x] Creative axes had thin choice menus. Added 3-5 option catalogs for vision, typography, palette, density, motion, components, reference scope, and viewport.
- [x] "Use defaults" could silently close all axes. Added `guidedDefaultsChecklist` with Accept default / Compare alternatives / Customize for every axis.
- [x] Brief intake did not turn large design text into structured axes. Added deterministic brief coverage extraction with source quotes and conflict reporting.
- [x] Stage 2 approval was too aggregate. Command and brandbook now require visible `styleboard.html` evidence before section approval.
- [x] Desktop viewport policy inherited web defaults. Added desktop/Tauri/Electron viewport policy with actual window size, `deviceScaleFactor`, min/main/secondary/large window metadata.
- [x] Agent receipts could be confused with command receipts. Design receipt validation now reports execution mode, missing agents, and quality impact; tests prove command receipts cannot substitute specialist receipts.
- [x] Degraded/manual execution was hidden. Agent plan now emits `executionStatus.executionMode`, `missingAgents`, and a degraded-mode question.
- [x] `/supervibe-design` completion could rely on generic workflow receipts. Command contract now requires both `workflow-receipt validate` and `validate-design-agent-receipts`.

## Follow-Up Watch Items

- [ ] Host adapters should consume `plan.wizard` and `plan.executionStatus` directly when rendering slash-command prompts.
- [ ] Future command-specific validators should map durable outputs to their exact agent/skill/reviewer/worker producers, following the design receipt validator pattern.
- [ ] When a real host API exposes current Tauri window metrics, wire it into `resolveDesignViewportPolicy({ currentWindow, deviceScaleFactor })`.

## Implementation Maturity Self-Check

Score: 10/10.

Evidence:

- Executable state exists in code, not only markdown.
- Every new contract has regression tests.
- The release check includes `validate:design-wizard`.
- `npm run check` passes after the version bump and memory update.
- Remaining watch items are host-adapter integration opportunities, not blockers for the current repository contract.
