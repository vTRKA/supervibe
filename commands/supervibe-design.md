---
description: >-
  End-to-end design pipeline with memory/code/design-intelligence preflight:
  design-system → spec → native HTML/CSS/JS prototype → live preview → review
  → feedback loop → approval → ready-for-development handoff. Pure native,
  two viewports default (375 + 1440), one question at a time.
---

# /supervibe-design

Single entry-point for the design pipeline. Orchestrates 6 design agents and 5 design skills through 8 explicit stages, ending with an **approved, ready-for-development** prototype that any stack-developer agent can pick up.

## Shared Dialogue Contract

Lifecycle: `draft -> review -> approved -> handoff`. Persist state in `prototypes/<slug>/config.json`, section approvals, and `prototypes/<slug>/.approval.json`.

Every interactive step asks one question at a time using `Step N/M` or `Шаг N/M`. Each question lists the recommended/default option first, gives a one-line tradeoff summary for every option, allows a free-form answer, and names the stop condition.

## Continuation Contract

`/supervibe-design <brief>` is a request to run the full applicable design pipeline, not to stop after the first useful subsection. Continue through all applicable stages until the prototype feedback gate or an explicit blocker. Intermediate stage and section approvals are recorded as delegated design decisions when the recommended/default path is clear; they are not chat-level hard stops.

Only pause when the user explicitly chooses stop/pause, the brief has a real ambiguity that blocks the next artifact, a safety/policy gate requires explicit approval (for example Figma writeback, external upload, production mutation, or reusing an old artifact), or the final prototype/deck approval gate is reached. Do not stop after typography, palette, spacing, storyboard, first screen, first review, or any other intermediate phase if the next stage can be completed with the current brief and safe defaults.

## Design Readiness Contract

Draft prototypes are not implementation contracts. A draft may provide the product model only: `agent workflow = intent + tool call + evidence/sources + human decision + result`. Treat every visual decision in a draft as temporary taste exploration until the user approves the prototype and the design system writes final tokens.

Developers must wait for **approved prototype + final tokens** in `prototypes/<slug>/handoff/`. Until that bundle exists, stack agents may read the product model, user flow, states, and evidence sources, but they must not copy draft colors, spacing, typography, layout taste, or component styling into production code.

**Taste Alignment Gate** runs before screen production. It defines direction, audience, reference set, what to borrow vs avoid, and how this direction differs from older prototypes. A design that merely recolors an old shell is not aligned.

Tokens have a two-step lifecycle: `candidate tokens` are allowed for visual proof and token discipline while building the draft prototype; `final tokens` are written only after visual approval. Do not stamp tokens as final just because Stage 2 completed.

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

After every material delivery, ask one explicit next-step question about the design artifact. Use language-matched, domain-specific labels; keep internal action ids only in saved state.
- Approve design / Утвердить дизайн - recommended when the current artifact looks right; move to the next lifecycle state.
- Revise design / Доработать дизайн - user gives one focused visual, UX, content or accessibility change; apply one iteration.
- Compare another direction / Сравнить другое направление - produce another design option with explicit tradeoffs.
- Review design deeper / Проверить дизайн глубже - run the relevant review/check agents or validators before changing anything.
- Stop and save design state / Остановиться и сохранить дизайн - persist current state and exit without claiming silent completion.

## Design Intelligence Integration

Design intelligence is an internal evidence source for this existing command, not a new workflow surface. Before style, palette, typography, chart, icon, presentation, collateral, mobile, or stack handoff decisions, design agents must run:

1. project memory preflight for accepted and rejected design decisions
2. code search over tokens, components, prototypes, and brand assets
3. internal `designContextPreflight()` or `searchDesignIntelligence()` lookup

The output must include `Design Intelligence Evidence` when retrieved rows influenced the decision. Generic lookup can suggest options, but the precedence order is strict: **approved design system > project memory > codebase patterns > accessibility constraints > external references**. The design system line item is valid only when `prototypes/_design-system/manifest.json` has `status: approved`.

## Hard rules (the user feedback that drives this command)

