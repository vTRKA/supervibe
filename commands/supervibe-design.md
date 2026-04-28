---
description: >-
  End-to-end design pipeline with explicit lifecycle: design-system → spec →
  native HTML/CSS/JS prototype → live preview → review → feedback loop →
  approval → ready-for-development handoff. Pure native, two viewports default
  (375 + 1440), one question at a time.
---

# /supervibe-design

Single entry-point for the design pipeline. Orchestrates 6 design agents and 5 design skills through 8 explicit stages, ending with an **approved, ready-for-development** prototype that any stack-developer agent can pick up.

## Hard rules (the user feedback that drives this command)

1. **Native HTML/CSS/JS only** for prototypes. No React, Vue, Svelte, Next.js, Nuxt. Pure web platform. Frameworks come AFTER approval, in the handoff-to-stack step.
2. **Two viewports default** — `375px` mobile + `1440px` desktop. Ask user upfront if they want different, but never silently expand.
3. **One question at a time** in markdown with progress indicator. Never dump 5 questions at once.
4. **Design system is source of truth.** Approved FIRST, before any prototype. Every visual decision references it.
5. **Explicit lifecycle.** draft → review → revisions → **approved** → handoff. The plugin tracks state in `.approval.json` artifacts; it knows when something is ready for backend/frontend integration.
6. **Feedback loop after every delivery.** No silent "done" state — always ask for explicit approve / refine / try-alternative / stop.
7. **Alternatives are first-class.** When user rejects, agent produces 2 alternatives with explicit tradeoffs, not random regen.
8. **Approved → handoff** automatically copies prototype to `prototypes/<slug>/handoff/` ready to be promoted into chosen stack later.

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

Each stage is gated on user explicit approval before the next starts. Skip stages that don't apply (e.g. brand direction unnecessary for an in-product flow inside an existing brand).

### Stage 0 — Target surface + Triage (always)

**Шаг 0a/N: Target surface.** Before anything else, ask the user the target surface (one question, markdown):

- `web` — браузер (default 375 mobile + 1440 desktop)
- `chrome-extension` — popup / options / side-panel
- `electron` — Electron desktop
- `tauri` — Tauri desktop
- `mobile-native` — iOS+Android (React Native / Flutter / native)

Read `$CLAUDE_PLUGIN_ROOT/templates/viewport-presets/<target>.json` and use as starting viewport list. Save `target`, `viewports`, `runtime`, `constraints` into `prototypes/<slug>/config.json` BEFORE any other write — the pre-write hook will block writes until config.json exists.

**Шаг 0b/N: Triage.** Then determine:
- Is this a marketing landing page → uses `supervibe:landing-page` skill
- Is this an in-product flow → uses `supervibe:prototype` skill
- Does brand direction exist (`prototypes/_brandbook/direction.md`) → if yes skip Stage 1
- Does design system exist (`prototypes/_design-system/manifest.json` with `status: approved`) → if yes skip Stage 2
- For non-web targets dispatch the corresponding specialist designer (`extension-ui-designer` / `electron-ui-designer` / `tauri-ui-designer` / `mobile-ui-designer`) instead of `ux-ui-designer` for spec/review.
- Multi-language UI? Reduced-motion sensitive? Touch / pointer device target? Save to brief metadata.

ASK ONE QUESTION at a time if any axis above is ambiguous. Save answers to `prototypes/<slug>/config.json` before stage advance.

### Stage 1 — Brand direction (conditional)

If brand direction missing OR brief asks for "new brand / rebrand":

1. Invoke `supervibe:project-memory --query brand` to surface prior brand decisions.
2. If brief named a competitor reference, invoke `supervibe:mcp-discovery` for `web-crawl` (Firecrawl) and scrape that reference.
3. Dispatch `creative-director` agent.
4. Output: `prototypes/_brandbook/direction.md` — mood-board (with per-image rationale), 3 candidate directions narrowed to 1, palette intent, type intent, motion intent, voice keywords. Score against `brandbook` rubric ≥9.
5. **Feedback gate** — present direction to user. Options:
   - ✅ approve direction → continue Stage 2
   - 🔀 alternative → creative-director generates 2 alternatives with documented tradeoffs (not random regen)
   - ✎ refine — user describes one specific change
   - 🛑 stop

### Stage 2 — Design system (conditional)

If design system missing OR Stage 1 just produced a new direction:

1. Invoke `supervibe:brandbook` skill in full-pass mode (8 sub-sections — palette, typography, spacing, motion, voice, components-baseline, accessibility, manifest).
2. Each sub-section is a separate dialogue (one question at a time, markdown with "Шаг N/8" progress).
3. Each sub-section gets explicit approval before next; per-section approvals saved to `prototypes/_design-system/.approvals/<section>.json`.
4. Output: `prototypes/_design-system/{tokens.css, motion.css, voice.md, components/, accessibility.md, manifest.json}` with `manifest.json.status === 'approved'`.

After completion: design system is the **source of truth** for all downstream stages. No prototype invents tokens.

### Stage 3 — UX spec

Dispatch `ux-ui-designer` agent with the brief + brand direction + design system.

Output: `prototypes/<slug>/spec.md` with:
- User flow (boxes-and-arrows or sequence)
- Information architecture
- Component inventory (every component referenced from `prototypes/_design-system/components/`)
- States matrix per screen (loading / empty / error / success / partial)
- Interaction notes (which animations from `motion.css`, which microcopy from `voice.md`)

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
- One question at a time when clarification needed

Output: `prototypes/<slug>/index.html` + supporting files. `config.json` with `approval: 'draft'`.

### Stage 6 — Live preview + parallel review

1. Skill auto-spawns `supervibe:preview-server --root prototypes/<slug>/`. Print `http://localhost:NNNN` to user. Preview includes feedback overlay — user can click regions to comment; comments arrive as system-reminder on next user prompt via UserPromptSubmit hook.
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
     "previewUrl": "http://localhost:NNNN",
     "feedbackRounds": <count>,
     "approvalScope": "full | viewport-mobile | layout-only"
   }
   ```

2. **Update `config.json`** → `"approval": "approved"`.

3. **Build handoff bundle** at `prototypes/<slug>/handoff/`:
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

4. **Print handoff summary**:
   ```
   ✅ Утверждено: prototypes/<slug>/
   Готово к интеграции: prototypes/<slug>/handoff/
   Состояние: approved
   Дальше: запусти <stack>-developer (laravel-developer / nextjs-developer / vue-implementer / ...)
           передай путь handoff/, он промоутит в production.
   ```

5. **Score** the bundle against `prototype.yaml` rubric ≥9.

## Output contract

```
=== Evolve Design ===
Brief:        <one-line>
Brand:        prototypes/_brandbook/direction.md     (score: X.X/10)
System:       prototypes/_design-system/manifest.json (approved)
Spec:         prototypes/<slug>/spec.md
Copy:         prototypes/<slug>/content/copy.md
Prototype:    prototypes/<slug>/index.html
Viewports:    [375, 1440]
Preview URL:  http://localhost:NNNN  (PID: ...; idle-shutdown 30 min)
Reviews:      polish (N issues) + a11y (M violations) [+ seo if landing]
Feedback rounds: <count>
Approval:     <draft | approved>     ← prototypes/<slug>/.approval.json
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
