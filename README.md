# Supervibe

> **Compliance notice:** This tool is designed exclusively for development assistance. By using it, you agree to comply with the Terms of Service (ToS) and Acceptable Use Policy (AUP) of all involved services, including Anthropic. Unauthorized automated usage, OAuth token abuse, or violation of third-party policies is the sole responsibility of the end user.

A plugin that turns Claude Code, Codex, and Gemini into a team of 89 specialist agents with a code graph, project memory, design intelligence, and confidence gates. Runs locally. No Docker.

**v2.0** - MIT - Windows / macOS / Linux - 919 tests

---

## What you get

| Feature | What it means |
|---------|---------------|
| 89 specialist agents | ≥250 lines each: persona, decision tree, procedure, output contract, anti-patterns, verification. See [agent roster](docs/agent-roster.md) |
| Code graph (10 languages) | tree-sitter symbols and edges. Query `--callers X`, `--callees Y`, `--neighbors Z --depth 2` |
| Semantic code search | multilingual-e5-small. Works offline. Speaks Russian, English, and 100 other languages |
| Project memory | Five categories with FTS5 plus per-chunk embeddings. Decisions get reused, not rederived |
| Confidence engine | Seventeen rubrics. Gate at score ≥9. Override rate above 5% triggers an audit |
| 26 discipline rules | `operational-safety`, compact `agent-excellence-baseline` validation, `use-codegraph-before-refactor`, `single-question-discipline`, `design-system-governance`, `agent-install-profiles`, `anti-hallucination`, and more |
| Auto-reindex | A PostToolUse hook plus an mtime scan on session start. The `memory:watch` daemon is optional |
| Agent improvement loop | Telemetry, underperformer detection, and `/supervibe-strengthen` with a user gate |
| Re-dispatch suggester | When a Task finishes at confidence < 8.0, the hook checks past high-confidence runs on similar tasks and prints a `[supervibe] dispatch-hint:` with up to 3 alternative agents — never auto-dispatches |
| Autonomous loop | `/supervibe-loop` turns a reviewed plan, PRD, epic, or validation request into a bounded, visible, cancellable agent loop with task graph scheduling, work-item templates, provider permission audit, side-effect ledger, and 9/10 confidence completion |
| Security audit loop | `/supervibe-security-audit` runs read-only multi-agent AppSec/dependency/ops/AI security review, ranks vulnerabilities, then optionally plans, executes, and re-audits remediation to a 10/10 gate |
| Prompt AI engineering | Optional `prompt-ai-engineer` add-on strengthens prompts, agent instructions, intent routing, structured outputs, tool policies, evals, and prompt-injection defenses |
| Visible context intelligence | Context packs show memory/RAG/codegraph/repo-map citations, confidence delta, omitted context, repair actions, and no-silent-done lifecycle evidence |
| Performance SLOs | Local release gates report context-pack latency, token ceilings, watcher overhead, index size, eval runtime, and resource drift |
| Feedback learning loop | User corrections become reviewed memory candidates, eval cases, and high-severity regression fixtures instead of disappearing in chat history |
| Network/router agent | Optional `network-router-engineer` add-on handles routers, VPN, firewall, Wi-Fi, DNS/DHCP, and routing stability with read-only diagnostics first and scoped approval before mutations |
| Live preview server | `localhost:PORT` with SSE hot reload, idle shutdown, and a max-server limit |
| Browser feedback channel | 💬 click-to-comment overlay injected into preview pages — comments arrive as `<system-reminder>` on next user prompt via UserPromptSubmit hook (zero-dep WebSocket via `node:net`) |
| Design pipeline (5 targets) | web · chrome-extension · electron · tauri · mobile-native — specialist designer per target, viewport presets, brandbook baselines, target-aware handoff adapters (RN / Flutter / MV3 / Electron renderer / Tauri webview) |
| Design intelligence (2.0) | Internal RAG data pack for designer agents: memory + code + retrieval-backed style, UX, charts, decks, collateral, and stack UI evidence through existing `/supervibe-design` and `/supervibe-audit` flows |
| Component library bridges | shadcn / MUI / Mantine / Radix / HeadlessUI — token bridge generated from approved design system |
| Pre-write prototype guard | `PreToolUse` hook blocks writes to `prototypes/<slug>/` until `config.json` exists AND blocks framework imports — prototypes stay native HTML/CSS/JS |
| Multi-CLI | One installer wires Claude Code, Codex, and Gemini together |

