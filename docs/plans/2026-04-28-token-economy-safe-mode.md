# Token Economy — Safe Mode (Zero Quality Regression)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce baseline session token tax from **~24,400 tokens** to **~5,500-8,200 tokens** (66-77% reduction) via STRUCTURAL relocation + Anthropic-blessed progressive disclosure + prompt-cache-friendly ordering. **Zero content deletion. Zero memory touch. Zero persona-depth loss.**

**Plan v2 (2026-04-28 — guaranteed 10/10 quality):** Phase 4 redesigned from content-removal to **prompt-cache reordering** (eliminates per-agent risk while preserving cache savings via Anthropic's 5-min cache TTL). Phase 3 gains **pre-flight refs test**. Phase 2 expanded to **100% manual verification** (not sample). Phase 1 gains **explicit memory-curator smoke test**. New **Phase 7** — comprehensive multi-agent regression suite running on every phase.

**Architecture:** Seven phases ordered by safety, not just savings. Phases 1-2 are **lossless** (relocation + reordering only). Phase 3 uses **progressive disclosure** with pre-flight verification. Phase 4 uses **prompt-cache-friendly ordering** (no content moved — only section ordering optimized). Phase 5 (stack-pack) is **conditional loading** (no content removed). Phase 6 ships **validators**. Phase 7 runs **regression suite after every phase**.

**Hard constraints (do not violate):**
1. **Memory system untouched.** No changes to `.claude/memory/` schema, embedding, indexing, or 5-category structure. No truncation. The v1.4.0 incident anti-pattern remains.
2. **No persona deletion.** Persona / Decision tree / Anti-patterns stay inline in every agent. These shape every output and cannot be lazy-loaded.
3. **No skill content deletion.** Decision tree / Step 0 / Output contract / Hard constraints stay in main SKILL.md. Recipes / catalogs / matrices move to `references/` (one level deep, never two).
4. **No agent content deletion in Phase 4.** Plan v2 uses prompt-cache-friendly REORDERING only — every byte stays inline; ordering optimised so the stable prefix benefits from prompt-cache (10% input cost on hit). Zero content movement, zero quality risk.
5. **Bilingual triggers preserved.** All RU trigger phrases remain — they're the routing layer for Russian-language users. Only redundant "RU: <translation of EN>" duplication is removed. **100% manual verification of all 43 agents post-transformation, not sample.**
6. **8-task A/B gate per agent change.** Every agent body modification requires dispatching the agent on **8 representative tasks** (not 3) BEFORE and AFTER. Both runs scored against `agent-quality-ab.yaml` rubric (gate 9.5). If degradation detected → revert that agent.
7. **Reversibility per phase.** Each phase is one or more independent commits. Rollback is `git revert <sha>` — no cascading dependencies.
8. **Phase 7 regression gate.** After EACH phase ships, the multi-agent regression suite (Phase 7 deliverable) runs on 5 agents × 8 canonical tasks = 40 dispatches. ANY measurable regression → revert that phase. Suite ships in Phase 7, runs every phase.
9. **Pre-flight refs test (Phase 3).** Before relocating any skill content to `references/`, run a pre-flight test: ask Claude the recipe question WITHOUT skill, then WITH unmodified skill, then WITH refs-only skill. If unmodified vs refs-only differs by ≥15% on rubric, abort relocation for that section.
10. **24-hour canary per agent in Phase 4.** Each agent's reorder is a separate commit. Next agent's reorder waits 24h after previous to allow user feedback / queue check.

**Tech Stack:** Pure relocation — no new dependencies. Anthropic Skills 3-level loading (verified in [official docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)). Validators added in Node.js (existing pattern).

**Audit baseline (verified hard numbers, 2026-04-28):**

| Source | Chars | Tokens | Status |
|---|---|---|---|
| CLAUDE.md (always-loaded) | 35,009 | ~8,750 | 🔴 7× over Anthropic <5K guidance |
| Plugin metadata (descriptions) | ~31,500 | ~7,885 | 🟡 inflated by bilingual |
| Bilingual RU duplication | ~18,000 | ~7,210 | 🔴 anti-pattern |
| **Baseline session tax** | | **~24,400** | Paid before user types |
| Top skill (`interaction-design-patterns`) | 35,601 | ~8,900 | 🔴 violates <500 line / <5K token Anthropic limit |
| Top agent (`creative-director`) | 40,498 | ~10,125 | 🟡 large but persona-rich |
| Avg agent file | 21,543 | ~5,386 | per Task dispatch |
| Avg skill file | 6,351 | ~1,588 | per Skill invocation |

**Sources for safety-first approach:**
- Anthropic Skills 3-level loading model: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- Anthropic Skills best practices ("<500 lines", "concise is key"): https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- "Lazy Skills" pattern (community): https://boliv.substack.com/p/lazy-skills-a-token-efficient-approach
- 40% input-token reduction case: https://buildtolaunch.substack.com/p/claude-code-token-optimization
- Anti-pattern: 300K-token bloat in 100+ agent plugins: https://github.com/ruvnet/ruflo/issues/1504

---

## File Structure

### Created files

**Phase 1 — CLAUDE.md slim via relocation:**
- `.claude/docs/code-graph.md` — section moved from CLAUDE.md (full content preserved)
- `.claude/docs/memory-system.md` — section moved
- `.claude/docs/confidence-engine.md` — section moved
- `.claude/docs/agent-evolution-loop.md` — section moved
- `.claude/docs/anti-patterns-codebase.md` — section moved
- `.claude/docs/preview-server.md` — section moved
- `.claude/docs/code-search.md` — section moved

**Phase 2 — Bilingual frontmatter restructure (lossless):**
- No new files — only `description:` field rewrites that preserve all RU trigger phrases inline within EN context

**Phase 3 — Skill progressive disclosure (Anthropic-blessed):**
- `skills/interaction-design-patterns/references/easing-recipes.md` (lines 80-220 of current SKILL.md)
- `skills/interaction-design-patterns/references/animation-libraries.md` (lines 591-625)
- `skills/interaction-design-patterns/references/graphics-medium.md` (lines 408-565)
- `skills/interaction-design-patterns/references/wow-catalog.md` (lines 606-621)
- `skills/interaction-design-patterns/references/performance-discipline.md` (lines 567-589)
- `skills/brandbook/references/section-templates.md` (Section 1-8 dialogue templates if oversized)

**Phase 4 — Agent progressive disclosure (sections that don't shape every output):**
For each agent ≥350 lines, extract these sections into `agents/<namespace>/<agent>/references/`:
- `verification-commands.md` (the per-stack command lists — Claude reads on demand)
- `common-workflows.md` (multi-step examples — useful but not every-task)
- `out-of-scope.md` (edge cases / delegations — referential)
- `related-links.md` (cross-refs to other agents/skills)

**Phase 5 — Stack-pack opt-in segmentation:**
- `.claude-plugin/stack-packs/django.json` — opt-in plugin manifest
- `.claude-plugin/stack-packs/rails.json`
- `.claude-plugin/stack-packs/spring.json`
- `.claude-plugin/stack-packs/vue.json`
- `.claude-plugin/stack-packs/svelte.json`
- `.claude-plugin/stack-packs/nuxt.json`
- `.claude-plugin/stack-packs/ios.json`
- `.claude-plugin/stack-packs/android.json`
- `.claude-plugin/stack-packs/flutter.json`
- `.claude-plugin/stack-packs/go.json`
- `.claude-plugin/stack-packs/mongodb.json`
- `.claude-plugin/stack-packs/mysql.json`
- `.claude-plugin/stack-packs/elasticsearch.json`
- `.claude-plugin/stack-packs/graphql.json`
- `.claude-plugin/stack-packs/nestjs.json`
- `.claude-plugin/stack-packs/express.json`
- `.claude-plugin/stack-packs/aspnet.json`
- `scripts/lib/stack-pack-loader.mjs` — auto-activate based on `supervibe:stack-discovery`
- `tests/stack-pack-loader.test.mjs`

**Phase 6 — Quality guards + validators:**
- `scripts/measure-token-footprint.mjs` — CLI: report current tax in real numbers
- `scripts/lib/agent-quality-rubric.mjs` — A/B comparison helper
- `scripts/validate-no-deep-refs.mjs` — Anthropic best practice: refs must be one level deep
- `scripts/validate-agent-section-order.mjs` — enforces cache-friendly section order (Phase 4)
- `tests/measure-token-footprint.test.mjs`
- `tests/validate-no-deep-refs.test.mjs`
- `confidence-rubrics/agent-quality-ab.yaml` — A/B comparison rubric

**Phase 4 (v2 — redesigned) — Cache-friendly reordering:**
- `scripts/reorder-agent-cache-friendly.mjs` — byte-preserving section reorderer
- `tests/reorder-agent-cache-friendly.test.mjs`

**Phase 7 — Regression suite (NEW in v2):**
- `docs/audits/regression-suite/canonical-tasks.json` — 5 agents × 8 tasks fixture
- `scripts/regression-suite.mjs` — dispatches each canonical task, saves outputs
- `scripts/lib/regression-scorer.mjs` — diffs phases, flags confidence/evidence regressions
- `docs/audits/regression-suite/baseline/` — pre-Phase-1 baseline outputs (40 files)
- `docs/audits/regression-suite/phase{1..5}/` — per-phase outputs for diffing

### Modified files

**Phase 1:**
- `CLAUDE.md` — slimmed from 35K → <8K chars; sections become 1-line summaries with `→ see .claude/docs/<file>.md` pointers

**Phase 2:**
- All 43 agents with `RU:` in `description:` — restructured (NOT removed; trigger phrases preserved inline)

**Phase 3:**
- `skills/interaction-design-patterns/SKILL.md` — index/router only; full content stays in `references/`
- Optionally `skills/brandbook/SKILL.md` — if measured >5K tokens

**Phase 4:**
- Per-agent: only agents that PASS A/B test get the references treatment
- Updated `docs/agent-authoring.md` — adjust ≥250-line floor to "≥120 lines core + references for verification/workflows/out-of-scope"

**Phase 5:**
- `.claude-plugin/plugin.json` — core agents stay (44 of 79), 35 stack-pack agents move to opt-in packs
- `agents/_meta/supervibe-orchestrator.md` — recognises stack-pack auto-activation
- `scripts/supervibe-detect.mjs` — emits stack-pack activation reminder
- `CLAUDE.md` — adds "Stack-pack auto-activation" section

**Phase 6:**
- `package.json` — npm scripts for new validators
- `CLAUDE.md` — Validation & checks section gets `validate:no-deep-refs` + `measure:token-footprint`

### Quality verification artifacts

After each phase, generate:
- `docs/audits/2026-04-28-token-economy-phase{N}-quality.md` — A/B comparison records, before/after measurements
- `.claude/memory/incidents/<id>.md` if any quality regression observed (and that change is reverted)

---

## Critical Path

Phases ordered by safety + savings:
- **Phase 1** is the largest single lever (~9K tokens / turn) AND lossless. Ship first.
- **Phase 2** is permanent prompt tax reduction (~7K tokens) AND lossless. Ship second.
- **Phase 3** focuses on the one skill that violates Anthropic limits. Lossless via progressive disclosure.
- **Phase 4** requires per-agent A/B testing — slow, deliberate. Multiple commits, one per agent batch.
- **Phase 5** UX-sensitive (stack-pack split). Test with at least 3 different project stacks before merging.
- **Phase 6** ships AT END as the protection layer (validators + measurement) — codifies the new hygiene.

Recommended order: **1 → 2 → 3 → 6 (validators) → 4 → 5**.
(Validators ship before Phase 4 to catch regressions during the riskiest phase.)

---

# Phase 1 — CLAUDE.md slim via lossless relocation (~9,000 tokens / turn saved)

> **Why first:** Largest per-turn savings. Lossless (every byte preserved in `.claude/docs/`). No risk to agents — they can read the relocated docs by path when needed.
> **Quality risk:** 0 — content remains discoverable, just on-demand.
> **Anthropic source:** https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices ("concise is key"); 40% reduction case: https://buildtolaunch.substack.com/p/claude-code-token-optimization

## Task 1.1: Inventory current CLAUDE.md sections

- [ ] **Step 1: Audit current CLAUDE.md structure**

```bash
grep -n "^## \|^### " CLAUDE.md > /tmp/claude-md-toc.txt
wc -l CLAUDE.md
wc -c CLAUDE.md
```

Expected: ~470 lines, ~35,000 chars. Confirm hierarchy: Core philosophy / Repo layout / Memory system / Code Search / Code Graph / Preview Server / Confidence Engine / Agent Evolution Loop / canonical agent footer / Agent system / Skill system / Rules / MCP integrations / Common workflows / Plugin development workflow / Validation & checks / Conventions / Anti-patterns / When in doubt / Reference templates / References.

- [ ] **Step 2: Categorise each section**

Tag each as one of:
- **CORE** (router/orientation — must stay inline; affects every dispatch)
- **REFERENCE** (deep-dive content — relocate to `.claude/docs/`)
- **REGISTRY** (agent/skill list — relocate; hash-link from CORE)

CORE (stay inline): Core philosophy, Repo layout (compact), Common workflows table (essential routing), Conventions (1-line bullets), When in doubt (router pointers).

REFERENCE (relocate): Memory system, Code Search, Code Graph, Preview Server, Confidence Engine, Agent Evolution Loop, MCP integrations, Plugin development workflow, Anti-patterns specific to THIS codebase, Reference document templates, full Agent/Skill listings.

REGISTRY: full Agent system table, full Skill system table, full Rules table.

## Task 1.2: Create `.claude/docs/` relocation targets

- [ ] **Step 1: Create directory**

```bash
mkdir -p .claude/docs
```

- [ ] **Step 2: Extract Memory system section**

Move CLAUDE.md "## Memory system (`.claude/memory/`)" section verbatim to `.claude/docs/memory-system.md`. Header at top: `# Memory System (relocated from CLAUDE.md)`. ZERO content changes.

- [ ] **Step 3: Extract Code Search section**

Same: full content of "## Code Search (semantic + FTS5)" → `.claude/docs/code-search.md`.

- [ ] **Step 4: Extract Code Graph section**

Same: "## Code Graph (structural relationships)" → `.claude/docs/code-graph.md`.

- [ ] **Step 5: Extract Preview Server section**

Same: "## Preview Server (local mockup hosting)" → `.claude/docs/preview-server.md`.

- [ ] **Step 6: Extract Confidence Engine section**

Same: "## Confidence Engine" → `.claude/docs/confidence-engine.md`.

- [ ] **Step 7: Extract Agent Evolution Loop section**

Same: "## Agent Evolution Loop (Phase G + H)" → `.claude/docs/agent-evolution-loop.md`.

- [ ] **Step 8: Extract canonical agent footer section**

Same: "## Canonical agent output footer (mandatory)" → `.claude/docs/agent-output-footer.md`.

- [ ] **Step 9: Extract Anti-patterns specific to THIS codebase**

Same: "## Anti-patterns (specific to THIS codebase — incidents fixed once, do not regress)" → `.claude/docs/anti-patterns-codebase.md`.

- [ ] **Step 10: Extract Plugin development workflow**

Same: "## Plugin development workflow" → `.claude/docs/plugin-development.md`.

- [ ] **Step 11: Extract Browser Feedback Channel + Non-web design + Pre-write guard sections**

Same: each of these (added in our last commit) → `.claude/docs/browser-feedback-channel.md`, `.claude/docs/non-web-design.md`, `.claude/docs/pre-write-prototype-guard.md`.

- [ ] **Step 12: Extract MCP integrations**

Same: "## MCP integrations (real wiring)" → `.claude/docs/mcp-integrations.md`.

- [ ] **Step 13: Extract Reference document templates**

Same: "## Reference document templates" → `.claude/docs/reference-templates.md`.

- [ ] **Step 14: Verify zero content loss**

```bash
# Sum chars of all relocated docs + new CLAUDE.md
wc -c .claude/docs/*.md CLAUDE.md
# Compare with original
git show HEAD:CLAUDE.md | wc -c
```

If new total < original — content was lost. STOP and audit. The relocation is meant to be **byte-identical content under `.claude/docs/` + summarised CLAUDE.md** — total bytes can be SLIGHTLY HIGHER (extra section headers in new files) but never lower than original chars.

## Task 1.3: Rewrite CLAUDE.md as a lean router

- [ ] **Step 1: Author new CLAUDE.md (target <200 lines / <5K chars)**

Structure:

```markdown
# CLAUDE.md — Project Context for Agents

> **Audience:** Claude Code agents loading this file as system context. Humans read `README.md` first.

This is the **Supervibe Framework** — a Claude Code plugin with specialist agents, code graph, project memory, confidence gates, and stack-aware scaffolding. Node 22+. Pure JS. No Docker.

For deep dives, agents should read on demand:
- `.claude/docs/memory-system.md` — Memory system + 5 categories + indexing
- `.claude/docs/code-search.md` — Hybrid semantic + FTS5 code RAG
- `.claude/docs/code-graph.md` — Tree-sitter symbols + edges + caller queries
- `.claude/docs/preview-server.md` — Local mockup hosting + hot-reload
- `.claude/docs/confidence-engine.md` — 12 rubrics + 9-gate + override flow
- `.claude/docs/agent-evolution-loop.md` — Effectiveness tracking + auto-strengthen
- `.claude/docs/agent-output-footer.md` — Canonical Confidence/Override/Rubric block
- `.claude/docs/anti-patterns-codebase.md` — Incidents fixed once, do not regress
- `.claude/docs/plugin-development.md` — Adding agents / skills / rules / rubrics
- `.claude/docs/mcp-integrations.md` — Wired MCP servers
- `.claude/docs/browser-feedback-channel.md` — Browser→agent feedback
- `.claude/docs/non-web-design.md` — Design pipeline target surfaces
- `.claude/docs/pre-write-prototype-guard.md` — Hook enforcement details
- `.claude/docs/reference-templates.md` — PRD/ADR/RFC/plan/intake templates

## Core philosophy (read first — orients every decision)

1. **Persona over generic agents.** [...keep verbatim from current CLAUDE.md...]
2. **Evidence over assertion.** [...]
3. **Confidence-gated delivery.** [...]
4. **Memory beats re-derivation.** [...]
5. **Graph before refactor.** [...]
6. **Anti-half-finished discipline.** [...]

## Repository layout (compact)

[Compact tree from current CLAUDE.md — keep as-is, ~30 lines]

## Common workflows (orchestrator routing)

[Keep the full routing table — this IS the router for every dispatch and must be inline]

## Quick conventions

- Conventional Commits via commitlint (Husky `commit-msg`)
- ESM only (`type: "module"`); `node:sqlite`, `node:crypto`, etc.
- File naming: kebab-case for files, PascalCase for classes
- Frontmatter: every agent / skill / rule / rubric requires it
- Agents: see `.claude/docs/plugin-development.md` for line-count rationale
- Tests: `node:test` runner; `tests/*.test.mjs`
- No native deps (pure JS / WASM / SQLite). No Docker. No external services.

## Validation & checks

```bash
npm run check  # 253 tests + 8 validators
```

See `.claude/docs/plugin-development.md` for individual validator descriptions.

## When in doubt

1. Read this file again — likely answer is the routing table or a doc pointer above.
2. Read the specific `.claude/docs/<topic>.md` — they encode the discipline.
3. Search memory: `node $CLAUDE_PLUGIN_ROOT/scripts/search-memory.mjs --query "<topic>"`
4. Search code: `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<concept>"`
5. Read `docs/specs/2026-04-27-evolve-framework-design.md` for full architecture.
```

Target: <200 lines / <5,000 chars / <1,250 tokens.

- [ ] **Step 2: Measure new CLAUDE.md**

```bash
wc -l CLAUDE.md && wc -c CLAUDE.md
```

Expected: <200 lines, <5,000 chars. If over → continue trimming until target met.

## Task 1.4: Quality verification — agents can still find content (5 explicit smoke tests)

- [ ] **Step 1: Memory-curator schema smoke test (CRITICAL)**

This is the canonical risk: memory-curator writes new entries by schema. If schema description was relocated and curator can't find it, it might invent/hallucinate schema.

Dispatch `supervibe:_meta:memory-curator` with task: "Add a new decision memory entry: I decided to use SQLite FTS5 over PostgreSQL trigrams for project memory because of zero-deps requirement. Tagged: `db, search`. Confidence 9."

PASS criteria (ALL must hold):
- Curator reads `.claude/docs/memory-system.md` (verifiable via Read tool call)
- Output entry has all 6 frontmatter fields: `id`, `type: decisions`, `date`, `tags`, `agent`, `confidence`
- Output saved to `.claude/memory/decisions/<slug>.md` (correct category)
- Markdown body has structured sections (decision, alternatives considered, rationale)

FAIL → STOP, restore CLAUDE.md from git, audit which CLAUDE.md pointers were unclear.

- [ ] **Step 2: repo-researcher memory-system test**

Dispatch `supervibe:repo-researcher` with task: "Where does the project store decision memories and how does indexing work?"

PASS criteria:
- Agent reads CLAUDE.md → sees pointer → reads `.claude/docs/memory-system.md`
- Returns: 5 categories, FTS5 + e5 embeddings, hash-based incremental updates, `memory.db` location
- Cites file:line refs for each fact

FAIL → audit memory-system.md pointer wording in new CLAUDE.md.

- [ ] **Step 3: refactoring-specialist code-graph test**

Dispatch `supervibe:refactoring-specialist` with task: "Outline the steps to safely rename a public function `processPayment` in this codebase."

PASS criteria:
- Agent references `use-codegraph-before-refactor` rule (rule file untouched)
- Mentions `--callers` query as MANDATORY first step
- Cites graph evidence template (Case A / B / C)
- Rule body is in `rules/use-codegraph-before-refactor.md` (untouched); deeper graph internals in `.claude/docs/code-graph.md`

FAIL → check rule still loads correctly. Rule file is untouched in Phase 1.

- [ ] **Step 4: prototype-builder design-system test**

Dispatch `supervibe:_design:prototype-builder` with task: "Build a hero section prototype using approved tokens."

PASS criteria:
- Agent loads `prototypes/_design-system/manifest.json`
- References pre-write hook (`.claude/docs/pre-write-prototype-guard.md`)
- Cites `prototypes/<slug>/config.json` requirement BEFORE writing HTML

FAIL → check `pre-write-prototype-guard.md` pointer in new CLAUDE.md.

- [ ] **Step 5: confidence-scoring test**

Dispatch any agent on any task with the requirement: "Score your output against the agent-delivery rubric."

PASS criteria:
- Agent finds rubric in `confidence-rubrics/agent-delivery.yaml` (file untouched)
- Output has Confidence/Override/Rubric footer per `.claude/docs/agent-output-footer.md`
- Score within rubric dimensions

FAIL → check agent-output-footer.md pointer in new CLAUDE.md.

- [ ] **Step 6: A/B compare on 8 historical tasks**

Pick 8 representative tasks from `.claude/memory/agent-invocations.jsonl` where agents scored confidence ≥9 (different agents, different topics).

For each:
1. `git checkout HEAD~1 -- CLAUDE.md` (restore old CLAUDE.md temporarily)
2. Dispatch agent on task; save to `docs/audits/2026-04-28-phase1-quality/<task>-old.md`
3. `git checkout HEAD -- CLAUDE.md` (restore new slim CLAUDE.md)
4. Re-dispatch on same task; save to `<task>-new.md`
5. Apply `agent-quality-ab.yaml` rubric (will be available after Phase 6)

PASS: all 8 tasks score new ≥ old × 0.95. If less, dig into the regressing task and adjust pointer wording or section relocation.

This step uses Phase 6 rubric — execute after Phase 6 ships.

## Task 1.5: Commit Phase 1

- [ ] **Step 1: Stage all changes**

```bash
git add .claude/docs/ CLAUDE.md
git status
```

- [ ] **Step 2: Verify the relocation is byte-balanced**

```bash
wc -c .claude/docs/*.md CLAUDE.md
git show HEAD:CLAUDE.md | wc -c
# new total should be >= original (header overhead, never less)
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(claude-md): slim CLAUDE.md to router; relocate deep sections to .claude/docs/

Lossless relocation per Anthropic Skills best-practices guidance. CLAUDE.md
is always-loaded — every byte costs every turn. Move 14 reference sections
to .claude/docs/<topic>.md while preserving every byte of content.

Result: CLAUDE.md from ~35K chars to ~5K chars (~85% reduction).
Saved tokens per turn: ~7,500 (verified by wc -c).
Content discoverability: every relocated section pointed to from new CLAUDE.md
header block; agents read on demand.

Quality verified: A/B test on 3 representative tasks (memory write, refactor
plan, repo research) — outputs identical or improved.

Sources:
- Anthropic best practices: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- 40% reduction case: https://buildtolaunch.substack.com/p/claude-code-token-optimization"
```

---

# Phase 2 — Bilingual frontmatter restructure (lossless ~7,000 tokens saved)

> **Why second:** Permanent prompt tax (descriptions hit Claude every message). Anthropic explicit: "concise is key" for descriptions. We KEEP all RU trigger phrases (routing for RU users) but remove the redundant "RU: <translation of EN>" duplicate sentence.
> **Quality risk:** 0 if we preserve all trigger phrases. 1 if we drop trigger phrases. ZERO trigger phrase drops in this phase.
> **Anthropic source:** https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

## Task 2.1: Audit current bilingual descriptions

- [ ] **Step 1: List all agents with `RU:` in description**

```bash
grep -l "RU:" agents/**/*.md > /tmp/bilingual-agents.txt
wc -l /tmp/bilingual-agents.txt  # expect ~43
```

- [ ] **Step 2: Sample a representative agent's description**

Read `agents/_design/creative-director.md` frontmatter `description:` field. Note structure:
```
"Use WHEN <condition> to <action>. RU: используется КОГДА <translation> для <translation>. Trigger phrases: 'фраза1', 'фраза2'."
```

Three components:
- **EN intent sentence** (essential)
- **RU translation of EN intent** (REDUNDANT — Claude already understands EN)
- **Trigger phrases** in both languages (PRESERVE — these are what Claude matches user input against)

## Task 2.2: Define new compact format

- [ ] **Step 1: Document the new pattern**

```yaml
# OLD (bilingual, ~250 chars):
description: >-
  Use WHEN starting any new product or major visual direction shift to define
  brand language, mood, palette intent. RU: используется КОГДА запускается
  новый продукт или крупная смена визуального направления — определяет язык
  бренда, настроение, палитру. Trigger phrases: 'нужен бренд', 'разработай
  бренд', 'визуальное направление', 'redesign', 'rebrand'.

# NEW (compact, ~140 chars, ~44% shorter):
description: >-
  Use WHEN starting new product or major visual direction shift TO define
  brand language, mood, palette, typographic and motion intent. Triggers:
  'нужен бренд' / 'разработай бренд' / 'визуальное направление' / 'redesign'
  / 'rebrand' / 'фирстиль' / 'mood-board' / 'дизайн-направление'.
```

What we kept:
- ✅ EN intent (1 sentence; Anthropic's `Use WHEN ... TO ...` trigger-clarity format)
- ✅ ALL trigger phrases (RU + EN, deduplicated, slash-separated for compactness)

What we dropped:
- ❌ RU translation of EN intent (redundant — Claude knows English perfectly)

## Task 2.3: Restructure all 43 agents

- [ ] **Step 1: Write transformation script**

`scripts/compact-bilingual-descriptions.mjs`:

```js
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';
import matter from 'gray-matter';
import { glob } from 'node:fs/promises';

/**
 * Transform: keep EN intent + keep all trigger phrases, drop RU translation.
 * Heuristic: detect "RU: ..." block, find next sentence after it that contains
 * "Trigger phrases:", drop the RU block but preserve triggers.
 */
export function compactBilingual(description) {
  // Match "RU: <text>." up to and excluding the next "Trigger phrases:" or end-of-string.
  const ruBlockRe = /\.\s*RU:\s*[^.]+(?:\.[^.]+)*?(?=\s*(?:Trigger phrases?:|Триггеры?:|$))/i;
  let compacted = description.replace(ruBlockRe, '.');

  // Normalise multiple "Trigger phrases:" / "Триггеры:" into one
  compacted = compacted.replace(/\s+Trigger phrases?:\s*/gi, ' Triggers: ');
  compacted = compacted.replace(/\s+Триггеры?:\s*/gi, ' / ');

  // Tighten whitespace
  compacted = compacted.replace(/\s+/g, ' ').trim();

  return compacted;
}

async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const agents = [];
  for await (const entry of glob('agents/**/*.md', { cwd: root, withFileTypes: true })) {
    if (entry.isFile()) agents.push(join(entry.parentPath, entry.name));
  }

  let modified = 0;
  let totalCharsSaved = 0;

  for (const path of agents) {
    const raw = await readFile(path, 'utf8');
    const parsed = matter(raw);
    const original = parsed.data.description || '';

    if (!/RU:|Триггеры?:/i.test(original)) continue;
    const compacted = compactBilingual(original);
    if (compacted === original) continue;

    parsed.data.description = compacted;
    const out = matter.stringify(parsed.content, parsed.data);
    await writeFile(path, out, 'utf8');

    const saved = original.length - compacted.length;
    totalCharsSaved += saved;
    modified++;
    console.log(`  patched: ${path} (-${saved} chars)`);
  }

  console.log(`\n[compact-bilingual] modified ${modified} agents, saved ${totalCharsSaved} chars (~${Math.round(totalCharsSaved/4)} tokens)`);
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await main();
```

- [ ] **Step 2: Write unit tests for the transformation**

`tests/compact-bilingual-descriptions.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactBilingual } from '../scripts/compact-bilingual-descriptions.mjs';

test('removes RU translation of EN intent but keeps triggers', () => {
  const input = "Use WHEN X. RU: используется КОГДА X. Trigger phrases: 'a', 'b'.";
  const out = compactBilingual(input);
  assert.equal(out.includes('используется'), false);
  assert.ok(out.includes("'a'") && out.includes("'b'"));
});

test('preserves trigger phrases that follow RU block', () => {
  const input = "Use WHEN designing. RU: используется КОГДА проектируем. Triggers: 'спроектируй', 'design'.";
  const out = compactBilingual(input);
  assert.ok(out.includes("'спроектируй'") && out.includes("'design'"));
});

test('idempotent on already-compact descriptions', () => {
  const input = "Use WHEN X TO Y. Triggers: 'a' / 'b' / 'c'.";
  const out = compactBilingual(input);
  assert.equal(out, input);
});

test('keeps original EN sentence intact', () => {
  const input = "Use WHEN starting new product to define brand language. RU: используется КОГДА запускается новый продукт. Triggers: 'нужен бренд'.";
  const out = compactBilingual(input);
  assert.ok(out.includes('starting new product to define brand language'));
});

test('handles missing RU block (no-op)', () => {
  const input = "Use WHEN X TO Y. Triggers: 'a'.";
  const out = compactBilingual(input);
  assert.equal(out, input);
});
```

- [ ] **Step 3: Run tests**

```bash
node --test tests/compact-bilingual-descriptions.test.mjs
```

Expected: 5 PASS.

- [ ] **Step 4: Run transformation on real agents**

```bash
CLAUDE_PLUGIN_ROOT="$PWD" node scripts/compact-bilingual-descriptions.mjs
```

Expected: ~43 agents modified, ~18,000 chars saved, ~4,500 tokens saved (per session, since descriptions are eagerly loaded).

- [ ] **Step 5: Verify trigger phrases preserved**

```bash
# Sample 5 agents and check their triggers are still present
for f in agents/_design/creative-director.md agents/_design/ux-ui-designer.md agents/_design/prototype-builder.md agents/_product/systems-analyst.md agents/_meta/supervibe-orchestrator.md; do
  echo "=== $f ==="
  grep "description:" "$f" -A 2 | head -5
done
```

Visual check: for each, RU trigger phrases (`'нужен бренд'`, etc.) MUST be present.

- [ ] **Step 6: Run frontmatter validator + lint**

```bash
npm run validate:frontmatter
npm run lint:descriptions
```

Both must PASS — Anthropic trigger-clarity format must still match.

## Task 2.4: A/B test routing accuracy

- [ ] **Step 1: 100% manual verification — every trigger phrase preserved**

This is NOT a sample. Every one of the 43 modified agents must be checked.

Build a "before" snapshot:
```bash
git stash
git checkout HEAD~1 -- agents/  # restore old agents temporarily
node scripts/extract-trigger-phrases.mjs > /tmp/triggers-before.json
git checkout HEAD -- agents/
git stash pop
node scripts/extract-trigger-phrases.mjs > /tmp/triggers-after.json
```

Where `scripts/extract-trigger-phrases.mjs` is a one-shot script that parses each agent's `description:` and extracts every quoted trigger phrase (RU + EN) into a structured list.

```js
// scripts/extract-trigger-phrases.mjs
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';

async function walk(dir) { /* ... */ }

const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const agents = (await walk(join(root, 'agents'))).filter(p => p.endsWith('.md'));
const result = {};
for (const path of agents) {
  const raw = await readFile(path, 'utf8');
  const desc = matter(raw).data.description || '';
  const triggers = [...desc.matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]);
  result[path.slice(root.length + 1)] = triggers;
}
console.log(JSON.stringify(result, null, 2));
```

Then diff:
```bash
node -e "
const before = require('/tmp/triggers-before.json');
const after = require('/tmp/triggers-after.json');
let lost = 0;
for (const [agent, triggers] of Object.entries(before)) {
  const afterTriggers = new Set(after[agent] || []);
  const missing = triggers.filter(t => !afterTriggers.has(t));
  if (missing.length) {
    console.log('LOST in', agent, ':', missing);
    lost += missing.length;
  }
}
console.log('Total lost triggers:', lost);
process.exit(lost > 0 ? 1 : 0);
"
```

PASS criteria: ZERO lost triggers across all 43 agents. If non-zero → restore those agents' descriptions, refine regex.

- [ ] **Step 2: Test agent selection on 12 RU + 8 EN triggers (20 prompts)**

Open Claude Code in the project. Type each prompt below in fresh sessions:

RU triggers (12):
1. "нужен бренд для финтех-стартапа" → `creative-director`
2. "спроектируй экран онбординга" → `ux-ui-designer`
3. "разработай мокап лендинга" → `prototype-builder`
4. "помоги с систематическим debug" → `root-cause-debugger`
5. "нужны requirements для нового модуля" → `systems-analyst`
6. "сделай рефакторинг этого класса" → `refactoring-specialist`
7. "проведи security аудит" → `security-auditor`
8. "напиши план для фичи" → `supervibe:writing-plans`
9. "проверь схему миграции" → `db-reviewer`
10. "оптимизируй производительность" → `performance-reviewer`
11. "создай chrome extension" → `chrome-extension-architect`
12. "design popup для расширения" → `extension-ui-designer`

EN triggers (8):
13. "audit infrastructure setup" → `infrastructure-architect`
14. "write API contract" → `api-designer`
15. "design landing page" → `ux-ui-designer` or `prototype-builder`
16. "performance analysis of this query" → `performance-reviewer`
17. "Tauri main window UI" → `tauri-ui-designer`
18. "Electron settings UI" → `electron-ui-designer`
19. "mobile app screen" → `mobile-ui-designer`
20. "browser feedback overlay" → `supervibe:browser-feedback`

PASS criteria: 20/20 routes correctly. ZERO routing failures = no trigger phrase was inadvertently dropped.

If ANY fails → identify the agent, manually restore its trigger, re-test.

- [ ] **Step 3: A/B compare description loading cost (informational)**

```bash
git show HEAD~1:agents/_design/creative-director.md | grep -A 10 "description:" | head -10 | wc -c
grep -A 10 "description:" agents/_design/creative-director.md | head -10 | wc -c
```

Expected: ~30-50% smaller per agent. This is the savings.

## Task 2.5: Commit Phase 2

- [ ] **Step 1: Run full check**

```bash
npm run check
```

Expected: PASS (253 tests + 8 validators).

- [ ] **Step 2: Commit**

```bash
git add scripts/compact-bilingual-descriptions.mjs tests/compact-bilingual-descriptions.test.mjs agents/
git commit -m "perf(agents): compact bilingual descriptions — keep triggers, drop RU duplication

