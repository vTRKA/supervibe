---
description: "Bootstrap a host-aware Supervibe scaffold from a stack-pack matched to the detected project stack. Invokes the supervibe:genesis skill end-to-end."
---

# /supervibe-genesis

Set up Supervibe for a fresh project or an existing project that needs host-aware Codex, Claude, Cursor, Gemini or OpenCode instructions.

## Invocation

```bash
/supervibe-genesis
/supervibe-genesis --dry-run
/supervibe-genesis --profile minimal
/supervibe-genesis --profile product-design --host codex
```

## Shared Dialogue Contract

Lifecycle: `detected -> profile-review -> dry-run -> approved -> applied -> verified`. Persist state in `.supervibe/memory/genesis/state.json` before every lifecycle transition; dry-run diffs are state artifacts, not throwaway console text.

Every interactive step asks one question at a time using `Step N/M` or `Step N/M`. Each question lists the recommended/default option first, gives a one-line tradeoff summary for every option, allows a free-form answer, and names the stop condition.

Default behavior: choose the safest minimal profile, no add-ons, dry-run only until the user approves. Free-form path: the user can name exact agents, rules, host files, or stack constraints instead of choosing a listed profile.

User-facing transparency is part of the command, not optional polish. Before asking for approval, show:
- the host adapter chosen and why;
- the detected stack evidence;
- the selected agent groups;
- each selected agent with a one-line responsibility from `docs/agent-roster.md` / `scripts/lib/supervibe-agent-roster.mjs`;
- which rules, skills, memory/index files and host instruction files will be created or updated;
- how to update these artifacts later with `/supervibe-update` + `/supervibe-adapt`.

Tool metadata contract: `/supervibe-genesis` exposes stable aliases, input shape, host/context requirements, token-cost hint, write side-effect level and dry-run approval policy through `scripts/lib/supervibe-tool-metadata-contract.mjs`; route only the intent-scoped metadata needed for the current setup.

After every material delivery, ask one explicit next-step question about the scaffold decision. Use `buildPostDeliveryQuestion({ intent: "genesis_setup" }, { locale })` when tooling is available. Visible labels must be language-matched and domain-specific; keep internal action ids only in saved state. Never show both English and Russian in the same visible option. Never use a generic next-step prompt for Genesis.

English visible labels:
- Apply scaffold - recommended only when the dry-run host, profile, agents, rules and files look correct; write the scaffold and run index/status checks.
- Adjust install plan - user gives one focused host, profile, add-on, stack-pack, agent or rule change; rebuild dry-run without writing files.
- Compare another set - produce another profile, host or agent/rule set with explicit tradeoffs before any write.
- Review dry-run deeper - run status, audit or confidence scoring before applying the scaffold.
- Stop without installing - persist current dry-run state and exit without changing the project.

Russian visible labels:
- Apply scaffold - recommended only when dry-run host, profile, agents, rules, and files look correct; write the scaffold and run index/status checks.
- Adjust install plan - user gives one focused host, profile, add-on, stack-pack, agent, or rule change; rebuild dry-run without writing files.
- Compare another set - prepare another profile, host, or agent/rule set with explicit tradeoffs before writing files.
- Review dry-run deeper - run status, audit, or confidence scoring before applying the scaffold.
- Stop without installing - persist current dry-run state and exit without project changes.

Scenario evals assert this post-delivery menu and persisted command state via
`tests/fixtures/scenario-evals/supervibe-user-flows.json`.

## Procedure

1. **Pre-flight check.** Run host detection before assuming any provider folder:
   - Read supported host instruction files, host marker folders and active CLI hints through the host detector instead of naming one provider as the default.
   - Precedence is explicit user override (`SUPERVIBE_HOST`) -> active runtime/current chat hints -> project filesystem markers. Do not select OpenCode only because `.opencode` or `opencode.json` exists when the current chat is running in Codex.
   - If more than one host has strong evidence, ask exactly one host-selection question and stop until the user chooses.
   - If an existing host instruction file already has custom content, plan a dry-run managed-block update instead of overwriting it.

