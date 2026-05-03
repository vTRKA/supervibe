---
description: >-
  End-to-end design pipeline with memory/code/design-intelligence preflight:
  design-system → spec → native HTML/CSS/JS prototype → live preview → review
  → feedback loop → approval → ready-for-development handoff. Pure native,
  two viewports default (375 + 1440), one question at a time.
---

# /supervibe-design

Single entry-point for the adaptive design pipeline. Orchestrates 6 design agents and 5 design skills through up to 8 explicit stages, ending with an **approved, ready-for-development** prototype that any stack-developer agent can pick up.

## Shared Dialogue Contract

Lifecycle: `draft -> review -> approved -> handoff`. Persist state in `.supervibe/artifacts/prototypes/<slug>/config.json`, `.supervibe/artifacts/prototypes/_design-system/design-flow-state.json`, explicit design-system section approvals, and `.supervibe/artifacts/prototypes/<slug>/.approval.json`.

Every interactive step asks one question at a time using `Step N/M` or `Step N/M`. Each question must include explicit answer choices: the recommended/default option first, one-line tradeoff summary for every option, a free-form answer path, and the stop condition. A bare line such as `Step 3/6: main screen or shell?` is invalid until it lists concrete choices.

## Design Wizard Contract

`/supervibe-design` uses the executable wizard catalog in `scripts/lib/design-wizard-catalog.mjs`, not only this markdown file, for Stage 0-2 interaction. Run `node scripts/design-agent-plan.mjs --brief "<brief>" --status --plan-writes --slug <slug>` or `node scripts/design-agent-plan.mjs --brief "<brief>" --json --plan-writes` to build `plan.wizard`, `plan.executionStatus`, `plan.viewportPolicy`, `plan.stages`, wizard progress, resume token, and the prewrite manifest.

CLI output must show the stage ladder explicitly: `intake -> candidate DS -> review styleboard -> approval -> prototype unlock`. The wizard runtime owns the transition `questionQueue -> decision -> coverage -> gates`; agents should call `recordDesignWizardAnswer` or `transitionDesignWizardState` instead of manually patching `config.json` fields such as axes, coverage, timestamps, or blocked reasons.

The first wizard step is a **mode question** with these choices: design system only, design system plus UX spec, full pipeline to prototype preview, or continue an existing approved design system. Save the answer to `config.json.mode`, `config.json.stageTriage`, and `config.json.executionMode`. Execution mode is a separate explicit choice: `inline`, `real-agents`, or `hybrid`. If the mode is ambiguous after design-system approval, ask the **Continuation question after approved design system**: continue to UX spec, build prototype, export tokens, or stop on approved DS.

The wizard state is persisted in `config.json.designWizard` and must include:

- `questionQueue` - ordered one-question-at-a-time prompts for missing or conflicting decisions.
- `decisions` - axis, answer/default, source, confidence, quote/evidence, decisionUnlocked, and timestamp.
- `guidedDefaultsChecklist` - shown when the user says to use defaults; every axis offers `Accept default / Compare alternatives / Customize`.
- `coverage` - required axes, covered axes, missing axes, conflicts, and score.
- `gates` - `tokensUnlocked` stays false until mandatory questions are closed or explicitly delegated/defaulted by the user.
- `writeGate` - executable hard-stop for artifact writes. If `intake.needsQuestion=true`, `executionMode="agent-required-blocked"`, or `wizard.gates.tokensUnlocked=false`, ask exactly one blocking question and write only run-state or diagnostic scratch. Durable design artifacts, review styleboards, prototypes, tokens, and section markers are forbidden until the gate is ready.

### Stage Question Catalog

Use the catalog choices from `DESIGN_WIZARD_AXES`; do not invent a thin recommended/alternative/stop menu for creative axes.

- Vision: 3-5 mood directions with risk and tradeoff.
- Typography: system-native, geometric, humanist, code-first.
- Palette: graphite+amber, graphite+cyan, light-first, high-contrast.
- Density: compact, balanced, comfortable.
- Radius/elevation: flat, tactile, layered when detailed in the design-system section.
- Motion: strict, subtle, expressive.
- Components: Radix/headless, custom, shadcn-style adapter, platform-native.
- Viewport: current 1:1, 1280x800, 1440x900, 1920x1080, or custom.
- Creative alternatives: require 2-3 compared directions before tokens unless the user supplied an already-approved direction.
- Anti-generic guardrail: document what avoids generic admin, safe blue/gray SaaS cards, old sidebar skeletons, and repainted old shells.

If the brief already covers an axis, the wizard stores `source=user` with a short quote. If the user explicitly says "use defaults", the wizard stores `source=explicit-default` and shows the editable `guidedDefaultsChecklist`; defaults are not a silent collapse of the design interview. `source=inferred` remains forbidden for the Preference Coverage Matrix.

Before approving Stage 2, build a visible `styleboard.html` under `.supervibe/artifacts/prototypes/_design-system/` or `.scratch/<run-id>/` containing palette swatches, typography samples, controls, table, dialog, shell, motion notes, density sample, and component feel. A full review styleboard is allowed only after mode, target, viewport policy, reference scope, creative alternatives, anti-generic guardrail, visual direction, density, palette mood, typography personality, component feel, and motion intensity are recorded. Before that point, only diagnostic scratch is allowed and it must not present itself as a visual direction. Section approval is valid only after the user sees this review packet/styleboard. Bulk approval is an escape hatch after all section summaries and the styleboard have been shown, not the default UX.

For desktop/Tauri/Electron targets, do not inherit web-only `375 + 1440` as the complete viewport model. Ask for actual window size, target monitor, OS scale, `deviceScaleFactor`, min-resize, `mainWindow`, `secondaryWindow`, and `largeWindow`; if unavailable, record `exactWindow=false` and use `1920x1080`, `1440x900`, `1280x800`, plus `800x600` as the desktop baseline.

Execution visibility is mandatory. `config.json.executionMode` must be one of `inline`, `real-agents`, or `hybrid`; `agent-required-blocked` is a hard-stop status when requested real/hybrid agents are unavailable. `config.json.missingAgents` lists unavailable specialists; `config.json.qualityImpact` explains what quality is blocked. If a required specialist is missing, ask one blocked-mode question before any approval: install missing agents with `scripts/provision-agents.mjs`, connect host-native agents, choose `hybrid` with real receipts for agent-owned outputs, save an `inline` draft without agent claims, or stop here. Manual emulation is not an allowed design workflow path and is never a completed agent stage.

