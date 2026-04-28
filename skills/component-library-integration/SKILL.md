---
name: component-library-integration
namespace: evolve
description: Use AFTER design-system-approved AND BEFORE prototype-handoff TO bridge brandbook tokens into a chosen component library (MUI, shadcn/ui, Radix UI, HeadlessUI, Mantine, or fully-custom). Decides which library fits, then generates the token bridge so the library renders with project palette/typography/motion.
allowed-tools: Read, Write, Edit, Glob, Grep
phase: design-system
prerequisites:
  - design-system-approved
emits-artifact: prototypes/_design-system/library-bridge/<library>/
confidence-rubric: framework
gate-on-exit: design-system
version: 1.0
last-verified: 2026-04-28
---

# Component Library Integration

## When to invoke
- AFTER `brandbook` skill produces `manifest.json` with `status: approved`.
- BEFORE `prototype-handoff` runs, IF the target stack uses a component library.
- WHEN user asks "use shadcn / use MUI / can we adopt <library>" — propose this skill.

## Step 0 — Read source of truth
- `prototypes/_design-system/manifest.json` (status must be approved)
- `prototypes/_design-system/tokens.css`
- `prototypes/_design-system/motion.css`
- `prototypes/_design-system/components/*.md` (each baseline component spec)

## Decision tree

Ask user one question at a time.

**Шаг 1/4:** What is the target stack for production?
- React → continue Step 2
- Vue → recommend HeadlessUI (Vue) or Radix-Vue or custom; Step 2
- Svelte → recommend Melt UI / Bits UI or custom; Step 2
- Angular → recommend Angular Material or custom; Step 2
- Vanilla / multi-framework → custom only; Step 2

**Шаг 2/4:** What is the design priority axis?
- Speed-to-market + opinionated visual: MUI | Mantine
- Maximum control + tokens-first: shadcn/ui | Radix UI primitives
- Headless logic only, full visual control: HeadlessUI | Radix UI primitives
- Already chose a library externally (project has it installed): adapt it

**Шаг 3/4:** Confirm library: <chosen>

**Шаг 4/4:** Bridge depth — 3 tiers:
- A) Token-only bridge: re-theme library to consume our tokens. Library API stays default.
- B) Token + component-spec alignment: also map each baseline component (button/input/card/...) to the library's primitive.
- C) Full custom layer: build our components on the library's headless primitives, our spec drives API.

## Procedure

1. Branch on chosen library:
   - **MUI** → copy `templates/component-adapters/mui-token-bridge.ts.tpl` to `prototypes/_design-system/library-bridge/mui/theme.ts`. Fill palette/typography/spacing/shape/transitions from `tokens.css`.
   - **shadcn/ui** → copy `templates/component-adapters/shadcn-token-bridge.css.tpl` to `prototypes/_design-system/library-bridge/shadcn/globals.css`. Map shadcn CSS vars (`--background`, `--foreground`, `--primary`, etc.) to our tokens.
   - **Radix / HeadlessUI / Melt UI / Bits UI** → copy `templates/component-adapters/headless-ui-mapping.md.tpl` to `prototypes/_design-system/library-bridge/<lib>/mapping.md`. List which primitive backs each baseline component.
   - **Mantine** → similar to MUI; create `theme.ts` from Mantine's `MantineThemeOverride` shape filled with tokens.
   - **Custom** → no bridge needed; baseline component specs are the contract.

2. Write a `prototypes/_design-system/library-bridge/<library>/README.md` describing:
   - Why this library (link back to brandbook decision)
   - Bridge depth (A/B/C)
   - How to import in production stack
   - Migration path if library is later swapped

3. Update `prototypes/_design-system/manifest.json` with `componentLibrary: { name: "...", bridgeDepth: "...", bridgePath: "..." }`.

4. Print feedback prompt (mandatory):
   ```
   ✅ Утвердить — фиксирую bridge, продолжаю handoff
   ✎ Доработать — что поменять в маппинге?
   🔀 Альтернатива — построить bridge для другой библиотеки
   📊 Углублённый review — позвать code-reviewer на сгенерированный theme
   🛑 Стоп — оставить bridge как draft
   ```

## Output contract
- `prototypes/_design-system/library-bridge/<library>/` — bridge files
- `prototypes/_design-system/library-bridge/<library>/README.md` — rationale
- Updated `manifest.json`

```
Confidence: <N>.<dd>/10
Override: <true|false>
Rubric: framework
```

## Anti-patterns
- `library-without-bridge` — picking shadcn/MUI/Mantine and shipping with their default theme; project tokens become decoration.
- `silent-library-choice` — installing MUI/shadcn before asking the user about priority axis.
- `bridge-drift` — bridge files diverge from `tokens.css`; bridge must regenerate when tokens change. Add a TODO in README for regeneration trigger.
- `asking-multiple-questions-at-once`
- `advancing-without-feedback-prompt`

## Verification
- `cat prototypes/_design-system/library-bridge/<library>/README.md` shows: library name, bridge depth, link back to brandbook decision.
- `manifest.json` `componentLibrary.bridgePath` resolves to existing file.
- Token references in bridge file (grep for token names from `tokens.css`) — count must be > 0; bridge that doesn't reference any token is broken.

## Related
- `evolve:brandbook` — produces tokens this skill consumes
- `evolve:prototype-handoff` — consumes bridge as part of handoff bundle
- `agents/_design/creative-director.md` — invokes this skill when component-library decision branch fires