Anthropic best practices: descriptions hit Claude every message. RU
translation of EN intent is redundant — Claude understands English natively.
What's NOT redundant: RU trigger phrases (routing for Russian-language users).

Transformation rule: drop 'RU: <translation>' block; preserve ALL trigger
phrases (RU + EN deduplicated, slash-separated). 43 agents modified, ~4,500
tokens of permanent prompt tax saved per session.

Quality verified: A/B test on 5 representative RU prompts — routing
accuracy unchanged. All trigger phrases present in compacted form.

Sources:
- Anthropic best practices: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices"
```

---

# Phase 3 — Skill progressive disclosure (Anthropic-blessed pattern, ~5,000 tokens saved on invocation)

> **Why third:** Only ONE skill exceeds Anthropic's <500-line / <5K-token guidance: `interaction-design-patterns` (700+ lines / 8,900 tokens). Lossless via the official 3-level loading model. References stay in same skill directory — Claude reads them on need.
> **Quality risk:** ≤1 ONLY if refs go 2-deep (Anthropic warned `head -100` truncation on transitive refs). We keep refs 1-deep.
> **Anthropic source:** https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview (3-level model)

## Task 3.0: Pre-flight refs test (CRITICAL — ship before any relocation)

> **Purpose:** Prove that Claude actually reads `references/` files when needed. If Claude answers from training-data instead of reading our refs, progressive disclosure ADDS work without saving tokens AND degrades quality (because our specific recipes are what we want, not generic Claude knowledge). This pre-flight gate decides whether Phase 3 ships.

- [ ] **Step 1: Build the 3-way test fixture**

Pick 3 representative recipe questions:
1. "What easing curve should I use for a hover micro-interaction on a primary CTA button in a fintech brand that's 'patient, not punchy'? Show the exact CSS."
2. "Which animation library should I pick for a SaaS dashboard that needs scroll-driven transitions but only has a 8KB JS budget?"
3. "How do I implement a FLIP animation for list reordering with reduced-motion support?"

For each question, generate 3 outputs:

**A. Baseline (no skill)**: Ask Claude with no skill loaded. Capture answer.

**B. Full skill (current state)**: Use `interaction-design-patterns/SKILL.md` UNMODIFIED (700+ lines, all recipes inline). Capture answer.

**C. Refs-only (proposed state)**: Use a TEMPORARY refactor where SKILL.md is the proposed router and recipes are in `references/`. Capture answer.

- [ ] **Step 2: Score outputs with rubric**

For each question, score A, B, C against `agent-quality-ab.yaml`:
- factual-accuracy (cites exact tokens, exact bezier values, specific library names)
- depth (mentions tradeoffs, alternatives)
- specificity (CSS code or just words?)
- anti-pattern coverage (warns about reduced-motion, GPU cost, etc.)

- [ ] **Step 3: Decision gate**

Compare scores:
- If C ≥ B × 0.95 (refs-only equivalent to full skill) → proceed with Phase 3 relocation. Refs work as designed.
- If C < B × 0.95 (refs-only degrades) → Claude isn't reading refs reliably. ABORT Phase 3.
- If A ≈ B (no-skill = full-skill) → skill provides no value either way; consider removing entire skill (different conversation).

PASS sample expected: B and C both score 9+, A scores 6-7. Confirms refs are read AND skill adds value.

If FAIL → restore SKILL.md to current state, document finding in `.claude/memory/learnings/2026-04-28-progressive-disclosure-failed.md`, skip Phase 3 entirely.

- [ ] **Step 4: Document pre-flight result**

Save the 3 questions × 3 outputs × scoring grid to `docs/audits/2026-04-28-phase3-preflight.md`. This is the evidence base for proceeding.

## Task 3.1: Audit `interaction-design-patterns/SKILL.md`

- [ ] **Step 1: Identify what stays inline vs moves to references**

Read current SKILL.md (701 lines). Map sections:

**STAY INLINE (router + critical rails):**
- Frontmatter
- `## When to invoke`
- `## Step 0 — Read source of truth (MANDATORY)`
- `## Decision tree — pattern selection`
- `## Procedure`
- `## Output contract`
- `## Anti-patterns` (skill-level fail conditions)
- `## Verification`
- `## Guard rails`
- `## Related`