24 stacks supported: PHP (Laravel) · TypeScript / JavaScript (Next.js, Nuxt, Vue, Svelte, React, Express, NestJS) · Python (FastAPI, Django + DRF) · Ruby (Rails) · Java / Kotlin (Spring) · C# (ASP.NET) · Go · Mobile (Flutter, iOS, Android) · Browser Extensions (Chrome MV3 / WXT / Plasmo / Vite-CRXJS) · GraphQL · PostgreSQL · MySQL · MongoDB · Elasticsearch · Redis.

---

## Start here

1. Install or update the plugin with the one-line installer for your OS.
2. Restart your AI CLI.
3. Open the target project and run `/supervibe-genesis`.
4. Review the dry-run: host adapter, detected stack, selected agent groups, each selected agent's responsibility, rules, skills, memory/index files, and host instruction changes.
5. Approve only after the dry-run looks right. Genesis writes managed project artifacts and initializes Code RAG + Code Graph.
6. Run `npm run supervibe:status` or `/supervibe --status` to confirm memory, RAG, code graph, watcher and index config health.

Existing projects should not be wiped after plugin updates. Run `/supervibe-update` to update the plugin, then `/supervibe-adapt` inside each project to review and apply managed agent/rule/skill/context diffs.

## Available agents

Supervibe ships 89 agents grouped by core workflow, product/design, operations/security, system improvement and stack specialists. The generated roster lives at [docs/agent-roster.md](docs/agent-roster.md) and is built from the same frontmatter that genesis uses for role explanations.

Core examples:
- `supervibe-orchestrator` routes work, verifies skill/agent selection and keeps the workflow moving.
- `repo-researcher` maps unfamiliar code with memory, semantic search and code graph evidence before changes.
- `code-reviewer` performs severity-ranked review before merge.
- `quality-gate-reviewer` checks final readiness, tests and release evidence.
- `root-cause-debugger` isolates bugs with hypothesis/evidence loops.

Stack examples include React, Next.js, Vue, Nuxt, SvelteKit, Laravel, Django, FastAPI, Rails, Go, Spring, ASP.NET, Tauri, mobile, databases, GraphQL, Redis and Elasticsearch specialists.

## Indexing config

Code RAG + Code Graph use `.supervibe/memory/index-config.json` for project-owned indexing settings. `exclude` patterns hide files from indexing; privacy blocks for secrets, archives, binaries and local config always win. The optional `npm run memory:watch` daemon reacts to file events immediately and runs a 5-minute safety refresh.

