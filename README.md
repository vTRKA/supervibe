# Supervibe

> **Compliance notice:** This tool is designed exclusively for development assistance. By using it, you agree to comply with the Terms of Service (ToS) and Acceptable Use Policy (AUP) of all involved services, including Anthropic. Unauthorized automated usage, OAuth token abuse, or violation of third-party policies is the sole responsibility of the end user.

A plugin that turns Claude Code, Codex, and Gemini into a team of 81 specialist agents with a code graph, project memory, design intelligence, and confidence gates. Runs locally. No Docker.

**v2.0** · MIT · Windows / macOS / Linux

---

## What you get

| Feature | What it means |
|---------|---------------|
| 81 specialist agents | ≥250 lines each: persona, decision tree, procedure, output contract, anti-patterns, verification |
| Code graph (10 languages) | tree-sitter symbols and edges. Query `--callers X`, `--callees Y`, `--neighbors Z --depth 2` |
| Semantic code search | multilingual-e5-small. Works offline. Speaks Russian, English, and 100 other languages |
| Project memory | Five categories with FTS5 plus per-chunk embeddings. Decisions get reused, not rederived |
| Confidence engine | Seventeen rubrics. Gate at score ≥9. Override rate above 5% triggers an audit |
| 23 discipline rules | `use-codegraph-before-refactor`, `single-question-discipline`, `design-system-governance`, `agent-install-profiles`, `anti-hallucination`, and more |
| Auto-reindex | A PostToolUse hook plus an mtime scan on session start. The `memory:watch` daemon is optional |
| Agent evolution loop | Telemetry, underperformer detection, and `/supervibe-strengthen` with a user gate |
| Re-dispatch suggester | When a Task finishes at confidence < 8.0, the hook checks past high-confidence runs on similar tasks and prints a `[supervibe] dispatch-hint:` with up to 3 alternative agents — never auto-dispatches |
| Autonomous loop | `/supervibe-loop` turns a reviewed plan, PRD, epic, or validation request into a bounded, visible, cancellable agent loop with task graph scheduling, work-item templates, provider permission audit, side-effect ledger, and 9/10 confidence completion |
| Live preview server | `localhost:PORT` with SSE hot reload, idle shutdown, and a max-server limit |
| Browser feedback channel | 💬 click-to-comment overlay injected into preview pages — comments arrive as `<system-reminder>` on next user prompt via UserPromptSubmit hook (zero-dep WebSocket via `node:net`) |
| Design pipeline (5 targets) | web · chrome-extension · electron · tauri · mobile-native — specialist designer per target, viewport presets, brandbook baselines, target-aware handoff adapters (RN / Flutter / MV3 / Electron renderer / Tauri webview) |
| Design intelligence (2.0) | Internal RAG data pack for designer agents: memory + code + retrieval-backed style, UX, charts, decks, collateral, and stack UI evidence through existing `/supervibe-design` and `/supervibe-audit` flows |
| Component library bridges | shadcn / MUI / Mantine / Radix / HeadlessUI — token bridge generated from approved design system |
| Pre-write prototype guard | `PreToolUse` hook blocks writes to `prototypes/<slug>/` until `config.json` exists AND blocks framework imports — prototypes stay native HTML/CSS/JS |
| Multi-CLI | One installer wires Claude Code, Codex, and Gemini together |

24 stacks supported: PHP (Laravel) · TypeScript / JavaScript (Next.js, Nuxt, Vue, Svelte, React, Express, NestJS) · Python (FastAPI, Django + DRF) · Ruby (Rails) · Java / Kotlin (Spring) · C# (ASP.NET) · Go · Mobile (Flutter, iOS, Android) · Browser Extensions (Chrome MV3 / WXT / Plasmo / Vite-CRXJS) · GraphQL · PostgreSQL · MySQL · MongoDB · Elasticsearch · Redis.

---