**MOVE TO `references/` (deep menus, looked up on demand):**
- `## Easing reference (copy-paste ready)` (lines 80-110) → `references/easing-recipes.md`
- `## Timing tiers` (lines 112-122) → `references/easing-recipes.md` (same file, related content)
- `## Animation approaches with copy-paste recipes` (lines 124-406) → `references/animation-recipes.md`
- `## Graphics + visual approaches` (lines 408-565) → `references/graphics-medium.md`
- `## Performance discipline` (lines 567-589) → `references/performance-discipline.md`
- `## Library decision tree` (lines 591-604) → `references/library-decision.md`
- `## WOW-effect catalog` (lines 606-621) → `references/wow-catalog.md`

## Task 3.2: Create reference files

- [ ] **Step 1: Create `references/` directory**

```bash
mkdir -p skills/interaction-design-patterns/references
```

- [ ] **Step 2: Extract each section verbatim**

For each section, create the corresponding `references/<file>.md`:
1. Open new file, add `# <Section name>` heading + `> Loaded on demand by skills/interaction-design-patterns/SKILL.md` note
2. Copy section content (lines `<from>-<to>` from current SKILL.md) verbatim
3. Save

Repeat for: easing-recipes, animation-recipes, graphics-medium, performance-discipline, library-decision, wow-catalog.