## Install

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1 | iex
```

The installer auto-detects every supported AI CLI on your machine and registers the plugin. Re-running it is a clean managed reinstall: user-owned tracked local edits stop the install, installer-managed `package-lock.json` and ONNX model drift are restored automatically, and stale untracked/ignored files from older plugin versions are removed before dependencies and generated registries are rebuilt.

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
Use the one-line installer above. For Codex it registers the official plugin cache at `~/.codex/plugins/cache/supervibe-marketplace/supervibe/local`, enables `[plugins."supervibe@supervibe-marketplace"]` in `~/.codex/config.toml`, keeps a legacy `~/.codex/plugins/supervibe` link for older wrappers, and links `~/.agents/skills/supervibe` for native skill discovery in Codex/Zed ACP sessions. Current Codex supports this skills/config surface; plugin slash-command, agent, and hook manifest fields are not advertised to Zed by `codex-acp`.

Restart your AI CLI. On the next session you should see:

```
[supervibe] welcome — plugin v2.0.32 initialized for this project
[supervibe] code RAG ✓ N files / M chunks (fresh)
[supervibe] code graph ✓ N symbols / M edges (X% resolved)
```

Check multi-host readiness at any time:

```bash
npm run supervibe:doctor -- --host all
```

**Requirements:** Node.js 22.5+ and Git. The installer checks `node:sqlite` before registration; if Node is missing or too old, it asks for explicit consent to install or upgrade Node and only continues after SQLite/RAG/CodeGraph can run. Git LFS is optional, but the ONNX embedding model is not: the installer prepares it before registration, using Git LFS when available and a direct HuggingFace download fallback otherwise. No Docker, no Python, no native compile step.

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

**Auto-update policy:**

Supervibe checks upstream in the background from Claude Code SessionStart when the plugin root is available. The default mode is `managed`: managed installer checkouts under `~/.claude/plugins/marketplaces/supervibe-marketplace` auto-apply safe git updates in the background, while dev/manual/IDE checkouts stay notify-only so local work is not pulled unexpectedly.

Override with:

```bash
SUPERVIBE_AUTO_UPDATE=apply npm run supervibe:auto-update -- --refresh
SUPERVIBE_AUTO_UPDATE=check  npm run supervibe:auto-update -- --refresh
SUPERVIBE_AUTO_UPDATE=off    npm run supervibe:auto-update -- --status
```

Host coverage: Claude Code gets host `autoUpdate` registration plus the SessionStart background check/apply path; OpenCode follows the git source on restart; Codex gets official plugin cache/config registration plus native skill links for Zed ACP sessions; Gemini symlink/include installs follow the managed checkout after it updates; Cursor and other IDE/manual installs rely on their host marketplace where available and `npm run supervibe:doctor -- --host all` to surface drift.

**Manually from the plugin checkout:**
```bash
cd ~/.claude/plugins/marketplaces/supervibe-marketplace
npm run supervibe:upgrade
```

All three do the same thing: refuse user-owned tracked edits in the plugin checkout, self-heal installer-managed `package-lock.json` and ONNX model drift, clean stale untracked/ignored files, then `git pull --ff-only` with LFS smudge disabled + required ONNX model setup + `npm ci` + rebuild generated `registry.yaml` + run the install lifecycle doctor + refresh the upstream-check cache. Restart the AI CLI afterwards.

`/supervibe-adapt` is a slash command inside your AI CLI session, not a terminal command. Do not type `/supervibe-adapt` in zsh, bash, or PowerShell; open the target project in Claude Code, Codex, Gemini, Cursor, or OpenCode and send it in the AI chat/session.

### Refresh an already-scaffolded project

Plugin update and project artifact refresh are separate on purpose:

1. Update the plugin with `/supervibe-update` or the installer update command.
2. Open each project that previously ran genesis.
3. Run `/supervibe-adapt`.
4. Review the dry-run table for agents, rules, skills, host instruction managed blocks and `.supervibe/memory/.supervibe-version`.
5. Approve only the files you want updated. User-owned host instruction sections and project memory entries are preserved.

Do not delete installed project agents/rules/skills to "refresh" them. Adapt performs a diff-gated update, flags deleted or renamed upstream artifacts, and can archive project-only files when you explicitly approve it.

---

## Workflows

### Brainstorm -> Plan -> Review -> Atomize -> Safe Run

The trigger-safe path is explicit and chainable:

1. `/supervibe-brainstorm <topic>` writes the approved spec, then asks whether to proceed to planning.
2. `/supervibe-plan <spec-path>` writes the plan, then asks for the review loop before execution.
3. `/supervibe-plan --review <plan-path>` reviews plan quality, safety, missing checks, and README impact.
4. `/supervibe-loop --from-plan --atomize <plan-path>` splits the reviewed plan into atomic work items and an epic.
5. `/supervibe-loop --guided --max-duration 3h` runs in the current session after provider-safe preflight, explicit approval, side-effect ledger setup, and stop/resume/status controls. Worktree is optional: add `--worktree` only when you want isolated or parallel sessions.

Diagnostics are first-class: use `/supervibe --diagnose-trigger` when a phrase did not route as expected, and `/supervibe --why-trigger` to explain the selected command, selected skill, confidence, missing artifacts, and safety blockers. The router also has a semantic intent layer for implicit needs: "I cannot see epics/tasks", "old tasks are cluttering memory", "agents do not use tools", "RAG/codegraph wastes tokens", "docs has internal TODO garbage", and "Figma tokens drift from code" all route to the nearest safe command without requiring slash-command phrasing. Long-running work stays visible through stop/resume/status commands and never attempts provider bypass, hidden background execution, or policy evasion.

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
/supervibe-loop --resume .supervibe/memory/loops/example-run/state.json
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
fresh-context prime summaries, context packs, PRD/story intake, visual local
control, reversible GC, and safe export/import bundles:

```bash
/supervibe-loop --from-prd docs/specs/checkout.md --dry-run
/supervibe-loop --atomize-plan docs/plans/example.md --dry-run
/supervibe-loop --tracker-sync-push --file .supervibe/memory/work-items/example-epic/graph.json
/supervibe-loop graph --file .supervibe/memory/loops/<run-id>/state.json --format text
/supervibe-loop doctor --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop prime --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-ui --file .supervibe/memory/work-items/example-epic/graph.json
/supervibe-gc --all --dry-run
/supervibe-loop export --file .supervibe/memory/loops/<run-id>/state.json --out .supervibe/memory/bundles/<run-id>
```

Work-item status uses the same vocabulary in CLI, reports, and query answers:
`ready`, `blocked`, `claimed`, `stale`, `orphan`, `drift`, `review`, and
`done`. State and evidence live under `.supervibe/memory/loops/`, atomized epics
under `.supervibe/memory/work-items/`, external tracker mappings in
`task-tracker-map.json`, and archived/exported run bundles under
`.supervibe/memory/bundles/`.

The localhost UI is universal across IDEs: run `/supervibe-ui` or
`npm run supervibe:ui -- --file <graph.json>`, then open the printed
`127.0.0.1` URL in a browser or IDE webview. It shows epics, tasks, selected
context packs, loop `state.json`, waves, gates, SLA reports, GC previews, and
RAG/memory/codegraph health tabs. The Overview phase rail is derived from real
graph/run state and marks plan, atomize, execute, verify, close, and archive as
complete/current/blocked/pending from task status, gates, waves, and archive
markers. The Kanban view groups real work items by ready/claimed/blocked/
deferred/review/done and shows each task's epic, agent, blockers, verification
count, and write scope. Context packs and fresh-context loop prompts include a
compact `workflowSignal` with the same phase, epic, task, claim, gate, and next
action signal, so agents act from the same state that the UI shows. Mutating
actions are local-only and require a preview plus explicit apply confirmation.
`npm run supervibe:ide-bridge -- --out .supervibe/ide-bridge.json` writes a
portable descriptor that IDE webviews can consume without becoming a separate
task store.

Long-lived projects can prune clutter without deleting evidence:
`/supervibe-gc` and `npm run supervibe:gc -- --all --dry-run` preview completed
epic archival and memory cleanup; `--apply` moves candidates into reversible
`.archive/` folders with JSONL audit logs.
`npm run supervibe:status -- --gc-hints` prints the same cleanup signal inside
the normal status flow.

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

**Browser feedback in real time:** click the 💬 button in the preview, select any region, type a comment. Hits `.supervibe/memory/feedback-queue.jsonl`; the `UserPromptSubmit` hook injects new entries as `<system-reminder>` on your next prompt — the `supervibe:browser-feedback` skill triages and dispatches to the right designer.

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
| `/supervibe` | Auto-router: picks genesis, design, security audit, network diagnostics, audit, strengthen, adapt, score, or update based on project state |
| `/supervibe-genesis` | First-time host-aware scaffold for your stack |
| `/supervibe-brainstorm <topic>` | Explicit entry to the brainstorming flow; produces an approved spec |
| `/supervibe-plan [<spec-path>]` | Turn an approved spec into a phased TDD implementation plan |
| `/supervibe-execute-plan [<plan-path>]` | Execute a plan with explicit 10/10 confidence gates. Supports `--dry-run` and `--resume` |
| `/supervibe-loop --request/--plan/--from-prd` | Bounded autonomous loop with graph scheduler, status/resume/stop, doctor, graph export, and policy gates |
| `/supervibe-security-audit` | Read-only multi-agent security audit, prioritized vulnerability backlog, optional remediation plan, execute, and re-audit loop to 10/10 |
| `/supervibe-ui` | Local browser/IDE-webview control plane with Kanban for epics, tasks, agent claims, loop state, waves, context packs, reports, and safe local actions |
| `/supervibe-gc` | Reversible dry-run-first cleanup for completed work-item graphs and stale/superseded memory |
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

Internal command specs for diagnostics, plugin QA, low-level GC internals,
legacy aliases, and override logging live in `references/internal-commands/`. They
are intentionally outside the published `commands/` directory so they do not
add slash-command noise.

Shell scripts (run inside the plugin directory `~/.claude/plugins/marketplaces/supervibe-marketplace/`):

| Command | What it does |
|---------|--------------|
| `npm run supervibe:status` | Health check across every index |
| `npm run supervibe:loop -- --help` | Local no-tty help for loop status, graph, doctor, prime, export/import, and execution modes |
| `npm run supervibe:ui -- --file <graph.json>` | Local visual control plane for work items, loop state, RAG/memory/codegraph health, reports, context packs, and safe actions |
| `npm run supervibe:ide-bridge -- --out .supervibe/ide-bridge.json` | Webview descriptor for wrapping the local UI in any IDE |
| `npm run supervibe:gc -- --all --dry-run` | Reversible cleanup preview for work-item graphs and memory |
| `npm run supervibe:context-pack -- --file <graph.json> --item T1` | Compact high-signal context pack for one active task |
| `npm run supervibe:context-eval -- --case-file <cases.json>` | Retrieval/context-pack evals for required memory, evidence, anchors, and token budgets |
| `npm run supervibe:happy-path -- --plan <plan.md>` | Guided happy path: PRD/plan -> atomize -> execute -> verify -> archive |
| `npm run supervibe:docs-audit` | User-facing docs relevance audit; flags internal dev files if they drift into `docs/` |
| `npm run supervibe:install-doctor` | Post-install lifecycle audit: package versions, registry, stale files, and host registration state |
| `npm run supervibe:upgrade` | clean checkout, git pull, required ONNX model setup, npm ci, rebuild registry, run install doctor |
| `npm run supervibe:upgrade-check` | Manually query upstream for new commits |
| `npm run code:index` | Code RAG + graph indexer with heartbeat/progress logging, single-run lock, and optional bounded batches |
| `npm run code:search -- --query "..."` | Semantic search |
| `npm run code:search -- --context "..."` | Agent-ready RAG + graph + anchor context |
| `npm run code:search -- --symbol-search "Symbol"` | Graph: ranked symbol lookup |
| `npm run code:search -- --callers "Symbol"` | Graph: who calls this symbol |
| `npm run code:search -- --impact "Symbol" --depth 2` | Graph: inbound blast radius before refactor |
| `npm run code:search -- --files "src"` | Graph: indexed files with language and symbol counts |
| `npm run presentation:build -- --input presentations/<slug>/deck.json --output presentations/<slug>/export/<slug>.pptx` | Export an approved deck spec to PPTX |
| `npm run memory:watch` | Optional watcher daemon |
| `npm run migrate:prototype-configs` | One-shot: backfill `config.json` for legacy prototype directories (also runs auto on SessionStart) |
| `npm run check` | Full test suite plus manifest, frontmatter, design-skill, question-discipline, spec-artifact, plan-artifact, agent-footer, knip, confidence-gate, package, and release-security validation |

---

## Troubleshooting

**No banner after install.** Re-run the installer — it is idempotent and refreshes the detected host registration files. Then fully restart the AI CLI (close the desktop app, do not just open a new chat).

The installer now writes `.supervibe/audits/install-lifecycle/latest.json`; if the banner is still absent, check that report for stale files or missing host registration.

**Not visible in VS Code or Zed.** Claude-backed IDE sessions read the same `~/.claude/` as the terminal. If the banner appears in the terminal, restart the IDE. If still nothing, re-run the installer.

**Zed with Codex ACP does not show Supervibe after typing `/`.** Current `codex-acp` advertises only its own built-in commands to Zed. Supervibe follows the Codex-supported route instead: Codex sees the plugin through `~/.codex/plugins/cache/supervibe-marketplace/supervibe/local` plus `~/.codex/config.toml`, and Zed/Codex ACP sessions get Supervibe behavior through native skills linked at `~/.agents/skills/supervibe`. Re-run the installer, restart the Zed external-agent session, then check `npm run supervibe:doctor -- --host codex --strict`.

**`Protobuf parsing failed`.** The embedding model is missing or still an LFS pointer. Re-run the current installer; it verifies the ONNX file, tries bounded Git LFS, then downloads the model directly from HuggingFace before registration.

**Install hangs at `git-lfs filter-process`.** Re-run with the current installer. Clone/checkout disables LFS smudge, and the required ONNX setup uses bounded Git LFS plus direct HuggingFace fallback so the plugin is not registered until the model is ready.

**Windows install starts in WSL.** If `install.sh` runs under `C:\Windows\System32\bash.exe`, it uses WSL `$HOME` and WSL Node, not the Windows Codex/Claude/Gemini profile. Use PowerShell `install.ps1` for Windows, or set `SUPERVIBE_ALLOW_WSL_INSTALL=1` only when you intentionally want a separate WSL install.

**SQLite errors.** Node.js 22.5+ is required for the built-in `node:sqlite` used by semantic RAG, code graph, project memory, and agent task memory. Re-run the installer and approve the Node upgrade prompt, or install Node.js 22.5+ manually and then re-run.

**Stale or partial code index.** The mtime scan on session start catches most external edits. For source RAG repair, run `node scripts/build-code-index.mjs --root . --list-missing`, then `node scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress` from your project directory. Large projects can be processed in bounded atomic batches; the indexer prints heartbeat lines with stage/current file/progress, emits machine-readable `SUPERVIBE_INDEX_PROGRESS` with `--json-progress`, persists `.supervibe/memory/code-index-checkpoint.json`, and uses `.supervibe/memory/code-index.lock` to block duplicate runs and clean stale dead-PID locks. Build graph separately with `node scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health`; graph warnings do not fail the default source RAG gate when coverage is healthy. Use `npm run code:index -- --root . --force --health` only for a deliberate full rebuild.

**Windows.** If PowerShell rejects the installer with an Execution Policy error: `Set-ExecutionPolicy -Scope Process Bypass`. The Codex symlink needs Developer Mode — without it, the installer falls back to a directory copy.

---

## Uninstall

```bash
# macOS / Linux
rm -rf ~/.claude/plugins/marketplaces/supervibe-marketplace
rm -rf ~/.codex/plugins/cache/supervibe-marketplace/supervibe
rm -f  ~/.codex/plugins/supervibe
rm -rf ~/.agents/skills/supervibe
# Also remove [plugins."supervibe@supervibe-marketplace"] from ~/.codex/config.toml if present.

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
const fs=require('fs'),p=process.env.HOME+'/'+['.','claude'].join('')+'/settings.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
if(d.enabledPlugins) delete d.enabledPlugins['supervibe@supervibe-marketplace'];
if(d.extraKnownMarketplaces) delete d.extraKnownMarketplaces['supervibe-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

sed -i.bak '/<!-- supervibe-plugin-include: do-not-edit -->/,/<!-- supervibe-plugin-include: do-not-edit -->/d' ~/.gemini/GEMINI.md 2>/dev/null || true
```

Windows equivalent: replace `rm -rf` with `Remove-Item -Recurse -Force` and run the same node `-e` blocks (paths via `$HOME` work in PowerShell too).

Project indexes are your data — remove only when sure: `rm -rf .supervibe/memory/code.db .supervibe/memory/memory.db`.
