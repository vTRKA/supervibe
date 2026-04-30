---
description: >-
  Use WHEN checking Supervibe health, work-item watch state, delegated inbox, or
  tracker visibility, dashboard output, external integration readiness, saved
  views, structured queries, interactive status palette, or local work reports
  or eval reports TO show a read-only project status report.
---

# /supervibe-status

Shows local index health, preview servers, MCP discovery, task tracker mapping,
read-only work-item watch snapshots, delegated inbox blockers, agent telemetry,
dashboard output, and external integration readiness.
It can also filter large work-item graphs with safe structured queries, apply
saved views, and render local redacted daily/weekly/SLA reports.

## Invocation

```bash
/supervibe-status
/supervibe-status --dashboard --file .claude/memory/loops/<run-id>/state.json --out .claude/memory/loops/<run-id>/dashboard.html
/supervibe-status --integrations
/supervibe-status --integrations --json
/supervibe-status --view ready-now --file .claude/memory/work-items/<epic-id>/graph.json
/supervibe-status --query "status:blocked label:integration sort:age" --file .claude/memory/work-items/<epic-id>/graph.json
/supervibe-status --save-view release-risk --query "risk:high status:not-done" --views-file .claude/memory/work-item-views.json
/supervibe-status --report daily --file .claude/memory/work-items/<epic-id>/graph.json
/supervibe-status --report sla --file .claude/memory/work-items/<epic-id>/graph.json --out .claude/memory/reports/sla.md
/supervibe-status --interactive
/supervibe-status --eval-report
/supervibe-status --eval-report --file .supervibe/audits/autonomous-loop-evals/latest-report.json --json
/supervibe-status --policy
/supervibe-status --policy --policy-profile CI-readonly --json
/supervibe-status --role
/supervibe-status --anchors --file src/example.ts
/supervibe-status --waves --file .claude/memory/loops/<run-id>/state.json
/supervibe-status --assignment task-123 --file .claude/memory/loops/<run-id>/state.json
```

`--dashboard` writes a static offline HTML run dashboard from an existing loop
state file. It redacts local paths, secrets, and raw prompt text before writing.

`--integrations` reports detected local integration capabilities. Network-backed
integrations stay advisory unless an explicit policy approval and allowlisted
target are present; native JSON graph support is always the safe fallback.

`--query` accepts only whitelisted local filters and sort keys such as
`status`, `label`, `priority`, `owner`, `package`, `worktree`, `repo`, `due`,
`stale`, `blocked-reason`, `verification`, and `risk`. It never evaluates code.

`--view` applies built-in or custom saved views. Built-ins include `ready-now`,
`blocked`, `review-needed`, `stale-claims`, `due-soon`, `overdue`, `high-risk`,
`release-gates`, `my-work`, `unowned-work`, and `cross-repo-blockers`.

`--report daily|weekly|sla` renders local markdown summaries with done work,
blocked work, next ready work, risk changes, stale claims, review requests,
release gates, due state, aging, and SLA status. Reports redact secrets, local
user paths, and raw prompts before printing or writing.

`--interactive` opens the opt-in command palette only when a real terminal is
available. In CI, pipes, and agent subprocesses it prints
`SUPERVIBE_INTERACTIVE_FALLBACK` with the equivalent non-interactive command and
exits without mutation.

`--eval-report` prints the latest local autonomous-loop replay eval report.
Reports include replay pass/fail, quality scorecard averages, golden diffs, and
top regressions. They are local artifacts and do not run live tools.

`--policy` prints the active local policy profile, including allowed tools,
denied tools, network/MCP/write modes, runtime limits, and validation issues.
`--role` prints team governance for the current role: storage location, branch
policy, allowed sync, review requirement, metadata visibility, and mutation
permission. Both are read-only and no-tty safe.

`--anchors --file <source>` parses optional semantic anchors from one source
file and prints anchor IDs, file coverage, and verification coverage. It does
not write indexes or edit comments.

`--waves` rebuilds read-only execution wave status from a loop or work-item
state file, including current wave, next serialized work, blockers, and missing
reviewer/worktree conditions. `--assignment <task-id>` prints the stored
assignment explanation for one task: why the worker/reviewer were selected,
which alternatives were rejected, and what evidence the handoff must include.

The work-item watch and delegated inbox sections are observational. They do not
claim, close, or mutate tasks.