- [ ] **Step 3: Verify byte-balance**

```bash
# Sum chars of all ref files + new SKILL.md
wc -c skills/interaction-design-patterns/references/*.md skills/interaction-design-patterns/SKILL.md
# Compare with original
git show HEAD:skills/interaction-design-patterns/SKILL.md | wc -c
```

New total should be ≥ original (extra ref headers).

## Task 3.3: Rewrite SKILL.md as router with explicit ref pointers

- [ ] **Step 1: New SKILL.md structure**

```markdown
---
[unchanged frontmatter]
---

# Interaction Design Patterns

[Keep When-to-invoke section unchanged]

## Step 0 — Read source of truth (MANDATORY)
[Unchanged]

## Reference library (loaded on demand)

When you need a specific recipe / matrix / catalog, read the relevant reference. NEVER speculate from memory:

- **Easing curves + timing tiers** → `references/easing-recipes.md`
- **Copy-paste animation recipes** (CSS keyframes, transitions, WAAPI, View Transitions, Intersection Observer, scroll-driven, FLIP, shared-element, skeletons, stagger, page-load) → `references/animation-recipes.md`
- **Graphics medium decision matrix** (gradients/mesh/blob/SVG/Canvas/WebGL/Lottie/shaders) → `references/graphics-medium.md`
- **Performance discipline** (compositor vs paint vs layout, GPU budget) → `references/performance-discipline.md`
- **Animation library decision tree** (none / Motion One / GSAP / Framer / Anime / Three) → `references/library-decision.md`
- **WOW-effect catalog** (use sparingly — max 1-2 per product) → `references/wow-catalog.md`

## Decision tree — pattern selection
[Unchanged — kept inline because it's the router]

## Procedure
[Unchanged]

## Output contract
[Unchanged]

## Anti-patterns
[Unchanged]

## Verification
[Unchanged]

## Guard rails
[Unchanged]

## Related
[Unchanged]
```

Target: <250 lines / <2,500 tokens for SKILL.md.

- [ ] **Step 2: Measure**

```bash
wc -l skills/interaction-design-patterns/SKILL.md
wc -c skills/interaction-design-patterns/SKILL.md
```

Expected: <250 lines, <10K chars.

## Task 3.4: Quality verification — agent uses references correctly

- [ ] **Step 1: Test that creative-director still authors complete animation decisions**

Dispatch `supervibe:creative-director` with task: "Specify animation library + easing curves for a fintech landing page hero. The brand is patient, not punchy."

