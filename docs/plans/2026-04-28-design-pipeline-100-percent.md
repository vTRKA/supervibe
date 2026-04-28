# Design Pipeline → 10/10 Across All 13 Items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring all 13 design-pipeline requirements from current scores (1–10/10) to a uniform **10/10**, by closing the audit gaps documented in conversation 2026-04-28.

**Architecture:** Six phases ordered by scope. Phase 1–2 polish 9/10 items into 10/10 (small structural additions + one new validator). Phase 3 expands component library coverage. Phase 4 globalises single-question discipline via a new rule + agent rollout. Phase 5 extends design lifecycle to non-web surfaces (Electron/Tauri/extensions/mobile). Phase 6 builds the browser-side feedback channel — the largest new system.

**Tech Stack:** Pure ESM Node 22+, SQLite (existing), tree-sitter (existing), zero-dep WebSocket via `node:net` (no `ws` dep), `node:test` for validators. No frameworks. No native compilation.

**Plan v2 (2026-04-28 patch):** added 3 tasks closing self-review gaps — backward-compat migration for existing prototypes (Task 4a), prototype-handoff non-web adapters (Task 14a), brandbook target-awareness (Task 14b). Replaced standalone feedback-monitor with `UserPromptSubmit` hook for proper system-reminder delivery (Task 19 rewritten). Fixed hook-code typo (Task 4). Clarified `/evolve-design` stage renumbering (Task 12). Added agent-count reconcile to final docs (Task 21).

**Audit baseline (from conversation 2026-04-28):**

| # | Item | Current | Target | Phase |
|---|------|---------|--------|-------|
| 1 | Viewport defaults + ask | 9 | 10 | 1 |
| 2 | Animation/graphics tooling | 7 | 10 | 2 |
| 3 | Single-question UX (design) | 9 | 10 | 1 |
| 4 | Mandatory feedback loop | 9 | 10 | 1 |
| 5 | Approval state | 10 | 10 | — |
| 6 | Native-only prototypes | 9 | 10 | 1 |
| 7 | Handoff bundle | 10 | 10 | — |
| 8 | DS as source of truth | 10 | 10 | — |
| 9 | Flexible alternatives | 9 | 10 | 1 |
| 10 | Single-question for ALL agents | 4 | 10 | 4 |
| 11 | Non-web design surfaces | 3 | 10 | 5 |
| 12 | Browser-side feedback | 1 | 10 | 6 |
| 13 | Unrestricted DS templates | 2 | 10 | 3 |

---

## File Structure

### Created files

**Phase 1 — Quick wins:**
- `scripts/validate-design-skills.mjs` — single combined validator: feedback-prompt presence, single-question anti-pattern, viewport pre-write guard, framework pre-write guard
- `tests/validate-design-skills.test.mjs` — unit tests for the validator
- `templates/alternatives/tradeoff.md.tpl` — alternative-direction documentation template
- `scripts/hooks/pre-write-prototype-guard.mjs` — PreToolUse hook: blocks `Write` to `prototypes/<slug>/` if `config.json` missing OR if path contains framework imports
- `scripts/migrate-prototype-configs.mjs` — one-shot migration: backfill `config.json` for any existing `prototypes/<slug>/` directories without it (default `[375, 1440]` web target). Idempotent.
- `tests/migrate-prototype-configs.test.mjs`

**Phase 2 — Animation/graphics depth:**
- `templates/design-decisions/animation-library-matrix.md.tpl` — decision matrix template
- `templates/design-decisions/graphics-medium-matrix.md.tpl` — Canvas vs WebGL vs SVG vs Lottie matrix

**Phase 3 — Component library expansion:**
- `templates/design-system/components/input.md.tpl`
- `templates/design-system/components/select.md.tpl`
- `templates/design-system/components/textarea.md.tpl`
- `templates/design-system/components/checkbox.md.tpl`
- `templates/design-system/components/radio.md.tpl`
- `templates/design-system/components/toggle.md.tpl`
- `templates/design-system/components/card.md.tpl`
- `templates/design-system/components/modal.md.tpl`
- `templates/design-system/components/toast.md.tpl`
- `templates/design-system/components/tabs.md.tpl`
- `templates/design-system/components/nav.md.tpl`
- `templates/design-system/components/badge.md.tpl`
- `skills/component-library-integration/SKILL.md` — adapter helpers: MUI / shadcn / Radix / HeadlessUI / Mantine
- `templates/component-adapters/mui-token-bridge.ts.tpl`
- `templates/component-adapters/shadcn-token-bridge.css.tpl`
- `templates/component-adapters/headless-ui-mapping.md.tpl`

**Phase 4 — Single-question discipline globally:**
- `rules/single-question-discipline.md` — new rule, severity: high
- `scripts/validate-question-discipline.mjs` — validator: every interactive agent must declare the discipline
- `tests/validate-question-discipline.test.mjs`

**Phase 5 — Non-web design surfaces:**
- `templates/viewport-presets/web.json` — `[375, 1440]`
- `templates/viewport-presets/chrome-extension.json` — popup `[360x600]`, options `[1024x768]`, side-panel `[400x800]`
- `templates/viewport-presets/electron.json` — `[1280x800]`, `[1440x900]`
- `templates/viewport-presets/tauri.json` — `[1280x800]`, `[1440x900]`, customizable
- `templates/viewport-presets/mobile-native.json` — iPhone 15 `[393x852]`, Pixel 8 `[412x915]`
- `agents/_design/electron-ui-designer.md` — specialist for desktop Electron UI
- `agents/_design/tauri-ui-designer.md` — specialist for Tauri webview UI
- `agents/_design/extension-ui-designer.md` — specialist for browser-extension UI surfaces
- `agents/_design/mobile-ui-designer.md` — specialist for native mobile (iOS/Android via React Native or Flutter design)
- `skills/non-web-prototype/SKILL.md` — extension/desktop/mobile prototype lifecycle wrapper
- `templates/handoff-adapters/react-native.md.tpl` — handoff adapter hint for mobile-native target
- `templates/handoff-adapters/flutter.md.tpl` — handoff adapter hint for Flutter mobile target
- `templates/handoff-adapters/electron.md.tpl` — handoff adapter hint for Electron renderer
- `templates/handoff-adapters/tauri.md.tpl` — handoff adapter hint for Tauri webview
- `templates/handoff-adapters/chrome-extension.md.tpl` — handoff adapter hint for MV3 extension surfaces
- `templates/brandbook-target-baselines/web.md` — web density / type-scale baseline
- `templates/brandbook-target-baselines/chrome-extension.md` — popup tighter density baseline
- `templates/brandbook-target-baselines/electron.md` — desktop density baseline
- `templates/brandbook-target-baselines/tauri.md` — same as electron with cross-webview notes
- `templates/brandbook-target-baselines/mobile-native.md` — iOS HIG + Material 3 baseline references

**Phase 6 — Browser-side feedback channel:**
- `scripts/lib/feedback-channel.mjs` — WebSocket server + feedback queue writer (zero-dep, via `node:net`)
- `scripts/lib/feedback-overlay-injector.mjs` — injects `<script>` overlay into served HTML
- `scripts/lib/feedback-overlay/overlay.js` — client-side: region selection, comment box, WS send
- `scripts/lib/feedback-overlay/overlay.css` — overlay styling
- `scripts/lib/feedback-cursor.mjs` — track last-seen feedback queue offset per session
- `scripts/hooks/user-prompt-submit-feedback.mjs` — UserPromptSubmit hook: reads new feedback entries since last cursor and emits as `additionalContext`
- `skills/browser-feedback/SKILL.md` — agent-side skill for receiving + acting on feedback
- `tests/feedback-channel.test.mjs`
- `tests/feedback-cursor.test.mjs`

### Modified files

**Phase 1:**
- `skills/prototype/SKILL.md` — add `asking-multiple-questions-at-once` + `advancing-without-feedback-prompt` + `framework-coupling` to anti-patterns section explicitly
- `skills/landing-page/SKILL.md` — same anti-patterns
- `skills/brandbook/SKILL.md` — same anti-patterns
- `agents/_design/creative-director.md` — alternatives section reference tradeoff template
- `agents/_design/prototype-builder.md` — alternatives section reference tradeoff template
- `commands/evolve-design.md` — alternatives stage references tradeoff template
- `hooks.json` — register `pre-write-prototype-guard` PreToolUse hook
- `package.json` — add validator npm script
- `CLAUDE.md` — note new validators in "Validation & checks" section

**Phase 2:**
- `agents/_design/creative-director.md` — embed animation-library decision matrix (or reference template) + graphics-medium matrix; add `library-decision-matrix` capability
- `agents/_design/ux-ui-designer.md` — add Motion section: when to specify animation, when to delegate to creative-director, hand-off contract
- `skills/interaction-design-patterns/SKILL.md` — wire into prototype-builder Procedure as a mandatory consultation step before final delivery

**Phase 3:**
- `skills/brandbook/SKILL.md` — Section 6 (components baseline): explicitly enumerate baseline components list as OPEN-ended; add Section 6.5 (component library choice) with branch logic for MUI / shadcn / Radix / custom
- `agents/_design/creative-director.md` — add `component-library-decision` capability + decision tree
- `agents/_design/ux-ui-designer.md` — when consuming brandbook, must check chosen component library

**Phase 4:**
- `agents/_product/systems-analyst.md` — add Single-question dialogue section + anti-pattern
- `agents/_product/product-manager.md` — same
- `agents/_meta/evolve-orchestrator.md` — same (orchestrator asks clarifying questions one at a time)
- `agents/_core/repo-researcher.md` — same
- `agents/_core/root-cause-debugger.md` — same
- `agents/_ops/devops-sre.md` — same
- `agents/_ops/infrastructure-architect.md` — same
- `agents/_ops/ai-integration-architect.md` — same
- `agents/stacks/laravel/laravel-architect.md` — same
- `agents/stacks/laravel/laravel-developer.md` — same
- `agents/stacks/nextjs/nextjs-architect.md` — same
- `agents/stacks/nextjs/nextjs-developer.md` — same
- `agents/stacks/nextjs/server-actions-specialist.md` — same
- `agents/stacks/fastapi/fastapi-architect.md` — same
- `agents/stacks/fastapi/fastapi-developer.md` — same
- `agents/stacks/react/react-implementer.md` — same
- `agents/stacks/postgres/postgres-architect.md` — same
- `agents/stacks/redis/redis-architect.md` — same
- `agents/stacks/chrome-extension/chrome-extension-architect.md` — same
- `agents/stacks/chrome-extension/chrome-extension-developer.md` — same
- (eloquent-modeler and queue-worker-architect inherit; verify each)

**Phase 5:**
- `skills/prototype/SKILL.md` — add `target` parameter (web | extension | electron | tauri | mobile) + viewport-preset loader
- `agents/_design/prototype-builder.md` — branch on target → load appropriate viewport preset → choose appropriate native runtime (HTML for web/electron-renderer/tauri-webview/extension; React Native preview for mobile)
- `commands/evolve-design.md` — Stage 0: ask user for target surface
- `agents/stacks/chrome-extension/chrome-extension-developer.md` — consume design handoff from extension-ui-designer
- `skills/prototype-handoff/SKILL.md` — load adapter hint per `target` from `templates/handoff-adapters/`; Stage 5 of skill branches by target
- `skills/brandbook/SKILL.md` — read target from active prototype config; load `templates/brandbook-target-baselines/<target>.md` as starting point for Sections 3 (spacing) + 5 (voice) + 6 (components)

**Phase 6:**
- `scripts/preview-server.mjs` — wire feedback-channel + overlay-injector
- `skills/preview-server/SKILL.md` — document feedback overlay enable/disable
- `agents/_design/prototype-builder.md` — when delivering, mention "feedback overlay enabled — click any region to comment"
- `agents/_design/creative-director.md` — same

### Auto-routing additions to `CLAUDE.md`

| User intent | First action |
|---|---|
| "design Chrome extension popup" | `extension-ui-designer` → `prototype` skill with target=extension |
| "design Electron settings window" | `electron-ui-designer` → `prototype` skill with target=electron |
| "design Tauri main window" | `tauri-ui-designer` → `prototype` skill with target=tauri |
| "design mobile app screen" | `mobile-ui-designer` → `prototype` skill with target=mobile |
| user clicks region in browser preview | feedback channel → `creative-director` (visual) or `prototype-builder` (layout) |

---

## Critical Path

Phases 1, 2, 3 are independent and can ship in parallel. Phase 4 must finish before Phase 5 (non-web designers also need single-question discipline). Phase 6 is independent of all but should ship last because it changes preview-server semantics that the other agents reference.

Recommended order: **1 → 2 → 3 → 4 → 5 → 6**.

---

# Phase 1 — Quick Wins (items 1, 3, 4, 6, 9 → 10/10)

## Task 1: Tradeoff documentation template (item 9)

**Files:**
- Create: `templates/alternatives/tradeoff.md.tpl`

- [ ] **Step 1: Write the template**

```markdown
# Alternative Direction: <variant-name>

> Generated: <ISO-date>
> Originating prototype: prototypes/<slug>/
> Status: parked | active | rejected (kept for audit)

## Differs because
<one sentence — what visual or interaction axis this variant moves along>

## Gives up
- <constraint or property the original satisfied that this drops>
- <e.g. "narrower information density on mobile">
- <e.g. "loses the brand's signature accent colour">

## Gains
- <what this variant achieves the original did not>
- <e.g. "stronger first-fold contrast for new users">
- <e.g. "lower cognitive load on the secondary CTA">

## Tradeoff axes
| Axis | Original | This variant |
|---|---|---|
| Density | <value> | <value> |
| Tone | <value> | <value> |
| Motion intensity | <value> | <value> |
| Accent usage | <value> | <value> |

## When to prefer this
<scenarios where this variant beats original>

## When NOT to prefer this
<scenarios where original wins>

## Rejection note (fill on rejection — do not delete file)
- Date: <ISO-date>
- Rejected by: <user|agent>
- Reason: <one sentence>
- Lessons saved to: .claude/memory/learnings/<slug>.md
```

- [ ] **Step 2: Reference template in 3 places**

In `agents/_design/creative-director.md` (alternatives section, around line 113-118), append:
> When parking a direction in `alternatives/`, copy `templates/alternatives/tradeoff.md.tpl` and fill all sections. Never delete a parked variant — convert to `Status: rejected` with a Rejection note instead.

In `agents/_design/prototype-builder.md` (line 144 area, the alternative branch), append the same paragraph.

In `commands/evolve-design.md` (line 148-149 alternatives stage), append the same paragraph.

- [ ] **Step 3: Commit**

```bash
git add templates/alternatives/tradeoff.md.tpl agents/_design/creative-director.md agents/_design/prototype-builder.md commands/evolve-design.md
git commit -m "feat(design): add tradeoff template for parked alternative directions"
```

---

## Task 2: Anti-patterns inside skills (item 3)

**Files:**
- Modify: `skills/prototype/SKILL.md`
- Modify: `skills/landing-page/SKILL.md`
- Modify: `skills/brandbook/SKILL.md`
- Modify: `skills/interaction-design-patterns/SKILL.md`

- [ ] **Step 1: Add Anti-patterns block to each skill**

In each of the four skills, locate (or create after the Procedure section) a `## Anti-patterns` block and ensure it contains at minimum:

```markdown
## Anti-patterns (skill-level — fail conditions)

- `asking-multiple-questions-at-once` — bundling >1 question into one user message. ALWAYS one question with `Шаг N/M:` progress label.
- `advancing-without-feedback-prompt` — concluding delivery without printing the 5-choice feedback block (✅ / ✎ / 🔀 / 📊 / 🛑) and waiting for explicit user choice.
- `framework-coupling` (prototype, landing-page only) — emitting `import … from`, `require()`, `<script src="…cdn…">`, `<script src="…unpkg…">`, or any `node_modules/` reference inside the prototype directory.
- `silent-viewport-expansion` (prototype, landing-page only) — adding viewport widths beyond what `prototypes/<slug>/config.json` declares without re-asking the user.
- `random-regen-instead-of-tradeoff-alternatives` — when user dislikes a direction, re-rolling without producing 2-3 documented alternatives via `templates/alternatives/tradeoff.md.tpl`.
```

(Omit `framework-coupling` and `silent-viewport-expansion` from `brandbook` and `interaction-design-patterns` — they don't emit prototypes.)

- [ ] **Step 2: Commit**

```bash
git add skills/prototype/SKILL.md skills/landing-page/SKILL.md skills/brandbook/SKILL.md skills/interaction-design-patterns/SKILL.md
git commit -m "feat(design): codify anti-patterns at skill level (not just agent level)"
```

---

## Task 3: Combined design-skill validator (items 1, 3, 4, 6 enforcement)

**Files:**
- Create: `scripts/validate-design-skills.mjs`
- Create: `tests/validate-design-skills.test.mjs`
- Modify: `package.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write failing test**

`tests/validate-design-skills.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDesignSkill } from '../scripts/validate-design-skills.mjs';

test('validator flags missing feedback prompt', () => {
  const body = '## Procedure\n\n1. Build prototype.\n2. Done.\n';
  const issues = validateDesignSkill('prototype', body);
  assert.ok(issues.some(i => i.code === 'missing-feedback-prompt'));
});

test('validator flags missing single-question anti-pattern', () => {
  const body = '## Anti-patterns\n- foo\n- bar\n';
  const issues = validateDesignSkill('prototype', body);
  assert.ok(issues.some(i => i.code === 'missing-single-question-anti-pattern'));
});

test('validator flags missing framework-coupling for prototype/landing-page', () => {
  const body = '## Anti-patterns\n- asking-multiple-questions-at-once\n- advancing-without-feedback-prompt\n';
  const issues = validateDesignSkill('prototype', body);
  assert.ok(issues.some(i => i.code === 'missing-framework-coupling-anti-pattern'));
});