1. **Native HTML/CSS/JS only** for prototypes. No React, Vue, Svelte, Next.js, Nuxt. Pure web platform. Frameworks come AFTER approval, in the handoff-to-stack step.
2. **Two viewports default** — `375px` mobile + `1440px` desktop. Ask user upfront if they want different, but never silently expand.
3. **One question at a time** in markdown with progress indicator. Never dump 5 questions at once.
4. **Design system lifecycle is explicit.** Start with candidate tokens for visual proof, then finalize tokens only after visual approval. Every visual decision references the current candidate/final system instead of inventing one-off values.
4a. **Design system is project-level, not per-mockup.** Build it once at `prototypes/_design-system/`, then reuse it for every future mockup. New work may extend the system through an explicit extension request; it must not rebuild palette/type/components from scratch unless the user asked for a rebrand.
5. **Explicit lifecycle.** draft → review → revisions → **approved** → handoff. The plugin tracks state in `.approval.json` artifacts; it knows when something is ready for backend/frontend integration.
6. **Feedback loop after every delivery.** No silent "done" state — always ask for explicit approve / refine / try-alternative / stop.
7. **Alternatives are first-class.** When user rejects, agent produces 2 alternatives with explicit tradeoffs, not random regen.
8. **Approved → handoff** automatically invokes `supervibe:prototype-handoff` and copies prototype to `prototypes/<slug>/handoff/` ready for development and promotion into the chosen stack later.
9. **Existing design files are never reused silently.** If any `prototypes/`, `mockups/`, or `presentations/` artifact exists and the brief does not explicitly say "continue/refine existing" or "new/from scratch", stop at Stage 0a and ask one artifact-mode question before reading or editing an old file.
10. **Preview feedback button is mandatory.** Design preview servers must run with feedback overlay enabled. Do not pass `--no-feedback` for `prototypes/`, `mockups/`, or `presentations/`; verify the visible `Feedback` button before presenting the preview URL.
11. **Draft-to-dev boundary is mandatory.** Draft visuals are not production guidance. Stack agents only implement from `approved prototype + final tokens` in the handoff bundle.

## Invocation forms

### `/supervibe-design <brief>`

```
/supervibe-design landing in the style of Linear, focused on dev-tool buyers
/supervibe-design checkout flow for one-time purchases, mobile-first
/supervibe-design лендинг для финтех-продукта, brutalist стиль
```

### `/supervibe-design <existing-spec-path>`

```
/supervibe-design docs/specs/2026-04-28-checkout-design.md
```

### `/supervibe-design` (no args)

Use most recent brief from the conversation, or ask one clarifying question.

## Pipeline (8 stages)

Each stage records progress before the next starts. Skip stages that don't apply (e.g. brand direction unnecessary for an in-product flow inside an existing brand), but do not treat normal stage completion as a reason to stop.

### Stage 0 — Artifact mode + Target surface + Triage (always)

**Step 0a/N: Design artifact mode.** Before choosing target surface or opening old design files, run:

```bash
node "<resolved-supervibe-plugin-root>/scripts/lib/design-artifact-intake.mjs" --json --brief "<brief>"
```

If it returns `needsQuestion: true`, ask exactly one question:

```markdown
**Step 0/8: Design artifact mode.**
I found existing design artifacts, but the brief does not say whether to reuse them or start fresh.

What should I do?

- Continue an existing artifact - pick the path or say "latest".
- Create a new design from scratch - new slug, no edits to old artifacts.
- Create an alternative next to the old one - keep the old artifact parked for comparison.
```

Do not read, edit, copy, or treat any prior `prototypes/<slug>/`, `mockups/<slug>/`, or `presentations/<slug>/` artifact as source until the user chooses. If the brief explicitly says "from scratch/new" then create a new slug. If it explicitly says "continue/refine existing" or names a path, reuse only that selected artifact.

**Шаг 0b/N: Target surface.** Ask the user the target surface (one question, markdown):

- `web` — браузер (default 375 mobile + 1440 desktop)
- `chrome-extension` — popup / options / side-panel
- `electron` — Electron desktop
- `tauri` — Tauri desktop
- `mobile-native` — iOS+Android (React Native / Flutter / native)

Read `<resolved-supervibe-plugin-root>/templates/viewport-presets/<target>.json` and use as starting viewport list. Save `target`, `viewports`, `runtime`, `constraints` into `prototypes/<slug>/config.json` BEFORE any other write — the pre-write hook will block writes until config.json exists.