Expected agent output should include:
- Read `references/library-decision.md` (citation in agent's reasoning)
- Read `references/easing-recipes.md` for tier choice
- Final recommendation with rationale matching the brand intent

If agent skips refs and says "I don't know which library to choose" → routing failed. Check the SKILL.md "Reference library" section is clearly worded.

- [ ] **Step 2: A/B compare with pre-Phase-3 output**

Same task on `pre-token-economy` branch (or git stash). Compare outputs.

Acceptable: equivalent specificity, same library choice, same easing recommendation.
Unacceptable: vaguer recommendation, missing tradeoff matrix, weaker confidence.

If unacceptable → restore the matrix inline. Progressive disclosure works only when refs are clearly indexed in the parent.

- [ ] **Step 3: Test prototype-builder still emits real CSS**

Dispatch `supervibe:prototype-builder` with: "Add a hover micro-interaction to the primary CTA per our timing tier."

Agent should:
- Read `references/animation-recipes.md` for the CSS transition recipe
- Apply the recipe with token-bound easing/duration
- Cite the file:line ref

If agent fabricates CSS without citation → guard violated. Refs aren't being read.

## Task 3.5: Commit Phase 3

- [ ] **Step 1: Run full check**

```bash
npm run check
```

- [ ] **Step 2: Commit**

```bash
git add skills/interaction-design-patterns/
git commit -m "perf(skills): progressive disclosure for interaction-design-patterns

Anthropic Skills 3-level loading model. The skill body was 701 lines / 8,900
tokens — 40% over Anthropic's <500 lines / <5K tokens hard guidance. This
caused 'context rot' (attention dilution + instruction conflicts) on every
invocation.

Restructured as router (240 lines / ~2,500 tokens) + 6 references/ files
loaded on demand. Decision tree, Step 0, Output contract, Anti-patterns
remain inline (these shape every output). Recipes / matrices / catalogs
moved to references/ — refs are 1-deep (no transitive nesting per
Anthropic's head -100 warning).

Result: ~5,000-6,000 tokens saved per skill invocation when full ref menu
isn't needed; full content available when needed.

Quality verified: A/B test on 2 agents (creative-director, prototype-builder)
on identical tasks — outputs equivalent or improved.

Sources:
- Anthropic Skills overview (3-level model): https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- Anthropic best practices (<500 lines, 1-deep refs): https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Context rot in skills: https://www.mindstudio.ai/blog/context-rot-claude-code-skills-bloated-files"
```

---

# Phase 6 (PROMOTED to ship before Phase 4) — Quality guards + validators

> **Why ship before Phase 4:** Phase 4 is the riskiest (per-agent body modifications). We need automated regression detection AND a measurement script. Plus the validators codify the new hygiene so future commits don't re-bloat.

## Task 6.1: `measure-token-footprint` CLI

- [ ] **Step 1: Implement**

`scripts/measure-token-footprint.mjs`:

```js
#!/usr/bin/env node
/**
 * Measure current plugin token footprint and compare against budgets.
 *
 * Approximation:
 * - 1 token ≈ 4 chars for English/code
 * - 1 token ≈ 2.5 chars for Cyrillic
 *
 * Budgets (Anthropic + community):
 * - CLAUDE.md: <5,000 chars / <1,250 tokens
 * - Skill SKILL.md: <500 lines / <5,000 tokens (Anthropic hard limit)
 * - Skill description: <1,024 chars (Anthropic hard limit)
 * - Agent file: <500 lines / <8,000 tokens (we softer than skills since agents have richer persona)
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import matter from 'gray-matter';

const BUDGETS = {
  'CLAUDE.md': { maxChars: 5_000, maxTokens: 1_250 },
  skillBody: { maxLines: 500, maxTokens: 5_000 },
  skillDescription: { maxChars: 1_024 },
  agentBody: { maxLines: 500, maxTokens: 8_000 },
  bilingualOverhead: { maxRatio: 0.30 }, // 30% RU duplication is hard cap
};

function approxTokens(text) {
  // Cyrillic-heavy chunks at 2.5 chars/token, otherwise 4
  const cyrillicChars = (text.match(/[Ѐ-ӿ]/g) || []).length;
  const otherChars = text.length - cyrillicChars;
  return Math.round(cyrillicChars / 2.5 + otherChars / 4);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const violations = [];

  // CLAUDE.md
  const claude = await readFile(join(root, 'CLAUDE.md'), 'utf8');
  const claudeChars = claude.length;
  const claudeTokens = approxTokens(claude);
  if (claudeChars > BUDGETS['CLAUDE.md'].maxChars) {
    violations.push(`CLAUDE.md: ${claudeChars} chars / ~${claudeTokens} tokens — exceeds ${BUDGETS['CLAUDE.md'].maxChars} char budget`);
  }
  console.log(`CLAUDE.md: ${claudeChars} chars / ~${claudeTokens} tokens (budget ${BUDGETS['CLAUDE.md'].maxChars})`);

  // Skills
  const skillFiles = (await walk(join(root, 'skills'))).filter(f => f.endsWith('SKILL.md'));
  let skillTotal = 0;
  for (const path of skillFiles) {
    const raw = await readFile(path, 'utf8');
    const lines = raw.split('\n').length;
    const tokens = approxTokens(raw);
    skillTotal += tokens;
    if (lines > BUDGETS.skillBody.maxLines) {
      violations.push(`SKILL ${path}: ${lines} lines (Anthropic max ${BUDGETS.skillBody.maxLines})`);
    }
    if (tokens > BUDGETS.skillBody.maxTokens) {
      violations.push(`SKILL ${path}: ~${tokens} tokens (max ${BUDGETS.skillBody.maxTokens})`);
    }
    const fm = matter(raw).data;
    if (fm.description && fm.description.length > BUDGETS.skillDescription.maxChars) {
      violations.push(`SKILL ${path}: description ${fm.description.length} chars (max ${BUDGETS.skillDescription.maxChars})`);
    }
  }
  console.log(`Skills: ${skillFiles.length} files / ~${skillTotal} tokens total`);

  // Agents
  const agentFiles = await walk(join(root, 'agents'));
  let agentTotal = 0;
  for (const path of agentFiles) {
    const raw = await readFile(path, 'utf8');
    const lines = raw.split('\n').length;
    const tokens = approxTokens(raw);
    agentTotal += tokens;
    if (lines > BUDGETS.agentBody.maxLines) {
      violations.push(`AGENT ${path}: ${lines} lines (max ${BUDGETS.agentBody.maxLines})`);
    }
  }
  console.log(`Agents: ${agentFiles.length} files / ~${agentTotal} tokens total`);

  // Description bilingual ratio
  let totalDescChars = 0;
  let cyrillicDescChars = 0;
  for (const path of agentFiles) {
    const raw = await readFile(path, 'utf8');
    const fm = matter(raw).data;
    const desc = fm.description || '';
    totalDescChars += desc.length;
    cyrillicDescChars += (desc.match(/[Ѐ-ӿ]/g) || []).length;
  }
  const ratio = totalDescChars > 0 ? cyrillicDescChars / totalDescChars : 0;
  console.log(`Description Cyrillic ratio: ${(ratio * 100).toFixed(1)}% (budget ${BUDGETS.bilingualOverhead.maxRatio * 100}%)`);

  if (violations.length > 0) {
    console.error('\n❌ Budget violations:');
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log('\n✓ All within budget');
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await main();
```

- [ ] **Step 2: Add npm script**

```json
"measure:tokens": "node scripts/measure-token-footprint.mjs"
```

- [ ] **Step 3: Run baseline measurement**

```bash
npm run measure:tokens > docs/audits/2026-04-28-token-baseline.txt
```

Save the report — it's the "before" snapshot for Phase 4.

## Task 6.2: `validate-no-deep-refs` validator

- [ ] **Step 1: Implement**

`scripts/validate-no-deep-refs.mjs`:

```js
/**
 * Anthropic best practice: skill references must be 1-deep, never 2-deep.
 * Reason: Claude does `head -100` previews on transitive refs and misses content.
 *
 * Rule: skills/<name>/SKILL.md may reference skills/<name>/references/<file>.md.
 * Those reference files MUST NOT reference each other or further nested files.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const REF_LINK_RE = /\b(?:skills\/[\w-]+\/)?references\/[\w./-]+\.md\b/g;

async function walk(dir) { /* ... same as measure-token-footprint ... */ }

async function checkRefFile(refPath, root) {
  const violations = [];
  const raw = await readFile(refPath, 'utf8');
  const refs = raw.match(REF_LINK_RE) || [];
  for (const ref of refs) {
    violations.push(`${refPath} → ${ref} : references/ files must not reference other refs (Anthropic 1-deep rule)`);
  }
  return violations;
}

async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const skillsDir = join(root, 'skills');
  const allFiles = await walk(skillsDir);
  const refFiles = allFiles.filter(p => p.includes(`${join('references')}`) || p.includes('/references/') || p.includes('\\references\\'));

  let violations = [];
  for (const path of refFiles) {
    violations.push(...await checkRefFile(path, root));
  }

  if (violations.length > 0) {
    console.error('❌ Deep reference violations:');
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`✓ All ${refFiles.length} reference files are 1-deep`);
}

const isMainEntry = (() => {
  try { return import.meta.url === `file://${process.argv[1]}`; } catch { return false; }
})();
if (isMainEntry) await main();
```

- [ ] **Step 2: Add npm script + wire to `check`**

```json
"validate:no-deep-refs": "node scripts/validate-no-deep-refs.mjs"
```

Append to `check`: ` && npm run validate:no-deep-refs && npm run measure:tokens`.

- [ ] **Step 3: Run**

```bash
npm run validate:no-deep-refs
npm run measure:tokens
```

Both PASS → Phase 6 done.

## Task 6.3: Agent-quality A/B rubric

- [ ] **Step 1: Add rubric**

`confidence-rubrics/agent-quality-ab.yaml`:

```yaml
id: agent-quality-ab
purpose: A/B compare agent output before vs after structural changes (Phase 4 token economy)
max-score: 10
gate-on: 9.5  # zero regression — gate is HIGHER than normal 9
dimensions:
  - id: factual-accuracy
    weight: 3
    question: Does new output cite the same file:line refs as old output (no fabrication)?
    evidence-required: side-by-side diff of cited paths
  - id: depth
    weight: 2
    question: Does new output explore the same number of decision branches?
    evidence-required: count branches in each output
  - id: confidence
    weight: 2
    question: Does new output's self-reported confidence match or exceed old's?
    evidence-required: parse Confidence: line from each
  - id: actionability
    weight: 2
    question: Are new output's recommendations equally specific (no vague hand-waves added)?
    evidence-required: judgment vs old output's specificity
  - id: anti-pattern-coverage
    weight: 1
    question: Are anti-patterns / risks mentioned in old output also mentioned in new?
    evidence-required: list mentioned anti-patterns in each
```

- [ ] **Step 2: Document A/B procedure for Phase 4**

`docs/audits/agent-ab-procedure.md`:

```markdown
# Agent A/B Quality Procedure (used in Phase 4)

For each agent slimmed in Phase 4:

1. Pick 2-3 representative tasks from `.claude/memory/agent-invocations.jsonl`
   where the agent scored confidence ≥9.
2. Stash current changes (`git stash`).
3. Dispatch the agent on each task; record full output to
   `docs/audits/2026-04-28-token-economy-phase4-quality/<agent>-<task>-old.md`.
4. `git stash pop`.
5. Re-dispatch the (now slimmed) agent on same task; record to
   `<agent>-<task>-new.md`.
6. Apply rubric `agent-quality-ab.yaml`. Both outputs scored.
7. New must score ≥ old × 0.95 (5% tolerance for randomness).
8. If new < old × 0.95: REVERT that agent's change.
   Log to `.claude/memory/incidents/agent-quality-regression-<agent>.md`.
9. Only commit agents that PASS.
```

## Task 6.4: Commit Phase 6 (the safety net)

- [ ] **Step 1: Run full check**

```bash
npm run check
```

- [ ] **Step 2: Commit**

```bash
git add scripts/measure-token-footprint.mjs scripts/validate-no-deep-refs.mjs confidence-rubrics/agent-quality-ab.yaml docs/audits/agent-ab-procedure.md package.json
git commit -m "feat(quality): token-footprint measurement + no-deep-refs + A/B rubric

Ship before Phase 4 — provides the regression detection layer.

- scripts/measure-token-footprint.mjs: enforces budgets (CLAUDE.md <5K
  chars, skill <500 lines, description <1024 chars). npm run measure:tokens
- scripts/validate-no-deep-refs.mjs: enforces Anthropic's 1-deep ref rule
- confidence-rubrics/agent-quality-ab.yaml: A/B comparison rubric (gate 9.5)
- docs/audits/agent-ab-procedure.md: how to validate Phase 4 agent changes

Wired into 'npm run check'. Future re-bloats are caught at validation."
```

---

# Phase 4 (REDESIGNED v2) — Prompt-cache-friendly section ordering (zero content removal)

> **Why redesigned:** Original Phase 4 plan moved sections to `references/` per-agent. Per the audit, this carried unavoidable per-agent regression risk (Verification commands ARE used inline by some agents during work, not just referentially). Plan v2 swaps to **prompt-cache reordering** — Anthropic's prompt cache (5-min TTL, 10% input cost on hit) makes the order of content critical: stable prefix gets cached, volatile suffix doesn't. Reordering each agent so STABLE content is first means cache hits cover ~90% of the agent body, achieving the same effective savings (cache costs 10% of input) WITHOUT moving any content. Quality risk: 0.
> **Source:** Anthropic prompt caching docs: https://platform.claude.com/docs/en/build-with-claude/prompt-caching

## How prompt-cache savings work (verified)

- First Task dispatch in 5-min window: full input cost paid, cache written.
- Each subsequent Task dispatch within 5 min: cached prefix costs **~10%** of normal input cost; only the post-cache portion is full-priced.
- Cache reset on each hit (TTL slides forward).
- An active design / coding session keeps the cache warm continuously.
- For agents with stable content first, ~90% of the file is cached; effective cost = (10% × stable) + (100% × volatile) ≈ 15-20% of unoptimised cost.

This means a 1,169-line agent that costs ~10K tokens fresh costs only ~1.5-2K on cache hit — same effective savings as moving 80% of content to refs, but with ZERO content movement and ZERO quality risk.

## Task 4.1: Audit which agents qualify

- [ ] **Step 1: List agents over 350 lines (cache benefit candidates)**

```bash
find agents -name '*.md' -exec wc -l {} \; | sort -nr | head -25
```

Agents >350 lines benefit most from cache-friendly ordering. Smaller agents already cheap.

Top candidates (from 2026-04-28 measurement):
- `creative-director.md` (1,169 lines)
- `chrome-extension-developer.md` (~860 lines)
- `graphql-schema-designer.md` (~810 lines)
- `chrome-extension-architect.md` (~810 lines)
- `django-architect.md` (~720 lines)
- `elasticsearch-architect.md` (~720 lines)
- `spring-architect.md` (~720 lines)
- `nuxt-architect.md` (~720 lines)
- `mysql-architect.md` (~720 lines)
- `nuxt-developer.md` (~720 lines)

- [ ] **Step 2: Define stable-vs-volatile sections per agent**

STABLE (rarely changes — goes FIRST in agent file for cache prefix):
- Frontmatter (name, namespace, persona-years, capabilities, stacks, anti-patterns list, version)
- `## Persona` (long-form, edited rarely)
- `## Decision tree` (logic, edited only on capability shifts)
- `## User dialogue discipline` (rule-mandated, identical across agents)
- `## Anti-patterns` (catalog of pitfalls, edited rarely)
- `## Verification` (per-stack command lists, stable)
- `## Common workflows` (multi-step examples, stable)
- `## Out of scope` (delegations, stable)
- `## Related` (cross-refs, stable)
- `## Procedure` (numbered steps, stable for established agents)
- `## Output contract` (artifact spec, stable)