test('validator passes for fully-compliant body', () => {
  const body = `
## Procedure

Step N: Print this exact prompt:
✅ Утвердить — фиксирую approval, готовлю handoff
✎ Доработать
🔀 Альтернатива
📊 Углублённый review
🛑 Стоп

## Anti-patterns
- asking-multiple-questions-at-once
- advancing-without-feedback-prompt
- framework-coupling
- silent-viewport-expansion
- random-regen-instead-of-tradeoff-alternatives
`;
  const issues = validateDesignSkill('prototype', body);
  assert.equal(issues.length, 0);
});
```

- [ ] **Step 2: Run test to verify failures**

```bash
node --test tests/validate-design-skills.test.mjs
```

Expected: 4 tests fail with "validateDesignSkill is not a function".

- [ ] **Step 3: Implement validator**

`scripts/validate-design-skills.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const FEEDBACK_MARKERS = ['✅', '✎', '🔀', '📊', '🛑'];

const REQUIRED_ANTIPATTERNS_ALL = [
  'asking-multiple-questions-at-once',
  'advancing-without-feedback-prompt',
  'random-regen-instead-of-tradeoff-alternatives',
];

const REQUIRED_ANTIPATTERNS_PROTOTYPE = [
  ...REQUIRED_ANTIPATTERNS_ALL,
  'framework-coupling',
  'silent-viewport-expansion',
];

const SKILLS = {
  prototype: { needsFeedback: true, antipatterns: REQUIRED_ANTIPATTERNS_PROTOTYPE },
  'landing-page': { needsFeedback: true, antipatterns: REQUIRED_ANTIPATTERNS_PROTOTYPE },
  brandbook: { needsFeedback: true, antipatterns: REQUIRED_ANTIPATTERNS_ALL },
  'interaction-design-patterns': { needsFeedback: false, antipatterns: REQUIRED_ANTIPATTERNS_ALL },
};

export function validateDesignSkill(skillName, body) {
  const spec = SKILLS[skillName];
  if (!spec) return [];

  const issues = [];

  if (spec.needsFeedback) {
    const allMarkersPresent = FEEDBACK_MARKERS.every(m => body.includes(m));
    if (!allMarkersPresent) {
      issues.push({
        code: 'missing-feedback-prompt',
        message: `${skillName}: feedback prompt missing one or more of ${FEEDBACK_MARKERS.join(' ')}`,
      });
    }
  }

  for (const ap of spec.antipatterns) {
    if (!body.includes(ap)) {
      issues.push({
        code: ap === 'asking-multiple-questions-at-once'
          ? 'missing-single-question-anti-pattern'
          : `missing-${ap}-anti-pattern`,
        message: `${skillName}: missing anti-pattern '${ap}'`,
      });
    }
  }

  return issues;
}

export async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  let totalIssues = 0;

  for (const skillName of Object.keys(SKILLS)) {
    const path = `${root}/skills/${skillName}/SKILL.md`;
    let body;
    try {
      body = await readFile(path, 'utf8');
    } catch {
      console.error(`[validate-design-skills] cannot read ${path}`);
      totalIssues++;
      continue;
    }
    const issues = validateDesignSkill(skillName, body);
    for (const issue of issues) {
      console.error(`[${issue.code}] ${issue.message}`);
      totalIssues++;
    }
  }

  if (totalIssues > 0) {
    console.error(`\n${totalIssues} issue(s) — fix before commit.`);
    process.exit(1);
  }
  console.log('[validate-design-skills] all design skills compliant');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
node --test tests/validate-design-skills.test.mjs
```

Expected: 4 PASS.

- [ ] **Step 5: Wire to npm scripts and CI check**

In `package.json`, add:

```json
"validate:design-skills": "node scripts/validate-design-skills.mjs"
```

Also append `&& npm run validate:design-skills` to the `check` script.

In `CLAUDE.md`, in the "Validation & checks" section's `npm run check` composition list, add:
> 6. `validate:design-skills` — every design skill body has feedback prompt + required anti-patterns

- [ ] **Step 6: Run full check**

```bash
npm run validate:design-skills
```

Expected: PASS (Task 2 already added the anti-patterns; existing skills already have feedback markers per audit).

- [ ] **Step 7: Commit**

```bash
git add scripts/validate-design-skills.mjs tests/validate-design-skills.test.mjs package.json CLAUDE.md
git commit -m "feat(validators): enforce design-skill body has feedback prompt + anti-patterns"
```

---

## Task 4: Pre-write prototype guard hook (items 1, 6 enforcement)

**Files:**
- Create: `scripts/hooks/pre-write-prototype-guard.mjs`
- Modify: `hooks.json`

- [ ] **Step 1: Write the hook**

`scripts/hooks/pre-write-prototype-guard.mjs`:

```js
#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const FRAMEWORK_PATTERNS = [
  /\bimport\s+.+\s+from\s+['"]/,
  /\brequire\s*\(/,
  /<script\s+[^>]*src=["'][^"']*(?:unpkg|cdn|jsdelivr|node_modules)/i,
  /\bfrom\s+['"](?:react|vue|svelte|next|nuxt|astro|@angular)/,
];

const PROTOTYPE_DIR_RE = /(?:^|[\\/])prototypes[\\/][^\\/]+[\\/]/;

function readEvent() {
  let raw = '';
  process.stdin.on('data', chunk => raw += chunk);
  return new Promise(r => process.stdin.on('end', () => r(JSON.parse(raw))));
}

function emit(decision, reason) {
  console.log(JSON.stringify({ decision, reason }));
  process.exit(decision === 'block' ? 2 : 0);
}

const event = await readEvent();
const tool = event.tool_name;
if (tool !== 'Write' && tool !== 'Edit') emit('allow');

const path = event.tool_input?.file_path || '';
if (!PROTOTYPE_DIR_RE.test(path)) emit('allow');

if (path.includes('/handoff/') || path.includes('\\handoff\\')) emit('allow');

const slugMatch = path.match(/prototypes[\\/]([^\\/]+)/);
const slug = slugMatch ? slugMatch[1] : null;
if (!slug || slug === '_design-system' || slug === '_brandbook') emit('allow');

const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Item 1 — viewport gate: config.json must exist before any prototype file write
const configPath = resolve(projectRoot, 'prototypes', slug, 'config.json');
const isWritingConfig = path.endsWith(`prototypes/${slug}/config.json`) || path.endsWith(`prototypes\\${slug}\\config.json`);
if (!existsSync(configPath) && !isWritingConfig) {
  emit('block', `prototypes/${slug}/config.json must exist before writing other files. The viewport question must be asked and config persisted FIRST. See skills/prototype/SKILL.md Step 2.`);
}

// Item 6 — framework gate
const content = event.tool_input?.content || '';
for (const pat of FRAMEWORK_PATTERNS) {
  if (pat.test(content)) {
    emit('block', `Framework coupling detected in prototype write (${pat}). Prototypes must be native HTML/CSS/JS only. See skills/prototype/SKILL.md anti-pattern 'framework-coupling'.`);
  }
}

emit('allow');
```

- [ ] **Step 2: Register hook in hooks.json**

Read current `hooks.json` and add a `PreToolUse` matcher:

```json
{
  "PreToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": "node $CLAUDE_PLUGIN_ROOT/scripts/hooks/pre-write-prototype-guard.mjs"
        }
      ]
    }
  ]
}
```

(If a `PreToolUse` array already exists, append the new matcher to it.)

- [ ] **Step 3: Manual test — block missing config**

```bash
mkdir -p /tmp/evolve-test-proj/prototypes/foo
cd /tmp/evolve-test-proj
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/evolve-test-proj/prototypes/foo/index.html","content":"<html></html>"}}' \
  | CLAUDE_PROJECT_DIR=/tmp/evolve-test-proj node "$CLAUDE_PLUGIN_ROOT/scripts/hooks/pre-write-prototype-guard.mjs"
```

Expected: `decision: block`, message about missing `config.json`. Exit code 2.

- [ ] **Step 4: Manual test — block framework import**

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/evolve-test-proj/prototypes/foo/config.json","content":"{}"}}' \
  | node "$CLAUDE_PLUGIN_ROOT/scripts/hooks/pre-write-prototype-guard.mjs"
# Then with config in place:
echo '{}' > /tmp/evolve-test-proj/prototypes/foo/config.json
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/evolve-test-proj/prototypes/foo/app.js","content":"import React from \"react\";"}}' \
  | CLAUDE_PROJECT_DIR=/tmp/evolve-test-proj node "$CLAUDE_PLUGIN_ROOT/scripts/hooks/pre-write-prototype-guard.mjs"
```

Expected: first call allowed, second call blocked with framework-coupling message.

- [ ] **Step 5: Manual test — allow handoff/ subfolder**

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/evolve-test-proj/prototypes/foo/handoff/components-used.json","content":"[]"}}' \
  | CLAUDE_PROJECT_DIR=/tmp/evolve-test-proj node "$CLAUDE_PLUGIN_ROOT/scripts/hooks/pre-write-prototype-guard.mjs"
```

Expected: `decision: allow`. Handoff bundle is post-approval, framework imports are intentional there (stack-agnostic adapter hints).

- [ ] **Step 6: Commit**

```bash
git add scripts/hooks/pre-write-prototype-guard.mjs hooks.json
git commit -m "feat(hooks): pre-write guard enforces viewport config + native-only in prototypes"
```

---

## Task 4a: Migration — backfill `config.json` for existing prototypes (backward-compat for Task 4)

> **Why:** Task 4's hook blocks any `Write` to `prototypes/<slug>/` until `config.json` exists. Without this migration, every existing prototype directory in user projects becomes immediately un-editable when the hook ships. This task creates an idempotent backfill so existing prototypes keep working.

**Files:**
- Create: `scripts/migrate-prototype-configs.mjs`
- Create: `tests/migrate-prototype-configs.test.mjs`
- Modify: `package.json` (add `migrate:prototype-configs` script)
- Modify: `scripts/session-start-check.mjs` (auto-run migration if needed)

- [ ] **Step 1: Write failing test**

`tests/migrate-prototype-configs.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migratePrototypeConfigs } from '../scripts/migrate-prototype-configs.mjs';

test('creates config.json for prototype dir without one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mig-'));
  await mkdir(join(root, 'prototypes', 'foo'), { recursive: true });
  await writeFile(join(root, 'prototypes', 'foo', 'index.html'), '<html></html>');

  const result = await migratePrototypeConfigs({ projectRoot: root });
  assert.equal(result.created.length, 1);

  const cfg = JSON.parse(await readFile(join(root, 'prototypes', 'foo', 'config.json'), 'utf8'));
  assert.equal(cfg.target, 'web');
  assert.deepEqual(cfg.viewports.map(v => v.width), [375, 1440]);
  assert.equal(cfg.migrated, true);
});

test('skips dirs that already have config.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mig-'));
  await mkdir(join(root, 'prototypes', 'bar'), { recursive: true });
  await writeFile(join(root, 'prototypes', 'bar', 'config.json'), '{"target":"web","viewports":[]}');

  const result = await migratePrototypeConfigs({ projectRoot: root });
  assert.equal(result.created.length, 0);
  assert.equal(result.skipped.length, 1);
});

test('skips reserved dirs (_design-system, _brandbook)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mig-'));
  await mkdir(join(root, 'prototypes', '_design-system'), { recursive: true });
  await mkdir(join(root, 'prototypes', '_brandbook'), { recursive: true });

  const result = await migratePrototypeConfigs({ projectRoot: root });
  assert.equal(result.created.length, 0);
});

test('idempotent — second run does nothing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mig-'));
  await mkdir(join(root, 'prototypes', 'baz'), { recursive: true });

  await migratePrototypeConfigs({ projectRoot: root });
  const stat1 = await stat(join(root, 'prototypes', 'baz', 'config.json'));

  await new Promise(r => setTimeout(r, 10));
  const result2 = await migratePrototypeConfigs({ projectRoot: root });
  assert.equal(result2.created.length, 0);

  const stat2 = await stat(join(root, 'prototypes', 'baz', 'config.json'));
  assert.equal(stat1.mtimeMs, stat2.mtimeMs); // file untouched
});
```

- [ ] **Step 2: Run test — fails**

```bash
node --test tests/migrate-prototype-configs.test.mjs
```

Expected: 4 fail.

- [ ] **Step 3: Implement**

`scripts/migrate-prototype-configs.mjs`:

```js
import { readdir, stat, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_CONFIG = {
  target: 'web',
  viewports: [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'desktop', width: 1440, height: 900 },
  ],
  runtime: 'browser',
  migrated: true,
  note: 'Auto-migrated by scripts/migrate-prototype-configs.mjs. Verify viewports match this prototype intent.',
};

const RESERVED = new Set(['_design-system', '_brandbook']);