**Шаг 0c/N: Triage.** Then determine:
- Is this a marketing landing page → uses `supervibe:landing-page` skill
- Is this an in-product flow → uses `supervibe:prototype` skill
- Does brand direction exist (`prototypes/_brandbook/direction.md`) → if yes reuse it by default and skip Stage 1
- Does design system exist (`prototypes/_design-system/manifest.json` with `status: candidate`, `approved`, or final token metadata) → if yes enter **system-reuse mode** and skip the full Stage 2 dialogue
- Does the brief require a token/component not present in the existing system → create a narrow extension request instead of rebuilding the system
- For non-web targets dispatch the corresponding specialist designer (`extension-ui-designer` / `electron-ui-designer` / `tauri-ui-designer` / `mobile-ui-designer`) instead of `ux-ui-designer` for spec/review.
- Multi-language UI? Reduced-motion sensitive? Touch / pointer device target? Save to brief metadata.

ASK ONE QUESTION at a time if any axis above is ambiguous. Save answers to `prototypes/<slug>/config.json` before stage advance.

**Stage 0d — Media capability check (required for motion/video-heavy briefs).**

Run:

```bash
node "<resolved-supervibe-plugin-root>/scripts/detect-media-capabilities.mjs" --json
```

Persist the result in `prototypes/<slug>/config.json.mediaCapabilities`. If `video=false`, designers MUST NOT promise rendered video output. They may still create CSS/WAAPI motion in the live prototype, static storyboard frames, SVG/Lottie specs when assets already exist, or poster-frame + interaction notes. If `video=true`, video is allowed but still requires a performance + reduced-motion fallback plan.

**Stage 0e — Figma source-of-truth check (required when Figma is mentioned).**

If the brief, ticket, memory, or project docs include a Figma URL, file key,
node id, variables export, component library, or Code Connect metadata:

1. Invoke `supervibe:mcp-discovery` with category=`figma`.
2. Follow `docs/figma-source-of-truth.md`.
3. Record capability mode in `prototypes/<slug>/config.json.figma`:
   `none`, `read-only`, `writeback`, or `code-connect`.
4. Extract variables/components/assets only when the MCP or user-provided
   artifacts allow it.
5. Build from approved local tokens/components, not raw Figma values.
6. Write `prototypes/<slug>/figma-source/drift-report.md` before approval.
7. Block any Figma writeback unless an exact approval covers file, node/page,
   action type, and timebox. If writeback is unavailable, write
   `figma-source/manual-patch.md` instead.

### Stage 1 — Brand direction (conditional)

If brand direction missing OR brief asks for "new brand / rebrand":

1. Invoke `supervibe:project-memory --query brand` to surface prior brand decisions.
2. If brief named a competitor reference, invoke `supervibe:mcp-discovery` for `web-crawl` (Firecrawl) and scrape that reference.
3. Dispatch `creative-director` agent.
4. Run the **Taste Alignment Gate** before any screen work: document audience, product personality, reference set, what to borrow, what to avoid, and how the selected direction differs from older prototypes in this project.
5. Output: `prototypes/_brandbook/direction.md` — mood-board (with per-image rationale), 3 candidate directions narrowed to 1, palette intent, type intent, motion intent, voice keywords, old-prototype differentiation notes. Score against `brandbook` rubric ≥9.
6. **Feedback gate** — present direction to user. Options:
   - ✅ approve direction → continue Stage 2
   - 🔀 alternative → creative-director generates 2 alternatives with documented tradeoffs (not random regen)
   - ✎ refine — user describes one specific change
   - 🛑 stop

### Stage 2 — Design system (conditional, project-level)

If design system missing OR Stage 1 just produced a new direction OR the user explicitly asked for rebrand:

1. Invoke `supervibe:brandbook` skill in full-pass mode (8 sub-sections — palette, typography, spacing, motion, voice, components-baseline, accessibility, manifest).
2. Each sub-section is a separate decision record (one question at a time only when clarification is actually needed, markdown with "Шаг N/8" progress).
3. Each sub-section writes a completion/approval marker before the next section; when the user has not asked to review every section manually, use delegated approval markers with rationale in `prototypes/_design-system/.approvals/<section>.json` and continue.
4. Output: `prototypes/_design-system/{tokens.css, motion.css, voice.md, components/, accessibility.md, manifest.json}` with candidate tokens and `manifest.json.status === 'candidate'` until visual approval.