Hard-stop rule: if `intake.needsQuestion=true`, `plan.executionStatus.executionMode!="real-agents"`, `plan.wizard.gates.viewportPolicyRecorded=false`, or `plan.wizard.gates.tokensUnlocked=false`, do not write `.supervibe/artifacts/brandbook/direction.md`, `_design-system/tokens.css`, `_design-system/manifest.json`, `_design-system/design-flow-state.json`, `_design-system/styleboard.html`, `.approvals/*.json`, prototype files, or agent receipts for those outputs. Persist only run-state or diagnostic scratch, then ask the single `plan.writeGate.nextQuestion`.

Approval promotion must be automated. After explicit approval, run `node scripts/promote-design-approval.mjs --slug <slug> --approved-by "<user>" --feedback-hash "<hash>"` so `manifest.json`, `design-flow-state.json`, `.approvals/*.json`, `config.json`, `.approval.json`, component docs, status comments, and `designer-package.json` move from candidate/draft to approved together. The designer package points to `direction.md`, `tokens.css`, `styleboard.html`, `spec.md`, screenshots, rejected alternatives, approval state, and known risks.

Visual regression is part of the design gate, not a nice-to-have. For desktop/Tauri/Electron, capture and review screenshots at `1920x1080`, `1440x900`, and `1280x800`, then run DOM overflow, text overlap, contrast audit, focus-visible, reduced-motion, and Tauri webview smoke checks. Web flows include mobile `375x812`, `1440x900`, and `1920x1080`.

Run the unified workflow validator before claiming design workflow completion:

```bash
node scripts/supervibe-workflow-validate.mjs --workflow /supervibe-design --slug <slug>
```

At minimum, run both receipt validators before claiming design workflow completion:

```bash
node scripts/workflow-receipt.mjs validate
node scripts/validate-agent-producer-receipts.mjs
node scripts/validate-design-agent-receipts.mjs
```

`workflow-receipt validate` is not sufficient for `/supervibe-design`: a `/supervibe-design` command receipt cannot substitute for a `creative-director`, `ux-ui-designer`, `copywriter`, `prototype-builder`, `ui-polish-reviewer`, or `accessibility-reviewer` receipt for that agent's durable output. Every agent, worker, or reviewer receipt must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host agent run, plus the typed output artifact `.supervibe/artifacts/_agent-outputs/<invocation-id>/agent-output.json` recorded by `agent-invocation.mjs`.

## Continuation Contract

`/supervibe-design <brief>` is a request to run the full applicable design pipeline, not to stop after the first useful subsection. Continue through all applicable stages until the next mandatory approval gate, prototype feedback gate, or explicit blocker. Continue through all applicable non-blocking stages when the next stage can be completed from the current brief, approved artifacts, and documented safe defaults; stages may be marked `reuse`, `delegated`, `skipped`, or `N/A` only through documented triage. Delegated design decisions can fill safe defaults, but they cannot satisfy creative-direction selection, required design-system section approval, prototype approval, safety/policy gates, production approvals, or destructive-operation consent.

Only pause when the user explicitly chooses stop/pause, the brief has a real ambiguity that blocks the next artifact, the Preference Coverage Matrix Gate is incomplete for a new/rebrand design run, the Design Flow State Machine requires explicit approval, a safety/policy gate requires explicit approval (for example Figma writeback, external upload, production mutation, or reusing an old artifact), or the final prototype/deck approval gate is reached. Do not stop after internal draft generation, storyboard, first screen, first review, or any other non-gated phase if the next stage can be completed with the current brief and safe defaults.

Every run must persist a `stageTriage` map in `.supervibe/artifacts/prototypes/<slug>/config.json`. Mark each stage as `required`, `reuse`, `delegated`, `skipped`, or `N/A` with rationale. Existing approved design systems enter `system-reuse mode` by default for prototype/refinement work, so the command reuses prior preference and visual-system decisions instead of forcing the user through a fresh eight-stage path. Existing candidate systems enter design-system review/resume mode and cannot unlock prototype generation.

## Topic Drift / Resume Contract

If the user shifts topic while a design run has `stageTriage`, prototype config, browser feedback, or a `NEXT_STEP_HANDOFF` pending, do not silently drop the saved phase. Surface the current design stage, artifact path, preview/feedback state when present, next command, and blocker, then ask one `Step N/M` or `Step N/M` resume question with these choices: continue current design stage, skip/delegate safe non-final decisions to the design agents and continue, pause current design and switch topic, or stop/archive the current state.

Skipped or delegated decisions must be recorded in `config.json.stageTriage`, design-flow notes, or `.approval.json` notes. They cannot satisfy required design-system section approval, final visual approval, final token approval, safety/policy gates, Figma writeback, production approvals, or destructive-operation consent.

## Design Readiness Contract

Draft prototypes are not implementation contracts. A draft may provide the product model only: `agent workflow = intent + tool call + evidence/sources + human decision + result`. Treat every visual decision in a draft as temporary taste exploration until the user approves the prototype and the design system writes final tokens.

Developers must wait for **approved prototype + final tokens** in `.supervibe/artifacts/prototypes/<slug>/handoff/`. Until that bundle exists, stack agents may read the product model, user flow, states, and evidence sources, but they must not copy draft colors, spacing, typography, layout taste, or component styling into production code.

**Taste Alignment Gate** runs before screen production. It defines direction, audience, reference set, what to borrow vs avoid, and how this direction differs from older prototypes. A design that merely recolors an old shell is not aligned.

Tokens have a gated lifecycle: `candidate tokens` are allowed for styleboard/review packets only; `design_system.status = approved` with all required sections approved unlocks prototype generation; final handoff token metadata is written only after prototype approval. Do not stamp tokens as approved or final just because Stage 2 generated files.

## Design Flow State Machine

Persist the project-level design gate at `.supervibe/artifacts/prototypes/_design-system/design-flow-state.json`. The command and prototype/landing skills must treat this file as authoritative when present.

Required design-system approval sections:

- `palette`
- `typography`
- `spacing-density`
- `radius-elevation`
- `motion`
- `component-set`
- `copy-language`
- `accessibility-platform`

Allowed transition map:

