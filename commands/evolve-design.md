---
description: "Single entry-point for the design pipeline: brand direction → spec → HTML/CSS prototype → live preview at localhost:PORT → a11y + polish review. RU: запуск дизайн-режима — от бренд-направления до живого превью с hot-reload."
---

# /evolve-design

End-to-end design flow. Orchestrates 6 design agents and 5 design skills into one pipeline that ends with a live preview URL the user can click around in.

## Invocation forms

### `/evolve-design <brief>`

Examples:
- `/evolve-design landing in the style of Linear, focused on dev-tool buyers`
- `/evolve-design checkout flow for one-time purchases, mobile-first`
- `/evolve-design lендинг для финтех-продукта, brutalist стиль`  *(Russian briefs work)*

### `/evolve-design <existing-spec-path>`

Skip the brand discovery if a brand direction or design spec already exists in the project. Example: `/evolve-design docs/specs/2026-04-28-checkout-design.md`.

### `/evolve-design` (no args)

Use the most recent brief from the conversation, or ask one clarifying question.

## Pipeline

This command runs **up to 7 stages**, each gated on user approval before moving forward. Skip stages that don't apply (e.g. brand direction is unnecessary for an in-product flow inside an existing brand).

### Stage 1 — Discovery (skip if brand exists in `prototypes/_brandbook/`)

1. Run `evolve:project-memory --query brand` to surface any prior brand direction, mood-board, or token decisions.
2. If user mentioned a reference (Linear, Stripe, etc.), invoke `evolve:mcp-discovery` with category `web-crawl` to get Firecrawl. Use it to scrape the reference. Fallback: WebFetch of one canonical URL.
3. Dispatch `creative-director` agent with `mcp-discovery` skill loaded.
4. Output: brand direction document at `prototypes/_brandbook/direction.md` with mood-board + token intent + DO/DON'T. Score against `brandbook.yaml` ≥9.

### Stage 2 — UX spec

1. Dispatch `ux-ui-designer` agent with the brief + brand direction.
2. Output: state matrix + user flow + interaction spec.

### Stage 3 — Copy pass

1. Dispatch `copywriter` agent over the spec.
2. Output: every visible string nailed (no Lorem Ipsum, CTA verbs match action, error messages actionable).

### Stage 4 — Prototype

1. Invoke `evolve:landing-page` skill OR `evolve:prototype` skill (skill picks itself based on the brief — landing page vs in-product flow).
2. Both delegate to `prototype-builder` agent which writes HTML/CSS/JS to `prototypes/<slug>/`.
3. Discipline: every color, spacing, type token must come through CSS custom properties pointing at the brandbook. **No raw hex values.**

### Stage 5 — Live preview (auto-spawn)

1. The `evolve:landing-page` / `evolve:prototype` skill ends by invoking `evolve:preview-server` with the prototype root.
2. Preview server spawns on `127.0.0.1:NNNN` (port allocated 3047-3099 → OS-assigned fallback), SSE hot-reload wired, idle-shutdown 30 min.
3. Print the URL to the user. They open it in any browser. Edits in the prototype source propagate within ~200ms.

### Stage 6 — Polish review (parallel)

Dispatch in parallel:
- `ui-polish-reviewer` agent — 8-dimension review (hierarchy, spacing rhythm, alignment, state coverage, keyboard, responsive, copy precision, token compliance)
- `accessibility-reviewer` agent — WCAG AA check via Playwright + axe-core if available; static review otherwise

Both write to `prototypes/<slug>/_reviews/` with per-issue file:line refs.

### Stage 7 — Score + handoff

1. Score the bundle against `prototype.yaml` rubric. Gate ≥9.
2. Print summary + preview URL + review locations + recommended next step.

## Output contract

```
=== Evolve Design ===
Brief:        <one-line>
Brand:        prototypes/_brandbook/direction.md  (score: X.X/10)
Spec:         prototypes/<slug>/spec.md
Prototype:    prototypes/<slug>/index.html
Preview URL:  http://localhost:NNNN  (PID: ...; idle-shutdown in 30m)
Polish:      <issue count>  prototypes/<slug>/_reviews/polish.md
A11y:        <violation count>  prototypes/<slug>/_reviews/a11y.md
Score:       <N>/10  Rubric: prototype

Next:
  - Open the URL, edit prototypes/<slug>/ files — changes hot-reload
  - Manage server: /evolve-preview --list, /evolve-preview --kill <port>
  - Promote to production: hand off to <stack>-developer with the prototype URL
```

## When NOT to invoke

- Pure feature spec without visual surface — `/evolve-brainstorm` then `/evolve-plan`
- Already have a final design and just want to implement — skip to stack-developer agent directly
- Just want to manage already-running preview servers — `/evolve-preview`

## Related

- `creative-director`, `ux-ui-designer`, `copywriter`, `prototype-builder`, `ui-polish-reviewer`, `accessibility-reviewer` — the agent cast
- `evolve:landing-page`, `evolve:prototype`, `evolve:brandbook`, `evolve:tokens-export`, `evolve:interaction-design-patterns`, `evolve:preview-server` — the skill chain
- `/evolve-preview` — manage the running preview servers
- `mcp-server-figma`, `mcp-server-firecrawl`, `mcp-playwright` — optional MCPs that improve specific stages
