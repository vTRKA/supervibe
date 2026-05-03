---
description: "Create and iterate presentation decks with Supervibe designers: brief -> storyboard -> HTML slide preview -> feedback -> approved PPTX -> Google Drive handoff."
---

# /supervibe-presentation

Brief: User-facing command for presentation work. It routes the request to presentation agents, keeps the same review loop as design prototypes, and only exports `.pptx` after the deck is approved.

## Continuation Contract

Do not stop after storyboard or first slide. A `/supervibe-presentation <brief>` invocation should continue through the deck pipeline from objective, storyboard, deck JSON, HTML preview, review, and feedback prompt unless the user explicitly stops/pauses, a required brief field blocks the next artifact, or export/upload requires explicit approval.

Intermediate story and slide decisions can be recorded as delegated decisions when the brief and recommended/default path are clear. Delegated decisions cannot satisfy the final deck approval gate. Browser feedback comments are revision inputs, not approval signals. The explicit approval gate is for final deck approval before PPTX export, not for every slide or section. Wait for explicit choice before export or Google Drive handoff.

## Usage

| Form | Behavior |
| --- | --- |
| `/supervibe-presentation <brief>` | Create or continue a deck from a natural-language brief. |
| `/supervibe-presentation --revise <slug>` | Load feedback for `.supervibe/artifacts/presentations/<slug>/` and revise the approved draft. |
| `/supervibe-presentation --export <slug>` | Export `.supervibe/artifacts/presentations/<slug>/deck.json` to `.supervibe/artifacts/presentations/<slug>/export/<slug>.pptx`. |
| `/supervibe-presentation --drive <slug>` | Prepare a Google Drive handoff manifest after PPTX export. |

## What I do when invoked

Before story or visuals, run the local design expert reference path from
`docs/references/design-expert-knowledge.md`: preference/audience fit, local
design intelligence lookup, current reference scan when available, storyboard
flow, visual system, responsive preview, quality review, and explicit
feedback/approval. External references are supplemental and never replace local
design-system, memory, code, or design-intelligence evidence.

1. Parse the user's request into a single deck objective: sales, investor, product demo, internal update, training, proposal, report, or custom.
2. Ask one clarification at a time if the brief is missing audience, outcome, deadline, source materials, or export requirement.
3. Dispatch:
   - `supervibe:_design:presentation-director` for story arc, slide architecture, visual reference scan, and design-system alignment.
   - `supervibe:_design:presentation-deck-builder` for HTML slide preview, feedback revisions, PPTX export, and Google Drive handoff.
   - Existing `creative-director`, `ux-ui-designer`, `copywriter`, `ui-polish-reviewer`, and `accessibility-reviewer` when the deck needs brand, screen, copy, visual QA, or accessibility depth.
4. Create or reuse `.supervibe/artifacts/presentations/<slug>/`:
   - `brief.md`
   - `storyboard.md`
   - `deck.json`
   - `preview/index.html`
   - `assets/`
   - `_reviews/`
   - `feedback-resolutions/`
   - `export/`
   - `google-drive-handoff.md`
5. Start preview with `node scripts/preview-server.mjs --root .supervibe/artifacts/presentations/<slug>/preview --label "<slug> deck" --daemon`.
6. Prompt the user for explicit feedback choice after the preview and reviews exist: approve, revise, alternative, deeper review, or stop.
7. On approval, run `node scripts/build-presentation.mjs --input .supervibe/artifacts/presentations/<slug>/deck.json --output .supervibe/artifacts/presentations/<slug>/export/<slug>.pptx`.
8. If Google Drive is requested, fill `templates/presentation/google-drive-handoff.md.tpl` with target folder, file name, owner, exported PPTX path, and upload instructions.

## Clarifying question format

Ask only one question per message:

```markdown
**Step N/M: deck outcome.**
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

## Output Contract

```text
SUPERVIBE_PRESENTATION
STATUS: draft | approved | exported | drive-ready | blocked
ARTIFACT_DIR: .supervibe/artifacts/presentations/<slug>/
PREVIEW_URL: <local URL or none>
NEXT_ACTION: <feedback | approve | revise | export | drive handoff | blocked reason>
CONFIDENCE: <N>/10
```

## Safety Boundaries

- Writes stay under `.supervibe/artifacts/presentations/<slug>/`.
- PPTX export requires explicit approval of the deck content and visuals.
- Google Drive handoff is a manifest unless a connected Drive action is
  explicitly approved in the current environment.
- Source material with secrets or private customer data must be redacted before
  deck artifacts are created.

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-presentation` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, required agents, and durable-write permission before any agent-owned artifact is produced.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