- `discovery.confirmed -> creative_direction.options` is allowed after product/workflow/current-artifact summary.
- `creative_direction.status = selected -> design_system.candidate` is allowed.
- `creative_direction.status = selected -> prototype.requested = BLOCKED`.
- `design_system.status = candidate -> prototype.requested = BLOCKED`.
- `design_system.status = needs_revision -> prototype.requested = BLOCKED`.
- `design_system.status = approved` plus every required section in `approved_sections` -> `prototype.requested = ALLOWED`.

Approval evidence must include `approved_at`, `approved_by`, `approved_sections`, and `feedback_hash` or equivalent user-message evidence. `.approvals/*.json` files may be `draft`, `candidate`, `needs_revision`, or `approved`; a file named like an approval but carrying `candidate` status is only a proposal/completion marker, not user approval. Preview servers must not start before `prototype.requested = ALLOWED`.

**Critique Gate** runs after the first representative screen: ask whether this feels like a new product direction or a repainted old shell. If the answer is "repaint", revise the direction before expanding to the rest of the flow.

Before dev handoff, collapse alternatives into **one source of truth**: one approved prototype, one final design-system manifest, one final token set, and parked/rejected alternatives with rationale. Competing prototypes cannot all be "ready for development".

### Standard Question Template

Every design question must use this structure, with the labels translated to the user's language when needed:

```markdown
**Step N/M: <single decision question>**

Why: <one sentence explaining user-visible impact>
Decision unlocked: <artifact, scope, target surface, token, component, or lifecycle state this answer changes>
If skipped: <safe default or stop condition>

- <Recommended option> (recommended) - <one-line tradeoff>
- <Alternative option> - <one-line tradeoff>
- Stop here - save current state and make no hidden progress
```

After every material delivery, ask one explicit next-step question about the design artifact. Use `buildPostDeliveryQuestion({ intent: "design_delivery" }, { locale })` when tooling is available. Visible labels must be language-matched and domain-specific; keep internal action ids only in saved state. Never show both English and Russian in the same visible option.

English visible labels:
- Approve design - recommended when the current artifact looks right; move to the next lifecycle state.
- Revise design - user gives one focused visual, UX, content or accessibility change; apply one iteration.
- Compare another direction - produce another design option with explicit tradeoffs.
- Review design deeper - run the relevant review/check agents or validators before changing anything.
- Stop and save design state - persist current state and exit without claiming silent completion.

Non-English visible labels:
- Translate the same action semantics at runtime into the active user language. Keep the shared artifact text in English, do not hard-code non-English menu labels here, and never show bilingual labels in the same visible option.

## Design Intelligence Integration

Design intelligence is an internal evidence source for this existing command, not a new workflow surface. Before style, palette, typography, chart, icon, presentation, collateral, mobile, or stack handoff decisions, design agents must run:

1. project memory preflight for accepted and rejected design decisions
2. code search over tokens, components, prototypes, and brand assets
3. internal `designContextPreflight()` or `searchDesignIntelligence()` lookup over the relevant local domains: `product`, `style`, `color`, `typography`, `ux`, `landing`, `app-interface`, `charts`, `icons`, `google-fonts`, `react-performance`, `ui-reasoning`, `stack`, `slides`, and `collateral`

The output must include `Design Intelligence Evidence` when retrieved rows influenced the decision. Generic lookup can suggest options, but the precedence order is strict: **approved design system > project memory > codebase patterns > accessibility constraints > external references**. The design system line item is valid only when `.supervibe/artifacts/prototypes/_design-system/manifest.json` has `status: approved`. External references are supplemental: use the internet only for current references, market examples, official platform docs, live competitor pages, or fresh visual evidence that local data cannot contain.

## Design Expert Knowledge Gate

Use `docs/references/design-expert-knowledge.md` as the adapted UI/UX coverage checklist. This gate does not replace Supervibe tokens or approval flow; it ensures designers do not miss critical review dimensions.

Run **Design Pass Triage** from the `Eight-Pass Expert Routine` for every substantial design request. This is an adaptive coverage map, not a mandatory eight-question path. Record each pass as `required | reuse | delegated | skipped | N/A` with rationale.

Full eight-pass coverage is required for a new product, rebrand, missing design system, or material direction/audience change. If an approved design system already exists and the request is a prototype, screen, deck, or refinement inside that system, reuse preference intake and visual-system decisions and run only the relevant evidence, reference, IA/user-flow, responsive/platform, quality, and prototype/review/feedback passes. If the system is candidate or needs_revision, resume the design-system approval gate; do not treat it as prototype-ready. Do not force all eight passes for every prototype. If the current brief needs a missing token, component, asset, or interaction, ask one narrow extension approval question instead of reopening the full design system.

Before finalizing direction, spec, prototype, review, or handoff, confirm the relevant domains are either covered or explicitly marked N/A with rationale:

1. Accessibility
2. Touch & Interaction
3. Performance
4. Style Selection
5. Layout & Responsive
6. Typography & Color
7. Animation
8. Forms & Feedback
9. Navigation Patterns
10. Charts & Data

Run a product-fit style matrix before committing to a visual direction: product category, trust/risk level, density, platform, interaction mode, and data intensity must explain the chosen style, palette, type, motion, and component density. For stack handoff, use stack-aware UI guidance so framework/library adapters implement the approved prototype and tokens instead of replacing them with library defaults.

## Hard rules (the user feedback that drives this command)

