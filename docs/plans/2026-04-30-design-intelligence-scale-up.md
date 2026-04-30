# Design Intelligence Scale-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `supervibe:subagent-driven-development` for implementation batches after plan review. Use `supervibe:verification` before every phase gate. Design-facing work must also use `supervibe:project-memory`, `supervibe:code-search`, and internal `supervibe:design-intelligence` lookup before producing artifacts.

**Goal:** Turn Supervibe design work into a retrieval-backed, memory-aware, trigger-routable design intelligence system that makes designer agents, prototype builders, presentation deck builders, reviewers, and downstream stack agents measurably smarter.

**Architecture:** Add a Node-only design intelligence data pack and internal lookup engine adapted from a pinned upstream design-intelligence source at commit `b7e3af8`, keep Supervibe's existing approval-driven `/supervibe-design` lifecycle as the orchestration source of truth, and connect design decisions to RAG, memory, trigger routing, rubrics, and evals. The data pack is advisory evidence, not an automatic designer; agents must cite retrieved rows, reconcile them with project memory and existing code, and write durable accepted or rejected decisions back into memory.

**Tech Stack:** Node.js 22+, existing Supervibe skills and agents, existing memory store, JSON or CSV source data, JSON Schema and Ajv, current trigger router and trigger corpus, current command and skill metadata linting, current plan and design validators.

**Release Target:** Ship this design intelligence scale-up as Supervibe `2.0.0`. Public prose may say `2.0`, and machine-readable versions, package metadata, plugin manifests, lockfile root versions, and changelog heading must use semver `2.0.0`. README install/update snippets keep the existing `main` URLs and unpinned plugin install examples unless the release operator explicitly chooses a strict `SUPERVIBE_REF`.

**Constraints:**
- No Python runtime requirement in the shipped plugin.
- No required external database, cloud service, browser service, or native dependency.
- No hidden design decisions: every style, palette, typography, motion, UX, chart, and component recommendation must cite its source or explicitly say no match was found.
- No bypass of the approved `prototypes/_design-system/` contract.
- No automatic rebrand when an approved design system exists.
- No raw license or provenance ambiguity for imported external data.
- No trigger phrase may exist only in body text; command and skill frontmatter must expose routeable design intents.
- No memory writeback for speculative options until the user or review gate marks a decision accepted, rejected, or learned.
- No new user-facing slash commands, package scripts, or standalone command wrappers. All behavior is exposed through existing `/supervibe-design`, `/supervibe-audit`, `/supervibe-strengthen`, `/supervibe`, and their current lifecycle.

---

## Source Basis

| Source | What to adapt | What to avoid |
| --- | --- | --- |
| Pinned upstream design-intelligence source at commit `b7e3af8` | CSV design knowledge base, canonical-source reconciliation across duplicated data trees, BM25 lookup, app-interface guidance, stack-specific UI guidance, slide decision CSVs, logo/icon/CIP collateral CSVs, priority checklists, token drift ideas, brand context and asset-validation ideas, brand-to-token sync heuristics, token generation/validation heuristics, shadcn/Tailwind setup guidance, brand references, design-system references, logo/icon/banner/social/slides/CIP guidance, base-template ideas, platform-template ideas, and CLI platform-detection lessons | Python dependency, whole-skill copy, noisy markdown, unreviewed automatic design-system generation, font binaries without explicit packaging approval, upstream plugin metadata, upstream CI, preview demos, screenshots, pycache, installer/update CLI behavior, generated coverage artifacts, or upstream slash-command surfaces as runtime dependencies |
| Existing `/supervibe-design` | Approved design lifecycle, target surfaces, prototype handoff, review loop | Rebuilding system-level colors or components per mockup |
| Existing memory store | FTS and semantic memory preflight over durable project knowledge | Adding isolated design memory that is not searched by existing memory tools |
| Existing trigger router | Intent corpus, safety blockers, bilingual continuation routing | Design requests falling back to generic planning or coding routes |
| Existing design agents | Role separation across creative direction, UX spec, prototype build, polish, accessibility, mobile, desktop, extension surfaces | Letting a single broad design skill override specialist responsibilities |

---

## Target Design Intelligence Flow

1. User asks for design, UI review, style selection, design-system extension, mobile UI, chart UX, or prototype work.
2. Trigger router maps request to existing `/supervibe-design`, `/supervibe-audit`, `/supervibe-strengthen`, or `/supervibe` routes. Internal `supervibe:design-intelligence` lookup is never exposed as a new slash command.
3. The selected design agent runs a design context preflight:
   - project memory search for prior accepted and rejected decisions
   - code search for existing tokens, components, routes, prototypes, and brand artifacts
   - design intelligence lookup for product, style, color, typography, UX, chart, icon, landing, slides, brand/collateral, and stack guidance
   - optional Figma, browser, Firecrawl, or image sources when available
4. Agent output includes a `Design Intelligence Evidence` section with source ids, scores, and conflict notes.
5. Approved decisions are written to existing memory categories with design tags and linked artifact paths.
6. Review agents validate token compliance, UX priority rules, accessibility, trigger coverage, and memory writeback evidence.

---

## File Structure

Create:
- `skills/design-intelligence/SKILL.md` - retrieval workflow and output contract for design knowledge lookup.
- `skills/design-intelligence/data/manifest.json` - source, license, version, checksum, and domain metadata.
- `skills/design-intelligence/data/*.csv` - normalized design knowledge tables.
- `skills/design-intelligence/data/stacks/*.csv` - normalized stack-specific guidance.
- `skills/design-intelligence/data/slides/*.csv` - normalized slide strategy, layout, copy, chart, typography, color, and background guidance.
- `skills/design-intelligence/data/collateral/*.csv` - normalized logo, icon, CIP, banner, and social asset guidance.
- `scripts/lib/design-intelligence-search.mjs` - Node BM25, domain lookup, and advisory recommendation composer.
- `scripts/lib/design-context-preflight.mjs` - project memory, code search, and design lookup aggregator.
- `scripts/lib/design-memory-writer.mjs` - accepted, rejected, and learned design decision writeback helper.
- `scripts/lib/design-brand-asset-auditor.mjs` - internal brand context, asset naming/format/size, palette comparison, and brand-to-token sync checks.
- `skills/design-intelligence/references/*.md` - curated, normalized reference cards for brand, design-system, shadcn/Tailwind, asset, slide, collateral, and professional UI priority guidance.
- `schemas/design-intelligence-result.schema.json` - lookup result contract.
- `schemas/design-recommendation.schema.json` - composed design recommendation contract for pattern, style, colors, typography, effects, anti-patterns, decision rules, and checklist items.
- `schemas/design-memory-entry.schema.json` - design memory writeback contract.
- `schemas/design-brand-asset-audit.schema.json` - brand asset and brand-to-token compliance result contract.
- `schemas/design-upstream-coverage.schema.json` - external-source coverage and skip-rationale contract.
- `confidence-rubrics/design-intelligence.yaml` - retrieval and synthesis quality gate.
- `tests/design-intelligence-search.test.mjs` - search and ranking tests.
- `tests/design-context-preflight.test.mjs` - RAG aggregation tests.
- `tests/design-memory-writer.test.mjs` - memory writeback tests.
- `tests/design-trigger-router.test.mjs` - design trigger routing tests.
- `tests/design-agent-integration.test.mjs` - agent metadata and evidence contract tests.
- `tests/design-quality-gates.test.mjs` - rubric and validator coverage.
- `tests/design-upstream-coverage.test.mjs` - upstream coverage and no-new-command guard tests.
- `tests/design-agent-cognitive-regression.test.mjs` - agent role-boundary and decision-quality anti-regression tests.
- `docs/design-intelligence.md` - user and contributor documentation.
- `docs/third-party-design-intelligence.md` - provenance and license notes.
- `docs/design-intelligence-upstream-coverage.md` - matrix of adapted, skipped, and deferred upstream assets.