## Install

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1 | iex
```

The installer auto-detects every supported AI CLI on your machine and registers the plugin.

**Claude Code (auto-detect):**
```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash
```

**Cursor:**
```text
/add-plugin supervibe
```
Or search for "supervibe" in Cursor's plugin marketplace.

**OpenCode:**
Add to your `opencode.json`:
```json
{
  "plugin": ["supervibe@git+https://github.com/vTRKA/supervibe.git"]
}
```

**GitHub Copilot CLI:**
```bash
copilot plugin marketplace add vTRKA/supervibe-marketplace
copilot plugin install supervibe@supervibe-marketplace
```

**Gemini CLI:**
```bash
gemini extensions install https://github.com/vTRKA/supervibe
```

**Codex CLI:**
Open the plugin search interface (`/plugins`) and search for "supervibe".

Restart your AI CLI. On the next session you should see:

```
[supervibe] welcome — plugin v2.0.0 initialized for this project
[supervibe] code RAG ✓ N files / M chunks (fresh)
[supervibe] code graph ✓ N symbols / M edges (X% resolved)
```

**Requirements:** Node.js 22.5+ and Git. The installer checks `node:sqlite` before registration; if Node is missing or too old, it asks for explicit consent to install or upgrade Node and only continues after SQLite/RAG/CodeGraph can run. Git LFS is optional — the embedding model downloads from HuggingFace on first use. No Docker, no Python, no native compile step.

For unattended installs, set `SUPERVIBE_INSTALL_NODE=1` to allow Node bootstrap or `SUPERVIBE_INSTALL_NODE=0` to fail fast with manual instructions.

Release integrity evidence is documented in [release security](docs/release-security.md), [install integrity](docs/install-integrity.md), and [third-party licenses](docs/third-party-licenses.md). The default installer follows `main`; strict installs can set `SUPERVIBE_REF`, `SUPERVIBE_EXPECTED_COMMIT`, and `SUPERVIBE_EXPECTED_PACKAGE_SHA256` before running the installer.

### Update

Three ways, pick whichever fits your context:

**One-liner (matches the install style):**

macOS / Linux:
```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/update.sh | bash
```

Windows (PowerShell):
```powershell
irm https://raw.githubusercontent.com/vTRKA/supervibe/main/update.ps1 | iex
```

**From the AI CLI session:**
```
/supervibe-update
```

**Manually from the plugin checkout:**
```bash
cd ~/.claude/plugins/marketplaces/supervibe-marketplace
npm run supervibe:upgrade
```

All three do the same thing: refuse if you have uncommitted edits to the plugin checkout, then `git pull --ff-only` + LFS pull + `npm install` + run all tests + refresh the upstream-check cache. Restart the AI CLI afterwards.

---

## Workflows

### Brainstorm -> Plan -> Review -> Atomize -> Safe Run

The trigger-safe path is explicit and chainable:

1. `/supervibe-brainstorm <topic>` writes the approved spec, then asks: `Следующий шаг - написать план. Переходим?`
2. `/supervibe-plan <spec-path>` writes the plan, then asks for the review loop before execution.
3. `/supervibe-plan --review <plan-path>` reviews plan quality, safety, missing checks, and README impact.
4. `/supervibe-loop --from-plan --atomize <plan-path>` splits the reviewed plan into atomic work items and an epic.
5. `/supervibe-loop --guided --max-duration 3h` runs in the current session after provider-safe preflight, explicit approval, side-effect ledger setup, and stop/resume/status controls. Worktree is optional: add `--worktree` only when you want isolated or parallel sessions.

Diagnostics are first-class: use `/supervibe --diagnose-trigger` when a phrase did not route as expected, and `/supervibe --why-trigger` to explain the selected command, selected skill, confidence, missing artifacts, and safety blockers. Long-running work stays visible through stop/resume/status commands and never attempts provider bypass, hidden background execution, or policy evasion.

Unreleased capability label: the durable autonomous loop is implemented in this
workspace and remains opt-in until the release gate publishes it. Autonomous execution is opt-in, not the default.
The default path is read-only planning, review, atomization preview, status,
diagnostics, and dry-run artifacts.

Copy-paste path from brainstorm -> reviewed plan -> atomized epic -> safe execution:

```bash
/supervibe-brainstorm "idea"
/supervibe-plan --from-brainstorm docs/specs/example.md
/supervibe-plan --review docs/plans/example.md
/supervibe-loop --atomize-plan docs/plans/example.md --plan-review-passed
/supervibe-loop --guided --max-duration 3h
/supervibe-loop --epic example-epic --worktree --max-duration 3h
/supervibe-loop --epic example-epic --worktree --assigned-task T1 --assigned-write-set src/auth.ts --max-duration 3h
/supervibe-loop --status --epic example-epic
/supervibe-loop --resume .claude/memory/loops/example-run/state.json
/supervibe-loop --stop example-run
```

Execution modes are explicit: `--dry-run`, `--guided`, `--manual`,
`--fresh-context --tool codex|claude|gemini|opencode`, and optional worktree-backed
execution with `--worktree`. A single current-session run is valid when the user
does not need isolation or parallel sessions. Provider prompts, rate limits, network/MCP approvals,
secrets, billing, deploys, production mutations, and credential changes are
never bypassed. Missing credentials, missing provider permissions,
CI/external access failures, worktree conflicts, policy stops, stale claims, and
sync drift become blocked states with a next safe action.

For parallel work on one epic, scope each worktree session with
`--assigned-task` and `--assigned-write-set`. The registry is lock-protected and
status output shows each active session's wave, task IDs, write-set, agents, and
path so separate sessions do not silently claim the same zone.

Implemented loop operations now include graph inspection, doctor/repair,
fresh-context prime summaries, PRD/story intake, and safe export/import bundles:

```bash
/supervibe-loop --from-prd docs/specs/checkout.md --dry-run
/supervibe-loop --atomize-plan docs/plans/example.md --dry-run
/supervibe-loop --tracker-sync-push --file .claude/memory/work-items/example-epic/graph.json
/supervibe-loop graph --file .claude/memory/loops/<run-id>/state.json --format text
/supervibe-loop doctor --file .claude/memory/loops/<run-id>/state.json
/supervibe-loop prime --file .claude/memory/loops/<run-id>/state.json
/supervibe-loop export --file .claude/memory/loops/<run-id>/state.json --out .claude/memory/bundles/<run-id>
```

Work-item status uses the same vocabulary in CLI, reports, and query answers:
`ready`, `blocked`, `claimed`, `stale`, `orphan`, `drift`, `review`, and
`done`. State and evidence live under `.claude/memory/loops/`, atomized epics
under `.claude/memory/work-items/`, external tracker mappings in
`task-tracker-map.json`, and archived/exported run bundles under
`.claude/memory/bundles/`.

Production-prep may complete autonomously when evidence is complete, but
production mutation, destructive migration, credential mutation, billing, DNS,
account, access-control, and remote server changes remain blocked without an
exact approval lease.

Policy profiles make those boundaries explicit per project and role. Use
`/supervibe-status --policy` to inspect the active profile, `/supervibe-status
--role` to inspect team governance, and `/supervibe-loop --policy-profile
guided|contributor|maintainer|CI-readonly|CI-verify` to run with a named local
profile. Approval receipts live in a scoped expiring local ledger and can be
listed with `/supervibe-loop --approval-receipts`. Details are in
[policy profiles](docs/policy-profiles.md).

Semantic anchors are optional local hints for large files. They let agents find
stable regions, file-local contracts, invariants, and per-file change summaries
without requiring heavy markup everywhere. Use `/supervibe-status --anchors
--file src/example.ts` to inspect one file and `/supervibe-loop --anchor-doctor`
to check derived anchor drift. Details are in
[semantic anchors](docs/semantic-anchors.md).

Multi-agent orchestration can be inspected before any fan-out. Use
`/supervibe-loop --plan-waves docs/plans/example.md` to see safe parallel
waves, `/supervibe-loop --assign-ready --explain --file <state.json>` to see
worker/reviewer reasoning, and `/supervibe-status --assignment <task-id> --file
<state.json>` to answer why a task was assigned or serialized. Details are in
[multi-agent orchestration](docs/multi-agent-orchestration.md).

Three named flows cover most of the day-to-day use. Each has an explicit slash-command entry point — no need to remember the right phrase to make the AI pick the right skill.

### Brainstorm → Plan → Execute

For any new feature, component, or behavior change.

```
/supervibe-brainstorm payment idempotency
  ↓ collaborative dialogue, kill criteria, decision matrix
  ↓ saves docs/specs/2026-04-28-payment-idempotency-design.md
  ↓ score ≥9 against requirements rubric