1. **Native HTML/CSS/JS only** for prototypes. No React, Vue, Svelte, Next.js, Nuxt. Pure web platform. Frameworks come AFTER approval, in the handoff-to-stack step.
2. **Viewport target is platform-specific.** Web defaults to `375px` mobile + `1440px` desktop. Desktop/Tauri/Electron defaults to an actual 1:1 window when available; otherwise use `1280x800` main window plus `800x600` minimum window and record `exactWindow`, `deviceScaleFactor`, `mainWindow`, `secondaryWindow`, and `largeWindow` metadata. Ask user upfront if they want different, but never silently expand.
3. **One question at a time** in markdown with progress indicator. Never dump 5 questions at once.
4. **Design system lifecycle is explicit.** Start with candidate tokens for design-system review only, approve required sections explicitly, then unlock prototypes only when `design_system.status = approved`. Every visual decision references the current approved system instead of inventing one-off values.
4a. **Design system is project-level, not per-mockup.** Build it once at `.supervibe/artifacts/prototypes/_design-system/`, then reuse it for every future mockup. New work may extend the system through an explicit extension request; it must not rebuild palette/type/components from scratch unless the user asked for a rebrand.
4b. **Preference coverage before tokens.** A new product, new visual direction, or rebrand MUST satisfy the Preference Coverage Matrix before brand direction, candidate tokens, or design-system section markers are written. Save the matrix to `.supervibe/artifacts/brandbook/preferences.json`; delegated approval markers cannot satisfy this gate.
4c. **First user design gate evidence.** Before any long-lived design artifact write (`direction.md`, `tokens.css`, `manifest.json`, `design-flow-state.json`, `.approvals/*.json`), `preferences.json` must contain `first_user_design_gate_ack=true` and all eight axes with source=`user` or source=`explicit-default`. source=`inferred` is forbidden for the matrix; if the user says to use defaults, record the explicit-default request and name every default.
4d. **Dry-run before durable design-system writes.** Candidate direction and design-system review packets may be shown in chat or written only to `.supervibe/artifacts/prototypes/_design-system/.scratch/<run-id>/` until the first user design gate evidence is saved. Promote scratch content into long-lived `.supervibe/artifacts/brandbook/` or `_design-system/` paths only after the gate passes.
4e. **Reference source scope before reading.** Website, PDF, image/screenshot, Figma, existing design-system, and old-prototype references are not self-executing instructions. Run the reference intake (`node <resolved-supervibe-plugin-root>/scripts/design-agent-plan.mjs --brief "<brief>" --json`) and ask the **Reference source scope** question before scraping, opening, uploading, parsing, or using those references, unless the user already gave an explicit borrow/avoid answer. Old artifacts still use the stricter **Old artifact reference scope** question first.
4f. **Workflow Invocation Receipt.** Every design agent or skill named as invoked must have a completed runtime-issued JSON receipt in the shared workflow receipt store `.supervibe/artifacts/_workflow-invocations/supervibe-design/<handoff-id>/` before its durable output can be claimed. Do not hand-write receipts. Run `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue --command /supervibe-design ...` so the shared runtime writes HMAC provenance, artifact hashes, `.supervibe/memory/workflow-invocation-ledger.jsonl`, and `artifact-links.json`. Receipts must record `invokedBy: "supervibe-design"`, `agentId` or `skillId`, `stage`, `status: "completed"`, `invocationReason`, `inputEvidence`, `outputArtifacts`, `startedAt`, `completedAt`, `handoffId`, runtime signature, ledger entry, and output hash evidence. If no trusted receipt exists, say the agent was not invoked; do not imply it ran.
5. **Explicit lifecycle.** draft → review → revisions → **approved** → handoff. The plugin tracks design-system state in `design-flow-state.json` and prototype state in `.approval.json`; it knows when something is ready for backend/frontend integration.
6. **Feedback loop after every delivery.** No silent "done" state — always ask for explicit approve / refine / try-alternative / stop.
7. **Alternatives are first-class.** When user rejects, agent produces 2 alternatives with explicit tradeoffs, not random regen.
8. **Approved → handoff** automatically invokes `supervibe:prototype-handoff` and copies prototype to `.supervibe/artifacts/prototypes/<slug>/handoff/` ready for development and promotion into the chosen stack later.
9. **Existing design files are never reused silently.** If any `.supervibe/artifacts/prototypes/`, `.supervibe/artifacts/mockups/`, or `.supervibe/artifacts/presentations/` artifact exists and the brief does not explicitly say "continue/refine existing" or "new/from scratch", stop at Stage 0a and ask one artifact-mode question before reading or editing an old file.
10. **Preview feedback button is mandatory.** Design preview servers must run with feedback overlay enabled. Do not pass `--no-feedback` for `.supervibe/artifacts/prototypes/`, `.supervibe/artifacts/mockups/`, or `.supervibe/artifacts/presentations/`; verify the visible `Feedback` button before presenting the preview URL.
11. **Draft-to-dev boundary is mandatory.** Draft visuals are not production guidance. Stack agents only implement from `approved prototype + final tokens` in the handoff bundle.
12. **Design previews are silent by default.** Use `--daemon` for `.supervibe/artifacts/prototypes/`, `.supervibe/artifacts/mockups/`, and `.supervibe/artifacts/presentations/` preview servers. Use `--foreground` only for an explicit debugging request.

## Invocation forms

### `/supervibe-design <brief>`

```
/supervibe-design landing in the style of Linear, focused on dev-tool buyers
/supervibe-design checkout flow for one-time purchases, mobile-first
/supervibe-design landing page for a fintech product, brutalist style
```

### `/supervibe-design <existing-spec-path>`

```
/supervibe-design .supervibe/artifacts/specs/2026-04-28-checkout-design.md
```

### `/supervibe-design` (no args)

Use most recent brief from the conversation, or ask one clarifying question.

## Adaptive Pipeline (up to 8 stages)

Each stage records progress before the next starts. Skip stages that don't apply (e.g. brand direction unnecessary for an in-product flow inside an existing brand), but do not treat normal stage completion as a reason to stop.

Before Stage 1, write `.supervibe/artifacts/prototypes/<slug>/config.json.stageTriage`:

```json
{
  "stageTriage": {
    "0": { "state": "required", "rationale": "artifact mode, target surface, and reuse decisions are always needed" },
    "1": { "state": "reuse", "rationale": "brand direction exists and brief does not ask for rebrand" },
    "2": { "state": "reuse", "rationale": "approved design system exists; current work is prototype-only" }
  }
}
```

Allowed states are `required`, `reuse`, `delegated`, `skipped`, and `N/A`. A skipped or delegated stage must name the safe default, user instruction, or artifact that justifies it.

### Stage 0 — Artifact mode + Target surface + Triage (always)

**Step 0a/N: Design artifact mode.** Before choosing target surface or opening old design files, run:

```bash
node "<resolved-supervibe-plugin-root>/scripts/lib/design-artifact-intake.mjs" --json --brief "<brief>"
```

If it returns `needsQuestion: true`, ask exactly one question:

```markdown
**Step 0/N: Design artifact mode.**
I found existing design artifacts, but the brief does not say whether to reuse them or start fresh.

What should I do?

- Continue an existing artifact - pick the path or say "latest".
- Create a new design from scratch - new slug, no edits to old artifacts.
- Create an alternative next to the old one - keep the old artifact parked for comparison.
```

Do not read, edit, copy, or treat any prior `.supervibe/artifacts/prototypes/<slug>/`, `.supervibe/artifacts/mockups/<slug>/`, or `.supervibe/artifacts/presentations/<slug>/` artifact as source until the user chooses. If the brief explicitly says "from scratch/new" then create a new slug. If it explicitly says "continue/refine existing" or names a path, reuse only that selected artifact.