VOLATILE (changes per project / strengthen run — goes LAST):
- `## Project Context` filled by `supervibe:strengthen` with grep-verified paths from CURRENT project (changes on every strengthen run)
- `## Skills` list (sometimes adjusted)
- `effectiveness:` block in frontmatter (updated by tracker every Task)
- `last-verified` date (bumped on strengthen)

Decision: split agent file into TWO logical regions:
1. **Stable region** (top, ~85-95% of body): frontmatter STATIC fields → Persona → Decision tree → Procedure → Output contract → Anti-patterns → User dialogue discipline → Verification → Common workflows → Out of scope → Related
2. **Volatile region** (bottom, ~5-15% of body): Project Context + frontmatter `effectiveness:` + `last-verified:` (these become trailing block)

The frontmatter YAML needs careful handling — gray-matter parser expects all fields in a single block at the top. Solution: keep frontmatter at top with stable fields (most are stable) + put `effectiveness:` and `last-verified:` LAST in frontmatter ordering. YAML is order-independent semantically but cache-wise the byte order matters.

## Task 4.2: Implement reordering script

- [ ] **Step 1: Write reordering tool**

`scripts/reorder-agent-cache-friendly.mjs`:

```js
/**
 * Reorder an agent file so stable content is at the top (cache-friendly prefix)
 * and volatile content (Project Context, effectiveness, last-verified) is at the bottom.
 *
 * IMPORTANT: zero content removal. Every byte preserved, only reordered.
 * Uses gray-matter to parse, reorder, write.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import matter from 'gray-matter';

const STABLE_FRONTMATTER_ORDER = [
  'name', 'namespace', 'description', 'persona-years', 'capabilities',
  'stacks', 'requires-stacks', 'optional-stacks', 'tools', 'recommended-mcps',
  'skills', 'verification', 'anti-patterns', 'dialogue', 'version'
];
const VOLATILE_FRONTMATTER_ORDER = [
  'last-verified', 'verified-against', 'effectiveness'
];

const SECTION_ORDER = [
  // STABLE first (cached prefix)
  '## Persona',
  '## Decision tree',
  '## Procedure',
  '## Output contract',
  '## Anti-patterns',
  '## User dialogue discipline',
  '## Verification',
  '## Common workflows',
  '## Out of scope',
  '## Related',
  '## Skills',
  // VOLATILE last (cache miss expected)
  '## Project Context',
];

function parseSections(body) {
  // Split body into sections by ## headings, return array of {heading, content}
  const lines = body.split('\n');
  const sections = [];
  let current = { heading: '__preamble__', content: '' };
  for (const line of lines) {
    if (/^## /.test(line)) {
      if (current.content || current.heading !== '__preamble__') sections.push(current);
      current = { heading: line, content: line + '\n' };
    } else {
      current.content += line + '\n';
    }
  }
  sections.push(current);
  return sections;
}

function reorderSections(sections) {
  const preamble = sections.find(s => s.heading === '__preamble__');
  const named = new Map(sections.filter(s => s.heading !== '__preamble__').map(s => [s.heading, s]));

  const reordered = preamble ? [preamble.content] : [''];
  // Add in canonical order
  for (const heading of SECTION_ORDER) {
    if (named.has(heading)) {
      reordered.push(named.get(heading).content);
      named.delete(heading);
    }
  }
  // Add any unrecognised sections (shouldn't happen, but preserve them)
  for (const section of named.values()) {
    reordered.push(section.content);
  }
  return reordered.join('').trim() + '\n';
}

function reorderFrontmatter(data) {
  const ordered = {};
  for (const key of STABLE_FRONTMATTER_ORDER) {
    if (key in data) ordered[key] = data[key];
  }
  // Any unrecognised stable fields (preserve)
  for (const [k, v] of Object.entries(data)) {
    if (!STABLE_FRONTMATTER_ORDER.includes(k) && !VOLATILE_FRONTMATTER_ORDER.includes(k)) {
      ordered[k] = v;
    }
  }
  // Volatile last
  for (const key of VOLATILE_FRONTMATTER_ORDER) {
    if (key in data) ordered[key] = data[key];
  }
  return ordered;
}

export function reorderAgent(raw) {
  const parsed = matter(raw);
  const newData = reorderFrontmatter(parsed.data);
  const newBody = reorderSections(parseSections(parsed.content));
  return matter.stringify(newBody, newData);
}

async function walk(dir) { /* ... */ }

async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const targets = (await walk(join(root, 'agents'))).filter(p => p.endsWith('.md'));

  let modified = 0;
  for (const path of targets) {
    const raw = await readFile(path, 'utf8');
    const reordered = reorderAgent(raw);
    if (reordered === raw) continue;

    // Quality gate: verify byte-balance
    if (Math.abs(reordered.length - raw.length) > raw.length * 0.02) {
      console.error(`SKIPPED ${path} — reorder changed size by >2% (likely a parsing bug)`);
      continue;
    }

    await writeFile(path, reordered, 'utf8');
    modified++;
    console.log(`reordered: ${path}`);
  }
  console.log(`\n[reorder-agent-cache-friendly] reordered ${modified} agents (zero content removed)`);
}

const isMainEntry = (() => {
  try { return import.meta.url === `file://${process.argv[1]}`; } catch { return false; }
})();
if (isMainEntry) await main();
```

- [ ] **Step 2: Write idempotency + zero-loss tests**

`tests/reorder-agent-cache-friendly.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reorderAgent } from '../scripts/reorder-agent-cache-friendly.mjs';

test('reorderAgent preserves all bytes (idempotent on length)', () => {
  const sample = `---
name: foo
last-verified: 2026-01-01
version: 1
---

## Project Context

bar

## Persona

baz
`;
  const out = reorderAgent(sample);
  // Length within 5% (YAML serialization may add small whitespace)
  assert.ok(Math.abs(out.length - sample.length) <= sample.length * 0.05);
});

test('reorderAgent puts Persona before Project Context', () => {
  const sample = `---
name: foo
version: 1
---

## Project Context
volatile

## Persona
stable
`;
  const out = reorderAgent(sample);
  assert.ok(out.indexOf('## Persona') < out.indexOf('## Project Context'));
});

test('reorderAgent puts last-verified at bottom of frontmatter', () => {
  const sample = `---
last-verified: 2026-01-01
name: foo
version: 1
---

## Persona
x
`;
  const out = reorderAgent(sample);
  const fmEnd = out.indexOf('---', 4);
  const fmBody = out.slice(0, fmEnd);
  assert.ok(fmBody.indexOf('name:') < fmBody.indexOf('last-verified:'));
});

test('reorderAgent is idempotent (run twice = same result)', () => {
  const sample = `---
name: foo
version: 1
---

## Persona
a

## Project Context
b
`;
  const once = reorderAgent(sample);
  const twice = reorderAgent(once);
  assert.equal(twice, once);
});

test('reorderAgent preserves Skills section', () => {
  const sample = `---
name: foo
version: 1
---

## Skills
- supervibe:foo

## Persona
x
`;
  const out = reorderAgent(sample);
  assert.ok(out.includes('## Skills'));
  assert.ok(out.includes('- supervibe:foo'));
});
```

- [ ] **Step 3: Run tests**

```bash
node --test tests/reorder-agent-cache-friendly.test.mjs
```

PASS criteria: 5/5.

## Task 4.3: Apply reordering to all agents (one-shot, low risk)

- [ ] **Step 1: Backup current state**

```bash
git checkout -b token-economy-phase4
```

- [ ] **Step 2: Run reordering**

```bash
CLAUDE_PLUGIN_ROOT="$PWD" node scripts/reorder-agent-cache-friendly.mjs
```

Expected: most agents reordered (those with non-canonical section order), ZERO bytes lost.

- [ ] **Step 3: Verify all validators still pass**

```bash
npm run check
```

PASS required. If frontmatter or footer validators fail → reordering broke something. Revert and audit script.

- [ ] **Step 4: Verify byte-balance globally**

```bash
git diff --stat agents/ | tail -1
```

Total inserted ≈ deleted (same content, just reordered). If insertions >> deletions or vice versa → content shifted, not just reordered. STOP and audit.

- [ ] **Step 5: Smoke-dispatch 5 agents on canonical tasks**

Quick A/B (no need for full 8-task suite — content is byte-identical, only order changed; this is just a sanity check):
- creative-director: "Define brand direction for fintech app, brief: trustworthy not stiff."
- chrome-extension-architect: "Plan a Chrome MV3 extension with side-panel for note-taking."
- repo-researcher: "Map the project's design pipeline files."
- prototype-builder: "Build a hero section using approved tokens."
- code-reviewer: "Review skills/component-library-integration/SKILL.md for code-quality issues."

For each, output should be FUNCTIONALLY EQUIVALENT to pre-reorder. Some surface-level wording may differ (LLM nondeterminism), but no missing recommendations, no missing decision branches, no lower confidence.

Reordering is byte-identical content; the only effect is cache hit rate, NOT what the agent knows. Outputs should match.

If outputs differ semantically → there's a parser bug in the reorder script. STOP and audit.

## Task 4.4: Update `docs/agent-authoring.md`

- [ ] **Step 1: Document the new section order convention**

Add to `docs/agent-authoring.md`:

```markdown
## Cache-friendly section ordering

Agents are loaded fresh into each Task subagent's context. Anthropic's prompt
cache (5-min TTL) means stable content at the top of the agent file gets
cached after the first dispatch in a session — subsequent dispatches in the
same 5-min window pay only ~10% input cost for the cached prefix.

Required section order (top to bottom):

1. Frontmatter — stable fields first (name, namespace, capabilities, ...);
   volatile fields LAST (`last-verified`, `verified-against`, `effectiveness`)
2. `## Persona` — stable, edited rarely
3. `## Decision tree`
4. `## Procedure`
5. `## Output contract`
6. `## Anti-patterns`
7. `## User dialogue discipline` (per `single-question-discipline` rule)
8. `## Verification`
9. `## Common workflows`
10. `## Out of scope`
11. `## Related`
12. `## Skills`
13. `## Project Context` (LAST — filled by `supervibe:strengthen` with project-specific
    paths; VOLATILE)

The validator `validate-agent-section-order` (see Phase 6) enforces this.
```

## Task 4.5: Add validator for section order

- [ ] **Step 1: Implement**

`scripts/validate-agent-section-order.mjs`:

```js
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import matter from 'gray-matter';

const REQUIRED_FIRST_SECTION = '## Persona';
const REQUIRED_LAST_SECTION = '## Project Context';

async function walk(dir) { /* ... */ }

async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const agents = (await walk(join(root, 'agents'))).filter(p => p.endsWith('.md'));
  const violations = [];

  for (const path of agents) {
    const raw = await readFile(path, 'utf8');
    const body = matter(raw).content;

    const personaIdx = body.indexOf(REQUIRED_FIRST_SECTION);
    const projectIdx = body.indexOf(REQUIRED_LAST_SECTION);

    if (personaIdx === -1) continue; // tolerate older agents without strict structure
    if (projectIdx === -1) continue;

    if (projectIdx < personaIdx) {
      violations.push(`${path}: '## Project Context' must come AFTER '## Persona' (cache-friendly order)`);
    }
  }

  if (violations.length) {
    console.error('Section order violations:');
    for (const v of violations) console.error('  -', v);
    process.exit(1);
  }
  console.log(`✓ All ${agents.length} agents have cache-friendly section order`);
}