After completion: design system is the **candidate source of truth** for downstream prototype stages. No prototype invents tokens, but no downstream developer treats these as final tokens until Stage 8 approval.

If `prototypes/_design-system/manifest.json` exists with `status: approved` or final token metadata:

1. Read `manifest.json`, `tokens.css`, `motion.css`, `voice.md`, `components/*.md`, and any `extensions/*.md`.
2. Print a short reuse summary: system version, approved sections, component count, token families, last extension.
3. Continue without asking the user to approve palette/type/spacing again.
4. If the requested mockup needs something missing, create `prototypes/_design-system/extensions/<yyyy-mm-dd>-<slug>.md` with:
   - requested addition
   - why existing tokens/components do not cover it
   - affected prototypes
   - proposed token/component contract
   - approval status
5. Ask exactly one approval question for that extension. Do not reopen the entire design system.

### Stage 3 — UX spec

Dispatch `ux-ui-designer` agent with the brief + brand direction + design system.

Output: `prototypes/<slug>/spec.md` with:
- User flow (boxes-and-arrows or sequence)
- Information architecture
- Component inventory (every component referenced from `prototypes/_design-system/components/`)
- States matrix per screen (loading / empty / error / success / partial)
- Interaction notes (which animations from `motion.css`, which microcopy from `voice.md`)
- Reference scan: 5-8 external references when web/search tools are available, with source URLs and what to borrow vs avoid. If no search tool is available, explicitly write `reference scan skipped: no web/search MCP or WebFetch available`.

**Feedback gate:** approve spec / refine / try alternative / stop.

### Stage 4 — Copy pass

Dispatch `copywriter` agent over the spec.

Output: `prototypes/<slug>/content/copy.md` — every visible string nailed. No Lorem Ipsum. CTA verbs match action. Error messages actionable. Voice matches `prototypes/_design-system/voice.md`.

**Feedback gate:** approve copy / refine / stop.

### Stage 5 — Prototype build (native HTML/CSS/JS)

Dispatch `prototype-builder` agent. Decide which skill it dispatches:
- Marketing landing → `supervibe:landing-page`
- In-product flow → `supervibe:prototype`

Both skills enforce:
- Pure native (no frameworks, no npm)
- Default viewports `[375, 1440]` — agent asks once if user wants different
- All visuals through `prototypes/_design-system/tokens.css` (no raw hex / magic px)
- All animations from `prototypes/_design-system/motion.css` (no inline cubic-beziers)
- Video only if `config.json.mediaCapabilities.video === true`; otherwise use CSS/WAAPI, SVG/Lottie specs, storyboard frames, or static poster alternatives.
- One question at a time when clarification needed

After the first representative screen is rendered, run the **Critique Gate** before expanding the rest of the flow: "is this a new product direction or a repainted old shell?" If it reads as a repaint, revise brand direction/tokens first. If the critique passes, continue building the remaining screens without turning the gate into an unnecessary stop.

Output: `prototypes/<slug>/index.html` + supporting files. `config.json` with `approval: 'draft'`.

### Stage 6 — Live preview + parallel review

1. Skill auto-spawns `supervibe:preview-server --root prototypes/<slug>/` with feedback overlay enabled. Never use `--no-feedback` for design previews. Print `http://localhost:NNNN` to user only after verifying the page contains the visible `Feedback` button (`#supervibe-fb-toggle`). User can click regions to comment; comments arrive as system-reminder on next user prompt where hooks are supported, and remain available to any IDE through `node "<resolved-supervibe-plugin-root>/scripts/feedback-status.mjs" --list`.
2. Dispatch in parallel:
   - `ui-polish-reviewer` — 8-dimension review (hierarchy, spacing rhythm, alignment, state coverage, keyboard, responsive at both viewports, copy precision, token compliance). Writes to `prototypes/<slug>/_reviews/polish.md`.
   - `accessibility-reviewer` — WCAG AA via Playwright + axe-core if browser-automation MCP available; static review otherwise. Writes to `prototypes/<slug>/_reviews/a11y.md`.