**Step 0b/N: Target surface.** Ask the user the target surface (one question, markdown):

- `web` - browser (default 375 mobile + 1440 desktop)
- `chrome-extension` — popup / options / side-panel
- `electron` — Electron desktop
- `tauri` — Tauri desktop
- `mobile-native` — iOS+Android (React Native / Flutter / native)

Read `<resolved-supervibe-plugin-root>/templates/viewport-presets/<target>.json` and use as starting viewport list. Save `target`, `viewports`, `runtime`, `constraints` into `.supervibe/artifacts/prototypes/<slug>/config.json` BEFORE any other write — the pre-write hook will block writes until config.json exists.

**Step 0c/N: Triage.** Then determine:
- Is this a marketing landing page → uses `supervibe:landing-page` skill
- Is this an in-product flow → uses `supervibe:prototype` skill
- Does brand direction exist (`.supervibe/artifacts/brandbook/direction.md`) → if yes reuse it by default and skip Stage 1
- Does design system exist (`.supervibe/artifacts/prototypes/_design-system/design-flow-state.json` or `manifest.json`) → if approved enter **system-reuse mode** and skip the full Stage 2 dialogue; if candidate or needs_revision enter review/resume mode and block prototype
- Does the brief require a token/component not present in the existing system → create a narrow extension request instead of rebuilding the system
- Does the user explicitly want to skip a stage or delegate safe decisions to agents → record that in `stageTriage` and continue only when no approval, safety, policy, or final lifecycle gate is being bypassed
- For non-web targets dispatch the corresponding specialist designer (`extension-ui-designer` / `electron-ui-designer` / `tauri-ui-designer` / `mobile-ui-designer`) instead of `ux-ui-designer` for spec/review.
- Multi-language UI? Reduced-motion sensitive? Touch / pointer device target? Save to brief metadata.

ASK ONE QUESTION at a time if any axis above is ambiguous. Save answers to `.supervibe/artifacts/prototypes/<slug>/config.json` before stage advance.

**Stage 0d — Media capability check (required for motion/video-heavy briefs).**

Run:

```bash
node "<resolved-supervibe-plugin-root>/scripts/detect-media-capabilities.mjs" --json
```

Persist the result in `.supervibe/artifacts/prototypes/<slug>/config.json.mediaCapabilities`. If `video=false`, designers MUST NOT promise rendered video output. They may still create CSS/WAAPI motion in the live prototype, static storyboard frames, SVG/Lottie specs when assets already exist, or poster-frame + interaction notes. If `video=true`, video is allowed but still requires a performance + reduced-motion fallback plan.

**Stage 0e — Figma source-of-truth check (required when Figma is mentioned).**

If the brief, ticket, memory, or project docs include a Figma URL, file key,
node id, variables export, component library, or Code Connect metadata:

1. Invoke `supervibe:mcp-discovery` with category=`figma`.
2. Follow `docs/figma-source-of-truth.md`.
3. Record capability mode in `.supervibe/artifacts/prototypes/<slug>/config.json.figma`:
   `none`, `read-only`, `writeback`, or `code-connect`.
4. Extract variables/components/assets only when the MCP or user-provided
   artifacts allow it.
5. Build from approved local tokens/components, not raw Figma values.
6. Write `.supervibe/artifacts/prototypes/<slug>/figma-source/drift-report.md` before approval.
7. Block any Figma writeback unless an exact approval covers file, node/page,
   action type, and timebox. If writeback is unavailable, write
   `figma-source/manual-patch.md` instead.

**Stage 0e.5 — Reference source scope (required when websites, PDFs, screenshots/images, Figma links, or external/local references are mentioned).**

Run:

```bash
node <resolved-supervibe-plugin-root>/scripts/design-agent-plan.mjs --brief "<brief>" --target <target> --flow <in-product|landing> --json
```

If the result reports `needsReferenceSourceScopeQuestion=true`, ask one **Reference source scope** question before reading those sources or writing durable artifacts:

- Functional inventory only — preserve capabilities, flows, states, and terminology; avoid copying layout or style.
- Use for information architecture — borrow navigation/grouping patterns only.
- Use as visual inspiration — borrow selected mood/layout traits and document what changes.
- Treat as authoritative brand source — only for an approved brand guide/design source of truth.
- Ignore this reference — do not read it.
- Stop here — make no hidden progress.

Save the answer into the `reference borrow/avoid` preference axis and `config.json.referenceSources`. Websites go through `supervibe:mcp-discovery` for web-crawl capability; PDFs/images are parsed or inspected only after source scope is approved; Figma still follows Stage 0e; old prototypes follow Old artifact reference scope first.

**Stage 0f — Preference Coverage Matrix Gate (required before brand direction or design-system writes).**

For a new product, new visual direction, or rebrand, capture these eight preference axes before writing `.supervibe/artifacts/brandbook/direction.md`, `.supervibe/artifacts/prototypes/_design-system/tokens.css`, `manifest.json`, or any delegated section marker:

- visual direction and tone
- audience and trust/risk posture
- information density
- typography personality
- palette mood
- motion intensity
- component feel
- reference borrow/avoid

Use the Standard Question Template and ask one question at a time. Start with the highest-impact missing axis instead of dumping all eight questions. If the brief already states clear preferences, persist those axes with source=`user` and ask one confirmation or priority question for the remaining ambiguity. If the user explicitly says they have no preference and wants safe defaults, persist source=`explicit-default` for the missing axes and name each default. source=`inferred` is forbidden. Do not create candidate tokens until `.supervibe/artifacts/brandbook/preferences.json` contains `first_user_design_gate_ack=true` plus the matrix with prompt, answer/default, source, timestamp, and decision unlocked for every axis. Existing approved design systems can skip this gate unless the request changes direction, audience, brand personality, or target surface.

If the brief references an older prototype or a path such as `docs/old prototypes`, stop before reading that material and ask the **Old artifact reference scope** question: functional inventory only, functional inventory plus IA, visual reference allowed, ignore the old artifact, or stop. Save the borrow/avoid answer into the `reference borrow/avoid` preference axis before any durable artifact write. If the brief references a website, PDF, image/screenshot, Figma link, or other source, ask **Reference source scope** first unless the borrow/avoid boundary is explicit.