export async function migratePrototypeConfigs({ projectRoot }) {
  const protoRoot = join(projectRoot, 'prototypes');
  const created = [];
  const skipped = [];

  let dirents;
  try {
    dirents = await readdir(protoRoot, { withFileTypes: true });
  } catch {
    return { created, skipped, note: 'no prototypes/ directory — nothing to migrate' };
  }

  for (const entry of dirents) {
    if (!entry.isDirectory()) continue;
    if (RESERVED.has(entry.name)) continue;

    const cfgPath = join(protoRoot, entry.name, 'config.json');
    try {
      await access(cfgPath);
      skipped.push(entry.name);
      continue;
    } catch {}

    await writeFile(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf8');
    created.push(entry.name);
  }

  return { created, skipped };
}

export async function main() {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const result = await migratePrototypeConfigs({ projectRoot });
  if (result.created.length) {
    console.log(`[migrate-prototype-configs] backfilled config.json for: ${result.created.join(', ')}`);
    console.log(`  Edit each prototypes/<slug>/config.json to confirm target + viewports match design intent.`);
  } else if (result.skipped.length) {
    console.log(`[migrate-prototype-configs] all ${result.skipped.length} prototype(s) already have config.json`);
  } else {
    console.log(`[migrate-prototype-configs] ${result.note || 'nothing to do'}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
```

- [ ] **Step 4: Run test — passes**

```bash
node --test tests/migrate-prototype-configs.test.mjs
```

Expected: 4 PASS.

- [ ] **Step 5: Wire into npm scripts**

In `package.json`:

```json
"migrate:prototype-configs": "node scripts/migrate-prototype-configs.mjs"
```

- [ ] **Step 6: Auto-run on SessionStart**

In `scripts/session-start-check.mjs`, after the existing checks, add a call to `migratePrototypeConfigs` if `prototypes/` directory exists. If `created.length > 0`, print a one-line warning so user knows config.json files were created and should be reviewed.

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-prototype-configs.mjs tests/migrate-prototype-configs.test.mjs package.json scripts/session-start-check.mjs
git commit -m "feat(migration): backfill prototype config.json for backward-compat with pre-write hook"
```

---

# Phase 2 — Animation & Graphics Tooling Depth (item 2 → 10/10)

## Task 5: Animation library decision matrix template

**Files:**
- Create: `templates/design-decisions/animation-library-matrix.md.tpl`
- Create: `templates/design-decisions/graphics-medium-matrix.md.tpl`

- [ ] **Step 1: Write animation matrix template**

`templates/design-decisions/animation-library-matrix.md.tpl`:

```markdown
# Animation Library Decision — <prototype-slug>

> Generated: <ISO-date>
> Decided by: creative-director
> Applies to: <viewport list>

## Context
<one paragraph: what motion problem are we solving — page enter, micro-interactions, hero, transitions, scroll-driven, shared-element?>

## Options Considered

| Option | Bundle (gzip) | API ergonomics | Performance ceiling | Reduced-motion | When to choose |
|---|---|---|---|---|---|
| Native CSS / WAAPI | 0 KB | medium | 60fps composited | trivial via media query | declarative, ≤3 properties, well-known easing |
| Motion One | 4 KB | high | 60fps composited | manual | timeline orchestration, springs, simple SVG morph |
| GSAP (free) | 24 KB | very high | 120fps possible | manual | complex sequences, ScrollTrigger, MorphSVG, SplitText |
| Anime.js | 6 KB | medium | 60fps composited | manual | SVG line-drawing, staggered patterns |
| Framer Motion | 35 KB | very high (React-only) | 60fps | built-in | layout animations, gestures (React only) |
| Three.js / r3f | 150+ KB | low (3D) | GPU-bound | n/a | actual 3D, particles, WebGL shaders |
| Lottie-web | 60 KB | declarative JSON | depends on JSON complexity | trivial | designer-authored complex sequences via AE → bodymovin |

## Decision
**Chosen:** <library-name>

## Rationale
- Why this option: <one sentence>
- Why not alternative A: <one sentence>
- Why not alternative B: <one sentence>

## Performance Budget
- Total motion library bundle: <KB>
- Per-frame work target: <ms>
- Animated properties allowed: transform, opacity (compositor) — anything else needs justification
- Reduced-motion strategy: <CSS media query | per-animation guard | full disable>

## Audit triggers (when to revisit)
- Bundle exceeds <KB>
- 60fps target missed on <device>
- New motion need outside chosen lib's strengths
```

- [ ] **Step 2: Write graphics matrix template**

`templates/design-decisions/graphics-medium-matrix.md.tpl`:

```markdown
# Graphics Medium Decision — <prototype-slug>

> Generated: <ISO-date>
> Decided by: creative-director

## Surface(s) covered
<which hero / illustration / data-viz / decorative / icon — list each>

## Per-surface decisions

### Surface: <name>
| Medium | Pixel scaling | File size | Authoring | Performance | A11y | When |
|---|---|---|---|---|---|---|
| SVG (inline) | infinite | small | code or Figma export | composited | semantic + aria | logos, icons, geometric illustrations |
| SVG (sprite) | infinite | small | tooling | cached | same | icon sets >5 icons |
| Canvas 2D | DPR-aware | medium | code | CPU | needs aria-label | data-viz, particles ≤500 |
| WebGL / regl | DPR-aware | medium-large | code | GPU | needs canvas alt | shaders, particles >500, 3D |
| WebGPU | DPR-aware | medium | code (modern) | GPU | needs canvas alt | compute-heavy, future-proof |
| Lottie JSON | infinite (vector) | small-medium | AE designer | CPU intensive on mobile | needs aria-hidden | hero illustrations with motion |
| PNG/JPG (with srcset) | needs DPR variants | large | export | cached | alt text | photo, complex artwork |
| AVIF/WebP | needs DPR variants | smaller | export | cached | alt text | modern photo (with PNG fallback) |

**Chosen for surface "<name>":** <medium>
**Why:** <one sentence>
**Why not alternatives:** <list>

## Asset pipeline
- Source format: <e.g. AE composition, Figma component, raw photo>
- Build step: <e.g. bodymovin export, svgo optimization, sharp resize>
- Output path: <prototypes/<slug>/assets/...>

## Performance ceiling
- Total visual asset budget: <KB on first paint>
- Largest single asset: <KB>
- Largest contentful paint target: <ms>
```

- [ ] **Step 3: Wire into creative-director agent**

In `agents/_design/creative-director.md`:

1. Add to `## Capabilities` list: `animation-library-decision`, `graphics-medium-decision`.
2. After the existing motion section, add a new procedure step:
   > **Step N: Persist animation/graphics decisions.** When the prototype involves any motion beyond CSS transitions, copy `templates/design-decisions/animation-library-matrix.md.tpl` to `prototypes/<slug>/decisions/animation.md` and fill all sections. When the prototype involves any graphics surface beyond standard typography/icons, copy `templates/design-decisions/graphics-medium-matrix.md.tpl` to `prototypes/<slug>/decisions/graphics.md` and fill it. Decisions become part of the handoff bundle.
3. Add anti-pattern: `unjustified-library-choice` — picking GSAP/Framer/Three without filling the matrix.

- [ ] **Step 4: Wire into prototype-builder agent**

In `agents/_design/prototype-builder.md`, in the Procedure, before final delivery (around the feedback-loop step), add:
> **Step N: Consult interaction-design-patterns.** Read `skills/interaction-design-patterns/SKILL.md` for the recipe matching this prototype's motion surface. If creative-director persisted `decisions/animation.md`, follow the chosen library; otherwise default to native CSS/WAAPI. Cite the recipe used in your delivery output.

- [ ] **Step 5: Add Motion section to ux-ui-designer**

In `agents/_design/ux-ui-designer.md`, add a new section after the existing screen-spec section:

```markdown
## Motion specification

When you specify a screen, your motion responsibility is: declare the **intent** (snappy / considered / deliberate) and the **state** (loading → loaded → error → success transitions). You do NOT pick the library.

Hand-off contract to creative-director:
- For each interactive element, name a tier from the timing-tier table (instant / quick / considered / deliberate / narrative).
- For each state transition, name what enters and what leaves.
- For prefers-reduced-motion: name the alternative (instant snap | crossfade | unchanged).
- Reference `skills/interaction-design-patterns/SKILL.md` timing tiers.

If your spec has 0 motion intent declared, creative-director will not animate. That is your decision, and it is OK — silence is a valid motion spec.
```

- [ ] **Step 6: Commit**

```bash
git add templates/design-decisions/ agents/_design/creative-director.md agents/_design/prototype-builder.md agents/_design/ux-ui-designer.md
git commit -m "feat(design): animation+graphics library decision matrices wired into creative pipeline"
```

---

# Phase 3 — Component Library Expansion (item 13 → 10/10)

## Task 6: Expand component templates from 1 to 13

**Files:**
- Create: 12 new files in `templates/design-system/components/`

For each new component file, follow the same structure as the existing `button.md.tpl`. Use the structure below.

- [ ] **Step 1: Read existing button template as reference**

```bash
cat templates/design-system/components/button.md.tpl
```

- [ ] **Step 2: Create input.md.tpl**

`templates/design-system/components/input.md.tpl`:

```markdown
# Input — Component Spec

## Purpose
Single-line text entry. Foundation for forms.

## Anatomy
- Wrapper: `<label>` (always — never use placeholder as label)
- Label text (required visually for sighted users; aria-label fallback for icon-only)
- Input element: `<input type="text|email|tel|url|search|number|password">`
- Helper text (optional)
- Error text (optional, replaces helper text on invalid)
- Leading icon slot (optional)
- Trailing icon slot (optional — clear button, password reveal, etc.)

## Tokens
- Height: `--input-height` (default `2.5rem` / 40px)
- Padding: `--input-padding-x` (default `0.75rem`)
- Border radius: `--radius-md`
- Border: `1px solid var(--border-default)` resting; `var(--border-active)` focus
- Type: `var(--type-body)` family/size; `var(--type-mono)` for code/IDs

## States
- resting | hover | focus | active | disabled | invalid | readonly | filled-vs-empty
- Each must declare visual change (not just attribute toggle)

## Variants
- size: sm (32px) | md (40px) | lg (48px)
- density: compact (no helper) | comfortable (with helper space reserved)
- adornments: none | leading-icon | trailing-icon | both

## A11y
- `<label for="id">` always wired (or `aria-label` if no visible label)
- `aria-describedby` for helper/error text
- `aria-invalid="true"` on validation failure
- Focus visible (never `outline: none` without replacement)
- Error must have programmatic association — colour alone is insufficient

## Anti-patterns
- placeholder as the only label
- coloured border as the only error indicator
- removing focus ring without a visible replacement
- locking width to a fixed pixel value (use `min-width` + content-driven)

## Reference (native CSS only — no framework)
```html
<label class="field">
  <span class="field__label">Email</span>
  <input class="field__input" type="email" aria-describedby="email-help" required>
  <span id="email-help" class="field__help">We'll never share your address.</span>
</label>
```

## Adapter notes
If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
```

- [ ] **Step 3: Create select.md.tpl**

Similar structure. Key sections to include:
- Anatomy: label + native `<select>` element + chevron + option list (renders OS-native, NO custom dropdown unless explicitly justified)
- States: resting | hover | focus | open | disabled | invalid
- Variants: size sm/md/lg; multiple-select (multi)
- A11y: label association, keyboard navigation native, ARIA listbox if custom dropdown
- Anti-patterns: replacing native dropdown without a11y parity, missing scroll for >7 options

- [ ] **Step 4: Create textarea.md.tpl**

Like input, but with: `min-rows`, `max-rows`, auto-grow option, `resize: vertical` default. States identical to input. Anti-pattern: fixed pixel height that crops content.

- [ ] **Step 5: Create checkbox.md.tpl**

Anatomy: label + native input checkbox + checkmark indicator. States: unchecked | checked | indeterminate | disabled (each × hover/focus). Variants: size sm/md/lg. A11y: label association mandatory, indeterminate via JS property only. Anti-pattern: replacing native checkbox without keyboard parity.

- [ ] **Step 6: Create radio.md.tpl**

Anatomy: fieldset + legend + radio inputs grouped by `name`. States: same as checkbox. A11y: fieldset+legend mandatory for groups; arrow key navigation within group. Anti-pattern: using checkboxes when only one selection is allowed.

- [ ] **Step 7: Create toggle.md.tpl**

Anatomy: label + native checkbox restyled OR `<button role="switch" aria-checked>`. States: off | on | disabled (× hover/focus). A11y: announce state change. Anti-pattern: using toggle for actions that are not boolean state (use button instead).

- [ ] **Step 8: Create card.md.tpl**

Anatomy: container + optional media slot + heading + body + actions slot + footer slot. States: resting | hover (interactive cards only) | focus (interactive cards only). Variants: outline | elevated | filled; padding tight/comfortable. A11y: if entire card is clickable, wrap in a single `<a>` or `<button>`; never nest interactive elements. Anti-pattern: card with multiple click targets at different layers.

- [ ] **Step 9: Create modal.md.tpl**

Anatomy: backdrop + dialog container + close button + header + body + actions footer. Built on `<dialog>` element where possible. States: closed | opening | open | closing. A11y: focus trap, return focus on close, `aria-labelledby` to title, `aria-modal="true"`, ESC closes. Anti-pattern: divs simulating dialog without focus trap; horizontal scroll inside modal; modal stack >1.

- [ ] **Step 10: Create toast.md.tpl**

Anatomy: container + icon + message + optional action + dismiss. Variants: info | success | warning | error. States: entering | visible | exiting. A11y: `role="status"` for info/success, `role="alert"` for warning/error; auto-dismiss only for non-critical. Anti-pattern: auto-dismissing error toasts; toasts for content that should be inline.

- [ ] **Step 11: Create tabs.md.tpl**

Anatomy: tablist + tab buttons + tabpanels. States: tab resting | tab active | tab disabled. Variants: underline | enclosed | pill. A11y: roving tabindex, arrow keys move, `aria-selected`, `aria-controls`. Anti-pattern: tabs that hide critical content from search/SEO.

- [ ] **Step 12: Create nav.md.tpl**

Anatomy: top-level nav, mobile drawer, breadcrumbs. States: link resting | hover | current (`aria-current="page"`) | disabled. Variants: horizontal | vertical | drawer. A11y: landmark role, skip-link. Anti-pattern: nav inside `<div>` without `<nav>` landmark.

- [ ] **Step 13: Create badge.md.tpl**

Anatomy: container + optional icon + text. Variants: count (number) | dot (presence) | label (status). Tone: neutral | info | success | warning | danger. A11y: if conveying state, `aria-label` describes; visual-only badges should be `aria-hidden`. Anti-pattern: decorative badge announced by screen readers.

- [ ] **Step 14: Commit each batch**

You can commit in two batches (form components, then composites) to keep diffs focused:

```bash
git add templates/design-system/components/{input,select,textarea,checkbox,radio,toggle}.md.tpl
git commit -m "feat(design): add 6 form component templates (input/select/textarea/checkbox/radio/toggle)"

git add templates/design-system/components/{card,modal,toast,tabs,nav,badge}.md.tpl
git commit -m "feat(design): add 6 composite component templates (card/modal/toast/tabs/nav/badge)"
```

---

## Task 7: Component-library-integration skill

**Files:**
- Create: `skills/component-library-integration/SKILL.md`
- Create: `templates/component-adapters/mui-token-bridge.ts.tpl`
- Create: `templates/component-adapters/shadcn-token-bridge.css.tpl`
- Create: `templates/component-adapters/headless-ui-mapping.md.tpl`
- Modify: `skills/brandbook/SKILL.md` (Section 6.5 added)

- [ ] **Step 1: Write the skill**

`skills/component-library-integration/SKILL.md`:

```markdown
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

Ask user one question at a time:

**Step 1/4:** What is the target stack for production?
- React → continue Step 2
- Vue → recommend HeadlessUI (Vue) or Radix-Vue or custom; Step 2
- Svelte → recommend Melt UI / Bits UI or custom; Step 2
- Angular → recommend Angular Material or custom; Step 2
- Vanilla / multi-framework → custom only; Step 2

**Step 2/4:** What is the design priority axis?
- Speed-to-market + opinionated visual: MUI | Mantine
- Maximum control + tokens-first: shadcn/ui | Radix UI primitives
- Headless logic only, full visual control: HeadlessUI | Radix UI primitives
- Already chose a library externally (project has it installed): adapt it

**Step 3/4:** Confirm library: <chosen>

**Step 4/4:** Bridge depth — 3 tiers:
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
```

- [ ] **Step 2: Write MUI bridge template**

`templates/component-adapters/mui-token-bridge.ts.tpl`:

```ts
// MUI theme bridging project design tokens
// Source: prototypes/_design-system/tokens.css
// Generated: <ISO-date>
// IMPORTANT: regenerate when tokens.css changes.

import { createTheme } from '@mui/material/styles';

const cssVar = (name: string) => `var(${name})`;

export const theme = createTheme({
  palette: {
    primary: {
      main: cssVar('--color-primary-500'),
      light: cssVar('--color-primary-300'),
      dark: cssVar('--color-primary-700'),
      contrastText: cssVar('--color-on-primary'),
    },
    secondary: {
      main: cssVar('--color-secondary-500'),
    },
    background: {
      default: cssVar('--color-bg-default'),
      paper: cssVar('--color-bg-elevated'),
    },
    text: {
      primary: cssVar('--color-text-primary'),
      secondary: cssVar('--color-text-secondary'),
    },
    error: { main: cssVar('--color-danger-500') },
    warning: { main: cssVar('--color-warning-500') },
    success: { main: cssVar('--color-success-500') },
  },
  typography: {
    fontFamily: cssVar('--type-family-body'),
    h1: { fontFamily: cssVar('--type-family-display') },
    button: { textTransform: 'none' },
  },
  shape: {
    borderRadius: 8, // overridden per-component via sx with var(--radius-md)
  },
  spacing: 4, // 0.25rem; multiply via sx={{ p: 4 }} → 16px
  transitions: {
    duration: {
      shortest: 150,
      shorter: 200,
      short: 250,
      standard: 300,
      complex: 375,
    },
  },
});
```

- [ ] **Step 3: Write shadcn bridge template**

`templates/component-adapters/shadcn-token-bridge.css.tpl`:

```css
/* shadcn/ui token bridge
 * Source: prototypes/_design-system/tokens.css
 * Generated: <ISO-date>
 * Regenerate when tokens.css changes.
 *
 * shadcn's globals.css typically declares :root vars like --background, --foreground, --primary.
 * Here we re-declare them as references to OUR tokens, so shadcn components inherit project palette.
 */

@import "../../tokens.css"; /* project tokens are the source of truth */

:root {
  --background: var(--color-bg-default);
  --foreground: var(--color-text-primary);
  --card: var(--color-bg-elevated);
  --card-foreground: var(--color-text-primary);
  --popover: var(--color-bg-elevated);
  --popover-foreground: var(--color-text-primary);
  --primary: var(--color-primary-500);
  --primary-foreground: var(--color-on-primary);
  --secondary: var(--color-secondary-500);
  --secondary-foreground: var(--color-on-secondary);
  --muted: var(--color-bg-muted);
  --muted-foreground: var(--color-text-muted);
  --accent: var(--color-accent-500);
  --accent-foreground: var(--color-on-accent);
  --destructive: var(--color-danger-500);
  --destructive-foreground: var(--color-on-danger);
  --border: var(--color-border-default);
  --input: var(--color-border-default);
  --ring: var(--color-primary-500);
  --radius: var(--radius-md);
}

.dark {
  --background: var(--color-bg-default-dark, var(--color-bg-default));
  /* ... mirror for dark mode if tokens.css declares dark variants ... */
}
```

- [ ] **Step 4: Write headless mapping template**

`templates/component-adapters/headless-ui-mapping.md.tpl`:

```markdown
# Headless Library Mapping — <library-name>

> Generated: <ISO-date>
> Source baseline: prototypes/_design-system/components/

| Our baseline | Headless primitive | Notes |
|---|---|---|
| Button | (none — use native `<button>`) | tokens applied directly |
| Input | (none — use native `<input>`) | tokens applied directly |
| Select | <library>/Listbox | replaces native select for advanced cases |
| Checkbox | (native) or <library>/Checkbox | native preferred |
| Radio | <library>/RadioGroup | for keyboard-arrow group navigation |
| Toggle | <library>/Switch | accessible role=switch built-in |
| Card | (none — composite) | structural CSS only |
| Modal | <library>/Dialog | built-in focus trap + return |
| Toast | <library>/Toast or custom | check whether library ships toast |
| Tabs | <library>/Tab.Group | roving tabindex built-in |
| Nav | (none — composite) | landmark + your tokens |
| Badge | (none — visual only) | tokens applied directly |

## Theme application
This library is logic-only — visual tokens come from `tokens.css` applied via class names or CSS variables. No theme provider is configured.

## Anti-patterns specific to this library
<list 2-3 known footguns>
```

- [ ] **Step 5: Update brandbook skill Section 6.5**

In `skills/brandbook/SKILL.md`, after the existing Section 6 (components baseline), add:

```markdown
### Section 6.5 — Component library decision (one question)

**Шаг 6.5/8:** Выбираем подход к компонентам.

- A) **Свои компоненты** — пишем с нуля, максимум контроля, дольше build.
- B) **shadcn/ui** (React) — copy-paste, наши токены, источник истины — наш репозиторий.
- C) **MUI** (React) — готовая библиотека, мы делаем theme.ts с нашими токенами.
- D) **Mantine** (React) — как MUI, более современный, гибкий.
- E) **Radix UI / HeadlessUI** — только логика, визуал полностью наш.
- F) **Angular Material / PrimeVue / другое** — указываем явно.

После выбора → запустим `evolve:component-library-integration` для генерации bridge.
```

Update Section 6 to make the components list explicitly OPEN-ended:
> Базовый набор: button, input, select, textarea, checkbox, radio, toggle, card, modal, toast, tabs, nav, badge. Этот список — старт. Можно добавлять и убирать. Если выбран MUI/shadcn — компоненты приходят из них, а наш список становится перечнем тех, у которых spec обязателен.

- [ ] **Step 6: Wire creative-director to invoke this skill**

In `agents/_design/creative-director.md`, in the brandbook flow, after Section 6 completion, append:
> If user picks any option B–F, dispatch `skill: evolve:component-library-integration` immediately after brandbook approval. Do NOT proceed to prototype until library bridge is approved.

- [ ] **Step 7: Test the skill end-to-end manually**

Manual smoke test (no automation needed for skill-only changes):
1. Read `skills/component-library-integration/SKILL.md`.
2. Verify all 4 templates exist.
3. Verify `brandbook` references it via 6.5.
4. Verify `creative-director` invokes it.

- [ ] **Step 8: Commit**

```bash
git add skills/component-library-integration/ templates/component-adapters/ skills/brandbook/SKILL.md agents/_design/creative-director.md
git commit -m "feat(design): component-library-integration skill + MUI/shadcn/headless bridges"
```

---

# Phase 4 — Single-Question Discipline Globally (item 10 → 10/10)

## Task 8: New rule — single-question-discipline

**Files:**
- Create: `rules/single-question-discipline.md`

- [ ] **Step 1: Write the rule**

`rules/single-question-discipline.md`:

```markdown
---
name: single-question-discipline
description: All agents that ask the user clarifying questions MUST ask one question at a time, with markdown formatting and a Step N/M progress indicator. Multi-question dumps are forbidden.
applies-to:
  - agents/_design/**
  - agents/_product/**
  - agents/_meta/evolve-orchestrator.md
  - agents/_core/repo-researcher.md
  - agents/_core/root-cause-debugger.md
  - agents/_ops/**
  - agents/stacks/**
severity: high
version: 1.0
last-verified: 2026-04-28
mandatory: true
related-rules:
  - confidence-discipline
  - anti-hallucination
---

## What
Any agent that engages the user in clarification, requirements gathering, design dialogue, or branching decisions MUST present **one question at a time**, formatted as markdown with a `Шаг N/M:` (or `Step N/M:`) progress indicator. Choices must be a list. The agent must wait for an explicit user reply before asking the next question.

## Why
Multi-question dumps overwhelm users, cause partial answers, and produce ambiguous state. Designers learned this first — the design-pipeline rollout in commit `2a16afc` proved one-at-a-time dialogues raise approval rates and reduce rework. The discipline must extend to product, ops, stack, and meta agents — not only design.

## How to apply

For every interactive agent, the agent MUST include a section in its definition:

```markdown
## User dialogue discipline

Ask one question per message. Format:

> **Шаг N/M:** <one focused question>
>
> - <option a> — <one-line rationale>
> - <option b> — <one-line rationale>
> - <option c> — <one-line rationale>
>
> Свободный ответ тоже принимается.

Wait for explicit user reply before advancing N. Do NOT bundle Step N+1 into the same message.
```

The agent's `## Anti-patterns` section MUST list:
- `asking-multiple-questions-at-once`
- `silent-progress` — advancing without reflecting `Шаг N/M:` so the user knows depth.
- `dumping-options-without-rationale` — listing 6 choices with no one-line trade-off.

## When NOT to apply
- Pure-output agents that don't ask the user anything (e.g., `code-reviewer` produces a verdict and exits — no questions).
- Background / log-processing agents that have no user dialogue.
- Single-question scenarios — when the agent only needs ONE clarification, the `Шаг 1/1:` indicator is still required for consistency.

## Discipline
Validator `scripts/validate-question-discipline.mjs` (run in `npm run check`) checks that every agent file matching `applies-to` contains either:
- the literal string `## User dialogue discipline`, OR
- the literal string `Шаг N/M`, AND
- the anti-pattern `asking-multiple-questions-at-once`.

Failures block commit.

## Override
If an agent legitimately cannot follow this rule (e.g., the orchestrator dispatches in parallel and never owns dialogue), declare in frontmatter: `dialogue: noninteractive` and the validator skips it.

## Related
- `rules/confidence-discipline.md` — every agent reports confidence
- `skills/brainstorming/SKILL.md` — meta-skill that itself follows this rule
```

- [ ] **Step 2: Commit**

```bash
git add rules/single-question-discipline.md
git commit -m "feat(rules): codify single-question dialogue discipline as global rule"
```

---

## Task 9: Validator for question discipline

**Files:**
- Create: `scripts/validate-question-discipline.mjs`
- Create: `tests/validate-question-discipline.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing test**

`tests/validate-question-discipline.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAgentDiscipline } from '../scripts/validate-question-discipline.mjs';

test('agent without discipline section fails', () => {
  const fm = {};
  const body = '## Persona\nfoo\n## Procedure\n1. Ask user.\n';
  const issues = checkAgentDiscipline('agents/_product/systems-analyst.md', fm, body);
  assert.ok(issues.length > 0);
});

test('agent with discipline section passes', () => {
  const fm = {};
  const body = `## User dialogue discipline\nШаг N/M format used.\n## Anti-patterns\n- asking-multiple-questions-at-once\n`;
  const issues = checkAgentDiscipline('agents/_product/systems-analyst.md', fm, body);
  assert.equal(issues.length, 0);
});

test('noninteractive frontmatter override skips check', () => {
  const fm = { dialogue: 'noninteractive' };
  const body = '';
  const issues = checkAgentDiscipline('agents/_meta/evolve-orchestrator.md', fm, body);
  assert.equal(issues.length, 0);
});

test('agent NOT in applies-to scope is skipped', () => {
  const fm = {};
  const body = '';
  const issues = checkAgentDiscipline('agents/_core/code-reviewer.md', fm, body);
  assert.equal(issues.length, 0); // code-reviewer is read-only, not in applies-to
});
```

- [ ] **Step 2: Run test to verify fails**

```bash
node --test tests/validate-question-discipline.test.mjs
```

Expected: 4 fails — function not exported.

- [ ] **Step 3: Implement validator**

`scripts/validate-question-discipline.mjs`:

```js
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter } from './lib/parse-frontmatter.mjs';

const APPLIES_TO_GLOBS = [
  /^agents[\\/]_design[\\/]/,
  /^agents[\\/]_product[\\/]/,
  /^agents[\\/]_meta[\\/]evolve-orchestrator\.md$/,
  /^agents[\\/]_core[\\/]repo-researcher\.md$/,
  /^agents[\\/]_core[\\/]root-cause-debugger\.md$/,
  /^agents[\\/]_ops[\\/]/,
  /^agents[\\/]stacks[\\/]/,
];

const DISCIPLINE_MARKER_A = '## User dialogue discipline';
const DISCIPLINE_MARKER_B = 'Шаг N/M';
const ANTI_PATTERN_REQUIRED = 'asking-multiple-questions-at-once';

export function isInScope(relPath) {
  return APPLIES_TO_GLOBS.some(re => re.test(relPath.replace(/\\/g, '/')));
}

export function checkAgentDiscipline(relPath, frontmatter, body) {
  if (!isInScope(relPath.replace(/\//g, require('path').sep))) return [];
  if (frontmatter?.dialogue === 'noninteractive') return [];

  const issues = [];
  const hasMarkerA = body.includes(DISCIPLINE_MARKER_A);
  const hasMarkerB = body.includes(DISCIPLINE_MARKER_B);
  if (!hasMarkerA && !hasMarkerB) {
    issues.push({
      file: relPath,
      code: 'missing-dialogue-discipline',
      message: `Add '## User dialogue discipline' section or use 'Шаг N/M' format.`,
    });
  }
  if (!body.includes(ANTI_PATTERN_REQUIRED)) {
    issues.push({
      file: relPath,
      code: 'missing-anti-pattern',
      message: `Add '${ANTI_PATTERN_REQUIRED}' to anti-patterns.`,
    });
  }
  return issues;
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

export async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const agentsDir = join(root, 'agents');
  const files = await walk(agentsDir);

  let totalIssues = 0;
  for (const full of files) {
    const rel = full.slice(root.length + 1);
    const raw = await readFile(full, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const issues = checkAgentDiscipline(rel, frontmatter, body);
    for (const issue of issues) {
      console.error(`[${issue.code}] ${issue.file}: ${issue.message}`);
      totalIssues++;
    }
  }
  if (totalIssues > 0) {
    console.error(`\n${totalIssues} discipline issue(s).`);
    process.exit(1);
  }
  console.log('[validate-question-discipline] all interactive agents compliant');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
node --test tests/validate-question-discipline.test.mjs
```

Expected: 4 PASS.

- [ ] **Step 5: Wire to npm scripts**

In `package.json` add:

```json
"validate:question-discipline": "node scripts/validate-question-discipline.mjs"
```

Append to `check`: `&& npm run validate:question-discipline`.

- [ ] **Step 6: Run validator standalone — see all current failures**

```bash
npm run validate:question-discipline 2>&1 | head -80
```

Expected: many failures (all non-design agents in scope) — this is the work list for Task 10.

- [ ] **Step 7: Commit**

```bash
git add scripts/validate-question-discipline.mjs tests/validate-question-discipline.test.mjs package.json
git commit -m "feat(validators): enforce single-question discipline across interactive agents"
```

---

## Task 10: Roll out discipline to non-design agents

For each agent below, add the `## User dialogue discipline` section (template under Task 8) and the `asking-multiple-questions-at-once` anti-pattern.

**Files (in batches):**

- [ ] **Step 1: Product batch**

Modify these files, each receiving the discipline section + anti-pattern:
- `agents/_product/systems-analyst.md`
- `agents/_product/product-manager.md`
- `agents/_product/qa-test-engineer.md`
- `agents/_product/analytics-implementation.md`
- `agents/_product/seo-specialist.md`
- `agents/_product/email-lifecycle.md`

For each, locate the `## Anti-patterns` section and add `asking-multiple-questions-at-once` if absent. Locate a place after `## Persona` (or after `## Project Context`) and insert the standardized `## User dialogue discipline` block from rule `single-question-discipline.md`.

Run `npm run validate:question-discipline` after this batch — should reduce errors.

```bash
git add agents/_product/
git commit -m "feat(agents): single-question dialogue discipline for product agents"
```

- [ ] **Step 2: Core + meta batch**

Modify:
- `agents/_meta/evolve-orchestrator.md` — orchestrator clarifying questions only (when it asks user "which path do you want?"). If the orchestrator never asks user clarifications and only routes, set `dialogue: noninteractive` in frontmatter instead.
- `agents/_core/repo-researcher.md`
- `agents/_core/root-cause-debugger.md`

Run validator. Commit:

```bash
git add agents/_meta/evolve-orchestrator.md agents/_core/repo-researcher.md agents/_core/root-cause-debugger.md
git commit -m "feat(agents): single-question dialogue discipline for meta + core agents"
```

- [ ] **Step 3: Ops batch**

Modify:
- `agents/_ops/devops-sre.md`
- `agents/_ops/infrastructure-architect.md`
- `agents/_ops/db-reviewer.md`
- `agents/_ops/ai-integration-architect.md`
- 5 *-researcher agents under `agents/_ops/`
- any other under `_ops/`

For researchers that produce read-only research and don't ask the user clarifications, set `dialogue: noninteractive` instead of adding the section. Verify each individually.

```bash
git add agents/_ops/
git commit -m "feat(agents): single-question dialogue discipline for ops agents"
```

- [ ] **Step 4: Stacks batch**

Modify:
- `agents/stacks/laravel/laravel-architect.md`, `laravel-developer.md`, `eloquent-modeler.md`, `queue-worker-architect.md`
- `agents/stacks/nextjs/nextjs-architect.md`, `nextjs-developer.md`, `server-actions-specialist.md`
- `agents/stacks/fastapi/fastapi-architect.md`, `fastapi-developer.md`
- `agents/stacks/react/react-implementer.md`
- `agents/stacks/postgres/postgres-architect.md`
- `agents/stacks/redis/redis-architect.md`
- `agents/stacks/chrome-extension/chrome-extension-architect.md`, `chrome-extension-developer.md`

```bash
git add agents/stacks/
git commit -m "feat(agents): single-question dialogue discipline for stack agents"
```

- [ ] **Step 5: Run full check**

```bash
npm run check
```

Expected: PASS.

---

# Phase 5 — Non-Web Design Surfaces (item 11 → 10/10)

## Task 11: Viewport presets

**Files:**
- Create: `templates/viewport-presets/web.json`
- Create: `templates/viewport-presets/chrome-extension.json`
- Create: `templates/viewport-presets/electron.json`
- Create: `templates/viewport-presets/tauri.json`
- Create: `templates/viewport-presets/mobile-native.json`

- [ ] **Step 1: web.json**

```json
{
  "target": "web",
  "defaults": [
    { "name": "mobile", "width": 375, "height": 812 },
    { "name": "desktop", "width": 1440, "height": 900 }
  ],
  "optional": [
    { "name": "tablet", "width": 768, "height": 1024 },
    { "name": "wide", "width": 1920, "height": 1080 }
  ],
  "runtime": "browser"
}
```

- [ ] **Step 2: chrome-extension.json**

```json
{
  "target": "chrome-extension",
  "defaults": [
    { "name": "popup", "width": 360, "height": 600, "surface": "browser_action" },
    { "name": "options", "width": 1024, "height": 768, "surface": "options_page" },
    { "name": "side-panel", "width": 400, "height": 800, "surface": "side_panel" }
  ],
  "optional": [
    { "name": "popup-narrow", "width": 320, "height": 480 },
    { "name": "options-mobile", "width": 768, "height": 1024 }
  ],
  "runtime": "browser-extension",
  "manifest-v": 3,
  "constraints": [
    "popup max width 800px enforced by Chrome",
    "popup heights >600 may scroll on small screens",
    "no inline event handlers (CSP)",
    "service worker has no DOM"
  ]
}
```

- [ ] **Step 3: electron.json**

```json
{
  "target": "electron",
  "defaults": [
    { "name": "main-window", "width": 1280, "height": 800 },
    { "name": "settings", "width": 800, "height": 600 }
  ],
  "optional": [
    { "name": "main-large", "width": 1920, "height": 1080 },
    { "name": "compact", "width": 1024, "height": 720 }
  ],
  "runtime": "electron-renderer",
  "constraints": [
    "renderer is Chromium — full web platform",
    "preload script bridges to main process",
    "system menu bar adds ~28px (macOS) / 0 (windows hidden)",
    "platform-specific window chrome"
  ]
}
```

- [ ] **Step 4: tauri.json**

```json
{
  "target": "tauri",
  "defaults": [
    { "name": "main-window", "width": 1280, "height": 800 },
    { "name": "secondary", "width": 800, "height": 600 }
  ],
  "optional": [
    { "name": "main-large", "width": 1920, "height": 1080 }
  ],
  "runtime": "tauri-webview",
  "constraints": [
    "Tauri uses platform native webview (WKWebView macOS / WebView2 Windows / WebKitGTK Linux)",
    "feature parity NOT identical to Chromium — test on all 3",
    "IPC via invoke() — no Node APIs in webview",
    "icon and chrome controlled via tauri.conf.json"
  ]
}
```

- [ ] **Step 5: mobile-native.json**

```json
{
  "target": "mobile-native",
  "defaults": [
    { "name": "iphone-15", "width": 393, "height": 852, "platform": "ios" },
    { "name": "pixel-8", "width": 412, "height": 915, "platform": "android" }
  ],
  "optional": [
    { "name": "iphone-se", "width": 375, "height": 667, "platform": "ios" },
    { "name": "ipad-mini", "width": 744, "height": 1133, "platform": "ipados" },
    { "name": "android-tablet", "width": 800, "height": 1280, "platform": "android" }
  ],
  "runtime": "react-native | flutter | swiftui | jetpack-compose",
  "constraints": [
    "safe-area insets — must respect notch/home-indicator",
    "platform-native components preferred (don't reskin iOS to Material)",
    "platform Human Interface Guidelines + Material Design",
    "touch targets ≥44pt iOS / 48dp Android"
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add templates/viewport-presets/
git commit -m "feat(design): viewport presets for 5 target surfaces (web/extension/electron/tauri/mobile)"
```

---

## Task 12: Extend prototype skill with target parameter

**Files:**
- Modify: `skills/prototype/SKILL.md`
- Modify: `agents/_design/prototype-builder.md`
- Modify: `commands/evolve-design.md`

- [ ] **Step 1: Update prototype skill**

In `skills/prototype/SKILL.md`, add (or update) the "When to invoke" section:

```markdown
## Target surfaces

Prototype skill supports five target runtimes. Ask the user which BEFORE the viewport question:

**Шаг 0/N:** На какую платформу делаем прототип?
- `web` — браузерный сайт/SaaS (default 375 mobile + 1440 desktop)
- `chrome-extension` — расширение браузера (popup + options + side-panel)
- `electron` — Electron desktop app (main + settings windows)
- `tauri` — Tauri desktop app (Rust + webview)
- `mobile-native` — нативное мобильное (iOS/Android — React Native / Flutter / SwiftUI)

После выбора — загружу `templates/viewport-presets/<target>.json` и спрошу про viewport'ы (default/optional/custom).
```

In Step 2 (viewport question), branch:
```markdown
Read `$CLAUDE_PLUGIN_ROOT/templates/viewport-presets/<target>.json`. Show defaults and optional, ask user.

Write `prototypes/<slug>/config.json` with structure:
{
  "target": "<target>",
  "viewports": [...],
  "runtime": "<from preset>",
  "constraints": [...from preset]
}
```

For `mobile-native`: prototype is HTML simulation of mobile UI within an iframe with the chosen viewport size — note that final implementation will be React Native / Flutter / native; the HTML prototype is a fidelity sketch only.

For `tauri` / `electron`: HTML/CSS/JS still works (renderer is webview-based), but constraints differ. Do NOT use Node APIs in HTML — IPC bridges only via documented preload exposed APIs.

For `chrome-extension`: HTML/CSS/JS works. Manifest constraints (CSP — no inline handlers) must be respected even at prototype stage.

- [ ] **Step 2: Update prototype-builder agent**

In `agents/_design/prototype-builder.md`, add to Procedure (after viewport step):

```markdown
**Step N: Target-specific scaffolding.**

Read `prototypes/<slug>/config.json` for `target`. Branch:

- `web` → directory layout: `prototypes/<slug>/{index.html, styles/, scripts/, content/}`. Single page or pages/.
- `chrome-extension` → directory layout: `prototypes/<slug>/{popup/index.html, options/index.html, side-panel/index.html, manifest.json (mock)}`. Each surface its own HTML file. Verify CSP compliance: no `<script>` inline content; all JS in external files.
- `electron` → layout: `prototypes/<slug>/{main-window/index.html, settings/index.html}`. Note in README that production preload bridge is NOT implemented in prototype.
- `tauri` → layout: `prototypes/<slug>/{main-window/index.html, secondary/index.html}`. Note production `invoke()` calls must be mocked at prototype stage.
- `mobile-native` → layout: `prototypes/<slug>/{ios/{home,detail}.html, android/{home,detail}.html}`. Each viewport iframe shows the corresponding HTML at the device-frame size. Note: production is React Native / Flutter / native — these HTMLs are fidelity sketches, not implementation.
```

- [ ] **Step 3: Update evolve-design command**

In `commands/evolve-design.md`:

a. Locate the existing Stage headers (currently Stage 1 through Stage 8 per commit `2a16afc`). Read the file to confirm the current numbering before editing.

b. Insert a new section BEFORE the current Stage 1, named:

```markdown
### Stage 0 — Target surface (Шаг 0/N)

Before any other question, ask the user the target surface as defined in skills/prototype/SKILL.md "Target surfaces" section. Save user choice into the future `prototypes/<slug>/config.json` `target` field.
```

c. **Renumber existing stages** so the chain is contiguous: existing Stage 1 → Stage 1 (unchanged), … but if the file uses absolute Stage numbers in cross-references (e.g., "as decided in Stage 3"), keep those absolute numbers and DO NOT shift them — only insert Stage 0 ahead of Stage 1. Verify by `grep -n "Stage [0-9]" commands/evolve-design.md` before and after to confirm no broken cross-refs.

d. Update any `Шаг N/M` progress labels inside Stage 0 dialogue to reflect the new total step count (e.g., if existing dialogue used `Шаг N/4`, increment M by 1 across the file).

- [ ] **Step 4: Commit**

```bash
git add skills/prototype/SKILL.md agents/_design/prototype-builder.md commands/evolve-design.md
git commit -m "feat(design): prototype skill supports 5 target surfaces (web/extension/electron/tauri/mobile)"
```

---

## Task 13: Specialist non-web design agents

**Files:**
- Create: `agents/_design/extension-ui-designer.md`
- Create: `agents/_design/electron-ui-designer.md`
- Create: `agents/_design/tauri-ui-designer.md`
- Create: `agents/_design/mobile-ui-designer.md`

For each, follow the standard 11-section agent structure from `agents/_core/code-reviewer.md`. ≥250 lines each.

- [ ] **Step 1: extension-ui-designer.md**

Key specialization details to embed:
- **Persona:** 12+ years browser-extension UX (Chrome MV3, Edge, Brave, Firefox WebExtensions). "Extensions live inside someone else's UI — your design is the etiquette guest at a party. Never block, never animate gratuitously, never pop up uninvited."
- **Project Context:** Lists all `agents/stacks/chrome-extension/*` agents and the design hand-off contract.
- **Skills:** prototype (target=chrome-extension), brandbook, interaction-design-patterns, ui-review-and-polish, repo-discovery-map.
- **Decision tree:** popup vs side-panel vs options vs new-tab; permission UX; first-run UX; auth flow inside extension.
- **Procedure:** read manifest constraints → declare target surfaces → load extension viewport preset → produce per-surface mockup → verify CSP compliance → handoff to chrome-extension-developer.
- **Anti-patterns:** popup taller than viewport, options page that simulates a website (use platform conventions), animations >300ms in popup (browser may close popup), localStorage assumptions (extension storage is different).
- **User dialogue discipline:** standard block.
- **Output contract:** standard footer with Confidence + Rubric.
- **Common workflows:** "design extension popup" → "extend extension to side-panel" → "add options screen".
- **Out of scope:** background service worker logic, content-script injection (delegate to chrome-extension-developer/architect).
- **Related:** chrome-extension-architect, chrome-extension-developer, prototype-builder.

- [ ] **Step 2: electron-ui-designer.md**

- **Persona:** 15+ years desktop app design (Slack, VSCode-class apps). "Desktop is not just a big phone. Users expect platform conventions: macOS title bar, Windows snap, Linux i18n."
- **Project Context:** Lists Electron-related rules (e.g., context isolation, preload bridge).
- **Skills:** prototype (target=electron), brandbook, interaction-design-patterns, ui-review-and-polish.
- **Decision tree:** native title bar vs custom; multi-window or single; tray icon presence; menu bar contents per platform; accelerators.
- **Procedure:** target surface enumeration (main, settings, modal, tray) → viewport preset → window-chrome decision → per-window mockup → keyboard accelerator spec → handoff.
- **Anti-patterns:** custom title bar without proper drag-region, ignoring platform menu conventions, modal-heavy flows in desktop (use sheets / inline), tiny touch targets on touchscreen Windows.
- **User dialogue discipline:** standard block.
- **Output contract:** standard footer.
- **Common workflows:** "design Electron settings window", "design tray dropdown", "design first-run onboarding".
- **Out of scope:** main-process logic, IPC contracts (delegate to a future electron-engineer agent or general node engineer).

- [ ] **Step 3: tauri-ui-designer.md**

- **Persona:** 8+ years desktop UI on lightweight runtimes. "Tauri's webview varies by OS — your design must work on WKWebView, WebView2, and WebKitGTK without surprises. CSS feature-detect, never assume Chromium."
- **Project Context:** Tauri 2 surface, IPC via `invoke()`.
- **Skills:** prototype (target=tauri), brandbook, interaction-design-patterns.
- **Decision tree:** main window structure; system tray; auto-update prompts UI; permission dialogs.
- **Procedure:** target enumeration → viewport preset → cross-webview compatibility audit (no `:has()` until Safari/WKWebView confirmed) → per-window mockup → handoff to tauri-engineer (project-specific).
- **Anti-patterns:** Chromium-only CSS (`:has`, latest features) without fallback, assuming `font-family: system-ui` resolves identically across OSes, bundle-heavy fonts (Tauri prides on small bundle).
- **User dialogue discipline:** standard block.
- **Output contract:** standard footer.

- [ ] **Step 4: mobile-ui-designer.md**

- **Persona:** 12+ years mobile UX (iOS HIG + Android Material 3). "Mobile is fingers, attention, and battery. Every animation costs joules; every screen must work one-handed."
- **Project Context:** target=mobile-native, runtime React Native | Flutter | SwiftUI | Jetpack Compose.
- **Skills:** prototype (target=mobile-native), brandbook, interaction-design-patterns.
- **Decision tree:** stack navigation vs tabs vs drawer; bottom-sheet vs modal; native components vs cross-platform tokens; iOS/Android divergence policy.
- **Procedure:** platform decision (iOS-first | Android-first | parity) → viewport preset → safe-area planning → per-screen mockup at iPhone 15 + Pixel 8 sizes → motion spec referencing platform-native easings (iOS: cubic-bezier(0.4, 0, 0.2, 1) ; Android: M3 standard).
- **Anti-patterns:** reskinning iOS to look like Android (or vice versa), ignoring safe-area, blocking gesture-edge with sticky elements, large layout shifts on rotate.
- **User dialogue discipline:** standard block.
- **Output contract:** standard footer.

- [ ] **Step 5: Add all 4 to plugin.json**

Read `.claude-plugin/plugin.json`, locate the `agents:[]` array, append paths:
- `agents/_design/extension-ui-designer.md`
- `agents/_design/electron-ui-designer.md`
- `agents/_design/tauri-ui-designer.md`
- `agents/_design/mobile-ui-designer.md`

- [ ] **Step 6: Update CLAUDE.md routing table**

In `CLAUDE.md` under "Common workflows", add:

```markdown
| "design Chrome extension popup/options/sidepanel" | `extension-ui-designer` |
| "design Electron settings window / tray" | `electron-ui-designer` |
| "design Tauri main window" | `tauri-ui-designer` |
| "design mobile screen / app onboarding" | `mobile-ui-designer` |
```

In the "Agent system" namespace table, increment _design count from 6 to 10.

- [ ] **Step 7: Run check**

```bash
npm run check
```

Expected: PASS (validators: frontmatter, descriptions, agent footers, design skills, question discipline, plugin-json).

- [ ] **Step 8: Commit**

```bash
git add agents/_design/extension-ui-designer.md agents/_design/electron-ui-designer.md agents/_design/tauri-ui-designer.md agents/_design/mobile-ui-designer.md .claude-plugin/plugin.json CLAUDE.md
git commit -m "feat(design): 4 specialist agents for non-web UI (extension/electron/tauri/mobile)"
```

---

## Task 14: Wire chrome-extension-developer to consume design handoff

**Files:**
- Modify: `agents/stacks/chrome-extension/chrome-extension-developer.md`

- [ ] **Step 1: Add design-input section**

After the agent's `## Project Context` section, add:

```markdown
## Design input

When implementing extension surfaces (popup / options / side-panel), check for design handoff first:

1. Look for `prototypes/<slug>/handoff/` produced by `extension-ui-designer` + `prototype-handoff` skill.
2. If present, read:
   - `viewport-spec.json` — confirms target widths
   - `components-used.json` — inventory of components needed
   - `tokens-used.json` — design tokens to consume
   - `stack-agnostic.md` — adapter hints (since extension uses your project framework)
3. Production code MUST consume tokens from the design system; never hard-code values from the prototype HTML.
4. If no handoff exists, dispatch `extension-ui-designer` BEFORE writing UI code — do not improvise.
```

- [ ] **Step 2: Commit**

```bash
git add agents/stacks/chrome-extension/chrome-extension-developer.md
git commit -m "feat(stacks): chrome-extension-developer reads extension-ui-designer handoff"
```

---

## Task 14a: Extend `prototype-handoff` skill with non-web adapter hints

> **Why:** Phase 5 introduces 5 target surfaces, but `skills/prototype-handoff/SKILL.md` Stage 5 currently only knows React/Vue/Svelte/Laravel/vanilla. Without per-target adapter hints, mobile/electron/tauri/extension handoffs ship without guidance for the production stack.

**Files:**
- Create: `templates/handoff-adapters/react-native.md.tpl`
- Create: `templates/handoff-adapters/flutter.md.tpl`
- Create: `templates/handoff-adapters/electron.md.tpl`
- Create: `templates/handoff-adapters/tauri.md.tpl`
- Create: `templates/handoff-adapters/chrome-extension.md.tpl`
- Modify: `skills/prototype-handoff/SKILL.md`

- [ ] **Step 1: Write react-native.md.tpl**

`templates/handoff-adapters/react-native.md.tpl`:

```markdown
# React Native Adapter — <prototype-slug>

> Source HTML sketches: prototypes/<slug>/{ios,android}/
> Target stack: React Native (>= 0.74) or Expo SDK 50+

## Component mapping
| Prototype HTML | RN equivalent | Note |
|---|---|---|
| `<div>` (layout) | `<View>` | flexbox by default, no margin-collapse |
| `<p>`, `<span>`, `<h1>`–`<h6>` | `<Text>` | text MUST be inside `<Text>`, not in `<View>` |
| `<img>` | `<Image source={{ uri: ... }} />` | requires explicit width+height |
| `<button>` | `<Pressable>` (preferred) or `<TouchableOpacity>` | `Pressable` for Android ripple compat |
| `<input>` | `<TextInput>` | controlled; iOS+Android keyboard differ |
| `<a>` | `<Pressable onPress={() => Linking.openURL(...)}>` | no built-in router-link |
| CSS Grid | `react-native-grid-list` or manual | RN has no native grid |
| `position: fixed` | `<Modal>` or top-level `<View>` | no fixed positioning |

## Token bridging
- `tokens.css` CSS vars → JS `tokens.ts` constants (manual export). Use a tiny generator if the project has many tokens.
- Typography: map `--type-family-body` to `Platform.select({ ios: 'SF Pro Text', android: 'Roboto' })` if explicit; else system default.
- Spacing scale: keep numeric (RN uses `dp` not `rem`). 1rem ≈ 16dp.

## Motion mapping
- CSS `transition` → `react-native-reanimated` `withTiming`
- CSS keyframes → `react-native-reanimated` `withRepeat` + interpolations
- Prefers-reduced-motion: read `AccessibilityInfo.isReduceMotionEnabled()`

## Platform divergence policy
- Document per-screen iOS vs Android differences in `notes.md`.
- Use `Platform.OS` switches sparingly; prefer platform-specific files (`Component.ios.tsx` / `Component.android.tsx`) when divergence > 30%.

## Safe-area
- Wrap top-level screens in `<SafeAreaView>` from `react-native-safe-area-context`.
- Test on devices with notch (iPhone 14+, Pixel 7+).

## Anti-patterns
- using `display: grid` styles in RN (will silently no-op)
- assuming `box-sizing: border-box` (RN is always content-box)
- 100vh / 100vw (use `Dimensions.get('window')` or flex)
```

- [ ] **Step 2: Write flutter.md.tpl**

`templates/handoff-adapters/flutter.md.tpl`:

```markdown
# Flutter Adapter — <prototype-slug>

> Source HTML sketches: prototypes/<slug>/{ios,android}/
> Target stack: Flutter 3.19+

## Component mapping
| Prototype HTML | Flutter widget | Note |
|---|---|---|
| `<div>` (layout) | `Container`, `Row`, `Column`, `Flex` | composition-heavy by design |
| text | `Text` | always wrap text in `Text` widget |
| `<img>` | `Image.network` / `Image.asset` | must specify size or wrap in `SizedBox` |
| `<button>` | `ElevatedButton` / `TextButton` / `IconButton` | Material 3 by default |
| `<input>` | `TextField` | controlled by `TextEditingController` |
| `<a>` | `GestureDetector` + `url_launcher` | no built-in link widget |
| CSS Grid | `GridView.builder` | scroll built-in |
| flex | `Row` / `Column` + `Expanded` / `Flexible` | weight via `flex:` |
| `position: fixed` | `Stack` + `Positioned` | overlay layout |

## Token bridging
- Generate `lib/theme/tokens.dart` from `tokens.css`. Group by category: colors, spacing, radii, typography.
- Typography → `TextTheme` in `MaterialApp.theme`
- Colors → `ColorScheme.fromSeed` + custom extensions

## Motion
- `AnimationController` + `Tween` + `CurvedAnimation`
- Match CSS easing names to Flutter `Curves`: `ease-in-out` → `Curves.easeInOut`, `cubic-bezier(0.4, 0, 0.2, 1)` → `Curves.easeInOutCubic`
- `MediaQuery.of(context).disableAnimations` for reduced-motion

## Platform divergence
- Material 3 is default; for iOS-faithful UI use `Cupertino*` widgets or `flutter_platform_widgets`.
- Document divergence policy in `notes.md`.

## Anti-patterns
- mixing Material + Cupertino without an adapter
- ignoring `MediaQuery.padding` (safe-area)
- `setState` in deep widget trees (use `Provider` / `Riverpod`)
```

- [ ] **Step 3: Write electron.md.tpl**

`templates/handoff-adapters/electron.md.tpl`:

```markdown
# Electron Adapter — <prototype-slug>

> Source HTML: prototypes/<slug>/{main-window,settings}/index.html
> Target stack: Electron renderer process — same HTML/CSS/JS works directly

## Renderer process
The HTML in this prototype runs near-verbatim in the Electron renderer. Differences from web:
- No `localStorage` quota limits practically
- Direct file:// access available (but security: prefer IPC)
- DevTools always available (Cmd-Opt-I / Ctrl-Shift-I)
- `process` global exists if `nodeIntegration: true` (NOT recommended)

## IPC contract
The prototype likely mocks data — replace with `window.api.*` calls exposed via `contextBridge`:

```ts
// preload.ts (production)
contextBridge.exposeInMainWorld('api', {
  getUser: () => ipcRenderer.invoke('user:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
});
```

## Window chrome
- macOS: traffic-light buttons fixed; `titleBarStyle: 'hiddenInset'` for custom chrome
- Windows: minimize/maximize/close on right; for custom chrome use `frame: false` + custom drag region (`-webkit-app-region: drag`)
- Linux: varies by DE — test KDE + GNOME

## Multi-window
- Each window is its own renderer process
- Share state via main process (`ipcMain.handle`) or shared `BrowserWindow.webContents.send`

## Anti-patterns
- using `nodeIntegration: true` (security)
- `remote` module (deprecated)
- synchronous `ipcRenderer.sendSync` (blocks renderer)
- assuming Chromium's latest features without testing on Electron's bundled version
```

- [ ] **Step 4: Write tauri.md.tpl**

`templates/handoff-adapters/tauri.md.tpl`:

```markdown
# Tauri Adapter — <prototype-slug>

> Source HTML: prototypes/<slug>/{main-window,secondary}/index.html
> Target stack: Tauri 2 webview

## Webview compatibility
Tauri uses platform-native webviews:
- macOS: WKWebView (Safari engine)
- Windows: WebView2 (Edge/Chromium)
- Linux: WebKitGTK (Safari engine, older)

**Test ALL three.** Features that work in Chromium may fail in WKWebView/WebKitGTK:
- `:has()` selector — Safari 15.4+ only
- Container queries — Safari 16+
- View Transitions API — Safari behind flag
- Some Web Animations API timeline features

## IPC contract
Replace mocked data with `invoke` calls:

```ts
import { invoke } from '@tauri-apps/api/core';
const user = await invoke('get_user');
```

Production Rust commands declared in `src-tauri/src/lib.rs`:
```rust
#[tauri::command]
fn get_user() -> User { ... }
```

## Asset paths
- Use Tauri's asset protocol (`tauri.conf.json` → `app.security.assetProtocol`)
- `convertFileSrc()` to translate file paths to webview-loadable URLs

## Bundle size
Tauri's selling point is small bundle. Audit:
- No CSS frameworks (or use Tailwind JIT-purged)
- No heavy fonts (subset or system-default)
- Tree-shake JS deps (Vite default)

## Anti-patterns
- assuming Chromium parity (test on macOS WKWebView!)
- `font-family: system-ui` without per-OS fallback list
- inline Node API access (always via `invoke`)
- bundle > 10 MB (defeats Tauri's purpose)
```

- [ ] **Step 5: Write chrome-extension.md.tpl**

`templates/handoff-adapters/chrome-extension.md.tpl`:

```markdown
# Chrome MV3 Extension Adapter — <prototype-slug>

> Source HTML: prototypes/<slug>/{popup,options,side-panel}/index.html
> Target stack: Chrome MV3 (works on Edge, Brave, Vivaldi, Opera)

## Manifest surfaces
Map prototype HTML to MV3 manifest entries:

```json
{
  "manifest_version": 3,
  "action": { "default_popup": "popup/index.html", "default_icon": "..." },
  "options_page": "options/index.html",
  "side_panel": { "default_path": "side-panel/index.html" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self';"
  }
}
```

## CSP constraints
MV3 CSP is strict:
- NO inline `<script>` content (must be external file)
- NO `eval`, `new Function`, inline event handlers (`onclick=...`)
- NO remote scripts
- ✅ external file refs to extension's own `.js` files

If your prototype HTML has any inline `<script>` content, refactor to external `.js` BEFORE handoff.

## Storage
- `chrome.storage.local` (5 MB) — most data
- `chrome.storage.sync` (100 KB total, 8 KB per item) — user settings to sync across devices
- NEVER `localStorage` — extension contexts have separate origins

## Messaging
- popup ↔ service worker: `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`
- content script ↔ extension: `chrome.tabs.sendMessage` / `chrome.runtime.connect`

## Permissions
Declare ONLY what's needed in `manifest.json` `permissions:[]`. Each new permission triggers user re-prompt on update.

## Surface dimensions
- popup: max 800×600 enforced by Chrome
- options page: full-tab, design as a normal web page
- side-panel: 280–800 wide; user can resize

## Anti-patterns
- `localStorage` — wrong origin, data lost
- inline event handlers (CSP violation)
- assuming popup stays open (closes on focus loss)
- background service worker holds state in JS variables (worker can be killed)
```

- [ ] **Step 6: Update `prototype-handoff` skill**

In `skills/prototype-handoff/SKILL.md`:

a. Read the file. Locate Stage 5 (Stack-agnostic adapter hints).

b. Update Stage 5 procedure to branch by `target` from `prototypes/<slug>/config.json`:

```markdown
### Stage 5 — Adapter hints

Read `prototypes/<slug>/config.json` for `target`. Branch:

- `target: web` → produce `handoff/stack-agnostic.md` covering React, Vue, Svelte, vanilla — same as v1.
- `target: chrome-extension` → also copy `templates/handoff-adapters/chrome-extension.md.tpl` to `handoff/extension-adapter.md` and fill prototype-specific notes.
- `target: electron` → also copy `templates/handoff-adapters/electron.md.tpl` to `handoff/electron-adapter.md`.
- `target: tauri` → also copy `templates/handoff-adapters/tauri.md.tpl` to `handoff/tauri-adapter.md`.
- `target: mobile-native` → ASK user one question: "Production stack — React Native, Flutter, или native (Swift/Kotlin)?". Based on answer copy `react-native.md.tpl` or `flutter.md.tpl`. For native (Swift/Kotlin): produce a manual hand-off note ("HTML sketches are layout reference; native implementation is greenfield — share with platform-native designer").

For any non-web target, the per-target adapter file goes alongside (not instead of) `stack-agnostic.md` — the latter still covers token+component inventory, the former covers runtime mapping.
```

c. Add to Stage 5 verification: each target's adapter file must exist in handoff/ before the bundle is considered complete.

d. Update the SKILL.md frontmatter `last-verified` to today's date.

- [ ] **Step 7: Run check**

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add templates/handoff-adapters/ skills/prototype-handoff/SKILL.md
git commit -m "feat(handoff): non-web adapter hints (RN/Flutter/Electron/Tauri/MV3 extension)"
```

---

## Task 14b: Make `brandbook` skill target-aware

> **Why:** Each surface has different baseline density, type-scale, and component sets. Extension popup needs tighter spacing; mobile-native needs platform-specific HIG / Material 3 references; desktop apps need different motion budgets. A single brandbook flow for all targets produces a generic baseline that doesn't fit any well.

**Files:**
- Create: `templates/brandbook-target-baselines/web.md`
- Create: `templates/brandbook-target-baselines/chrome-extension.md`
- Create: `templates/brandbook-target-baselines/electron.md`
- Create: `templates/brandbook-target-baselines/tauri.md`
- Create: `templates/brandbook-target-baselines/mobile-native.md`
- Modify: `skills/brandbook/SKILL.md`

- [ ] **Step 1: Write web.md baseline**

`templates/brandbook-target-baselines/web.md`:

```markdown
# Web Brandbook Baseline

## Density
- Comfortable spacing: 16px base unit, 1.5x line-height for body
- Touch targets ≥ 44×44 px (WCAG)

## Typography scale (recommended starting modular scale)
- 12, 14, 16, 18, 20, 24, 32, 40, 56 (px) — 1.25 ratio approximation
- Body: 16px/1.5 default
- Display: clamp() responsive between mobile/desktop

## Motion budget
- Page transitions: 250–350ms
- Component micro: 150–200ms
- Hero / orchestrated: 600–1200ms
- Reduced-motion: collapse to <50ms or instant

## Component baseline
button, input, select, textarea, checkbox, radio, toggle, card, modal, toast, tabs, nav, badge

## A11y baseline
- WCAG 2.2 AA contrast (4.5:1 body, 3:1 large text + UI)
- Focus visible never removed
- Keyboard: Tab/Shift-Tab/Enter/Space/Esc per ARIA APG
```

- [ ] **Step 2: Write chrome-extension.md baseline**

`templates/brandbook-target-baselines/chrome-extension.md`:

```markdown
# Chrome Extension Brandbook Baseline

## Density (TIGHTER than web)
- Base unit: 8px (vs web's 16px)
- Line-height: 1.4 for body
- Popup must fit in ≤ 600×800 px — design for compactness

## Typography scale
- 11, 12, 13, 14, 16, 18 (px) — narrower range than web
- Body: 13px/1.4 typical
- No display sizes — popups don't have hero space

## Motion budget (tight)
- Component micro: 100–150ms (popup may close — fast feedback critical)
- NO page transitions in popup
- Side-panel may use web tier
- Reduced-motion: instant

## Component baseline (subset)
button, input, select, toggle, list-item, badge, divider, link
(modal/toast/tabs/nav typically out of scope for popup; OK for options page)

## A11y baseline
- Same WCAG AA
- Popup: keyboard-only flows MUST work (some users mouse-disable in extensions)
- Test on macOS VoiceOver + Windows NVDA — popup screen-reader behaviour varies

## Surface-specific notes
- popup (360×600): one main task, ≤3 levels of hierarchy
- options page (1024×768): full-page web-app conventions
- side-panel (400×800): persistent — design for prolonged viewing
```

- [ ] **Step 3: Write electron.md baseline**

`templates/brandbook-target-baselines/electron.md`:

```markdown
# Electron Brandbook Baseline

## Density (desktop comfortable)
- Base unit: 8px
- Line-height: 1.5 body
- Touch targets ≤ 32px allowed (mouse-driven typically)
- Account for trackpad gestures + scroll-wheel

## Typography scale
- 12, 13, 14, 15, 16, 18, 20, 24, 32 (px)
- Body: 13–14px (smaller than web — desktop viewing distance closer)
- System font preferred (`-apple-system, "Segoe UI", "Ubuntu"`)

## Motion budget
- Component micro: 120–180ms
- Window/panel transitions: 200–280ms
- Heavy animations: avoid (battery, fan)
- Reduced-motion: collapse

## Component baseline
button, input, select, checkbox, radio, toggle, table (essential for desktop), tree, tabs, sidebar, toolbar, menubar, contextmenu, dialog, toast, badge, splitter

## Platform conventions (CRITICAL)
- macOS: traffic-light placement, sheet dialogs, sidebar drawers, ⌘ shortcuts
- Windows: minimize-maximize-close on right, ribbon or menubar, Ctrl shortcuts
- Linux: respect GTK / Qt theming where possible

## A11y baseline
- Keyboard nav for ALL features (no mouse-only)
- Native menus where possible (screen-reader friendly)
- Respect OS dark/light mode via `prefers-color-scheme`
```

- [ ] **Step 4: Write tauri.md baseline**

`templates/brandbook-target-baselines/tauri.md`:

```markdown
# Tauri Brandbook Baseline

> Inherits most of `electron.md`. Differences below.

## Webview engine differences
- macOS WKWebView: Safari-engine; CSS feature gaps vs Chromium
- Windows WebView2: Chromium-equivalent
- Linux WebKitGTK: older Safari-engine

**Avoid Chromium-only CSS without fallbacks:**
- `:has()` — Safari 15.4+, OK on macOS Big Sur 11.4+ only
- `aspect-ratio` — Safari 15+
- View Transitions API — behind flag in Safari

## Bundle constraint
Tauri's value is < 10 MB binary — keep it that way:
- NO CSS framework above ~10 KB gzipped
- NO bundled web fonts > 50 KB total — prefer system fonts
- Subset any unavoidable web font

## Motion budget
Same as Electron, but: WKWebView / WebKitGTK may stutter on heavy filter/blur — avoid `backdrop-filter` chains.

## Component baseline
Same as Electron — except: don't use `<dialog>` element (WKWebView support spotty pre-15.4); polyfill or use ARIA `role="dialog"`.
```

- [ ] **Step 5: Write mobile-native.md baseline**

`templates/brandbook-target-baselines/mobile-native.md`:

```markdown
# Mobile Native Brandbook Baseline

## Platform conventions take precedence
The brandbook here defines DESIGN INTENT, not pixel-perfect output. Final implementation honours platform HIG.

### iOS — follow Human Interface Guidelines
- SF Pro Text/Display (system) for typography
- 17pt body default
- Tab bar bottom; navigation bar top
- Sheet (modal) presentation
- Haptics for confirmations
- Easing: cubic-bezier(0.4, 0, 0.2, 1) (system default)

### Android — follow Material 3
- Roboto / system default
- 16sp body default
- Bottom nav (≤5 items) or nav rail (tablet)
- Bottom sheets for transient surfaces
- Material elevation tokens
- Easing: M3 standard `emphasized` for entering, `decelerated` for exiting

## Touch targets
- iOS: 44×44 pt minimum
- Android: 48×48 dp minimum

## Motion budget
- Within-screen: 100–250 ms
- Between-screen: 250–400 ms (iOS push) / 250–500 ms (Android shared-element)
- Battery-aware: avoid >3s continuous animation

## Density
- Compact, but generous tap targets
- Safe-area mandatory: top notch, bottom home-indicator, side gestures

## Component baseline (minimum)
button, text-field, list-item, card, sheet, dialog, snackbar, tab-bar/bottom-nav, app-bar, fab (Android), segmented-control (iOS), badge, chip

## Platform divergence policy
Brandbook captures intent; per-platform spec captures realisation. Each component spec MUST have iOS + Android sub-sections noting differences.
```

- [ ] **Step 6: Update `brandbook` skill to load target baseline**

In `skills/brandbook/SKILL.md`:

a. Read file. Locate "Step 0 — Read source of truth" section.

b. Add a step at the top of Procedure: **"Step 0a — Determine target baseline."**

```markdown
**Step 0a:** Read the active prototype's `prototypes/<slug>/config.json` for `target`. If no active prototype yet, ASK the user one question:

> **Шаг 0/8:** На какую платформу будет brandbook?
> - `web` — браузер (default)
> - `chrome-extension` — popup/options/side-panel
> - `electron` / `tauri` — desktop
> - `mobile-native` — iOS+Android
> - `mixed` — фронт + extension одновременно (используем web baseline + extension override)

Read `templates/brandbook-target-baselines/<target>.md` as the starting baseline. Use its density/type-scale/motion budget/component-list as DEFAULTS that the user can override during Sections 3, 4, 5, 6.

For `target: mixed`, load `web.md` as primary and surface-specific deltas from the secondary target's file when relevant.
```

c. Sections 3 (spacing), 4 (motion), 5 (voice — only if differs), 6 (components) MUST reference the target baseline as starting values rather than asking blank-slate questions.

d. Update Section 6.5 (component library decision from Phase 3, Task 7) to include a note: "If target is mobile-native, library options shift — RN: Tamagui / NativeBase / RN Paper; Flutter: Material 3 default / Cupertino / Forui."

e. Bump skill `version` to 1.1, update `last-verified`.

- [ ] **Step 7: Run check**

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add templates/brandbook-target-baselines/ skills/brandbook/SKILL.md
git commit -m "feat(design): brandbook is now target-aware (web/extension/electron/tauri/mobile baselines)"
```

---

# Phase 6 — Browser-Side Feedback Channel (item 12 → 10/10)

This is the largest phase. Builds a real-time feedback loop from the rendered prototype back to the agent.

## Architecture overview

```
┌─────────────┐  HTTP+SSE      ┌──────────────────┐
│  Browser    │ ◄────────────► │ preview-server   │
│  prototype  │                │ (existing)       │
│ + overlay   │                │                  │
│             │  WebSocket    │ + feedback-channel│
│             │ ◄────────────► │   (NEW)          │
└─────────────┘                └────────┬─────────┘
                                        │ append JSONL
                                        ▼
                          .claude/memory/feedback-queue.jsonl
                                        │
                                        │ on EVERY UserPromptSubmit
                                        ▼
                              ┌──────────────────────────┐
                              │ user-prompt-submit-hook  │
                              │ - reads cursor           │
                              │ - drains new entries     │
                              │ - writes additionalContext│
                              └──────────┬───────────────┘
                                        │
                                        ▼
                       Claude session receives system-reminder
                       inside the prompt context →
                       invokes evolve:browser-feedback skill
```

User clicks any region in the prototype → overlay shows comment box → submit → WebSocket → server appends to queue. On the user's NEXT prompt, the `UserPromptSubmit` hook drains new queue entries (from cursor to EOF), advances cursor, and emits them as `additionalContext` so Claude sees them inline. The skill then routes to creative-director or prototype-builder based on feedback type.

**Why hook-based delivery (vs sidecar process):** Claude Code only ingests its own input stream and `additionalContext` from registered hooks — it does NOT read stdout from sibling processes. A standalone watcher would be invisible. The `UserPromptSubmit` mechanism is exactly what `scripts/hooks/post-tool-use-log.mjs` and `dispatch-suggester` already use for similar surfacing.

## Task 15: WebSocket dependency choice — use built-in approach

**Decision:** Avoid adding `ws` package as new dep (per CLAUDE.md "no native deps" principle and zero-deps preview-server). Instead implement minimal WebSocket frame handling using `node:net` over the same HTTP server (RFC 6455 handshake on `Upgrade: websocket` request). For prototype-feedback purposes (text frames only, single-client typical, in-process), 200 lines of frame parsing is enough.

If this proves fragile, fall back to `ws` package and update CLAUDE.md exceptions.

- [ ] **Step 1: Decision recorded**

Add a memory entry:

```bash
mkdir -p .claude/memory/decisions
cat > .claude/memory/decisions/2026-04-28-feedback-websocket.md <<'EOF'
---
id: feedback-websocket
type: decisions
date: 2026-04-28
tags: [feedback, websocket, preview]
agent: human
confidence: 9
---

# Feedback channel: zero-dep WebSocket

For browser-to-agent feedback in `preview-server.mjs`, we implement minimal WebSocket frame handling with `node:net` rather than adding `ws` as a dependency. Justification:
- Single-client / low-volume use case (one browser per preview session)
- Aligns with CLAUDE.md "no native deps" principle and zero-dep preview-server
- ~200 LOC of frame parsing is acceptable

Trigger to revisit: if multi-tab feedback or binary frames become needed, add `ws`.

Confidence: 9/10
EOF
git add .claude/memory/decisions/2026-04-28-feedback-websocket.md
git commit -m "docs(memory): record decision to use zero-dep WebSocket for feedback channel"
```

---

## Task 16: Feedback channel server lib

**Files:**
- Create: `scripts/lib/feedback-channel.mjs`
- Create: `tests/feedback-channel.test.mjs`

- [ ] **Step 1: Write failing test**

`tests/feedback-channel.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFeedbackChannel } from '../scripts/lib/feedback-channel.mjs';

test('appends well-formed feedback entry to queue', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fbq-'));
  const queuePath = join(dir, 'feedback-queue.jsonl');
  const channel = createFeedbackChannel({ queuePath });

  await channel.submit({
    prototypeSlug: 'demo',
    viewport: 'mobile',
    region: { selector: '.hero', x: 100, y: 200, width: 300, height: 80 },
    comment: 'CTA color too washed out',
    type: 'visual',
  });

  const raw = await readFile(queuePath, 'utf8');
  const lines = raw.trim().split('\n');
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.prototypeSlug, 'demo');
  assert.equal(entry.region.selector, '.hero');
  assert.ok(entry.timestamp);
  assert.ok(entry.id);
});

test('parseWsFrame extracts text payload', async () => {
  const { parseWsFrame } = await import('../scripts/lib/feedback-channel.mjs');
  // Minimal masked text frame: FIN=1, opcode=0x1, mask=1, len=5, mask-key=4 bytes, payload=5 bytes XORed
  const payload = Buffer.from('hello');
  const mask = Buffer.from([0xa, 0xb, 0xc, 0xd]);
  const masked = Buffer.alloc(5);
  for (let i = 0; i < 5; i++) masked[i] = payload[i] ^ mask[i % 4];
  const frame = Buffer.concat([
    Buffer.from([0x81, 0x85]),
    mask,
    masked,
  ]);
  const out = parseWsFrame(frame);
  assert.equal(out.opcode, 0x1);
  assert.equal(out.payload.toString('utf8'), 'hello');
});
```

- [ ] **Step 2: Run failing test**

```bash
node --test tests/feedback-channel.test.mjs
```

Expected: 2 fail.

- [ ] **Step 3: Implement**

`scripts/lib/feedback-channel.mjs`:

```js
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function wsAcceptKey(clientKey) {
  return createHash('sha1').update(clientKey + WS_GUID).digest('base64');
}

export function isWsUpgrade(req) {
  const up = (req.headers.upgrade || '').toLowerCase();
  const conn = (req.headers.connection || '').toLowerCase();
  return up === 'websocket' && conn.includes('upgrade') && req.headers['sec-websocket-key'];
}

export function performWsHandshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const accept = wsAcceptKey(key);
  const lines = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n',
  ];
  socket.write(lines.join('\r\n'));
}

export function parseWsFrame(buffer) {
  if (buffer.length < 2) return null;
  const fin = (buffer[0] & 0x80) !== 0;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let len = buffer[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buffer.length < offset + 2) return null;
    len = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (len === 127) {
    if (buffer.length < offset + 8) return null;
    len = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }
  let mask = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.slice(offset, offset + 4);
    offset += 4;
  }
  if (buffer.length < offset + len) return null;
  const payload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    payload[i] = masked ? buffer[offset + i] ^ mask[i % 4] : buffer[offset + i];
  }
  return { fin, opcode, payload, totalLen: offset + len };
}

export function buildWsFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

export function createFeedbackChannel({ queuePath }) {
  const clients = new Set();

  async function submit(entry) {
    const full = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    await mkdir(dirname(queuePath), { recursive: true });
    await appendFile(queuePath, JSON.stringify(full) + '\n', 'utf8');
    return full;
  }

  function attachUpgrade(server) {
    server.on('upgrade', (req, socket) => {
      if (!isWsUpgrade(req) || !req.url.startsWith('/_feedback')) {
        socket.destroy();
        return;
      }
      performWsHandshake(req, socket);
      clients.add(socket);
      socket.on('close', () => clients.delete(socket));

      let buf = Buffer.alloc(0);
      socket.on('data', async chunk => {
        buf = Buffer.concat([buf, chunk]);
        while (true) {
          const frame = parseWsFrame(buf);
          if (!frame) break;
          buf = buf.slice(frame.totalLen);
          if (frame.opcode === 0x8) { socket.end(); return; }
          if (frame.opcode === 0x1) {
            try {
              const payload = JSON.parse(frame.payload.toString('utf8'));
              const stored = await submit(payload);
              socket.write(buildWsFrame(JSON.stringify({ ack: stored.id })));
            } catch (e) {
              socket.write(buildWsFrame(JSON.stringify({ error: e.message })));
            }
          }
        }
      });
    });
  }

  return { submit, attachUpgrade };
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
node --test tests/feedback-channel.test.mjs
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/feedback-channel.mjs tests/feedback-channel.test.mjs
git commit -m "feat(feedback): zero-dep WebSocket channel for browser→agent feedback"
```

---

## Task 17: Browser-side overlay

**Files:**
- Create: `scripts/lib/feedback-overlay/overlay.js`
- Create: `scripts/lib/feedback-overlay/overlay.css`
- Create: `scripts/lib/feedback-overlay-injector.mjs`

- [ ] **Step 1: Write overlay client (overlay.js)**

`scripts/lib/feedback-overlay/overlay.js`:

```js
(function () {
  if (window.__evolveFeedbackInstalled) return;
  window.__evolveFeedbackInstalled = true;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${window.location.host}/_feedback`);
  let armed = false;
  let highlight = null;

  function el(tag, props = {}, children = []) {
    const e = document.createElement(tag);
    Object.assign(e, props);
    children.forEach(c => e.appendChild(c));
    return e;
  }

  const button = el('button', {
    id: 'evolve-fb-toggle',
    textContent: '💬',
    title: 'Click to comment on a region (Evolve feedback)',
  });
  document.documentElement.appendChild(button);

  const panel = el('div', { id: 'evolve-fb-panel' });
  panel.style.display = 'none';
  document.documentElement.appendChild(panel);

  function arm() {
    armed = true;
    button.textContent = '✕';
    document.documentElement.style.cursor = 'crosshair';
  }
  function disarm() {
    armed = false;
    button.textContent = '💬';
    document.documentElement.style.cursor = '';
    if (highlight) { highlight.remove(); highlight = null; }
  }

  button.addEventListener('click', e => {
    e.stopPropagation();
    if (armed) disarm(); else arm();
  });

  function selectorOf(el) {
    if (el.id) return `#${el.id}`;
    if (el.className && typeof el.className === 'string') {
      return el.tagName.toLowerCase() + '.' + el.className.trim().split(/\s+/).join('.');
    }
    return el.tagName.toLowerCase();
  }

  document.addEventListener('mousemove', e => {
    if (!armed) return;
    const target = e.target;
    if (target === button || target.closest('#evolve-fb-panel')) return;
    if (highlight) highlight.remove();
    const r = target.getBoundingClientRect();
    highlight = el('div', { id: 'evolve-fb-highlight' });
    Object.assign(highlight.style, {
      position: 'fixed',
      left: r.left + 'px', top: r.top + 'px',
      width: r.width + 'px', height: r.height + 'px',
      pointerEvents: 'none',
    });
    document.documentElement.appendChild(highlight);
  });

  document.addEventListener('click', e => {
    if (!armed) return;
    if (e.target === button || e.target.closest('#evolve-fb-panel')) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    const r = target.getBoundingClientRect();
    showCommentBox(target, r);
  }, true);

  function showCommentBox(target, rect) {
    panel.innerHTML = '';
    const sel = selectorOf(target);
    panel.appendChild(el('h3', { textContent: 'Comment on element' }));
    panel.appendChild(el('div', { className: 'evolve-fb-meta', textContent: sel }));
    const textarea = el('textarea', { rows: 4, placeholder: 'What would you like to change?' });
    panel.appendChild(textarea);
    const typeSel = el('select');
    ['visual', 'layout', 'copy', 'motion', 'a11y'].forEach(t =>
      typeSel.appendChild(el('option', { value: t, textContent: t }))
    );
    panel.appendChild(el('label', { textContent: 'Kind: ' }, [typeSel]));
    const send = el('button', { textContent: 'Send to agent', className: 'evolve-fb-send' });
    panel.appendChild(send);
    panel.style.display = 'block';

    send.addEventListener('click', () => {
      const payload = {
        prototypeSlug: window.__evolvePrototypeSlug || 'unknown',
        viewport: window.__evolveViewport || `${window.innerWidth}`,
        region: { selector: sel, x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        comment: textarea.value.trim(),
        type: typeSel.value,
        url: window.location.href,
      };
      if (!payload.comment) return;
      ws.send(JSON.stringify(payload));
      panel.style.display = 'none';
      disarm();
      flashAck();
    });
  }

  function flashAck() {
    const ack = el('div', { id: 'evolve-fb-ack', textContent: '✓ Feedback sent' });
    document.documentElement.appendChild(ack);
    setTimeout(() => ack.remove(), 1500);
  }
})();
```

- [ ] **Step 2: Write overlay CSS**

`scripts/lib/feedback-overlay/overlay.css`:

```css
#evolve-fb-toggle {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  width: 48px; height: 48px; border-radius: 24px;
  background: #111; color: #fff; border: 0; font-size: 20px;
  cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.3);
}
#evolve-fb-toggle:hover { background: #000; }

#evolve-fb-highlight {
  outline: 2px solid #06b6d4; outline-offset: 2px;
  background: rgba(6, 182, 212, .1);
  z-index: 2147483646;
}

#evolve-fb-panel {
  position: fixed; right: 16px; bottom: 80px; z-index: 2147483647;
  width: 320px; background: #fff; border: 1px solid #e5e7eb;
  border-radius: 12px; padding: 16px; font-family: system-ui, sans-serif;
  box-shadow: 0 8px 24px rgba(0,0,0,.15);
}
#evolve-fb-panel h3 { margin: 0 0 8px; font-size: 14px; }
#evolve-fb-panel .evolve-fb-meta {
  font-family: ui-monospace, monospace; font-size: 11px; color: #6b7280;
  margin-bottom: 8px; word-break: break-all;
}
#evolve-fb-panel textarea {
  width: 100%; box-sizing: border-box; resize: vertical;
  border: 1px solid #d1d5db; border-radius: 6px; padding: 8px;
  font-family: inherit; font-size: 13px;
}
#evolve-fb-panel select { margin-left: 4px; }
#evolve-fb-panel .evolve-fb-send {
  margin-top: 8px; width: 100%; padding: 8px;
  background: #06b6d4; color: #fff; border: 0; border-radius: 6px;
  font-weight: 600; cursor: pointer;
}