3. If user requested SEO scaffolding (landing flow), also dispatch `seo-specialist` → `prototypes/<slug>/_reviews/seo.md`.

### Stage 7 — Feedback loop (MANDATORY — DO NOT SKIP)

After delivery, ALWAYS print this exact prompt:

```markdown
**Прототип готов**
- URL: http://localhost:NNNN
- Viewports: 375px (mobile), 1440px (desktop)
- Файлы: prototypes/<slug>/
- Reviews: prototypes/<slug>/_reviews/{polish,a11y}.md
- Состояние: **draft**

Что делаем дальше?

- ✅ **Утвердить** — фиксирую approval, копирую в `prototypes/<slug>/handoff/` (готов к интеграции)
- ✎ **Доработать** — расскажи что поменять (одной мыслью), итерирую один заход
- 🔀 **Альтернатива** — построю 2 другие визуальные/композиционные направления параллельно
- 📊 **Углублённый review** — позову ещё агентов (например seo-specialist, qa-test-engineer)
- 🛑 **Стоп** — оставить как draft, вернёмся позже
```

Wait for explicit choice. Do NOT proceed silently.

- If "Доработать" → ONE clarifying question, then back to Stage 5 with revision scope. Increment `feedbackRounds` in eventual approval marker.
- If "Альтернатива" → spawn `prototypes/<slug>/alternatives/<variant-name-1>/` and `<variant-name-2>/` with documented tradeoffs ("vs A: warmer palette, narrower hero column"). User compares side-by-side via separate preview-servers. For each variant copy `templates/alternatives/tradeoff.md.tpl` and fill all sections with "differs because X / gives up Y to gain Z" framing. Never delete a parked variant — convert to `Status: rejected` with a Rejection note instead.
- If "Углублённый review" → dispatch additional agents to `_reviews/`.
- If "Стоп" → leave as draft, save state, exit.
- If "Утвердить" → Stage 8.

### Stage 8 — Approval + handoff to development-ready

When user explicitly says "утвердить" / "approve" / "✅":

1. **Write approval marker** at `prototypes/<slug>/.approval.json`:
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

3. **Finalize design-system tokens**: update `prototypes/_design-system/manifest.json` from candidate to approved/final state, record `visualApprovalPrototype: "prototypes/<slug>/"`, and mark `tokensState: "final"`. If alternatives exist, mark every non-selected direction as parked or rejected before continuing.

4. **Invoke `supervibe:prototype-handoff` and build the ready for development handoff bundle** at `prototypes/<slug>/handoff/`:
   ```
   prototypes/<slug>/handoff/
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
   ✅ Утверждено: prototypes/<slug>/
   Готово к интеграции: prototypes/<slug>/handoff/
   Состояние: approved
   Дальше: запусти <stack>-developer (laravel-developer / nextjs-developer / vue-implementer / ...)
           передай путь handoff/, он промоутит в production.
   ```

6. **Score** the bundle against `prototype.yaml` rubric ≥9.

## Output contract

```
=== Supervibe Design ===
Brief:        <one-line>
Brand:        prototypes/_brandbook/direction.md     (score: X.X/10)
System:       prototypes/_design-system/manifest.json (candidate | approved/final)
Spec:         prototypes/<slug>/spec.md
Copy:         prototypes/<slug>/content/copy.md
Prototype:    prototypes/<slug>/index.html
Viewports:    [375, 1440]
Preview URL:  http://localhost:NNNN  (PID: ...; idle-shutdown 30 min)
Reviews:      polish (N issues) + a11y (M violations) [+ seo if landing]
Feedback rounds: <count>
Approval:     <draft | approved>     ← prototypes/<slug>/.approval.json
Tokens:       <candidate | final>
Handoff:      <pending | prototypes/<slug>/handoff/>

Confidence: <N>.<dd>/10
Override:   <true|false>
Rubric:     prototype
```

## When NOT to invoke

- Pure feature spec without visual surface — `/supervibe-brainstorm` then `/supervibe-plan`
- Already have an approved prototype, want to ship it — call the chosen stack-developer agent directly with the `prototypes/<slug>/handoff/` path
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