When in doubt, use dry-run mode: write the initial design-system review packet only in chat or under `.supervibe/artifacts/prototypes/_design-system/.scratch/<run-id>/`. Promote it to `.supervibe/artifacts/brandbook/` and `.supervibe/artifacts/prototypes/_design-system/` only after `first_user_design_gate_ack=true` and the required matrix evidence exist.

### Stage 1 — Brand direction (conditional)

If brand direction missing OR brief asks for "new brand / rebrand":

1. Invoke `supervibe:project-memory --query brand` to surface prior brand decisions.
2. Use the `design-agent-plan.mjs` output as the orchestration map for reference tooling, agents, and skills. Persist the plan to `config.json.agentPlan`.
3. If brief named a competitor reference, invoke `supervibe:mcp-discovery` for `web-crawl` (Firecrawl) only after Reference source scope is approved.
4. Dispatch `creative-director` agent and run `workflow-receipt.mjs issue --command /supervibe-design --agent creative-director --stage stage-1-brand-direction --reason "<why>" --input .supervibe/artifacts/brandbook/preferences.json --output .supervibe/artifacts/brandbook/direction.md --handoff <handoffId>` before claiming the agent produced `direction.md`.
5. Run the **Taste Alignment Gate** before any screen work: document audience, product personality, reference set, what to borrow, what to avoid, and how the selected direction differs from older prototypes in this project.
6. Output: `.supervibe/artifacts/brandbook/direction.md` — mood-board (with per-image rationale), 3 candidate directions narrowed to 1, palette intent, type intent, motion intent, voice keywords, old-prototype differentiation notes. Score against `brandbook` rubric ≥9. This file is mandatory for new/rebrand runs before any token or prototype write.
6. **Feedback gate** — present direction to user. Options:
   - Approve direction - write `creative_direction.status = selected` in `design-flow-state.json`, then ask one explicit continuation question before Stage 2.
   - Compare another direction - creative-director generates 2 alternatives with documented tradeoffs, not random regeneration.
   - Refine direction - user describes one specific change.
   - Stop here - persist `direction.md` as draft and do not write tokens.

A selected creative direction is not design-system approval. It must not create a prototype, unlock preview, or mark palette, typography, density, radius, motion, components, copy language, or platform constraints as approved.

### Stage 2 — Design system (conditional, project-level)

If design system missing OR Stage 1 just produced a new direction OR the user explicitly asked for rebrand:

0. Verify `.supervibe/artifacts/prototypes/<slug>/config.json.stageTriage`, `.supervibe/artifacts/brandbook/preferences.json`, and `.supervibe/artifacts/brandbook/direction.md` exist for new/rebrand runs. `preferences.json` must include `first_user_design_gate_ack=true` and no source=`inferred` matrix entries. Do not create candidate tokens, `manifest.json`, or section completion markers until the Preference Coverage Matrix and selected creative direction are satisfied.
1. Invoke `supervibe:brandbook` skill in full-pass mode only when Stage 2 triage is `required` (up to 8 sub-sections — palette, typography, spacing, motion, voice, components-baseline, accessibility, manifest), and run `workflow-receipt.mjs issue --command /supervibe-design --skill supervibe:brandbook ...` before claiming candidate or approved design-system outputs.
2. Each sub-section is a separate decision record driven by the wizard `questionQueue`. Ask one question at a time for every required or user-visible creative choice, even when a safe default exists, unless the user explicitly accepted the guided default for that axis.
3. Each sub-section writes a `draft`, `candidate`, `needs_revision`, or `approved` marker. Candidate markers are completion/proposal records, not user approval.
4. Output: `.supervibe/artifacts/prototypes/_design-system/{tokens.css, motion.css, voice.md, components/, accessibility.md, manifest.json, design-flow-state.json}` with candidate tokens and `design_system.status === "candidate"` until explicit section approvals are complete.
5. Show a review packet/styleboard and ask explicit approval for every required section: `palette`, `typography`, `spacing-density`, `radius-elevation`, `motion`, `component-set`, `copy-language`, and `accessibility-platform`. Every section must have a visible summary plus approve / revise / compare alternative / stop choices. The default UX is per-section review; a bulk phrase such as "approve all 8 sections" is valid only after `styleboard.html` was shown in the current run and all eight section summaries are visible in chat.
6. Only after every required section is explicitly approved, write `design_system.status = "approved"` with `approved_at`, `approved_by`, `approved_sections`, per-section evidence, and `feedback_hash` or equivalent user-message evidence in `design-flow-state.json`.

After candidate completion: design system is a **review packet**, not a prototype source of truth. It blocks downstream prototype stages until `design_system.status = "approved"` and every required section is approved. No preview server starts while the system is candidate or needs_revision.

If `.supervibe/artifacts/prototypes/_design-system/design-flow-state.json` or `manifest.json` exists with `status: approved` or final token metadata:

1. Read `manifest.json`, `tokens.css`, `motion.css`, `voice.md`, `components/*.md`, and any `extensions/*.md`.
2. Print a short reuse summary: system version, approved sections, component count, token families, last extension.
3. Continue without asking the user to approve palette/type/spacing again.
4. If the requested mockup needs something missing, create `.supervibe/artifacts/prototypes/_design-system/extensions/<yyyy-mm-dd>-<slug>.md` with:
   - requested addition
   - why existing tokens/components do not cover it
   - affected prototypes
   - proposed token/component contract
   - approval status
5. Ask exactly one approval question for that extension. Do not reopen the entire design system.

After design-system approval, recompute design status and stage triage before replying. Run `supervibe-design status --slug <slug>` or `node scripts/design-agent-plan.mjs --status --slug <slug>` and show whether the state is `approved DS`, `prototype missing`, and `handoff blocked`. If the original mode was `full-prototype-pipeline`, continue automatically to prototype intake after the approval summary. If the original mode was `design-system-only`, do not imply the final UI is done; ask the next-action prompt `Build prototype / revise DS / stop`. When the user chooses build prototype, switch to prototype phase, ask for interaction depth, create or update prototype `config.json`, and recalculate `stageTriage` so Stage 3, Stage 4, Stage 5, and Stage 6 become `ready` or `available` instead of staying `skipped`.

### Stage 3 — UX spec

Dispatch `ux-ui-designer` agent with the brief + brand direction + design system, and run `workflow-receipt.mjs issue --command /supervibe-design --agent ux-ui-designer ...` before claiming `spec.md`.