#evolve-fb-ack {
  position: fixed; right: 16px; bottom: 80px; z-index: 2147483647;
  background: #10b981; color: #fff; padding: 8px 16px; border-radius: 8px;
  font-family: system-ui; font-size: 13px;
}
```

- [ ] **Step 3: Write injector**

`scripts/lib/feedback-overlay-injector.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const cache = {};
async function loadAsset(name) {
  if (!cache[name]) {
    cache[name] = await readFile(join(here, 'feedback-overlay', name), 'utf8');
  }
  return cache[name];
}

export async function injectOverlay(html, { prototypeSlug = 'unknown', viewport } = {}) {
  if (!/<\/body>/i.test(html)) return html;
  const js = await loadAsset('overlay.js');
  const css = await loadAsset('overlay.css');
  const tag = `
<style>${css}</style>
<script>window.__evolvePrototypeSlug=${JSON.stringify(prototypeSlug)};${viewport ? `window.__evolveViewport=${JSON.stringify(viewport)};` : ''}</script>
<script>${js}</script>
`;
  return html.replace(/<\/body>/i, tag + '</body>');
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/feedback-overlay/ scripts/lib/feedback-overlay-injector.mjs
git commit -m "feat(feedback): browser overlay with click-to-comment region selection"
```

---

## Task 18: Wire feedback into preview-server

**Files:**
- Modify: `scripts/preview-server.mjs`

- [ ] **Step 1: Read current preview-server.mjs**

```bash
cat scripts/preview-server.mjs | head -100
```

- [ ] **Step 2: Add imports + flag**

At the top of `scripts/preview-server.mjs`, after existing imports, add:

```js
import { createFeedbackChannel } from './lib/feedback-channel.mjs';
import { injectOverlay } from './lib/feedback-overlay-injector.mjs';
```

Add a CLI flag handler: `--feedback` (default `true`) and `--no-feedback`.

In the args parsing section, parse `--feedback` / `--no-feedback` into `opts.feedback` (default `true`).

- [ ] **Step 3: Initialize channel**

After the HTTP server is created (search for `createServer` or similar), if `opts.feedback`:

```js
const queuePath = join(projectRoot, '.claude', 'memory', 'feedback-queue.jsonl');
const channel = createFeedbackChannel({ queuePath });
channel.attachUpgrade(server);
```

- [ ] **Step 4: Inject overlay into HTML responses**

Find the HTML response code path (likely in the static-server lib). When the response Content-Type is `text/html` AND `opts.feedback` is enabled, transform the body:

```js
if (contentType.startsWith('text/html') && opts.feedback) {
  const slug = derivePrototypeSlugFromPath(filePath, opts.root);
  body = await injectOverlay(body, { prototypeSlug: slug });
}
```

Implement `derivePrototypeSlugFromPath`: take the served file path, find segment after `prototypes/`, return that token (or `'unknown'`).

- [ ] **Step 5: Manual test**

```bash
mkdir -p /tmp/p-test/prototypes/demo
cat > /tmp/p-test/prototypes/demo/config.json <<'EOF'
{ "target": "web", "viewports": [{"name":"mobile","width":375,"height":812}] }
EOF
cat > /tmp/p-test/prototypes/demo/index.html <<'EOF'
<!doctype html><html><head><title>Demo</title></head>
<body><h1 class="hero">Hello</h1></body></html>
EOF
node "$CLAUDE_PLUGIN_ROOT/scripts/preview-server.mjs" --root /tmp/p-test/prototypes/demo --port 4567 &
sleep 1
curl -s http://localhost:4567/index.html | grep -c 'evolve-fb-toggle'
# kill server
node "$CLAUDE_PLUGIN_ROOT/scripts/preview-server.mjs" --kill 4567
```

Expected: count > 0 (overlay JS injected).

- [ ] **Step 6: Manual end-to-end with browser**

Open `http://localhost:4567/index.html` in browser, click the 💬 floating button, click on the `<h1>`, fill comment "less bold", click Send. Check:

```bash
cat .claude/memory/feedback-queue.jsonl | tail -1
```

Should contain JSON entry with `comment: "less bold"` and `region.selector: "h1.hero"`.

- [ ] **Step 7: Commit**

```bash
git add scripts/preview-server.mjs
git commit -m "feat(preview): inject feedback overlay + WebSocket channel into preview-server"
```

---

## Task 19: UserPromptSubmit hook + agent-side skill (delivers feedback as additionalContext)

> **Why we changed approach (vs plan v1):** A standalone `feedback-monitor.mjs` writing to its own stdout would NOT reach the active Claude Code session — Claude reads its own input stream, not arbitrary stdout from sibling processes. The correct mechanism is a `UserPromptSubmit` hook: every time the user sends a prompt, the hook reads new entries from the feedback queue (since the last cursor) and emits them as `additionalContext` JSON, which Claude Code reliably ingests. This is exactly the same pattern as `scripts/hooks/post-tool-use-log.mjs` already uses.

**Files:**
- Create: `scripts/lib/feedback-cursor.mjs` — read/write per-session cursor offset
- Create: `tests/feedback-cursor.test.mjs`
- Create: `scripts/hooks/user-prompt-submit-feedback.mjs` — UserPromptSubmit hook
- Create: `skills/browser-feedback/SKILL.md`
- Modify: `hooks.json` — register UserPromptSubmit hook
- Modify: `agents/_design/prototype-builder.md`, `agents/_design/creative-director.md`, `commands/evolve-design.md`, `CLAUDE.md`

- [ ] **Step 1: Write failing cursor test**

`tests/feedback-cursor.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCursor, writeCursor, drainNewEntries } from '../scripts/lib/feedback-cursor.mjs';

test('readCursor returns 0 when file missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cur-'));
  const p = join(dir, 'cursor.json');
  const cur = await readCursor(p);
  assert.equal(cur, 0);
});

test('writeCursor + readCursor roundtrip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cur-'));
  const p = join(dir, 'cursor.json');
  await writeCursor(p, 42);
  assert.equal(await readCursor(p), 42);
});

test('drainNewEntries returns rows from cursor to EOF, advances cursor', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cur-'));
  const queue = join(dir, 'q.jsonl');
  const cursor = join(dir, 'cur.json');
  await writeFile(queue, JSON.stringify({ id: 'a', comment: 'one' }) + '\n');
  let { entries, newOffset } = await drainNewEntries({ queuePath: queue, cursorPath: cursor });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'a');
  await writeCursor(cursor, newOffset);

  // append more
  await writeFile(queue, JSON.stringify({ id: 'b', comment: 'two' }) + '\n', { flag: 'a' });
  ({ entries, newOffset } = await drainNewEntries({ queuePath: queue, cursorPath: cursor }));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'b');
});

test('drainNewEntries with no new entries returns empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cur-'));
  const queue = join(dir, 'q.jsonl');
  const cursor = join(dir, 'cur.json');
  await writeFile(queue, JSON.stringify({ id: 'a' }) + '\n');
  const r1 = await drainNewEntries({ queuePath: queue, cursorPath: cursor });
  await writeCursor(cursor, r1.newOffset);
  const r2 = await drainNewEntries({ queuePath: queue, cursorPath: cursor });
  assert.equal(r2.entries.length, 0);
});
```

- [ ] **Step 2: Run failing**

```bash
node --test tests/feedback-cursor.test.mjs
```

Expected: 4 fail.

- [ ] **Step 3: Implement cursor lib**

`scripts/lib/feedback-cursor.mjs`:

```js
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readCursor(cursorPath) {
  try {
    const raw = await readFile(cursorPath, 'utf8');
    const obj = JSON.parse(raw);
    return Number.isFinite(obj.offset) ? obj.offset : 0;
  } catch {
    return 0;
  }
}

export async function writeCursor(cursorPath, offset) {
  await mkdir(dirname(cursorPath), { recursive: true });
  await writeFile(cursorPath, JSON.stringify({ offset, updated: new Date().toISOString() }) + '\n', 'utf8');
}

export async function drainNewEntries({ queuePath, cursorPath }) {
  let size;
  try { size = (await stat(queuePath)).size; } catch { return { entries: [], newOffset: 0 }; }
  const cursor = await readCursor(cursorPath);
  if (cursor >= size) return { entries: [], newOffset: cursor };

  const raw = await readFile(queuePath, 'utf8');
  const slice = raw.slice(cursor);
  const lines = slice.split('\n').filter(l => l.trim().length > 0);
  const entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch {}
  }
  return { entries, newOffset: size };
}
```

- [ ] **Step 4: Run cursor test — passes**

```bash
node --test tests/feedback-cursor.test.mjs
```

Expected: 4 PASS.

- [ ] **Step 5: Implement UserPromptSubmit hook**

`scripts/hooks/user-prompt-submit-feedback.mjs`:

```js
#!/usr/bin/env node
import { join } from 'node:path';
import { drainNewEntries, writeCursor } from '../lib/feedback-cursor.mjs';

function readEvent() {
  let raw = '';
  process.stdin.on('data', chunk => raw += chunk);
  return new Promise(r => process.stdin.on('end', () => r(raw ? JSON.parse(raw) : {})));
}

function routeFeedback(entry) {
  switch (entry.type) {
    case 'visual':
    case 'motion':
      return 'creative-director';
    case 'layout':
    case 'a11y':
      return 'prototype-builder';
    case 'copy':
      return 'copywriter';
    default:
      return 'prototype-builder';
  }
}

function formatEntry(entry) {
  const agent = routeFeedback(entry);
  return [
    `[evolve] browser-feedback received:`,
    `- id: ${entry.id}`,
    `- prototype: ${entry.prototypeSlug}`,
    `- viewport: ${entry.viewport}`,
    `- selector: ${entry.region?.selector || 'unknown'}`,
    `- type: ${entry.type}`,
    `- comment: ${JSON.stringify(entry.comment)}`,
    `- suggested-agent: ${agent}`,
    `- url: ${entry.url || ''}`,
  ].join('\n');
}

async function main() {
  await readEvent(); // input not used; presence triggers run
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const queuePath = join(projectRoot, '.claude', 'memory', 'feedback-queue.jsonl');
  const cursorPath = join(projectRoot, '.claude', 'memory', 'feedback-cursor.json');

  const { entries, newOffset } = await drainNewEntries({ queuePath, cursorPath });
  if (!entries.length) {
    process.stdout.write(JSON.stringify({}));
    return;
  }
  await writeCursor(cursorPath, newOffset);

  const blocks = entries.map(formatEntry).join('\n\n');
  const additionalContext = `<system-reminder>
${entries.length} new browser-feedback entr${entries.length === 1 ? 'y' : 'ies'} since last prompt.

${blocks}

INVOKE the \`evolve:browser-feedback\` skill to triage and respond. Do NOT skip; the user is waiting for action on these.
</system-reminder>`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
  }));
}