/supervibe-plan docs/specs/2026-04-28-payment-idempotency-design.md
  ↓ phased TDD plan, parallelization batches, risk register
  ↓ saves docs/plans/2026-04-28-payment-idempotency.md
  ↓ score ≥9 against plan rubric
  ↓ choose: subagent-driven OR inline execution
```

You can skip `/supervibe-brainstorm` if you already have an approved spec, or skip `/supervibe-plan` for trivial one-line changes.

### Design pipeline → Live preview → Browser feedback

For any visual surface — web landing, in-product flow, browser extension, Electron / Tauri desktop, or mobile native.

```
/supervibe-design landing in the style of Linear, focused on dev-tool buyers
  ↓ Stage 0: target surface (web | chrome-extension | electron | tauri | mobile-native)
  ↓ creative-director: brand direction (mood-board, tokens, animation library, graphics medium)
  ↓ brandbook: target-aware baselines + Section 6.5 component library decision
  ↓ optional: component-library-integration (shadcn / MUI / Mantine / Radix / HeadlessUI bridge)
  ↓ specialist designer per target (extension-ui-designer / electron / tauri / mobile / ux-ui)
  ↓ copywriter: every visible string nailed
  ↓ prototype-builder: 1:1 HTML/CSS in prototypes/<slug>/ (native only — pre-write hook enforces)
  ↓ AUTO: supervibe:preview-server spawns http://localhost:NNNN with hot reload + 💬 feedback overlay
  ↓ ui-polish-reviewer + accessibility-reviewer in parallel
  ↓ feedback loop (✅ / ✎ / 🔀 / 📊 / 🛑) — never silent
  ↓ on approval: handoff bundle with target-specific adapter (RN / Flutter / Electron / Tauri / MV3)
  ↓ score ≥9 against prototype rubric