Output: `.supervibe/artifacts/prototypes/<slug>/spec.md` with:
- User flow (boxes-and-arrows or sequence)
- Information architecture
- Component inventory (every component referenced from `.supervibe/artifacts/prototypes/_design-system/components/`)
- States matrix per screen (loading / empty / error / success / partial)
- Interaction notes (which animations from `motion.css`, which microcopy from `voice.md`)
- Reference scan: local design intelligence evidence first, then 5-8 external references when web/search tools are available, with source URLs and what to borrow vs avoid. If no search tool is available, explicitly write `reference scan skipped: no web/search MCP or WebFetch available`.

**Feedback gate:** approve spec / refine / try alternative / stop.

### Stage 4 — Copy pass

Dispatch `copywriter` agent over the spec, and run `workflow-receipt.mjs issue --command /supervibe-design --agent copywriter ...` before claiming `content/copy.md`.

Output: `.supervibe/artifacts/prototypes/<slug>/content/copy.md` — every visible string nailed. No Lorem Ipsum. CTA verbs match action. Error messages actionable. Voice matches `.supervibe/artifacts/prototypes/_design-system/voice.md`.

**Feedback gate:** approve copy / refine / stop.

### Stage 5 — Prototype build (native HTML/CSS/JS)

Before dispatching any builder, evaluate `.supervibe/artifacts/prototypes/_design-system/design-flow-state.json`. If `prototype.requested = BLOCKED`, fail fast with the missing design-system sections and return the user to Stage 2 review. Candidate design-system artifacts never unlock this stage.

Dispatch `prototype-builder` agent and run `workflow-receipt.mjs issue --command /supervibe-design --agent prototype-builder ...` before claiming prototype files. Decide which skill it dispatches:
- Marketing landing → `supervibe:landing-page`
- In-product flow → `supervibe:prototype`

Both skills enforce:
- Pure native (no frameworks, no npm)
- Viewports come from `plan.viewportPolicy`: web defaults to `[375, 1440]`; desktop/Tauri/Electron uses actual 1:1 window metadata or `[1280x800, 800x600]` fallback and asks once if user wants different
- `design_system.status = approved` and every required section approved before writing prototype HTML/CSS/JS
- All visuals through `.supervibe/artifacts/prototypes/_design-system/tokens.css` (no raw hex / magic px)
- All animations from `.supervibe/artifacts/prototypes/_design-system/motion.css` (no inline cubic-beziers)
- Video only if `config.json.mediaCapabilities.video === true`; otherwise use CSS/WAAPI, SVG/Lottie specs, storyboard frames, or static poster alternatives.
- One question at a time when clarification needed

After the first representative screen is rendered, run the **Critique Gate** before expanding the rest of the flow: "is this a new product direction or a repainted old shell?" If it reads as a repaint, revise brand direction/tokens first. If the critique passes, continue building the remaining screens without turning the gate into an unnecessary stop.

Output: `.supervibe/artifacts/prototypes/<slug>/index.html` + supporting files. `config.json` with `approval: 'draft'`.

### Stage 6 — Live preview + parallel review

1. Only start preview after Stage 5 has written a draft prototype under an allowed transition. Preferred command for prototypes that import the shared `_design-system` is `supervibe:preview-server --root .supervibe/artifacts/prototypes --label <slug> --daemon`, and the user URL is `http://localhost:NNNN/<slug>/`. The server also maps `/_design-system/*` when a `<slug>` root is served, but the parent-root URL is the canonical workflow. Never use `file://` verification for design delivery and never use `--no-feedback` for design previews. Print the URL only after verifying the page contains the visible `Feedback` button (`#supervibe-fb-toggle`) and shared tokens load with HTTP 200. User can click regions to comment; comments arrive as system-reminder on next user prompt where hooks are supported, and remain available to any IDE through `node "<resolved-supervibe-plugin-root>/scripts/feedback-status.mjs" --list`.
2. Dispatch in parallel:
   - `ui-polish-reviewer` — 8-dimension review (hierarchy, spacing rhythm, alignment, state coverage, keyboard, responsive at both viewports, copy precision, token compliance). Writes to `.supervibe/artifacts/prototypes/<slug>/_reviews/polish.md` plus a completed Workflow Invocation Receipt.
   - `accessibility-reviewer` — WCAG AA via Playwright + axe-core if browser-automation MCP available; static review otherwise. Writes to `.supervibe/artifacts/prototypes/<slug>/_reviews/a11y.md` plus a completed Workflow Invocation Receipt.
3. If user requested SEO scaffolding (landing flow), also dispatch `seo-specialist` → `.supervibe/artifacts/prototypes/<slug>/_reviews/seo.md` plus a completed Workflow Invocation Receipt.

### Stage 7 — Feedback loop (MANDATORY — DO NOT SKIP)

After delivery, ALWAYS print this exact prompt. The chat-level feedback prompt is canonical; the browser feedback overlay is supplemental and never replaces this approval/refine/alternative/stop choice:

```markdown
**Prototype ready**
- URL: http://localhost:NNNN
- Viewports: 375px (mobile), 1440px (desktop)
- Files: .supervibe/artifacts/prototypes/<slug>/
- Reviews: .supervibe/artifacts/prototypes/<slug>/_reviews/{polish,a11y}.md
- State: **draft**

What should happen next?

- **Approve** - write approval, copy to `.supervibe/artifacts/prototypes/<slug>/handoff/` (ready for integration)
- **Revise** - describe one focused change; apply one iteration
- **Alternative** - build two other visual/composition directions in parallel
- **Deep review** - call additional relevant agents such as seo-specialist or qa-test-engineer
- **Stop** - keep as draft and resume later
```

Wait for explicit choice. Do NOT proceed silently.

- If "Revise" -> ONE clarifying question, then back to Stage 5 with revision scope. Increment `feedbackRounds` in eventual approval marker.
- If "Alternative" -> spawn `.supervibe/artifacts/prototypes/<slug>/alternatives/<variant-name-1>/` and `<variant-name-2>/` with documented tradeoffs ("vs A: warmer palette, narrower hero column"). User compares side-by-side via separate preview-servers. For each variant copy `templates/alternatives/tradeoff.md.tpl` and fill all sections with "differs because X / gives up Y to gain Z" framing. Never delete a parked variant - convert to `Status: rejected` with a Rejection note instead.
- If "Deep review" -> dispatch additional agents to `_reviews/`.
- If "Stop" -> leave as draft, save state, exit.
- If "Approve" -> Stage 8.