main().catch(err => {
  console.error(`[feedback-hook] ${err.message}`);
  process.stdout.write(JSON.stringify({}));
  process.exit(0); // never block the prompt on hook error
});
```

- [ ] **Step 6: Register hook in hooks.json**

Read current `hooks.json`. Add a `UserPromptSubmit` matcher:

```json
{
  "UserPromptSubmit": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node $CLAUDE_PLUGIN_ROOT/scripts/hooks/user-prompt-submit-feedback.mjs"
        }
      ]
    }
  ]
}
```

(If `UserPromptSubmit` array already exists, append the new entry.)

- [ ] **Step 7: Manual end-to-end test**

```bash
mkdir -p /tmp/proj/.claude/memory /tmp/proj/prototypes/demo
echo '{"id":"x1","timestamp":"2026-04-28T00:00:00Z","prototypeSlug":"demo","viewport":"mobile","region":{"selector":"h1.hero"},"type":"visual","comment":"too washed out"}' > /tmp/proj/.claude/memory/feedback-queue.jsonl
echo '{}' | CLAUDE_PROJECT_DIR=/tmp/proj node "$CLAUDE_PLUGIN_ROOT/scripts/hooks/user-prompt-submit-feedback.mjs"
```

Expected: JSON output with `hookSpecificOutput.additionalContext` containing `[evolve] browser-feedback received` block.

```bash
echo '{}' | CLAUDE_PROJECT_DIR=/tmp/proj node "$CLAUDE_PLUGIN_ROOT/scripts/hooks/user-prompt-submit-feedback.mjs"
```

Expected: JSON `{}` (cursor advanced; no new entries).

- [ ] **Step 8: Create browser-feedback skill

`skills/browser-feedback/SKILL.md`:

```markdown
---
name: browser-feedback
namespace: evolve
description: Use WHEN browser-feedback system-reminder appears with click-region context AND active prototype is open in preview server TO triage the comment, route to designer or layout agent, and respond. Closes the user→browser→agent loop in real time.
allowed-tools: Read, Edit, Bash, Grep
phase: feedback
prerequisites: []
emits-artifact: prototypes/<slug>/feedback-resolutions/<id>.md
confidence-rubric: agent-delivery
gate-on-exit: feedback
version: 1.0
last-verified: 2026-04-28
---

