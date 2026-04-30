---
description: >-
  Use WHEN the user asks what to do next, says brainstorm/брейншторм or
  plan/план is ready, asks review/ревью, atomic task split, epic/эпик creation,
  autonomous run, design/UI/deck requests, worktree isolation, status,
  stop/resume, or diagnose/why-trigger TO route to the next safe Supervibe
  workflow command without mutating first.
---

# /supervibe

Trigger router for the full workflow chain: brainstorm -> plan -> review -> atomic work items -> epic -> provider-safe worktree run. It also handles work-item questions, status, dashboard output, integration readiness, saved views, structured queries, local reports, autonomous replay evals, deferred work, guided forms, interactive command palette, sync bundle export/import, notifications, stop/resume, and trigger diagnostics (`--diagnose-trigger`, `--why-trigger`) before any mutating action.

Design requests route to existing commands only:
- new UI, prototype, mockup, professional polish request -> `/supervibe-design`
- design review, UI polish, token drift, accessibility review -> `/supervibe-audit --design`
- mobile UI -> `/supervibe-design --target mobile-native`
- chart UX -> `/supervibe-design --chart-ux`
- presentation/deck design -> `/supervibe-design --presentation`
- brand/collateral asset work -> `/supervibe-design --brand-collateral`
- stack-aware UI handoff -> `/supervibe-design --handoff`

The internal design intelligence lookup never appears as its own slash command.

For workflow handoffs, ask the concrete next-step question instead of stopping at the previous phase:
- Brainstorm ready: `Следующий шаг - написать план. Переходим?`
- Plan ready: `Следующий шаг - review loop по плану. Переходим?`
- Review passed: `Следующий шаг - разбить план на атомарные work items и epic. Переходим?`
- Epic run requested: `Следующий шаг - provider-safe preflight перед worktree/autonomous run. Переходим?`
- Work status question: route "what is ready?", "what is blocked?", "who owns this?", "what changed?", and "what should I run next?" to the work-item query layer.

Dispatcher. Reads project + plugin state via a deterministic detector and proposes the right next command. Never modifies anything itself — always defers to the phase-specific command after user confirmation.

## How it works

The detector lives at `scripts/lib/supervibe-state-detector.mjs` and runs **7 checks in priority order** (first-triggered wins). Each check is independent code, NOT an AI heuristic — failures are surfaced explicitly, false-positives are testable.

| Priority | Check | Signal source | Proposes |
|----------|-------|---------------|----------|
| 1 | `upstream-behind` | `.claude-plugin/.upgrade-check.json` shows `behind > 0` | `/supervibe-update` |
| 2 | `version-bump-unacked` | `.claude/memory/.evolve-version` < installed plugin version | `/supervibe-adapt` |
| 3 | `project-not-scaffolded` | No `.claude/agents/` AND no `CLAUDE.md` in project root | `/supervibe-genesis` |
| 4 | `underperformers` | `auto-strengthen-trigger` returns ≥1 flagged agent (needs ≥10 invocations to trigger) | `/supervibe-strengthen` |
| 5 | `stale-artifacts` | ≥3 files in `agents/` `rules/` `skills/` with `last-verified` >30 days old | `/supervibe-audit` |
| 6 | `override-rate-high` | `.claude/confidence-log.jsonl` shows >5% overrides over last 100 entries | `/supervibe-audit` |
| 7 | `pending-evaluation` | Latest invocation in `agent-invocations.jsonl` has no `outcome` field | `/supervibe-score --record` |
| (none) | — | All 7 checks pass | "System healthy. No action needed." |

## Procedure

1. **Run the detector.** Execute `node $CLAUDE_PLUGIN_ROOT/scripts/supervibe-detect.mjs` from the project root. It prints a human-readable banner + the proposed next command. Failure-tolerant — individual check errors do not break the run.

2. **Show the user the report.** Print every check's status (✓ pass / ⚠ triggered) with one-line evidence. Do not paraphrase — the detector's wording is precise.

3. **Return the next safe route.** Producer phases must include the chain handoff question; status questions should use the work-item query layer for ready, blocked, claimed, stale, orphan, delegated inbox, duplicate, drift, and integration views. Ask before mutation.

Advanced loop helpers are direct routes: `/supervibe-loop --quickstart` creates safe local folders, `/supervibe-loop --onboard` reports readiness, `/supervibe-loop --watch` writes a read-only heartbeat snapshot, `/supervibe-loop --defer <item> --until <timestamp>` defers local graph work, `/supervibe-loop --notify terminal,inbox` routes bounded run events, `/supervibe-loop --export-sync-bundle` creates a redacted portable bundle, `/supervibe-loop --import-sync-bundle --dry-run` validates incoming bundles without remote mutation, `/supervibe-loop --eval` runs local replay evals and scorecards, `/supervibe-loop --eval-live` is opt-in and budget-gated, `/supervibe-status --eval-report` prints local eval summaries, `/supervibe-status --dashboard` writes a static run dashboard, `/supervibe-status --integrations` reports optional external integrations, `/supervibe-status --view|--query` filters large work-item graphs, `/supervibe-status --save-view` stores portable local views, `/supervibe-status --report daily|weekly|sla` renders redacted markdown reports, `/supervibe --interactive` and `/supervibe-status --interactive` open the optional command palette when a TTY exists, `/supervibe-loop --create-work-item --interactive` opens guided local forms with no-tty fallback, `/supervibe-loop --atomize-plan <plan> --preview` shows a redacted dry-run preview, and `/supervibe-loop --completion <shell>` prints shell completions.

4. **Ask for confirmation** before running anything destructive. `/supervibe-update` and `/supervibe-adapt` modify files — explicit "yes" required. `/supervibe-audit` and `/supervibe-score --record` are read-only scoring/persistence flows and can run immediately if the user agrees.

## Output contract

Mirrors what `evolve-detect.mjs` prints, plus a one-line conclusion:

```
=== Supervibe State ===
Project:  <path>
Plugin:   <path>

  ✓ upstream-behind             → plugin is up to date with upstream
  ✓ version-bump-unacked        → project + plugin both on 1.9.0
  ⚠ project-not-scaffolded      → no .claude/agents/ and no CLAUDE.md — run genesis first
  ✓ underperformers             → 12 invocations, no underperformers
  ✓ stale-artifacts             → 0 stale artifact(s) (under 3-threshold)
  ✓ override-rate-high          → override rate 1.2% (under threshold)
  ✓ pending-evaluation          → latest invocation already has outcome

Proposed: /supervibe-genesis
Why:      no .claude/agents/ and no CLAUDE.md — run genesis first

Confidence: N/A    Rubric: read-only-research
```

## When NOT to invoke

- You already know which phase you want — call it directly. The dispatcher adds a round-trip you can skip.
- You only want a one-off score — `/supervibe-score`.
- You are diagnosing a specific bug — `supervibe:systematic-debugging` skill is more direct.

## Related

- `scripts/lib/supervibe-state-detector.mjs` — the deterministic detector (7 checks, all unit-tested)
- `tests/supervibe-state-detector.test.mjs` — covers each check's triggered + not-triggered paths
- All `/supervibe-*` phase commands — what this dispatcher proposes
- `npm run supervibe:status` — overlapping but more index-focused