### Stage 8 — Approval + handoff to development-ready

When the user explicitly approves the artifact:

1. **Write approval marker** at `.supervibe/artifacts/prototypes/<slug>/.approval.json`:
   ```json
   {
     "status": "approved",
     "approvedAt": "<ISO>",
     "approvedBy": "<user from git config user.name>",
     "viewports": [375, 1440],
     "designSystemVersion": "<commit-sha of _design-system/>",
     "tokensState": "final",
     "previewUrl": "http://localhost:NNNN",
     "feedbackRounds": <count>,
     "approvalScope": "full | viewport-mobile | layout-only"
   }
   ```

2. **Update `config.json`** → `"approval": "approved"`.

3. **Finalize handoff token metadata**: keep `design_system.status = "approved"` in `design-flow-state.json`, update `.supervibe/artifacts/prototypes/_design-system/manifest.json` with `tokensState: "final"`, record `visualApprovalPrototype: ".supervibe/artifacts/prototypes/<slug>/"`, and preserve the approved sections/evidence. If alternatives exist, mark every non-selected direction as parked or rejected before continuing.

4. **Invoke `supervibe:prototype-handoff` and build the ready for development handoff bundle** at `.supervibe/artifacts/prototypes/<slug>/handoff/`:
   ```
   .supervibe/artifacts/prototypes/<slug>/handoff/
   ├── README.md                  ← what this is, when approved, by whom, viewport list
   ├── index.html                 ← the approved native prototype, copied verbatim
   ├── styles/                    ← copied from <slug>/styles/
   ├── scripts/                   ← copied from <slug>/scripts/
   ├── content/copy.md            ← approved copy
   ├── components-used.json       ← inventory: which design-system components, with file:line refs
   ├── tokens-used.json           ← inventory: which design tokens (color/space/radius/motion) consumed
   ├── viewport-spec.json         ← exact breakpoints + container queries used
   └── stack-agnostic.md          ← per-stack adapter hints (React component skeleton, Vue SFC skeleton, Next.js page skeleton — all derivable from this prototype)
   ```

5. **Print handoff summary**:
   ```
   Approved: .supervibe/artifacts/prototypes/<slug>/
   Ready for integration: .supervibe/artifacts/prototypes/<slug>/handoff/
   State: approved
   Next: run <stack>-developer (laravel-developer / nextjs-developer / vue-implementer / ...)
           pass the handoff/ path; it promotes the prototype to production.
   ```

6. **Score** the bundle against `prototype.yaml` rubric ≥9.

## Output contract

```
=== Supervibe Design ===
Brief:        <one-line>
Brand:        .supervibe/artifacts/brandbook/direction.md     (score: X.X/10)
System:       .supervibe/artifacts/prototypes/_design-system/design-flow-state.json + manifest.json (candidate | needs_revision | approved | final metadata)
Wizard:       coverage <covered>/<required>, queue <N>, guidedDefaultsChecklist <N>
Execution:    executionMode <inline | real-agents | hybrid | agent-required-blocked>, missingAgents <list|none>, provisioning <ready|blocked|none>, qualityImpact <text|none>
Spec:         .supervibe/artifacts/prototypes/<slug>/spec.md
Copy:         .supervibe/artifacts/prototypes/<slug>/content/copy.md
Prototype:    .supervibe/artifacts/prototypes/<slug>/index.html
Viewports:    [375, 1440]
Preview URL:  http://localhost:NNNN  (PID: ...; idle-shutdown 30 min)
Reviews:      polish (N issues) + a11y (M violations) [+ seo if landing]
Feedback rounds: <count>
Approval:     <draft | approved>     ← .supervibe/artifacts/prototypes/<slug>/.approval.json
Tokens:       <candidate | final>
Handoff:      <pending | .supervibe/artifacts/prototypes/<slug>/handoff/>
DesignerPkg:  <pending | .supervibe/artifacts/prototypes/<slug>/designer-package.json>

Confidence: <N>.<dd>/10
Override:   <true|false>
Rubric:     prototype
```

## When NOT to invoke

- Pure feature spec without visual surface — `/supervibe-brainstorm` then `/supervibe-plan`
- Already have an approved prototype, want to ship it — call the chosen stack-developer agent directly with the `.supervibe/artifacts/prototypes/<slug>/handoff/` path
- Just want to manage already-running preview servers — `/supervibe-preview`
- Want to update design system tokens only (no prototype) — invoke `supervibe:brandbook` skill in narrow-section mode

## Related

- `creative-director` — Stage 1 brand direction
- `supervibe:brandbook` — Stage 2 design system materialization
- `ux-ui-designer` — Stage 3 spec
- `copywriter` — Stage 4 copy
- `prototype-builder` + `supervibe:prototype` / `supervibe:landing-page` — Stage 5 native build
- `supervibe:preview-server` — Stage 6 live URL
- `ui-polish-reviewer` + `accessibility-reviewer` + `seo-specialist` — Stage 6 reviews
- `supervibe:tokens-export` — when downstream stack picked, exports tokens to its format
- `<stack>-developer` agents (laravel / nextjs / vue / etc.) — pick up `handoff/` after Stage 8
- `supervibe:interaction-design-patterns` — animation recipes referenced from `motion.css`
- `mcp-server-figma`, `mcp-server-firecrawl`, `mcp-playwright` — optional MCPs that improve specific stages
- `docs/figma-source-of-truth.md` — optional Figma variables/components/token/code parity flow

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-design` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, required agents, `IMMEDIATE_AGENTS`, `DEFERRED_AGENTS`, `AGENT_STAGE_GATE`, and durable-write permission before any agent-owned artifact is produced.

For `/supervibe-design`, invoke `supervibe-orchestrator` immediately when the command starts in real-agent mode, then run `node <resolved-supervibe-plugin-root>/scripts/design-agent-plan.mjs --status --plan-writes --slug <slug>` and keep specialist design agents deferred until the wizard gate unlocks their stages. Do not spawn `creative-director`, `ux-ui-designer`, `copywriter`, `prototype-builder`, `ui-polish-reviewer`, `accessibility-reviewer`, or `quality-gate-reviewer` just because they appear in `REQUIRED_AGENTS`; spawn them when their stage is ready and before writing their durable output.

Invoke the real host agents named by the active stage plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES`, full `CODEX_SPAWN_PAYLOADS` catalog, `CODEX_SPAWN_NOW_PAYLOADS`, and staged/deferred payload information printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