# Browser Feedback

## When to invoke
Trigger source: `<system-reminder>` containing `[evolve] browser-feedback received:`. The reminder includes prototypeSlug, viewport, selector, comment, type, suggested-agent.

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
- `asking-multiple-questions-at-once`
- `advancing-without-feedback-prompt`

## Verification
- Check `prototypes/<slug>/feedback-resolutions/<id>.md` exists.
- Reload browser preview; confirm visual change matches comment intent.
- `git diff` shows minimal change scope (no scope-creep).

## Related
- `scripts/preview-server.mjs` — emits feedback over WebSocket into `.claude/memory/feedback-queue.jsonl`
- `scripts/hooks/user-prompt-submit-feedback.mjs` — UserPromptSubmit hook surfaces new entries as `additionalContext` on every prompt
- `scripts/lib/feedback-cursor.mjs` — tracks last-seen offset
- `agents/_design/creative-director.md`, `agents/_design/prototype-builder.md`
```

- [ ] **Step 9: Mention overlay in designer agents**

In `agents/_design/prototype-builder.md`, in the delivery section (where it prints the URL after starting preview), append:
> Inform user: "💬 кнопка в правом нижнем углу — кликни любой элемент, оставь комментарий, и я получу его в реальном времени для правок (попадает в context на следующий твой prompt)."

In `agents/_design/creative-director.md`, in the delivery flow, add the same note.

In `commands/evolve-design.md`, in the preview-launch stage, add a one-liner: `Preview includes feedback overlay — user can click regions to comment; comments arrive as system-reminder on next user prompt.`

- [ ] **Step 10: Wire to CLAUDE.md routing**

In `CLAUDE.md` "Common workflows":

```markdown
| Browser feedback received (system-reminder with [evolve] browser-feedback) | invoke `evolve:browser-feedback` skill |
```

In CLAUDE.md "Browser Feedback Channel" section (will be added in Task 21), document the UserPromptSubmit-hook delivery mechanism (NOT a separate watcher process).

- [ ] **Step 11: Run check**

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add scripts/lib/feedback-cursor.mjs tests/feedback-cursor.test.mjs scripts/hooks/user-prompt-submit-feedback.mjs hooks.json skills/browser-feedback/SKILL.md agents/_design/prototype-builder.md agents/_design/creative-director.md commands/evolve-design.md CLAUDE.md
git commit -m "feat(feedback): UserPromptSubmit hook delivers browser feedback as additionalContext"
```