2. **Detect stack.** Invoke the `supervibe:stack-discovery` skill. It reads manifests (`package.json`, `composer.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, etc.) and returns a stack-fingerprint with primary language, framework(s), database(s), queue(s), and confidence per axis.

3. **Confirm intent.** Show the user the detected fingerprint and ask exactly one `Step N/M` question at a time (e.g. monorepo vs single-app first, deployment environments only if still needed). Wait for the answer before the next question.

4. **Choose agent install profile.** Before writing host adapter agents (`<adapter>/agents` as resolved by host detection), present profile choices and wait for explicit selection:
   - `minimal` — core router, repo research, code review, quality gate, stack developer(s). Fastest install; recommended default.
   - `product-design` — minimal + product manager, systems analyst, UX/UI designer, prototype builder, presentation agents, copywriter, accessibility/polish reviewers.
   - `full-stack` — product-design + ops/security/data/performance specialists for larger teams.
   - `research-heavy` — minimal + researcher agents for uncertain stacks, stale dependencies, security or best-practice discovery.
   - `custom` — show grouped agent list and let the user add/remove groups.

   Do not silently install every agent in the stack-pack. The stack-pack is a catalog; the selected profile is the install plan.

4a. **Choose optional add-ons.** After the base profile, ask one explicit add-on question. Default is `none`.
   - `ai-prompting` - installs `prompt-ai-engineer` for prompts, agent instructions, intent routing, prompt evals, and prompt-injection hardening.
   - `project-adaptation` - installs `rules-curator`, `memory-curator`, and supporting research so user-requested project-specific rule/agent gap closing is deliberate.
   - `security-audit` — installs the multi-agent security audit chain used by `/supervibe-security-audit`.
   - `network-ops` — installs `network-router-engineer`; never default because router/server mutations require scoped approval.
   - `none` — keep the base profile only.

   New high-risk or specialized agents are never copied into a project silently. They must be selected through an add-on or `custom`.

5. **Match a stack-pack.** Invoke the `supervibe:genesis` skill with the fingerprint + selected profile. The skill:
   - Looks for an exact pack in the resolved Supervibe plugin root under `stack-packs/` (e.g. `laravel-nextjs-postgres-redis`).
   - If no exact match — composes from `stack-packs/_atomic/` per its decision tree, scoring the composition against `confidence-rubrics/scaffold.yaml`.

5a. **Explain index privacy policy.** Before dry-run file output, summarize skipped classes (`generated`, `binary`, `archive`, `secret-like`, `local-config`) using `node scripts/supervibe-status.mjs --index-policy-diagnostics`; never print secret values.
   Also point to `.supervibe/memory/index-config.json`: user exclusions there hide files from Code RAG + Code Graph, while privacy blocks for secrets, archives, binaries and local config always win.

6. **Apply scaffold (with diff gate).** Before any write, present a file-by-file diff for the selected host adapter:
   - `<adapter agents folder>` — copies of profile-selected agents only
   - `<adapter rules folder>` — project-applicable rules plus upstream `related-rules` closure so validator cannot fail on a profile-only omission
   - `.supervibe/memory/` — Supervibe-owned project memory, indexes and lifecycle state
   - `<adapter instruction file>` — generated or updated with the adapter managed block marker
   - `<adapter settings file>` — host-specific config only when supported
   Wait for user "yes" before writing.

   The dry-run artifact plan must also list selected rules, selected support skills,
   stack-pack root files, husky hooks, directories, and `missingArtifacts`. If
   `missingArtifacts` is non-empty, remediate or ask before applying.

7. **Score the result.** Run `supervibe:confidence-scoring` against the scaffold using `confidence-rubrics/scaffold.yaml`. Required: ≥9 to declare done.

8. **Initialize and verify indexes.** From the target project root, first make source RAG ready with bounded atomic batches: `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress`. The indexer logs heartbeat/progress lines with stage, current file, processed/remaining counts, elapsed time, ETA and checkpoint path, and writes `.supervibe/memory/code-index-checkpoint.json` after each file/batch. It also uses `.supervibe/memory/code-index.lock` to block duplicate indexers and removes stale locks whose PID is gone. If the run stops at `SUPERVIBE_INDEX_BOUNDED_TIMEOUT`, inspect gaps with `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --list-missing`, then rerun the same `--resume --source-only --max-files 200 --max-seconds 120 --health --json-progress` command until source coverage is healthy. Graph warning output is not a genesis failure when source RAG coverage is healthy. Build graph/semantic data separately with `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health`; only use `--strict-index-health` when explicitly auditing graph extraction. Then run `npm run supervibe:status` or `node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs`. The banner should show source coverage as `indexed/eligible`, fresh code RAG counts, graph warnings separately, and `SUPERVIBE_INDEX_CONFIG` with `REFRESH_INTERVAL: 5m`.

8a. **Keep app builds separate.** Do not use application build scripts, framework builds, or other application verification commands as proof that genesis itself succeeded unless the user explicitly asked for that verification or the selected stack-pack lists it as a required post-genesis check. If an application build is run and fails in pre-existing project code, report it as `Project verification failed after genesis` with the command, exit code, and repo-relative error paths only. Do not include absolute local paths, project names, or claim the failure is unrelated unless a pre-genesis baseline proves it.

## Output contract

```
Detected stack:    <fingerprint summary>
Pack chosen:       <pack name>  (composition score: X.X/10)
Install profile:   <minimal | product-design | full-stack | research-heavy | custom>
Add-ons:           <none | security-audit | ai-prompting | project-adaptation | network-ops | custom list>
Agent roles:       <agent id -> responsibility list or docs/agent-roster.md reference>
Files written:     <count>
Confidence:        <N>/10  Rubric: scaffold
Next:              open the project, restart your AI CLI, watch for [supervibe] welcome banner; after plugin updates use /supervibe-update then /supervibe-adapt
```

## When NOT to invoke

- Project already has host adapter agents with custom edits — use `/supervibe-adapt` instead
- User just wants to score an existing artifact — use `/supervibe-score`
- User wants per-feature scaffolding (not the whole project) — use the `supervibe:new-feature` skill directly

## Related

- `supervibe:stack-discovery` — produces the fingerprint
- `supervibe:genesis` skill — does the actual composition + write
- `supervibe:confidence-scoring` — final gate
- `/supervibe-adapt` — what to use when the project is already scaffolded

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-genesis` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, required agents, and durable-write permission before any agent-owned artifact is produced.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