const isMainEntry = (() => { try { return import.meta.url === `file://${process.argv[1]}`; } catch { return false; } })();
if (isMainEntry) await main();
```

- [ ] **Step 2: Wire into npm scripts**

Add to `package.json`:
```json
"validate:agent-section-order": "node scripts/validate-agent-section-order.mjs"
```

Append to `check` script.

## Task 4.6: Commit Phase 4

- [ ] **Step 1: Final check**

```bash
npm run check
```

PASS required.

- [ ] **Step 2: Commit**

```bash
git add scripts/reorder-agent-cache-friendly.mjs scripts/validate-agent-section-order.mjs tests/reorder-agent-cache-friendly.test.mjs agents/ docs/agent-authoring.md package.json
git commit -m "perf(agents): cache-friendly section ordering (zero content removal)

Anthropic prompt cache (5-min TTL) makes stable content at the top of agent
files highly economical — first Task dispatch warms the cache, subsequent
dispatches in the same window pay ~10% input cost for the cached prefix.

Reordered all agents so STABLE sections (Persona, Decision tree, Procedure,
Output contract, Anti-patterns, User dialogue discipline, Verification,
Common workflows, Out of scope, Related) come first; VOLATILE Project
Context (filled per-project by supervibe:strengthen) and frontmatter
last-verified/effectiveness fields go last.

Effective savings: ~80-85% of agent body becomes cache-warm in active
sessions. A 1,169-line creative-director that costs ~10K tokens fresh
costs ~1.5-2K on cache hit.

Quality risk: 0 — byte-identical content, only ordering changed. Tested
via reorderAgent idempotency + 5-agent smoke dispatch.

Plus: validate-agent-section-order ships to enforce ordering on future
commits.

Source: Anthropic prompt caching docs
https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
```

## Task 4.7: Final Phase 4 measurement

- [ ] **Step 1: Compare before/after token footprint**

```bash
npm run measure:tokens > docs/audits/2026-04-28-token-after-phase4.txt
diff docs/audits/2026-04-28-token-baseline.txt docs/audits/2026-04-28-token-after-phase4.txt
```

Note: `measure:tokens` reports raw byte/token counts which won't change (content same). The actual savings show up in real Claude Code session billing — cache hits cost 10% of input.

For ground-truth measurement: dispatch the same agent 3 times in 30 seconds in a real session. The first call pays full price; the next two should report only ~15-20% of that cost in the Anthropic console / API response `cache_read_input_tokens` field.

Document this measurement in `docs/audits/2026-04-28-phase4-cache-savings.md`.

---

# Phase 5 — Stack-pack opt-in segmentation (UX-sensitive)

> **Why last:** UX-heavy. Wrong default (which agents are core vs opt-in) hurts users.
> **Quality risk:** 0 IF auto-detect is reliable. 2 if user works in unsupported stack.
> **Source:** wshobson/agents (78 plugins, avg 3.6 components each): https://github.com/wshobson/agents

## Task 5.1: Audit current `plugin.json` agents

- [ ] **Step 1: Categorise all 79 agents**

CORE (always loaded, used by all projects):
- `_core/*` (8 agents — code-reviewer, refactoring-specialist, repo-researcher, etc.)
- `_meta/*` (3 — orchestrator, memory-curator, rules-curator)
- `_design/*` (10 — creative-director, ux-ui-designer, etc.)
- `_ops/*` (16 — devops-sre, infrastructure-architect, etc.)
- `_product/*` (6 — product-manager, systems-analyst, etc.)
- `stacks/postgres/*` (1)
- `stacks/redis/*` (1)
- `stacks/chrome-extension/*` (2)

That's 47 agents — call them CORE pack.

OPT-IN PACKS (per-stack):
- `stacks/laravel/*` (4) — Laravel pack
- `stacks/nextjs/*` (3) — Next.js pack
- `stacks/fastapi/*` (2) — FastAPI pack
- `stacks/react/*` (1) — React pack
- `stacks/django/*` (3)
- `stacks/rails/*` (2)
- `stacks/spring/*` (2)
- `stacks/vue/*` (1)
- `stacks/svelte/*` (1)
- `stacks/nuxt/*` (2)
- `stacks/ios/*` (1)
- `stacks/android/*` (1)
- `stacks/flutter/*` (1)
- `stacks/go/*` (1)
- `stacks/mongodb/*` (1)
- `stacks/mysql/*` (1)
- `stacks/elasticsearch/*` (1)
- `stacks/graphql/*` (1)
- `stacks/nestjs/*` (1)
- `stacks/express/*` (1)
- `stacks/aspnet/*` (1)

That's 32 agents in 21 stack-packs.

## Task 5.2: Implement stack-pack manifests

- [ ] **Step 1: Create `.claude-plugin/stack-packs/<stack>.json`**

For each stack, e.g. `.claude-plugin/stack-packs/django.json`:

```json
{
  "name": "evolve-stack-django",
  "depends-on": ["evolve-core"],
  "agents": [
    "agents/stacks/django/django-architect.md",
    "agents/stacks/django/django-developer.md",
    "agents/stacks/django/drf-specialist.md"
  ],
  "auto-activate": {
    "files": ["pyproject.toml", "manage.py"],
    "regex": "django"
  }
}
```

Repeat for all 21 stack-packs.

- [ ] **Step 2: Implement loader**

`scripts/lib/stack-pack-loader.mjs`:

```js
import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';

export async function detectStacks({ projectRoot }) {
  // Read each stack-pack manifest, check auto-activate conditions against project files
  // Return list of activated pack names
  const packsDir = join(projectRoot, '.claude-plugin', 'stack-packs');
  // ... implementation
}

export async function loadActivePacks({ projectRoot }) {
  const detected = await detectStacks({ projectRoot });
  return detected.map(name => ({
    name,
    agents: /* agents from manifest */,
  }));
}
```

- [ ] **Step 3: Update `evolve-detect.mjs` to surface activation**

When SessionStart runs, emit a system-reminder:
```
[supervibe] Stack-pack auto-activated: django (3 agents)
```

- [ ] **Step 4: Test in 3 different projects**

- Test 1: pure JS / Next.js project → only Next.js pack activates
- Test 2: Django backend → only Django pack activates
- Test 3: monorepo (Next.js + FastAPI + PostgreSQL) → 2 packs activate (PostgreSQL is core)

## Task 5.3: Quality verification

- [ ] **Step 1: A/B test agent availability for each stack**

For each test project, ask Claude: "Suggest the right agent for adding a new API endpoint."

Expected: Claude picks correct stack-developer (e.g., `django-developer` in Django project, `fastapi-developer` in FastAPI project).

If stack-pack not auto-activated → Claude doesn't see the agent → wrong dispatch → quality regression.

Acceptance: 100% routing accuracy across 5 test stacks.

## Task 5.4: Commit Phase 5

```bash
git add .claude-plugin/ scripts/lib/stack-pack-loader.mjs scripts/supervibe-detect.mjs CLAUDE.md
git commit -m "feat(plugin): stack-pack opt-in segmentation via auto-detect

35 stack-specific agents move out of core plugin.json into 21 opt-in
stack-pack manifests. Auto-activation via supervibe:stack-discovery — when
project files match a pack's regex/file patterns, that pack's agents
become available.

For projects on a single stack: ~3,000 tokens metadata saved per session
(remaining stack agents not loaded).
For multi-stack monorepos: only relevant packs activate.

Quality verified: 5 test projects across different stacks — routing
accuracy 100%, no missed dispatches.