---

## Task 20: End-to-end feedback test

**Files:**
- Modify: `tests/feedback-channel.test.mjs` (add e2e test)

- [ ] **Step 1: Add e2e test**

Append:

```js
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

test('e2e: WebSocket client → server → queue → ack', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'fbe2e-'));
  const queuePath = join(dir, 'queue.jsonl');
  const { createServer } = await import('node:http');
  const server = createServer();
  const channel = createFeedbackChannel({ queuePath });
  channel.attachUpgrade(server);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  t.after(() => server.close());

  // Use Node 22+ built-in WebSocket
  const ws = new WebSocket(`ws://localhost:${port}/_feedback`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  const ackPromise = new Promise(resolve => {
    ws.addEventListener('message', e => resolve(JSON.parse(e.data)));
  });

  ws.send(JSON.stringify({
    prototypeSlug: 'e2e',
    viewport: 'mobile',
    region: { selector: '.x', x: 0, y: 0, width: 10, height: 10 },
    comment: 'e2e ok',
    type: 'visual',
  }));

  const ack = await ackPromise;
  assert.ok(ack.ack);
  ws.close();

  await sleep(50);
  const raw = await readFile(queuePath, 'utf8');
  const entry = JSON.parse(raw.trim().split('\n').pop());
  assert.equal(entry.comment, 'e2e ok');
});
```

- [ ] **Step 2: Run**

```bash
node --test tests/feedback-channel.test.mjs
```

Expected: 3 PASS (2 prior + 1 new).

- [ ] **Step 3: Commit**

```bash
git add tests/feedback-channel.test.mjs
git commit -m "test(feedback): e2e WebSocket → queue → ack roundtrip"
```

---

# Final Phase — Verification & Documentation

## Task 21: Update CLAUDE.md with new systems

- [ ] **Step 1: Update CLAUDE.md sections**

Add these blocks to `CLAUDE.md`:

In "Repository layout":
- `templates/viewport-presets/` — 5 target presets
- `templates/design-decisions/` — animation + graphics matrices
- `templates/component-adapters/` — MUI/shadcn/headless bridges
- `templates/handoff-adapters/` — RN/Flutter/Electron/Tauri/MV3 handoff adapter hints
- `templates/brandbook-target-baselines/` — per-target brandbook starting baselines
- `templates/alternatives/` — tradeoff template
- `scripts/lib/feedback-channel.mjs`, `scripts/lib/feedback-cursor.mjs`, `scripts/lib/feedback-overlay-injector.mjs`, `scripts/lib/feedback-overlay/`
- `scripts/hooks/pre-write-prototype-guard.mjs` — viewport + native-only gate
- `scripts/hooks/user-prompt-submit-feedback.mjs` — surfaces browser feedback as additionalContext

Add a new section "Browser Feedback Channel":

```markdown
## Browser Feedback Channel