Modify:
- `commands/supervibe-design.md`
- `commands/supervibe.md`
- `commands/supervibe-audit.md`
- `commands/supervibe-strengthen.md`
- `skills/brandbook/SKILL.md`
- `skills/prototype/SKILL.md`
- `skills/landing-page/SKILL.md`
- `skills/presentation-deck/SKILL.md`
- `skills/interaction-design-patterns/SKILL.md`
- `skills/component-library-integration/SKILL.md`
- `skills/browser-feedback/SKILL.md`
- `skills/tokens-export/SKILL.md`
- `agents/_design/creative-director.md`
- `agents/_design/ux-ui-designer.md`
- `agents/_design/ui-polish-reviewer.md`
- `agents/_design/accessibility-reviewer.md`
- `agents/_design/mobile-ui-designer.md`
- `agents/_design/prototype-builder.md`
- `agents/_design/presentation-deck-builder.md`
- `agents/_design/presentation-director.md`
- `agents/_design/extension-ui-designer.md`
- `agents/_design/electron-ui-designer.md`
- `agents/_design/tauri-ui-designer.md`
- `agents/_product/seo-specialist.md`
- `scripts/lib/supervibe-trigger-router.mjs`
- `scripts/lib/supervibe-trigger-intent-corpus.mjs`
- `scripts/lib/supervibe-workflow-router.mjs`
- `scripts/validate-design-skills.mjs`
- `scripts/validate-trigger-metadata.mjs`
- `package.json` for target version `2.0.0` and existing test/package metadata only; no new scripts or command aliases.
- `package-lock.json` for root package version `2.0.0` sync only.
- `README.md`
- `CHANGELOG.md`
- `.codex-plugin/plugin.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `.cursor-plugin/plugin.json`
- `gemini-extension.json`
- `.opencode/plugins/supervibe.js`
- `registry.yaml`

Test:
- `tests/*.test.mjs`
- `npm run validate:design-skills`
- `npm run validate:trigger-metadata`
- `npm run validate:plan-artifacts`
- `npm test`
- `npm run check`

---

## Critical Path

Critical path: T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T11 -> T15 -> T16 -> T17 -> T13 -> T14.

Parallel and off-path candidates:
- T9 can run after T4 and in parallel with T6, but must finish before T17.
- T10 can run after T3 and in parallel with T5, but must finish before T11.
- T12 can run after T8 and in parallel with T11, but must finish before T17 and final docs.
- T15 can start after T2 but final coverage assertions wait for T11.
- T16 starts after T8 because it verifies route integration and no-new-command behavior.
- Documentation portions of T13 can run after T6, but final docs wait for T11, T12, T15, T16, and T17.
- T17 runs before documentation and release so T13 and T14 include the final agent-cognitive guard.

---

## Phase Gates

### REVIEW GATE 1 after T4
- [ ] Data pack has provenance, checksums, and normalized schemas.
- [ ] Normalized data preserves upstream search/output field intent, including accessibility, code examples, docs URLs, implementation checklists, design-system variables, and do-not-use guidance.
- [ ] Search engine works without Python.
- [ ] Lookup output has row ids and citation-friendly metadata.
- [ ] Tests for search pass.

### REVIEW GATE 2 after T8
- [ ] Trigger routing selects design intents reliably.
- [ ] Design agents require memory plus design lookup before artifacts.
- [ ] Design context preflight returns memory, code, lookup, and conflict sections.
- [ ] No trigger phrase exists only in body text.

### REVIEW GATE 3 after T11 and T12
- [ ] Rubrics and validators block uncited or token-bypassing design output.
- [ ] Evals cover fresh design, existing design-system reuse, UI review, mobile UI, and chart UX.
- [ ] Memory writeback stores accepted and rejected decisions with evidence links.
- [ ] Slide/deck guidance uses retrieved slide strategy, layout, copy, chart, typography, color, and token evidence instead of generic presentation advice.
- [ ] Stack-aware handoff preserves design tokens, responsive constraints, accessibility requirements, and cited lookup evidence.

### REVIEW GATE 4 after T17, before T13 and T14
- [ ] Upstream coverage matrix proves every useful upstream asset is adapted, intentionally skipped, or deferred with rationale.
- [ ] No new slash command, package script, or standalone command wrapper is introduced.
- [ ] Agent cognitive regression tests prove design lookup makes agents more grounded without overriding role boundaries.
- [ ] Existing `/supervibe-design`, `/supervibe-audit`, `/supervibe-strengthen`, and `/supervibe` routes remain the only user-facing surfaces for the update.

---

## Task T1: Data Provenance And Import Contract

**Files:**
- Create: `docs/third-party-design-intelligence.md`
- Create: `skills/design-intelligence/data/manifest.json`
- Modify: `docs/third-party-licenses.md`
- Test: `tests/design-intelligence-search.test.mjs`

**Estimated time:** 1h, confidence: high.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Imported data may create license ambiguity; mitigation: record commit, upstream URL, license, adapted fields, and checksums before copying data.
- R2: Large data files may bloat plugin packaging; mitigation: measure package size before release and keep only normalized fields used by agents.
- R3: Upstream README badges and prose counts can lag actual CSV contents; mitigation: manifest counts are generated from files at the pinned commit, not copied from README claims.
- R4: The upstream package has duplicated `src`, packaged-asset, and skill data trees that can drift; mitigation: record which tree is canonical for every imported file, compare duplicates by checksum, and import the canonical source only.

- [ ] **Step 1:** Write a failing test that expects `skills/design-intelligence/data/manifest.json` to exist and include `sourceRepository`, `sourceCommit`, `license`, `domains`, and `checksums`.
- [ ] **Step 2:** Create the provenance document describing adapted assets from the upstream repository and the decision to port runtime code to Node.
- [ ] **Step 3:** Create the manifest with domain names, source commit `b7e3af8`, license `MIT`, source URL, canonical source tree per domain, duplicate-source checksum comparison, and checksum placeholders generated by the implementation task.
- [ ] **Step 4:** Update third-party license docs to include the upstream repository and adaptation notes.
- [ ] **Step 5:** Commit: `git add docs/third-party-design-intelligence.md docs/third-party-licenses.md skills/design-intelligence/data/manifest.json tests/design-intelligence-search.test.mjs && git commit -m "docs: add design intelligence provenance"`

**Failing test first:** The first test must fail before the manifest and provenance files exist.

**Verification:**
```powershell
node --test tests/design-intelligence-search.test.mjs
```
Expected output: the provenance and manifest assertions pass.

---

## Task T2: Normalize Design Knowledge Data Pack

**Files:**
- Create: `skills/design-intelligence/data/*.csv`
- Create: `skills/design-intelligence/data/stacks/*.csv`
- Create: `skills/design-intelligence/data/slides/*.csv`
- Create: `skills/design-intelligence/data/collateral/*.csv`
- Modify: `skills/design-intelligence/data/manifest.json`
- Test: `tests/design-intelligence-search.test.mjs`

**Estimated time:** half-day, confidence: medium.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Upstream CSV headers may be inconsistent or multilingual; mitigation: normalize headers and keep original source field names in manifest metadata.
- R2: Over-importing low-signal tables may make lookup noisy; mitigation: import the high-signal domains first and park low-confidence domains behind manifest status `experimental`.
- R3: Normalization can drop the strongest upstream fields and make agents less useful; mitigation: manifest records per-domain `searchFields`, `displayFields`, `criticalFields`, and `excludedFields` with explicit rationale.
- R4: Slide decision tables can be treated as generic deck copy instead of design evidence; mitigation: normalize them as a dedicated `slides` domain with contextual fields and route only to presentation/deck work.
- R5: Logo/icon/CIP data can encourage generic brand assets detached from the approved brand; mitigation: route collateral data as inspiration and audit evidence only, with approved brandbook and memory taking precedence.
- R6: Duplicate upstream CSV copies differ for `app-interface`, `colors`, `icons`, and `landing`; mitigation: compare `src`, packaged assets, and skill-linked files, prefer the documented source-of-truth tree, and record any divergence in the manifest before normalization.
- R7: Some upstream CSVs use non-uniform ids or missing `No` columns; mitigation: generate stable normalized ids from source path, row index, and primary label rather than relying on a single header.

- [ ] **Step 1:** Extend the failing test to assert expected core domains: `product`, `style`, `color`, `typography`, `ux`, `chart`, `icons`, `google-fonts`, `landing`, `app-interface`, `react-performance`, `stack`, `slides`, and `collateral`.
- [ ] **Step 1a:** Add a failing duplicate-source test that compares the upstream source tree, packaged asset tree, and skill-linked tree for every imported CSV, records checksum differences, and proves the importer selected the documented canonical source.
- [ ] **Step 2:** Copy and normalize high-signal CSVs from the upstream repository into `skills/design-intelligence/data/` while preserving useful upstream output intent: style `Do Not Use For`, `Mobile-Friendly`, `Conversion-Focused`, `Implementation Checklist`, `Design System Variables`; landing `Recommended Effects`; app-interface platform guidance, `Do`, `Don't`, severity, and code examples; chart accessibility and fallback fields; UX/web/react code examples; stack `Code Good`, `Code Bad`, `Severity`, and `Docs URL`; typography import/config fields; icon import/usage fields; google-fonts ranking and variable-axis fields.
- [ ] **Step 3:** Copy stack CSVs into `skills/design-intelligence/data/stacks/` with stable stack ids and normalized stack-family aliases such as `next.js` -> `nextjs`, `react native` -> `react-native`, and `tailwind` -> `html-tailwind` or `shadcn` based on context.
- [ ] **Step 3a:** Copy and normalize slide decision CSVs into `skills/design-intelligence/data/slides/`: strategies, layouts, layout logic, typography, color logic, backgrounds, copy formulas, and slide charts; preserve fields for narrative arc, emotion arc, sparkline beats, visual weight, CTA placement, Chart.js guidance, accessibility notes, token requirements, image search keywords, and avoid-for guidance.
- [ ] **Step 3b:** Copy and normalize collateral CSVs into `skills/design-intelligence/data/collateral/`: logo colors, logo industries, logo styles, icon styles, CIP deliverables, CIP industries, CIP mockup contexts, and CIP styles; preserve fields for industry fit, style constraints, output format, sizing/context guidance, prompt cues, and brand-approval caveats.
- [ ] **Step 4:** Add per-file row counts, checksums, canonical source tree, duplicate-source comparison, generated id strategy, `searchFields`, `displayFields`, `criticalFields`, and `excludedFields` to the manifest, including experimental status for low-signal `design.csv` and `draft.csv` rather than importing them into default lookup.
- [ ] **Step 5:** Add tests that fail if any critical upstream field is silently dropped or if normalized fields cannot be traced back to original source headers.
- [ ] **Step 6:** Commit: `git add skills/design-intelligence/data tests/design-intelligence-search.test.mjs && git commit -m "feat: add design intelligence data pack"`

**Failing test first:** The domain coverage test must fail before the CSV files are present.

**Verification:**
```powershell
node --test tests/design-intelligence-search.test.mjs
```
Expected output: all required domains are present, row counts match the manifest, critical fields are preserved, and skipped fields have explicit rationale.

---

## Task T3: Node BM25 Design Search Engine

**Files:**
- Create: `scripts/lib/design-intelligence-search.mjs`
- Create: `schemas/design-intelligence-result.schema.json`
- Create: `schemas/design-recommendation.schema.json`
- Test: `tests/design-intelligence-search.test.mjs`

**Estimated time:** half-day, confidence: high.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Search ranking may differ from upstream Python output; mitigation: test stable behavior by semantic intent, domain, row id, and score ordering rather than byte-for-byte output.
- R2: Lookup output may be too verbose for agents; mitigation: provide compact internal JSON and markdown formatter functions with max result limits.
- R3: Implementation may accidentally add a new user-facing command; mitigation: tests assert no new slash command, package script, or standalone command wrapper is added.
- R4: Upstream design-system generation can look authoritative even when it is only a generic recommendation; mitigation: expose it as an advisory composer whose output must be approved through `/supervibe-design` and reconciled with project memory.

- [ ] **Step 1:** Write failing tests for domain search, stack search, slide search, contextual deck recommendation, auto-domain detection, advisory recommendation composition, JSON schema validation, and no-Python execution.
- [ ] **Step 2:** Implement tokenizer, BM25 scorer, CSV loader, domain registry, stack registry, and compact result formatter in Node.
- [ ] **Step 3:** Port the useful upstream reasoning composer as internal library behavior: product lookup, `ui-reasoning.csv` rule match, style-priority weighting, landing/color/typography selection, key effects, anti-patterns, parsed decision rules, severity, and a pre-delivery checklist.
- [ ] **Step 4:** Implement internal API options equivalent to upstream CLI behavior: `domain`, `stack`, `maxResults`, `format`, `designSystemSummary`, and `slideContext`, exposed only as library functions consumed by existing commands and agents.
- [ ] **Step 5:** Map upstream Master + Overrides persistence to Supervibe's existing approved design-system contract: global recommendations can inform `prototypes/_design-system/`, page-specific overrides can inform `prototypes/_design-system/extensions/`, but neither writes approved artifacts without the existing approval gates.
- [ ] **Step 6:** Add no-new-command assertions proving no `commands/*.md`, package script, or standalone wrapper was added by this task.
- [ ] **Step 7:** Commit: `git add scripts/lib/design-intelligence-search.mjs schemas/design-intelligence-result.schema.json schemas/design-recommendation.schema.json tests/design-intelligence-search.test.mjs && git commit -m "feat: add internal design intelligence search"`

**Failing test first:** Search tests must fail with module-not-found before the engine exists.

**Verification:**
```powershell
node --test tests/design-intelligence-search.test.mjs
```
Expected output: search, stack lookup, advisory design-system summary, reasoning composer schema tests, Master + Overrides mapping tests, and no-new-command assertions pass.

---

## Task T4: Design Intelligence Skill And Agent Lookup Contract

**Files:**
- Create: `skills/design-intelligence/SKILL.md`
- Modify: `scripts/validate-design-skills.mjs`
- Test: `tests/design-agent-integration.test.mjs`

**Estimated time:** 1h, confidence: high.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: New skill may become another broad design persona; mitigation: define it as lookup and synthesis support only, not as owner of brand, IA, prototype, or review.
- R2: Agents may skip citations; mitigation: validator requires `Design Intelligence Evidence` in relevant agent outputs or specs.
- R3: A composed recommendation can hide weak source matches; mitigation: evidence must expose per-domain match status, missing domains, and whether anti-patterns or checklist items came from retrieved rules or fallback defaults.
- R4: Upstream quick-reference guidance mixes app, mobile, and web assumptions; mitigation: every retrieved rule carries `platformScope` and agents must not apply mobile-only or app-only rules to desktop web without an explicit rationale.

- [ ] **Step 1:** Write a failing test that the internal support skill exists, exposes routeable frontmatter for agent selection, lists lookup calls, and defines an evidence output contract.
- [ ] **Step 2:** Create the skill with required preflight order: memory, code search, design lookup, optional external reference scan.
- [ ] **Step 3:** Define the evidence block fields: query, domain, row id, score, recommendation, conflict, accepted status, composed pattern, key effects, anti-patterns, decision rules, pre-delivery checklist, `platformScope`, `applicabilityScope`, priority rank, and fallback reason.
- [ ] **Step 4:** Extend design skill validation to know the new skill and its required anti-patterns.
- [ ] **Step 5:** Commit: `git add skills/design-intelligence/SKILL.md scripts/validate-design-skills.mjs tests/design-agent-integration.test.mjs && git commit -m "feat: add internal design intelligence skill"`

**Failing test first:** The skill integration test must fail before `skills/design-intelligence/SKILL.md` exists.

**Verification:**
```powershell
node --test tests/design-agent-integration.test.mjs
npm run validate:design-skills
```
Expected output: the new skill and validator requirements pass.

---

## Task T5: Design Context Preflight For RAG

**Files:**
- Create: `scripts/lib/design-context-preflight.mjs`
- Create: `schemas/design-context-preflight.schema.json`
- Modify: `skills/design-intelligence/SKILL.md`
- Test: `tests/design-context-preflight.test.mjs`

**Estimated time:** half-day, confidence: medium.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Preflight can become noisy by mixing memory, code, and design data; mitigation: cap each source and return conflicts separately from recommendations.
- R2: Semantic memory may be unavailable in minimal installs; mitigation: gracefully fall back to FTS or file scan, matching existing memory-preflight behavior.

- [ ] **Step 1:** Write failing tests for a combined preflight result with `memory`, `code`, `designLookup`, `conflicts`, `missingSources`, and `recommendedNextQueries`.
- [ ] **Step 2:** Implement an aggregator that calls existing memory preflight, existing code search interfaces, and the new design search engine.
- [ ] **Step 3:** Add query plans for common design intents: new surface, design-system extension, UI review, mobile flow, chart UX, component polish, presentation deck, brand/collateral asset, and stack-specific shadcn/Tailwind implementation handoff.
- [ ] **Step 4:** Update the skill to require this preflight before any design artifact.
- [ ] **Step 5:** Commit: `git add scripts/lib/design-context-preflight.mjs schemas/design-context-preflight.schema.json skills/design-intelligence/SKILL.md tests/design-context-preflight.test.mjs && git commit -m "feat: add design context preflight"`

**Failing test first:** The preflight test must fail before the aggregator module exists.

**Verification:**
```powershell
node --test tests/design-context-preflight.test.mjs
```
Expected output: preflight aggregation and fallback behavior pass.

---

## Task T6: Design Memory Writeback And Retrieval Taxonomy

**Files:**
- Create: `scripts/lib/design-memory-writer.mjs`
- Create: `schemas/design-memory-entry.schema.json`
- Modify: `skills/project-memory/SKILL.md`
- Modify: `scripts/lib/memory-store.mjs`
- Test: `tests/design-memory-writer.test.mjs`

**Estimated time:** half-day, confidence: medium.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Memory can be polluted with rejected drafts; mitigation: store rejected options only when they have explicit rejection rationale and artifact links.
- R2: Design memory taxonomy may diverge from existing categories; mitigation: use existing memory categories with tags such as `design`, `brand`, `ux`, `a11y`, `tokens`, `prototype`, and `rejected`.

- [ ] **Step 1:** Write failing tests for accepted decision, rejected alternative, review finding, and learned pattern memory entries.
- [ ] **Step 2:** Implement a writer that emits markdown memory entries into existing categories with frontmatter tags and confidence.
- [ ] **Step 3:** Add retrieval helpers for design tags without adding a disconnected memory root.
- [ ] **Step 4:** Update project-memory skill docs with the design memory taxonomy and writeback rules.
- [ ] **Step 5:** Commit: `git add scripts/lib/design-memory-writer.mjs schemas/design-memory-entry.schema.json skills/project-memory/SKILL.md scripts/lib/memory-store.mjs tests/design-memory-writer.test.mjs && git commit -m "feat: add design memory writeback"`

**Failing test first:** Memory writer tests must fail before the writer module exists.

**Verification:**
```powershell
node --test tests/design-memory-writer.test.mjs
```
Expected output: writeback entries validate and are searchable by design tags.

---

## Task T7: Design Trigger Intent Corpus

**Files:**
- Modify: `scripts/lib/supervibe-trigger-intent-corpus.mjs`
- Modify: `scripts/lib/supervibe-trigger-router.mjs`
- Modify: `scripts/lib/supervibe-workflow-router.mjs`
- Create: `tests/design-trigger-router.test.mjs`
- Test: `tests/design-trigger-router.test.mjs`

**Estimated time:** half-day, confidence: medium.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Design triggers may steal generic feature requests; mitigation: require visual-surface or UI-quality terms unless prior context says design phase.
- R2: Russian trigger coverage can miss natural phrases; mitigation: add bilingual fixtures and diagnostics alternatives.
- R3: Internal lookup routes may look like new commands; mitigation: every design lookup intent resolves to existing `/supervibe-design`, `/supervibe-audit`, `/supervibe-strengthen`, or `/supervibe` commands.

- [ ] **Step 1:** Write failing trigger tests for Russian and English design intents: new design, UI review, style recommendation, design-system extension, mobile UI, chart UX, presentation deck, brand/collateral asset, shadcn/Tailwind implementation guidance, and "make it professional".
- [ ] **Step 2:** Add route ids for `design_surface`, `design_review`, `design_system_extension`, `design_lookup`, `mobile_design`, `chart_design`, `presentation_design`, `asset_collateral_design`, and `stack_ui_guidance`, all mapped to existing commands and specialist agents.
- [ ] **Step 3:** Add artifact prerequisites and safety blockers for write-producing design routes.
- [ ] **Step 4:** Ensure diagnostics explain when a request routes to `/supervibe-design` versus `/supervibe-plan`.
- [ ] **Step 5:** Commit: `git add scripts/lib/supervibe-trigger-intent-corpus.mjs scripts/lib/supervibe-trigger-router.mjs scripts/lib/supervibe-workflow-router.mjs tests/design-trigger-router.test.mjs && git commit -m "feat: add design trigger routing"`

**Failing test first:** Trigger tests must fail before the new design routes exist.

**Verification:**
```powershell
node --test tests/design-trigger-router.test.mjs tests/supervibe-trigger-router.test.mjs tests/supervibe-trigger-intent-corpus.test.mjs
```
Expected output: existing workflow routes and new design routes pass together.

---

## Task T8: Command And Skill Frontmatter For Design Routes

**Files:**
- Modify: `commands/supervibe-design.md`
- Modify: `commands/supervibe.md`
- Modify: `commands/supervibe-audit.md`
- Modify: `skills/brandbook/SKILL.md`
- Modify: `skills/prototype/SKILL.md`
- Modify: `skills/landing-page/SKILL.md`
- Modify: `skills/component-library-integration/SKILL.md`
- Modify: `skills/browser-feedback/SKILL.md`
- Modify: `skills/presentation-deck/SKILL.md`
- Test: `tests/design-agent-integration.test.mjs`

**Estimated time:** 1h, confidence: high.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Metadata drift can make auto-routing unreliable; mitigation: metadata linter checks command, skill, README, manifest, and registry route claims.
- R2: Frontmatter can become too long; mitigation: compact descriptions with routeable phrases and keep details in body sections.

- [ ] **Step 1:** Write a failing metadata test that design route phrases appear in command and skill frontmatter, not only in bodies.
- [ ] **Step 2:** Update command frontmatter for `/supervibe-design`, `/supervibe`, and audit flows.
- [ ] **Step 3:** Update design-adjacent skill frontmatter to mention design intelligence, memory preflight, RAG, review triggers, presentation/deck triggers, collateral triggers, and stack-specific UI implementation guidance.
- [ ] **Step 3a:** Update `skills/presentation-deck/SKILL.md` frontmatter and body so deck work invokes slide-domain lookup, approved brand/design tokens, memory preflight, and deck-specific evidence through existing `/supervibe-design` flow only.
- [ ] **Step 4:** Run trigger metadata linter and fix all design route drift.
- [ ] **Step 5:** Commit: `git add commands skills tests/design-agent-integration.test.mjs && git commit -m "feat: expose design intelligence triggers"`

**Failing test first:** The metadata test must fail before frontmatter contains design route phrases.

**Verification:**
```powershell
node --test tests/design-agent-integration.test.mjs
npm run validate:trigger-metadata
```
Expected output: route metadata is consistent and lint passes.

---

## Task T9: Designer Agent Evidence Contracts

**Files:**
- Modify: `agents/_design/creative-director.md`
- Modify: `agents/_design/ux-ui-designer.md`
- Modify: `agents/_design/ui-polish-reviewer.md`
- Modify: `agents/_design/accessibility-reviewer.md`
- Modify: `agents/_design/mobile-ui-designer.md`
- Modify: `agents/_design/prototype-builder.md`
- Modify: `agents/_design/presentation-deck-builder.md`
- Modify: `agents/_design/presentation-director.md`
- Modify: `agents/_design/extension-ui-designer.md`
- Modify: `agents/_design/electron-ui-designer.md`
- Modify: `agents/_design/tauri-ui-designer.md`
- Test: `tests/design-agent-integration.test.mjs`

**Estimated time:** half-day, confidence: high.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Agent instructions may become repetitive; mitigation: use a common evidence contract and only add role-specific lookup domains.
- R2: Review agents may over-block on advisory data; mitigation: evidence gates require cited reasoning, not blind adherence to retrieved rows.

- [ ] **Step 1:** Write failing tests that each design agent lists `supervibe:design-intelligence` and requires a `Design Intelligence Evidence` section when producing design artifacts.
- [ ] **Step 2:** Add role-specific domain usage to each agent: creative direction uses product, style, color, typography, brand, and collateral references; UX uses product, ux, landing, chart, and navigation/forms priority rules; polish uses ux, style, stack, token drift, and component-state rules; accessibility uses ux, app-interface, chart, and stack accessibility fields; mobile uses app-interface plus mobile stacks and platform scope; prototype-builder uses style, component, token, and stack evidence; presentation-director uses slides, narrative strategy, copy formulas, emotion arc, brand, and memory evidence; presentation-deck-builder uses slides, chart, typography, color, copy, token, and brand evidence; extension/electron/tauri designers use stack, platformScope, desktop constraints, and approved design-system extensions.
- [ ] **Step 3:** Add conflict handling rules: project memory beats generic data, approved design system beats lookup suggestions, accessibility beats visual novelty.
- [ ] **Step 4:** Add memory writeback rules for accepted and rejected design decisions.
- [ ] **Step 5:** Commit: `git add agents/_design tests/design-agent-integration.test.mjs && git commit -m "feat: require design evidence in designer agents"`

**Failing test first:** Agent integration tests must fail before the evidence contract appears in agent files.

**Verification:**
```powershell
node --test tests/design-agent-integration.test.mjs
```
Expected output: all design agents expose the new skill and evidence contract.

---

## Task T10: Design System And Token Drift Gates

**Files:**
- Create: `scripts/lib/design-token-drift-auditor.mjs`
- Create: `scripts/lib/design-brand-asset-auditor.mjs`
- Create: `schemas/design-brand-asset-audit.schema.json`
- Modify: `skills/brandbook/SKILL.md`
- Modify: `skills/tokens-export/SKILL.md`
- Modify: `skills/prototype/SKILL.md`
- Test: `tests/design-quality-gates.test.mjs`

**Estimated time:** half-day, confidence: medium.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Token drift scanner can flag legitimate token definitions; mitigation: ignore token source files and allow documented exceptions.
- R2: Over-strict scanning can slow prototype iteration; mitigation: run as review gate and allow draft warnings before approval.
- R3: A standalone scanner command can violate the no-new-command rule; mitigation: expose the scanner only through existing validators and skill procedures.
- R4: Brand automation heuristics can overwrite approved tokens or brand docs; mitigation: auditors report drift and suggested sync patches but never mutate brand or token files without the existing approval flow.

- [ ] **Step 1:** Write failing tests for raw hex, off-scale spacing, raw cubic-bezier, component token bypass detection, brand asset naming/format/size checks, palette extraction/comparison, and brand-to-token sync drift.
- [ ] **Step 2:** Implement a Node scanner for CSS, HTML, JS, TS, JSX, TSX, Vue, and Svelte files.
- [ ] **Step 3:** Add allowed-source configuration for `prototypes/_design-system/` and framework token files.
- [ ] **Step 3a:** Adapt the useful brand and token script behavior into internal Node libraries: brand context extraction, asset validation, palette extraction/comparison, brand-to-token sync verification, token generation checks, token embedding checks, and token usage validation.
- [ ] **Step 4:** Update brandbook, prototype, and tokens-export skills to require these audits before approval or export.
- [ ] **Step 5:** Commit: `git add scripts/lib/design-token-drift-auditor.mjs scripts/lib/design-brand-asset-auditor.mjs schemas/design-brand-asset-audit.schema.json skills/brandbook/SKILL.md skills/tokens-export/SKILL.md skills/prototype/SKILL.md tests/design-quality-gates.test.mjs && git commit -m "feat: add design token and brand asset audits"`

**Failing test first:** Drift gate tests must fail before the auditor module exists.

**Verification:**
```powershell
node --test tests/design-quality-gates.test.mjs
```
Expected output: token drift, brand asset, palette, and brand-to-token sync fixtures produce expected pass and fail results.

---

## Task T11: Design Quality Rubrics And Validators

**Files:**
- Create: `confidence-rubrics/design-intelligence.yaml`
- Modify: `confidence-rubrics/prototype.yaml`
- Modify: `confidence-rubrics/brandbook.yaml`
- Modify: `scripts/validate-design-skills.mjs`
- Create: `tests/design-quality-gates.test.mjs`
- Test: `tests/design-quality-gates.test.mjs`

**Estimated time:** 1h, confidence: high.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Rubrics can duplicate existing accessibility and prototype criteria; mitigation: limit new rubric to retrieval evidence, conflict handling, memory use, and token compliance.
- R2: Agents may game confidence scores with generic citations; mitigation: require source id, relevance explanation, and conflict outcome.

- [ ] **Step 1:** Write failing tests for missing evidence, missing memory preflight, no conflict handling, no token audit, missing anti-pattern review, missing pre-delivery checklist, and uncited design-system extension.
- [ ] **Step 2:** Add design intelligence rubric criteria for source quality, relevance, synthesis, anti-pattern handling, checklist completion, memory integration, and verification.
- [ ] **Step 3:** Extend prototype and brandbook rubrics to require design lookup evidence for new systems and extension requests.
- [ ] **Step 4:** Update validators to flag missing evidence markers in design skill output contracts.
- [ ] **Step 5:** Commit: `git add confidence-rubrics scripts/validate-design-skills.mjs tests/design-quality-gates.test.mjs && git commit -m "feat: add design intelligence quality gates"`

**Failing test first:** Quality gate tests must fail before the rubric and validator changes exist.

**Verification:**
```powershell
node --test tests/design-quality-gates.test.mjs
npm run validate:design-skills
```
Expected output: design quality gates block uncited design output and pass compliant fixtures.

---

## Task T12: Stack-Aware Design Handoff

**Files:**
- Modify: `commands/supervibe-design.md`
- Modify: `skills/tokens-export/SKILL.md`
- Modify: `skills/component-library-integration/SKILL.md`
- Modify: `agents/stacks/nextjs/nextjs-developer.md`
- Modify: `agents/stacks/react/react-implementer.md`
- Modify: `agents/stacks/vue/vue-implementer.md`
- Modify: `agents/stacks/flutter/flutter-developer.md`
- Modify: `agents/stacks/ios/ios-developer.md`
- Modify: `agents/stacks/android/android-developer.md`
- Test: `tests/design-agent-integration.test.mjs`

**Estimated time:** half-day, confidence: medium.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Stack agents may treat generic design hints as implementation law; mitigation: hints are evidence, and local codebase patterns remain authoritative.
- R2: Stack coverage can be uneven; mitigation: mark missing stack data as `not available` instead of inventing guidance.
- R3: shadcn/Tailwind guidance can become unauthorized dependency installation; mitigation: recommend component-library actions only when the stack already uses them or the user approves the dependency.

- [ ] **Step 1:** Write failing tests that handoff bundles can include stack-specific design intelligence references.
- [ ] **Step 2:** Extend the design handoff contract with `stack-guidance.json` generated from design intelligence stack lookup.
- [ ] **Step 3:** Add component-library guidance for shadcn/Tailwind/Radix-style patterns as evidence in the handoff, including setup prerequisites, accessibility expectations, theme-token mapping, and "do not install unless approved or already present" guardrails.
- [ ] **Step 4:** Update stack agents to read `handoff/stack-guidance.json` when present.
- [ ] **Step 5:** Add fallback wording for stacks without data.
- [ ] **Step 6:** Commit: `git add commands/supervibe-design.md skills/tokens-export/SKILL.md skills/component-library-integration/SKILL.md agents/stacks tests/design-agent-integration.test.mjs && git commit -m "feat: add stack-aware design handoff"`

**Failing test first:** Handoff tests must fail before `stack-guidance.json` is documented and consumed.

**Verification:**
```powershell
node --test tests/design-agent-integration.test.mjs
```
Expected output: stack handoff contract is recognized by target stack agents.

---

## Task T13: Design Intelligence Documentation And Public Metadata

**Files:**
- Create: `docs/design-intelligence.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.codex-plugin/plugin.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `.cursor-plugin/plugin.json`
- Modify: `gemini-extension.json`
- Modify: `.opencode/plugins/supervibe.js`
- Modify: `registry.yaml`
- Test: `tests/command-surface.test.mjs`
- Test: `tests/version-surface-sync.test.mjs`

**Estimated time:** 1h, confidence: high.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Public docs may promise implemented behavior too early; mitigation: mark enhanced existing routes as available only after tests and validators pass.
- R2: Plugin manifests may drift across surfaces; mitigation: package audit and command surface tests must include design intelligence capability claims.
- R3: README install/update snippets, package versions, lockfile versions, marketplace metadata, and platform plugin versions may diverge or stay on a prior release; mitigation: add a version surface sync test covering every release-facing file and requiring target `2.0.0` before publishing.

- [ ] **Step 1:** Write failing tests that public metadata mentions design intelligence consistently across plugin surfaces and that every release-facing version surface resolves to target `2.0.0`.
- [ ] **Step 2:** Document design lookup, RAG preflight, memory writeback, trigger examples, and review gates.
- [ ] **Step 3:** Update README examples with Russian and English design trigger phrases that invoke existing `/supervibe-design`, `/supervibe-audit`, `/supervibe-strengthen`, or `/supervibe` flows only.
- [ ] **Step 4:** Update README release-facing text: displayed version must be `2.0`, install/update snippets must keep the existing `main` URLs and unpinned marketplace/Gemini/OpenCode examples, feature summary must describe design intelligence as the shipped 2.0 capability, and examples must not add new command names.
- [ ] **Step 5:** Apply release version `2.0.0` consistently across `package.json`, `package-lock.json`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json`, `gemini-extension.json`, `.opencode/plugins/supervibe.js`, and any registry capability metadata that carries a version.
- [ ] **Step 6:** Update `CHANGELOG.md` with a `[2.0.0] - 2026-04-30` release section for the design intelligence update; keep `[Unreleased]` for future work only after the 2.0 notes are moved.
- [ ] **Step 7:** Update plugin manifests and registry capability summaries.
- [ ] **Step 8:** Commit: `git add docs/design-intelligence.md README.md CHANGELOG.md package.json package-lock.json .codex-plugin/plugin.json .claude-plugin/plugin.json .claude-plugin/marketplace.json .cursor-plugin/plugin.json gemini-extension.json .opencode/plugins/supervibe.js registry.yaml tests/command-surface.test.mjs tests/version-surface-sync.test.mjs && git commit -m "docs: document design intelligence"`

**Failing test first:** Command surface tests must fail before public metadata includes design intelligence consistently.

**Verification:**
```powershell
node --test tests/command-surface.test.mjs
node --test tests/version-surface-sync.test.mjs
npm run validate:plugin-json
```
Expected output: docs, plugin metadata, README release text, changelog notes, and version surfaces are consistent at target `2.0.0`; README install/update examples remain on the existing `main` URLs.

---

## Task T14: End-To-End Regression And Release Gate

**Files:**
- Modify: `package.json` only for target release version `2.0.0` and existing test/package metadata; do not add scripts or commands.
- Modify: `package-lock.json` only to mirror target root package version `2.0.0`.
- Modify: `knip.json`
- Modify: `docs/plans/2026-04-30-design-intelligence-scale-up.md`
- Test: `tests/design-intelligence-search.test.mjs`, `tests/design-context-preflight.test.mjs`, `tests/design-memory-writer.test.mjs`, `tests/design-trigger-router.test.mjs`, `tests/design-agent-integration.test.mjs`, `tests/design-quality-gates.test.mjs`, `tests/design-upstream-coverage.test.mjs`, `tests/design-existing-command-integration.test.mjs`, `tests/design-agent-cognitive-regression.test.mjs`, `tests/command-surface.test.mjs`, `tests/version-surface-sync.test.mjs`

**Estimated time:** 1h, confidence: medium.

**Rollback:** `git revert <sha>` after the task commit; verify by running `npm run check`.

**Risks:**
- R1: The full check suite can expose unrelated dirty worktree failures; mitigation: report unrelated failures separately and do not revert user changes.
- R2: New files can trip dead-code lint before they are wired into existing validators and tests; mitigation: wire internal modules into existing command and validation paths before running the release gate.
- R3: Release preparation can forget README/changelog/version updates after the implementation is complete; mitigation: the final gate blocks unless version surfaces and public docs are synchronized to `2.0.0`.

- [ ] **Step 1:** Write a failing aggregate test or script assertion that design intelligence tests are included in normal validation.
- [ ] **Step 2:** Add design intelligence tests to existing `npm test` coverage by naming convention; do not add a new npm command.
- [ ] **Step 3:** Update dead-code config only for intentionally imported internal modules; do not add public CLI entry points.
- [ ] **Step 4:** Verify README, `CHANGELOG.md`, package versions, lockfile versions, `.claude-plugin/marketplace.json`, and all platform plugin metadata match `2.0.0`; README install/update snippets must preserve the existing `main` URLs, and public text must mention only the existing command surfaces.
- [ ] **Step 5:** Run full validation and fix only failures caused by this feature.
- [ ] **Step 6:** Commit: `git add package.json package-lock.json knip.json docs/plans/2026-04-30-design-intelligence-scale-up.md tests && git commit -m "test: gate design intelligence release"`

**Failing test first:** The aggregate release gate must fail before design intelligence tests are included.

**Verification:**
```powershell
npm run check
```
Expected output: plugin validation, trigger validation, design validation, dead-code lint, and all tests pass.

---

## Task T15: Upstream Coverage Matrix And Reference Pack

**Files:**
- Create: `docs/design-intelligence-upstream-coverage.md`
- Create: `skills/design-intelligence/references/brand-reference.md`
- Create: `skills/design-intelligence/references/design-system-reference.md`
- Create: `skills/design-intelligence/references/ui-styling-reference.md`
- Create: `skills/design-intelligence/references/asset-and-collateral-reference.md`
- Create: `skills/design-intelligence/references/slide-deck-reference.md`
- Create: `skills/design-intelligence/references/professional-ui-priority-reference.md`
- Create: `schemas/design-upstream-coverage.schema.json`
- Modify: `skills/design-intelligence/data/manifest.json`
- Modify: `skills/design-intelligence/SKILL.md`
- Test: `tests/design-upstream-coverage.test.mjs`

**Estimated time:** half-day, confidence: medium.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Reference pack can become a noisy copy of upstream markdown; mitigation: curate compact cards with source path, adapted rule, Supervibe owner, and skip rationale.
- R2: Font binaries and generated image workflows can bloat or complicate licensing; mitigation: do not import font binaries by default and record them as skipped unless a later approved asset-pack plan exists.
- R3: Logo, banner, social, slides, and CIP guidance can conflict with existing Supervibe agents; mitigation: route them as evidence for existing creative, presentation, prototype, and brandbook agents, not new owners.
- R4: Upstream plugin manifests, platform templates, preview pages, screenshots, and GitHub workflows can accidentally reshape Supervibe packaging or command behavior; mitigation: classify them explicitly and adapt only wording or packaging lessons that fit current plugin surfaces.
- R5: Upstream quick-reference text contains platform-specific and mojibake-heavy sections; mitigation: curate the underlying rules into clean English/Russian-neutral reference cards with explicit app, mobile, web, desktop, and stack scopes instead of copying raw prose.
- R6: Script-heavy upstream workflows can tempt implementers to import Python or add new runtime entry points; mitigation: classify scripts by algorithmic value, port only useful checks to existing Node validators, and mark original scripts as skipped runtime assets.
- R7: Upstream CLI TypeScript source, starter templates, package sidecars, and generated coverage artifacts can be mistaken for required plugin runtime; mitigation: classify them as packaging/reference material, adapt only platform-detection or template-structure lessons, and skip installer/update behavior, generated coverage files, and upstream package mechanics.

- [ ] **Step 1:** Write failing tests that every upstream asset family is classified as `adapted`, `skipped`, or `deferred-with-rationale`.
- [ ] **Step 2:** Build a coverage matrix for upstream families: main data pack, duplicated data-tree sync script, stack CSVs, slide decision CSVs, logo/icon/CIP collateral CSVs, core search/design-system Python scripts, logo/icon/CIP Python search/generation/render scripts, brand references, brand scripts, brand starter templates, design-system references, design-system scripts, design-token starter templates, ui-styling references, ui-styling scripts, banner-design guidance, logo/icon/banner/social/CIP references, slides references, orchestration guidance, root skill manifest, source and CLI base templates, source and CLI platform templates, CLI TypeScript command and utility source, architecture docs, multilingual docs, CLI package manifests, npmignore/gitignore sidecars and lockfiles, upstream plugin marketplace metadata, README/docs/CLAUDE guidance, preview demo, GitHub workflows, Python tests and requirements, generated coverage artifacts, pycache artifacts, font binaries and font license sidecars, screenshots, and low-signal `design.csv` or `draft.csv`.
- [ ] **Step 3:** Create compact reference cards for the useful non-CSV material: brand governance, token architecture, component states, shadcn/Tailwind styling, asset rules, collateral sizing, slide strategy/layout/copy/chart guidance, starter-template structure, platform-template mapping, brand asset validation, brand-to-token sync, and the upstream professional UI priority taxonomy.
- [ ] **Step 3a:** Normalize the upstream 1-10 priority taxonomy into Supervibe review order: accessibility, touch/interaction, performance, style selection, layout/responsive, typography/color, animation, forms/feedback, navigation, and charts/data; each rule must include owner agent, severity, platform scope, and anti-patterns.
- [ ] **Step 3b:** Adapt upstream icon guidance to Supervibe's local icon policy: no emoji structural icons, consistent vector icon family, Lucide-first when available, and no automatic Phosphor/Heroicons dependency unless the target stack already uses it or the user approves it.
- [ ] **Step 3c:** Classify script behavior by disposition: adapt brand context extraction, asset validation, palette comparison, brand-to-token sync checks, token validation, token generation checks, slide BM25/contextual recommendation, logo/icon/CIP search heuristics, and shadcn/Tailwind setup heuristics; skip original Python/CJS scripts, CLI installer/update scripts, and generated coverage artifacts as runtime files unless a later task ports a specific helper into Supervibe's existing Node validation path.
- [ ] **Step 4:** Update the manifest with source paths, adaptation status, excluded files, font/license sidecars, generated artifacts, package sidecars, and rationale so future agents know what was intentionally not imported.
- [ ] **Step 5:** Commit: `git add docs/design-intelligence-upstream-coverage.md skills/design-intelligence/references schemas/design-upstream-coverage.schema.json skills/design-intelligence/data/manifest.json skills/design-intelligence/SKILL.md tests/design-upstream-coverage.test.mjs && git commit -m "docs: add design intelligence upstream coverage"`

**Failing test first:** Coverage tests must fail before every upstream family has an explicit classification.

**Verification:**
```powershell
node --test tests/design-upstream-coverage.test.mjs
```
Expected output: coverage matrix validates, useful upstream references are represented, and skipped assets have concrete rationale.

---

## Task T16: Existing-Command Integration Guard

**Files:**
- Modify: `commands/supervibe-design.md`
- Modify: `commands/supervibe-audit.md`
- Modify: `commands/supervibe-strengthen.md`
- Modify: `commands/supervibe.md`
- Modify: `tests/command-surface.test.mjs`
- Create: `tests/design-existing-command-integration.test.mjs`
- Test: `tests/design-existing-command-integration.test.mjs`

**Estimated time:** 1h, confidence: high.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: Designers may need a convenient lookup entry point and implementers may add a new slash command; mitigation: existing `/supervibe-design` gets internal lookup mode behavior without adding a new command file.
- R2: Hidden package scripts can become de facto commands; mitigation: tests assert no `design:intelligence`, `design:lookup`, or standalone design CLI script is added.
- R3: Existing command behavior can be overloaded; mitigation: command docs clearly route advisory lookup, design-system extension, prototype pipeline, and review modes through the existing lifecycle.

- [ ] **Step 1:** Write failing tests that the command count does not increase and no new design lookup slash command file appears.
- [ ] **Step 2:** Update `/supervibe-design` to describe internal lookup-backed behavior for style, palette, typography, component, chart, presentation/deck, collateral, and stack guidance requests.
- [ ] **Step 3:** Update `/supervibe-audit` to describe design intelligence as an internal evidence source for UI polish, accessibility, token drift, brand/collateral asset drift, presentation quality, and browser review.
- [ ] **Step 4:** Update `/supervibe-strengthen` and `/supervibe` to make design intelligence part of existing strengthening and routing, not a new workflow surface.
- [ ] **Step 5:** Commit: `git add commands tests/command-surface.test.mjs tests/design-existing-command-integration.test.mjs && git commit -m "test: keep design intelligence on existing commands"`

**Failing test first:** Integration tests must fail before the no-new-command assertions and existing-command route docs exist.

**Verification:**
```powershell
node --test tests/design-existing-command-integration.test.mjs tests/command-surface.test.mjs
```
Expected output: no new command file or package command is introduced, and existing design commands document the enhanced behavior.

---

## Task T17: Agent Cognitive Regression Gate

**Files:**
- Create: `tests/design-agent-cognitive-regression.test.mjs`
- Modify: `agents/_design/creative-director.md`
- Modify: `agents/_design/ux-ui-designer.md`
- Modify: `agents/_design/ui-polish-reviewer.md`
- Modify: `agents/_design/accessibility-reviewer.md`
- Modify: `agents/_design/mobile-ui-designer.md`
- Modify: `agents/_design/prototype-builder.md`
- Modify: `agents/_design/presentation-deck-builder.md`
- Modify: `agents/_design/presentation-director.md`
- Modify: `agents/_design/extension-ui-designer.md`
- Modify: `agents/_design/electron-ui-designer.md`
- Modify: `agents/_design/tauri-ui-designer.md`
- Modify: `confidence-rubrics/design-intelligence.yaml`
- Test: `tests/design-agent-cognitive-regression.test.mjs`

**Estimated time:** half-day, confidence: medium.

**Rollback:** `git revert <sha>` after the task commit; verify by running the test command listed below.

**Risks:**
- R1: More retrieved guidance can make agents less decisive; mitigation: require a decision hierarchy and a short synthesis, not a dump of all matches.
- R2: Generic upstream recommendations can override the project's existing design system; mitigation: tests assert the hierarchy `approved design system > project memory > codebase patterns > accessibility law > external lookup`.
- R3: Specialist agents can become less specialized by all reading the same broad knowledge; mitigation: each agent must declare owned domains, ignored domains, and escalation targets.

- [ ] **Step 1:** Write failing tests for decision hierarchy, role boundaries, conflict resolution, and evidence compactness.
- [ ] **Step 2:** Add a shared agent rule: retrieved guidance is advisory, local approved artifacts are authoritative, and accessibility or safety findings can block visual novelty.
- [ ] **Step 3:** Add role-specific guardrails so creative-director owns brand direction, ux-ui-designer owns IA and states, prototype-builder owns native prototype fidelity, presentation-director owns deck strategy, audience, narrative arc, copy framework, and story quality, presentation-deck-builder owns slide implementation and visual composition, ui-polish-reviewer owns rendered quality, mobile-ui-designer owns platform-mobile constraints, extension/electron/tauri designers own their surface constraints, and accessibility-reviewer owns WCAG correctness.
- [ ] **Step 4:** Add regression fixtures comparing before and after behavior for style selection, existing design-system reuse, UI review, mobile UI, presentation deck guidance, brand/collateral audit, and stack-specific UI handoff; passing output must be more grounded and not more verbose.
- [ ] **Step 5:** Commit: `git add tests/design-agent-cognitive-regression.test.mjs agents/_design confidence-rubrics/design-intelligence.yaml && git commit -m "test: guard design agent cognition"`

**Failing test first:** Cognitive regression tests must fail before agent role hierarchy and evidence compactness rules exist.

**Verification:**
```powershell
node --test tests/design-agent-cognitive-regression.test.mjs
```
Expected output: agents preserve role boundaries, use evidence compactly, and do not let generic lookup override approved local design truth.

---

## Design Trigger Acceptance Matrix

| Phrase | Expected intent | Route |
| --- | --- | --- |
| `сделай дизайн лендинга` | `design_surface` | `/supervibe-design` |
| `нужно спроектировать экран checkout` | `design_surface` | `/supervibe-design` |
| `подбери стиль для fintech dashboard` | `design_lookup` | `/supervibe-design` internal lookup mode |
| `дизайн выглядит непрофессионально` | `design_review` | `/supervibe-audit` plus `ui-polish-reviewer` |
| `проверь UI на accessibility` | `design_review` | `/supervibe-audit` plus `accessibility-reviewer` |
| `расширь дизайн систему под chart shell` | `design_system_extension` | `/supervibe-design` extension mode |
| `сделай мобильный UI` | `mobile_design` | `/supervibe-design` plus `mobile-ui-designer` |
| `add chart UX guidance for analytics` | `chart_design` | `/supervibe-design` plus `ux-ui-designer` |
| `собери презентацию для инвесторов` | `presentation_design` | `/supervibe-design` plus `presentation-deck-builder` |
| `проверь бренд-ассеты и токены` | `asset_collateral_design` | `/supervibe-audit` plus `brandbook` and token checks |
| `подскажи shadcn компоненты для формы` | `stack_ui_guidance` | `/supervibe-design` internal stack lookup mode |
| `make this UI feel more polished` | `design_review` | `/supervibe-audit` plus `ui-polish-reviewer` |
| `why did design route not trigger` | `trigger_diagnostics` | `/supervibe --diagnose-trigger` |

---

## Memory Writeback Acceptance Matrix

| Event | Memory type | Required tags | Required evidence |
| --- | --- | --- | --- |
| User approves brand direction | `decision` | `design`, `brand`, `approved` | Artifact path, agent, confidence, retrieved row ids |
| User rejects visual alternative | `decision` | `design`, `rejected`, `alternative` | Rejection reason, parked artifact path |
| UI polish reviewer blocks draft | `incident` | `design`, `polish`, `blocked` | Finding path, severity, screenshot or static evidence |
| Accessibility review finds recurring issue | `learning` | `design`, `a11y`, `wcag` | Criterion, reproduction, remediation |
| Prototype passes approval | `solution` | `design`, `prototype`, `handoff` | Approval marker, handoff path, design-system version |
| Token drift found and fixed | `pattern` | `design`, `tokens`, `drift` | Before path, fixed token, validator result |
| Presentation deck direction approved | `decision` | `design`, `slides`, `approved` | Deck goal, slide strategy row ids, token evidence |
| Brand asset audit finds drift | `incident` | `design`, `brand`, `asset`, `drift` | Asset path, failed rule, palette/token comparison |

---

## Non-Goals

- Do not replace `/supervibe-design` with a broad external design skill.
- Do not auto-generate a final design system from generic data without user approval.
- Do not require Python, Docker, browser automation, or external services for lookup.
- Do not copy upstream markdown wholesale into agent context.
- Do not write memory for every candidate suggestion.
- Do not let generic retrieved guidance override project memory, codebase facts, accessibility, or an approved design system.
- Do not add upstream `/brand`, `/slides`, direct design-system generator, install, update, uninstall, or version slash-command surfaces; adapt only useful behavior through existing Supervibe commands and validators.

---

## Execution Handoff

**Subagent-Driven batches:**
- Batch A foundation, sequential: T1, T2, T3, T4.
- Batch B parallel after T4: T5 and T10 can run together if write sets stay separate.
- Batch C memory and routing, sequential plus parallel: T6 and T7 first, then T8.
- Batch D agent integration, parallel after T8: T9 and T12 can run together if stack-agent edits and design-agent edits stay separate.
- Batch E quality and upstream coverage: T11, then T15.
- Batch F existing-command integration: T16 after T8 and T15.
- Batch G final cognitive regression: T17.
- Batch H docs and release gate: T13, then T14.

**Inline batches:**
- Inline path for one worker: T1 through T4, review gate, T5 through T8, review gate, T9 through T12, review gate, T15 through T17, final review gate, then T13 and T14.
- Keep T7 inline if trigger routing behavior is fragile during implementation.
- Keep T16 inline because it enforces the no-new-command constraint across command docs, tests, and metadata.
- Keep T17 and T14 inline because they reconcile agent decision regressions first, then suite-level release failures.

**Recommended path:** Use subagents for data normalization, reference card curation, agent metadata updates, and documentation; keep search engine, trigger router, memory writer, no-new-command guard, and final cognitive regression gate under one owner.

NEXT_STEP_HANDOFF
Current phase: plan
Artifact: docs/plans/2026-04-30-design-intelligence-scale-up.md
Next phase: plan-review
Next command: /supervibe-plan --review docs/plans/2026-04-30-design-intelligence-scale-up.md
Next skill: supervibe:requesting-code-review
Stop condition: ask-before-plan-review
Why: Execution and atomization are blocked until plan review passes.
Question: Next step is the plan review loop. Proceed?
END_NEXT_STEP_HANDOFF

---

## Self-Review

### Spec coverage

| Requirement | Task |
| --- | --- |
| Import useful upstream design knowledge with provenance | T1, T2 |
| Reconcile duplicated upstream source/package/skill data trees before import | T1, T2, T15 |
| Keep runtime Node-only and no Python requirement | T3 |
| Provide lookup skill for agents | T4 |
| Add RAG context combining memory, code, and design data | T5 |
| Add durable memory writeback for design decisions | T6 |
| Add bilingual design triggers and diagnostics | T7, T8 |
| Make designer agents smarter with evidence contracts | T9 |
| Add token drift and design-system compliance gates | T10, T11 |
| Feed design intelligence into stack handoff | T12 |
| Cover slide decision data, presentation-director strategy, and deck-builder implementation behavior | T2, T5, T8, T9, T15, T17 |
| Cover brand scripts, brand asset checks, palette comparison, and brand-to-token sync | T10, T15 |
| Cover shadcn/Tailwind setup guidance without unauthorized dependency installation | T12, T15 |
| Cover brand, asset, collateral, slides, shadcn, Tailwind, upstream metadata/templates/workflows/previews, and skipped upstream assets | T15 |
| Keep all improvements inside existing commands | T16 |
| Document and publish the capability consistently | T13 |
| Bump README, changelog, package, lockfile, and plugin version surfaces to `2.0.0` | T13, T14 |
| Add release and regression gates | T14, T17 |

### Placeholder scan
- [x] No unresolved placeholder language.
- [x] No task without concrete files.
- [x] No task without rollback, verification, or risks.
- [x] No execution starts before plan review.
- [x] No new slash command or package command is required.

### Type consistency
- [x] Lookup output has a schema before agents consume it.
- [x] Memory writeback has a schema before agents write entries.
- [x] Trigger entries reuse existing corpus shape.
- [x] Agent evidence fields use stable names across specs, reviews, and handoffs.
- [x] Design-system tokens remain the source of truth after approval.
- [x] Existing commands remain the user-facing surface for design intelligence.
- [x] Release surfaces explicitly target Supervibe `2.0.0`, with README public label `2.0` while install/update snippets keep the existing `main` URLs.

### RAG and memory consistency
- [x] Project memory beats generic design knowledge.
- [x] Existing code and approved tokens beat generic suggestions.
- [x] Rejected alternatives are preserved only with rationale.
- [x] Design lookup evidence is cited and conflict-aware.
- [x] Upstream assets are either adapted, skipped, or deferred with rationale.
- [x] Duplicate upstream data copies are reconciled before import, with canonical source and checksum drift recorded.

### Trigger consistency
- [x] Design routes are covered in command metadata.
- [x] Design routes are covered in skill metadata.
- [x] Design routes have regression tests.
- [x] Trigger diagnostics can explain rejected design alternatives.
- [x] Design routes do not add new slash commands.

### Final sanity check
- [x] The plan strengthens design agents without weakening approval gates.
- [x] The plan keeps Supervibe's design pipeline as orchestrator.
- [x] The plan makes data-driven recommendations auditable.
- [x] The plan avoids external runtime dependencies.
- [x] The plan explicitly prevents generic lookup from making specialist agents less precise.