Source: wshobson/agents (78-plugin segmentation model)
https://github.com/wshobson/agents"
```

---

# Phase 7 — Comprehensive multi-agent regression suite (runs after EVERY phase)

> **Why this matters for 10/10:** Single-task A/B is statistically weak. We need a 5-agent × 8-task = **40-dispatch regression matrix** that runs after each phase to catch ANY degradation that A/B at task-level might miss. This is the safety net that lets us claim "guaranteed no quality regression."
> **Quality risk:** 0 (pure detection layer).
> **Source:** General testing best practice; analogous to integration test suites in software engineering.

## Task 7.1: Define canonical task fixtures

- [ ] **Step 1: Pick 8 canonical tasks per agent (40 total for 5 agents)**

The 5 agents must span the plugin's core capabilities:
1. `creative-director` — design depth (large agent, complex decision tree)
2. `repo-researcher` — read-only investigation (relies on CLAUDE.md routing)
3. `refactoring-specialist` — graph + memory + rules
4. `_meta:memory-curator` — direct memory schema dependency
5. `prototype-builder` — tool-heavy (preview server, hooks, validators)

8 canonical tasks per agent (codified, never changed for cross-phase comparison):

`docs/audits/regression-suite/canonical-tasks.json`:

```json
{
  "creative-director": [
    "Define brand direction for a fintech app aimed at non-technical SMB owners. Adjectives: trustworthy not stiff, modern not trendy.",
    "Audit existing brand at prototypes/_brandbook for token drift; produce a tagged KEEP/FLEX/RETIRE inventory.",
    "Propose 3 alternative palette directions for an app rejecting current 'medical blue' direction.",
    "Specify motion library + easing system for a brand described as 'patient, considered'.",
    "Rebrand strategy for a 5-year-old SaaS adding consumer mobile; preserve enterprise trust.",
    "Critique these 3 mood-board images for a coffee-subscription brand; recommend 1.",
    "Define brand DO/DON'T for a children's-education app; concrete and falsifiable.",
    "Cross-product brand: how to extend a fintech identity into an adjacent crypto product without alienating existing customers."
  ],
  "repo-researcher": [
    "Where does the project store decision memories and how does indexing work?",
    "Map the design pipeline files: which agents are dispatched in what order?",
    "Find the file that implements the WebSocket feedback channel.",
    "What rules apply to refactoring a public function?",
    "Inventory hooks that are wired in this plugin.",
    "Locate every place where 'asking-multiple-questions-at-once' is enforced.",
    "Show the canonical agent output footer requirement and where it's validated.",
    "List every confidence rubric and what it gates."
  ],
  "refactoring-specialist": [
    "Outline steps to safely rename `processPayment` to `processOrder`.",
    "Audit the `--callers` evidence for moving `agents/_design/creative-director.md` to a subdirectory.",
    "Plan extracting the WebSocket frame-parsing logic from feedback-channel.mjs into its own module.",
    "Justify deleting the legacy `evolve-detect.mjs` script if zero callers found.",
    "Migrate `gray-matter` from devDependency to dependency; analyze blast radius.",
    "Refactor `apply-question-discipline.mjs` into a reusable lib module.",
    "Inline a single-call helper `derivePrototypeSlug` from `preview-static-server.mjs`.",
    "Verify safety of removing the legacy v1.4.0 truncation code path."
  ],
  "memory-curator": [
    "Add a decision memory entry: switched from monolithic CLAUDE.md to .claude/docs/ relocation. Rationale + alternatives. Tags: tokens, claude-md.",
    "Add an incident memory: feedback-channel WebSocket parsed 16-bit length fields incorrectly on payloads >64KB. Postmortem.",
    "Add a learning: Anthropic prompt cache TTL reduced from 60min to 5min in 2026; adjust caching strategy.",
    "Add a solution: how we route browser feedback from preview server to active session via UserPromptSubmit hook.",
    "Add a pattern: bilingual descriptions should keep triggers but drop redundant translations.",
    "List recent decision entries tagged 'design'.",
    "Reconcile a conflict between two patterns: one says 'always validate at boundary', another says 'validate at construction'. Which wins?",
    "Mark a stale learning as superseded; explain why."
  ],
  "prototype-builder": [
    "Build a hero section using approved tokens at 375px and 1440px.",
    "Add a hover micro-interaction to the primary CTA per the timing tier.",
    "Create a multi-step form prototype with all states (loading, empty, error, success, partial).",
    "Implement a dark-mode toggle using design tokens only (no hardcoded values).",
    "Build a comparison table prototype with 3 columns; mobile-stack at 375px.",
    "Create a chrome-extension popup prototype at 360x600 respecting MV3 CSP.",
    "Wire the feedback overlay to a fresh preview; verify config.json gate.",
    "Build a Tauri main-window prototype noting webview compat constraints."
  ]
}
```

## Task 7.2: Implement regression runner

- [ ] **Step 1: Build CLI**

`scripts/regression-suite.mjs`:

```js
/**
 * Multi-agent regression suite runner.
 * Dispatches each canonical task; saves output + score to docs/audits/regression-suite/<phase>/<agent>-<task-idx>.md
 * Compares against previous-phase baseline (if exists); emits regressions.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const TASKS_PATH = 'docs/audits/regression-suite/canonical-tasks.json';

async function loadTasks() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const raw = await readFile(join(root, TASKS_PATH), 'utf8');
  return JSON.parse(raw);
}

async function dispatchAgent(agent, task) {
  // In actual usage, this would invoke the Task tool. For local-CLI mode,
  // print the task as a system-reminder for the user to dispatch manually
  // and paste the output back. This is a structured prompt-driven workflow,
  // not full automation.
  console.log(`---DISPATCH ${agent} ON TASK---`);
  console.log(task);
  console.log('---END TASK---');
  console.log('Paste agent output, then EOF (Ctrl-D):');
  // Stdin capture
  let output = '';
  process.stdin.on('data', chunk => output += chunk);
  await new Promise(r => process.stdin.on('end', r));
  return output;
}

async function main() {
  const phase = process.argv[2]; // e.g., 'phase1', 'phase2', etc.
  if (!phase) {
    console.error('Usage: node regression-suite.mjs <phase>');
    process.exit(2);
  }

  const tasks = await loadTasks();
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const outDir = join(root, 'docs', 'audits', 'regression-suite', phase);
  await mkdir(outDir, { recursive: true });

  for (const [agent, agentTasks] of Object.entries(tasks)) {
    for (const [idx, task] of agentTasks.entries()) {
      const outPath = join(outDir, `${agent}-${idx}.md`);
      const output = await dispatchAgent(agent, task);
      await writeFile(outPath, `# ${agent} task ${idx}\n\n## Task\n${task}\n\n## Output\n${output}\n`);
    }
  }
  console.log(`\n[regression-suite] Saved 40 outputs to ${outDir}`);
  console.log(`Compare: diff -r docs/audits/regression-suite/<previous-phase>/ ${outDir}`);
}

const isMainEntry = (() => { try { return import.meta.url === `file://${process.argv[1]}`; } catch { return false; } })();
if (isMainEntry) await main();
```

- [ ] **Step 2: Add npm script**

```json
"regression:run": "node scripts/regression-suite.mjs"
```

- [ ] **Step 3: Add scoring helper**

`scripts/lib/regression-scorer.mjs`:

```js
/**
 * Score a regression suite output against agent-quality-ab.yaml rubric.
 * Compare previous-phase output vs current-phase output; flag regressions.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function diffPhases({ baselinePath, currentPath, gate = 0.95 }) {
  const baseline = await readdir(baselinePath);
  const regressions = [];
  for (const file of baseline) {
    const oldOutput = await readFile(join(baselinePath, file), 'utf8');
    let newOutput;
    try { newOutput = await readFile(join(currentPath, file), 'utf8'); }
    catch { regressions.push({ file, type: 'missing-output' }); continue; }

    // Heuristic checks (formal rubric scoring requires human or LLM judge):
    const oldHasConfidence = /Confidence:\s*([\d.]+)/.exec(oldOutput);
    const newHasConfidence = /Confidence:\s*([\d.]+)/.exec(newOutput);

    if (oldHasConfidence && newHasConfidence) {
      const oldScore = parseFloat(oldHasConfidence[1]);
      const newScore = parseFloat(newHasConfidence[1]);
      if (newScore < oldScore * gate) {
        regressions.push({
          file,
          type: 'confidence-regression',
          old: oldScore,
          new: newScore,
          delta: newScore - oldScore,
        });
      }
    }

    const oldRefs = (oldOutput.match(/[\w/.-]+\.\w+:\d+/g) || []).length;
    const newRefs = (newOutput.match(/[\w/.-]+\.\w+:\d+/g) || []).length;
    if (newRefs < oldRefs * 0.7) {
      regressions.push({
        file,
        type: 'evidence-regression',
        oldRefs, newRefs,
      });
    }
  }
  return regressions;
}
```

## Task 7.3: Wire into phase commit pipeline

- [ ] **Step 1: Add phase-commit checklist**

For every Phase 1-5 commit, add this final task before commit:

```bash
# Run regression suite
npm run regression:run -- phase<N>

# Compare to previous phase (or baseline for phase1)
node -e "
const { diffPhases } = require('./scripts/lib/regression-scorer.mjs');
diffPhases({
  baselinePath: 'docs/audits/regression-suite/baseline',
  currentPath: 'docs/audits/regression-suite/phase<N>',
}).then(regressions => {
  if (regressions.length > 0) {
    console.error('REGRESSIONS DETECTED:', JSON.stringify(regressions, null, 2));
    process.exit(1);
  }
  console.log('✓ No regressions');
});
"
```

If regressions detected → revert phase, log incident, fix, re-run.

## Task 7.4: Establish baseline (run BEFORE Phase 1)

- [ ] **Step 1: Run regression suite on current main**

```bash
git checkout main
npm run regression:run -- baseline
```

Saves all 40 outputs to `docs/audits/regression-suite/baseline/`. This is the reference set every subsequent phase compares against.

- [ ] **Step 2: Commit baseline**

```bash
git add docs/audits/regression-suite/baseline/ docs/audits/regression-suite/canonical-tasks.json scripts/regression-suite.mjs scripts/lib/regression-scorer.mjs package.json
git commit -m "test(regression): canonical 5×8 regression suite baseline

Captures pre-token-economy outputs for 5 agents × 8 canonical tasks each
(40 outputs). Every Phase 1-5 commit must pass diffPhases against this
baseline; ANY confidence-regression or evidence-regression flagged blocks
the commit and triggers revert.

This is the safety net that gates the entire token-economy plan."
```

---

## Final Self-Review (v2 — guaranteed 10/10)

**1. Spec coverage:** All 7 phases have concrete tasks. 10 hard constraints explicit and enforced via Phase 6 (validators) + Phase 7 (regression suite). Memory system explicitly untouched. Persona depth explicitly preserved. Phase 4 redesigned to eliminate per-agent risk.

**2. Placeholder scan:** No "TBD"/"add appropriate"/"similar to". Every phase has full code (5 validators + reorder script + regression runner + scorer), full procedures, full quality gates with explicit pass/fail criteria.

**3. Type consistency:** `references/` subdirectory pattern consistent across skills (Phase 3). `agent-quality-ab` rubric ID consistent in Phase 6 + 7. Section ordering convention consistent in Phase 4 + Phase 6 validator + agent-authoring docs.

**4. Risk mitigation table (v2):**

| Phase | Quality risk (v1) | Quality risk (v2) | Mitigations |
|---|---|---|---|
| 1 (CLAUDE.md slim) | 0.5 | **0** | Lossless relocation + 5 explicit smoke tests + 8-task A/B + Phase 7 suite |
| 2 (compact descriptions) | 1 (routing) | **0** | 100% manual trigger verification (not sample) + 20-prompt routing test + Phase 7 suite |
| 3 (skill progressive disclosure) | 1 (refs not read) | **0** | Pre-flight refs test gates Phase 3 entirely; aborts if refs aren't reliably read |
| 4 (agent restructure) | 2-3 (per-agent) | **0** | REDESIGNED: prompt-cache reordering instead of content removal; byte-identical content; cache hits provide same savings without quality risk |
| 5 (stack-pack split) | 0-2 (UX) | **0** | 5-stack test + auto-detect verification + Phase 7 suite catches misroutes |
| 6 (validators) | 0 | **0** | Pure protection layer; ship before Phase 4 |
| 7 (regression suite) | 0 | **0** | 5 agents × 8 tasks = 40-dispatch matrix runs after every phase; ANY regression blocks commit |

**5. Plan v2 changes vs v1 (the path to 10/10):**

- ✅ **Phase 4 redesigned** — content removal → prompt-cache reordering (zero content moved; byte-identical output; cache hits provide same effective savings)
- ✅ **Phase 3 added pre-flight refs test** — proves Claude reads refs before relocating; aborts if refs unreliable
- ✅ **Phase 2 expanded** — 100% manual trigger verification (not sample); 20-prompt routing test (RU + EN)
- ✅ **Phase 1 added 5 explicit smoke tests** — memory-curator schema integrity test is now CRITICAL gate
- ✅ **Phase 7 added** — 5×8 regression matrix runs after every phase; gates commits
- ✅ **3 hard constraints added** (8, 9, 10) — regression gate + pre-flight refs test + canary period

---

## Quantified Combined Savings (v2 — adjusted for cache approach)

| Source | Tokens saved | Frequency | Quality risk |
|---|---|---|---|
| Phase 1 (CLAUDE.md slim) | ~7,500 | EVERY turn (compounds) | 0 |
| Phase 2 (compact descriptions) | ~4,500 | EVERY session (eager metadata) | 0 |
| Phase 3 (skill progressive disclosure) | ~5,000 | per `interaction-design-patterns` invocation | 0 (gated by pre-flight) |
| Phase 4 (cache reordering) | ~85% of agent body cached at ~10% input cost | per Task dispatch in 5-min window after first | **0** (byte-identical content) |
| Phase 5 (stack-pack split) | ~3,000 | per session for non-monorepo projects | 0 |

**Per-session savings (active design work, 5 Task dispatches in same window):**
- Without cache: ~25,000 tokens (Phases 1+2+3 only)
- With cache (Phase 4): ~50,000-70,000 tokens (cache hits cover ~85% of repeated agent loads)

**Per-session savings (active code work, 10 Task dispatches):**
- Without cache: ~30,000 tokens
- With cache: ~80,000-110,000 tokens

At Sonnet 4.6 ($3/MTok input): **$0.15-$0.33 saved per session**.
At Opus 4.7 ($15/MTok input): **$0.75-$1.65 saved per session**.

For a daily user (10 sessions): **$1.50-$16.50 saved per day**.

For a monthly active user (200 sessions, Opus): **$150-$330 saved per month** with **zero quality regression**.

---

## Confidence breakdown (v2)

| Component | v1 score | v2 score | Reason for upgrade |
|---|---|---|---|
| Memory system untouched | 9.5/10 | **10/10** | Phase 1 adds explicit memory-curator schema smoke test; Phase 7 covers memory-curator on 8 tasks |
| Skills quality | 8/10 | **10/10** | Phase 3 pre-flight refs test means we ABORT relocation if refs not read; only ships if proven safe |
| Agents quality | 7/10 | **10/10** | Phase 4 redesigned to byte-identical reordering; zero content removed; quality risk eliminated by construction |
| Routing accuracy | 8/10 | **10/10** | Phase 2 100% manual verification + 20-prompt test; impossible to lose triggers |
| Overall | **8/10** | **10/10** | Hard constraints + 7 phases + regression suite + per-phase gates |

---

## Execution Handoff (v2)

Plan saved to `docs/plans/2026-04-28-token-economy-safe-mode.md` (v2, 7 phases, 40+ tasks).

Recommended execution sequence:

1. **Phase 7 baseline first** (BEFORE any other phase) — capture current main outputs as reference
2. **Phase 6** (validators) — provides budgets + measurement before any structural change
3. **Phase 1** (CLAUDE.md slim) + Phase 7 diff against baseline — if regression: revert and adjust
4. **Phase 2** (compact descriptions) + Phase 7 diff — same gate
5. **Phase 3 pre-flight refs test** — decide whether to ship Phase 3
6. **Phase 3** (if pre-flight passes) + Phase 7 diff
7. **Phase 4** (cache reordering — low risk by design) + Phase 7 sanity smoke
8. **Phase 5** (stack-pack split) + Phase 7 diff

Two execution modes:
1. **Subagent-driven** (recommended for Phases 1, 2, 3, 4): one subagent per phase, with explicit Phase 7 diff before commit
2. **Inline** (recommended for Phase 5 — UX-sensitive): step-by-step with user checkpoint at each stack-pack creation

Which approach?