When `preview-server` runs (default), every served HTML page is injected with a feedback overlay. User clicks a 💬 button → selects any element → comments → comment is appended as JSONL to `.claude/memory/feedback-queue.jsonl`.

**Delivery to active Claude session:** the `UserPromptSubmit` hook (`scripts/hooks/user-prompt-submit-feedback.mjs`) drains new entries on EVERY prompt the user sends, advances the per-session cursor at `.claude/memory/feedback-cursor.json`, and emits the entries as `additionalContext` so Claude sees them inline in the prompt context. This is the same delivery pattern used by the dispatch-suggester. There is NO separate watcher / sidecar process — claude-code reads only its own input + hook outputs.

The skill `evolve:browser-feedback` then triages each entry → routes to `creative-director` (visual/motion) or `prototype-builder` (layout/a11y/copy) → applies minimal change → writes `prototypes/<slug>/feedback-resolutions/<id>.md`.

Disable: `node scripts/preview-server.mjs --no-feedback ...`.

Constraints: localhost-only, single-client typical, text frames only. WebSocket implemented in-process via `node:net` (no `ws` dep) — see `.claude/memory/decisions/2026-04-28-feedback-websocket.md`.
```

Add a new section "Non-web design surfaces":

```markdown
## Non-web design surfaces

`/evolve-design` Stage 0 asks user the target surface: `web` | `chrome-extension` | `electron` | `tauri` | `mobile-native`. Viewport defaults from `templates/viewport-presets/<target>.json`. Specialist designer:

- web → `ux-ui-designer` + `creative-director`
- chrome-extension → `extension-ui-designer`
- electron → `electron-ui-designer`
- tauri → `tauri-ui-designer`
- mobile-native → `mobile-ui-designer`

Same brandbook (target-aware via `templates/brandbook-target-baselines/<target>.md`) + same handoff flow with target-specific adapter (`templates/handoff-adapters/<target>.md.tpl`). Prototype runtime adapts (HTML for web/extension/electron/tauri renderers; mobile-native HTML is fidelity sketch — production = React Native / Flutter / native).
```

- [ ] **Step 1a: Reconcile agent count discrepancy in CLAUDE.md**

CLAUDE.md currently has two conflicting agent counts: header reads "Agent system (75 agents)" while the repository-layout block earlier in the file reads "46 agents organized by namespace". This pre-existed plan v1 but plan v2 adds 4 more design agents.

Fix by:
1. `grep -n "agents organized\|Agent system" CLAUDE.md` to see exact lines.
2. Count `.md` files under `agents/**/*.md` (excluding any non-agent files like READMEs): `find agents -name '*.md' -not -name 'README.md' | wc -l`.
3. Set BOTH headings to that count (which becomes existing-count + 4 after Task 13 ships).
4. Also update the per-namespace table count for `_design` (was 6 → becomes 10) and update overall total accordingly.

- [ ] **Step 2: Run final check**

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 2: Run final check**

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 3: Update README.md "Capabilities" if it has a design pipeline summary**

Mention: target surfaces, component-library bridges, browser feedback channel.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: document non-web targets, component library bridges, browser feedback"
```

---

## Task 22: Confidence re-score against rubric

- [ ] **Step 1: Re-run audit mentally with new state**

For each of 13 items, verify the gap from the original audit is closed:

1. ✅ Pre-write hook blocks until config.json + Task 4a backfills existing prototypes — gap closed → 10/10
2. ✅ Animation + graphics matrices in creative-director, motion section in ux-ui-designer, interaction-design-patterns wired into prototype-builder — gap closed → 10/10
3. ✅ Anti-patterns also in skill bodies + validator enforces — gap closed → 10/10
4. ✅ Validator enforces feedback markers in skill bodies — gap closed → 10/10
5. (already 10) → 10/10
6. ✅ Pre-write hook blocks framework imports — gap closed → 10/10
7. ✅ (already 10) + Task 14a adds non-web adapter hints (RN/Flutter/Electron/Tauri/MV3) → 10/10
8. ✅ (already 10) + Task 14b makes brandbook target-aware → 10/10
9. ✅ Tradeoff template + referenced from 3 sites — gap closed → 10/10
10. ✅ Single-question rule + validator + applied to all interactive agents — gap closed → 10/10
11. ✅ Target parameter + 5 viewport presets + 4 specialist designers + 5 handoff adapters + 5 brandbook baselines + non-web prototype skill — gap closed → 10/10
12. ✅ WebSocket overlay + queue + cursor + UserPromptSubmit hook (proper delivery, NOT sidecar) + skill + agent dispatch — gap closed → 10/10
13. ✅ 13 templates + component-library-integration skill + MUI/shadcn/headless bridges + brandbook 6.5 — gap closed → 10/10

- [ ] **Step 2: Final commit**

If any docstring or comment lag was found, fix here:

```bash
git add -u
git commit -m "chore: final pass — all 13 design-pipeline items at 10/10" || echo "no changes"
```

---

## Self-Review (plan v2)

**1. Spec coverage:** All 13 audit items have concrete tasks. Items already at 10/10 in v1 (5, 7, 8) get reinforcing additions in v2 — Task 14a adds non-web handoff adapters (extends item 7), Task 14b makes brandbook target-aware (extends item 8 to non-web). Backward-compat for the new pre-write hook (which would otherwise brick existing prototypes) is added in Task 4a. Feedback delivery mechanism rewritten in Task 19 to use `UserPromptSubmit` hook instead of unreachable sidecar.

**2. Placeholder scan:** No "TBD"/"add appropriate"/"similar to". Each agent file (Tasks 13, 10) lists the exact insertion point and standardized block. Task 6 enumerates 12 components by name. Task 17 has full overlay code. Task 19 has full hook + cursor lib + skill code. Task 16 has full channel implementation. Tasks 14a/14b enumerate every adapter and baseline file with full content.

**3. Type consistency:**
- Single-question discipline section header `## User dialogue discipline` consistent across rule, validator regex, all agent edits.
- Anti-pattern key `asking-multiple-questions-at-once` identical across rule, validator, skill bodies, agent files.
- Frontmatter `dialogue: noninteractive` override consistent.
- Feedback queue path `.claude/memory/feedback-queue.jsonl` consistent across server, hook, skill, CLAUDE.md.
- Cursor path `.claude/memory/feedback-cursor.json` consistent (cursor lib + hook + CLAUDE.md docs).
- `target` enum (`web`/`chrome-extension`/`electron`/`tauri`/`mobile-native`) consistent across viewport-presets, prototype skill, prototype-builder, evolve-design Stage 0, prototype-handoff Stage 5, brandbook target-baselines.
- Hook code typo from v1 (`require('path').sep` mixed in ESM) fixed in Task 4 Step 1.

**4. Plan v2 changes vs v1:**
- ADDED Task 4a (migration backfill) — closes backward-compat gap for existing prototypes
- ADDED Task 14a (prototype-handoff non-web adapters) — closes coverage gap for items 7+11
- ADDED Task 14b (brandbook target baselines) — closes coverage gap for items 8+11
- REPLACED Task 19 — switched from sidecar `feedback-monitor.mjs` (which couldn't deliver reminders to active session) to `UserPromptSubmit` hook (proper mechanism)
- FIXED Task 4 Step 1 — removed broken `require('path').sep` line
- CLARIFIED Task 12 Step 3 — explicit stage renumbering instructions
- ADDED Task 21 Step 1a — agent count reconcile to fix pre-existing CLAUDE.md inconsistency (75 vs 46)

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-04-28-design-pipeline-100-percent.md` (v2).** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Phases 1–4 (Tasks 1–4a, 5, 6–7, 8–10) are mostly markdown edits and small validator scripts — well-suited for parallel subagent dispatch within phase. Phase 5 (Tasks 11–14b) needs sequential within-phase ordering. Phase 6 (Tasks 15–20) is the most complex, sequential within-phase. Total 25 tasks (was 22 in v1).

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Recommended if you want to review every change with me directly.

**Which approach?**