```

**Browser feedback in real time:** click the 💬 button in the preview, select any region, type a comment. Hits `.claude/memory/feedback-queue.jsonl`; the `UserPromptSubmit` hook injects new entries as `<system-reminder>` on your next prompt — the `supervibe:browser-feedback` skill triages and dispatches to the right designer.

Manage running servers with `/supervibe-preview --list` / `--kill <port>`. Disable the overlay with `--no-feedback`.

### Refactor with safety

For any rename / move / extract / delete on a public symbol.

```
ask: who calls processPayment?
  ↓ AI runs supervibe:code-search --callers "processPayment"
  ↓ shows N callers with file:line
if N > 10:
  ↓ rule use-codegraph-before-refactor escalates → architect-reviewer
  ↓ migration ADR
refactoring-specialist makes the rename in one PR
  ↓ verifies --callers "processPayment" returns 0
  ↓ score ≥9, no missed call sites
```

This flow has no slash command — you trigger it by asking the question. The graph + the discipline rules handle the rest.

---

## Commands

Slash commands (run inside an AI CLI session). The normal user path is intentionally short; advanced commands stay available for diagnostics and plugin maintenance.

### Primary

| Command | What it does |
|---------|--------------|
| `/supervibe` | Auto-router: picks genesis, design routes, audit, strengthen, adapt, score, or update based on project state |
| `/supervibe-genesis` | First-time scaffold of `.claude/` for your stack |
| `/supervibe-brainstorm <topic>` | Explicit entry to the brainstorming flow; produces an approved spec |
| `/supervibe-plan [<spec-path>]` | Turn an approved spec into a phased TDD implementation plan |
| `/supervibe-execute-plan [<plan-path>]` | Execute a plan with explicit 10/10 confidence gates. Supports `--dry-run` and `--resume` |
| `/supervibe-loop --request/--plan/--from-prd` | Bounded autonomous loop with graph scheduler, status/resume/stop, doctor, graph export, and policy gates |
| `/supervibe-design <brief>` | End-to-end design pipeline with memory/code/design-intelligence preflight: brand → spec → prototype → live preview → approval |
| `/supervibe-presentation <brief>` | Presentation pipeline: storyboard → slide preview → feedback → approved `.pptx` → Google Drive handoff |
| `/supervibe-preview` | Manage live preview servers |
| `/supervibe-update` | Update the plugin itself. Idempotent, with rollback on failed checks |
| `/supervibe-adapt` | Pull upstream agent/rule/skill improvements into the current project after plugin updates |

### Advanced

| Command | What it does |
|---------|--------------|
| `/supervibe-audit` | Read-only health check across agents, rules, memory, indexes, design evidence, and project overrides |
| `/supervibe-strengthen [agent_id]` | Strengthen a weak agent from telemetry; without arguments auto-detects flagged agents |
| `/supervibe-score [--record] <artifact>` | Score an artifact against its rubric; `--record` also updates telemetry. This is the preferred scoring/evaluation command |

Internal command specs for diagnostics, plugin QA, memory GC, legacy aliases, and override logging live in `docs/internal-commands/`. They are intentionally outside the published `commands/` directory so they do not add slash-command noise.

Shell scripts (run inside the plugin directory `~/.claude/plugins/marketplaces/supervibe-marketplace/`):

| Command | What it does |
|---------|--------------|
| `npm run supervibe:status` | Health check across every index |
| `npm run supervibe:loop -- --help` | Local no-tty help for loop status, graph, doctor, prime, export/import, and execution modes |
| `npm run supervibe:upgrade` | git pull, lfs pull, npm install, run all tests |
| `npm run supervibe:upgrade-check` | Manually query upstream for new commits |
| `npm run code:index` | Full reindex |
| `npm run code:search -- --query "..."` | Semantic search |
| `npm run code:search -- --callers "Symbol"` | Graph: who calls this symbol |
| `npm run presentation:build -- --input presentations/<slug>/deck.json --output presentations/<slug>/export/<slug>.pptx` | Export an approved deck spec to PPTX |
| `npm run memory:watch` | Optional watcher daemon |
| `npm run migrate:prototype-configs` | One-shot: backfill `config.json` for legacy prototype directories (also runs auto on SessionStart) |
| `npm run check` | All 320 tests plus manifest, frontmatter, design-skill, question-discipline, spec-artifact, plan-artifact, agent-footer, knip, and trigger-clarity validation |

---

## Troubleshooting

**No banner after install.** Re-run the installer — it is idempotent and refreshes the three Claude config files. Then fully restart the AI CLI (close the desktop app, do not just open a new chat).

**Not visible in VS Code or Zed.** Those IDEs read the same `~/.claude/` as the terminal. If the banner appears in the terminal, restart the IDE. If still nothing, re-run the installer.

**`Protobuf parsing failed`.** The embedding model is an LFS pointer. Run `git lfs pull` inside `~/.claude/plugins/marketplaces/supervibe-marketplace`, or just trigger a code search — the model downloads from HuggingFace (~118 MB).

**SQLite errors.** Node.js 22.5+ is required for the built-in `node:sqlite` used by semantic RAG, code graph, project memory, and agent task memory. Re-run the installer and approve the Node upgrade prompt, or install Node.js 22.5+ manually and then re-run.

**Stale code index.** The mtime scan on session start catches most external edits. For a full rebuild: `rm .claude/memory/code.db && npm run code:index` from your project directory.

**Windows.** If PowerShell rejects the installer with an Execution Policy error: `Set-ExecutionPolicy -Scope Process Bypass`. The Codex symlink needs Developer Mode — without it, the installer falls back to a directory copy.

---

## Uninstall

```bash
# macOS / Linux
rm -rf ~/.claude/plugins/marketplaces/supervibe-marketplace
rm -f  ~/.codex/plugins/supervibe

node -e "
const fs=require('fs'),p=process.env.HOME+'/.claude/plugins/installed_plugins.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
delete d.plugins['supervibe@supervibe-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

node -e "
const fs=require('fs'),p=process.env.HOME+'/.claude/plugins/known_marketplaces.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
delete d['supervibe-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

node -e "
const fs=require('fs'),p=process.env.HOME+'/.claude/settings.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
if(d.enabledPlugins) delete d.enabledPlugins['supervibe@supervibe-marketplace'];
if(d.extraKnownMarketplaces) delete d.extraKnownMarketplaces['supervibe-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

sed -i.bak '/<!-- supervibe-plugin-include: do-not-edit -->/,/<!-- supervibe-plugin-include: do-not-edit -->/d' ~/.gemini/GEMINI.md 2>/dev/null || true
```

Windows equivalent: replace `rm -rf` with `Remove-Item -Recurse -Force` and run the same node `-e` blocks (paths via `$HOME` work in PowerShell too).

Project indexes are your data — remove only when sure: `rm -rf .claude/memory/code.db .claude/memory/memory.db`.
