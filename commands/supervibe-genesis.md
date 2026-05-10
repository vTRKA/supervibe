---
description: "Bootstrap a host-aware Supervibe scaffold from a stack-pack matched to the detected project stack. Invokes the supervibe:genesis skill end-to-end."
last-verified: "2026-05-08"
---

# /supervibe-genesis

Set up Supervibe for a fresh project or an existing project that needs host-aware Codex, Claude, Cursor, Gemini or OpenCode instructions.

## Invocation

```bash
/supervibe-genesis
/supervibe-genesis --dry-run
/supervibe-genesis --profile minimal
/supervibe-genesis --profile product-design --host codex
supervibe-genesis --dry-run --target .
supervibe-genesis --apply --host codex --stack-tags nextjs,laravel,postgres
supervibe-genesis --apply --addons github-actions --host codex --stack-tags nextjs,laravel,postgres
supervibe-genesis --apply --generate-apps --verify-apps --app-choice next-app
```

Terminal runner: `supervibe-genesis` is executable for deterministic dry-run,
state persistence, and approved scaffold apply. The runner writes
`.supervibe/memory/genesis/state.json` during dry-run, but project scaffold
files are written only with explicit `--apply`. It accepts `--profile`,
`--addons`, `--host`, `--stack-tags`, `--request`, `--app-choice`,
`--generate-apps`, `--verify-apps`, and `--json` so empty projects can use the
stack named by the user instead of relying only on manifests.

## Shared Dialogue Contract

Lifecycle: `detected -> profile-review -> dry-run -> approved -> applied -> artifact/app/deploy verification`. Persist state in `.supervibe/memory/genesis/state.json` before every lifecycle transition; dry-run diffs are state artifacts, not throwaway console text. State uses layered verification fields: `artifactVerified`, `agentReceiptsVerified`, `appVerified`, and `deployVerified`.

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

Russian visible labels are supplied by
`scripts/lib/supervibe-dialogue-contract.mjs` to keep this command contract
ASCII-safe for validators. The ru locale must map to the same scaffold-specific
actions above and must not fall back to generic apply/revise wording.

Scenario evals assert this post-delivery menu and persisted command state via
`tests/fixtures/scenario-evals/supervibe-user-flows.json`.

## Procedure

1. **Pre-flight check.** Run host detection before assuming any provider folder:
   - Read supported host instruction files, host marker folders and active CLI hints through the host detector instead of naming one provider as the default.
   - Precedence is explicit user override (`SUPERVIBE_HOST`) -> active runtime/current chat hints -> project filesystem markers. Do not select OpenCode only because `.opencode` or `opencode.json` exists when the current chat is running in Codex.
   - If more than one host has strong evidence, ask exactly one host-selection question and stop until the user chooses.
   - If an existing host instruction file already has custom content, plan a dry-run managed-block update instead of overwriting it.

2. **Detect stack.** Invoke the `supervibe:stack-discovery` skill. It reads manifests (`package.json`, `composer.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, etc.) and returns a stack-fingerprint with primary language, framework(s), database(s), queue(s), and confidence per axis.

2a. **Resolve frontend target.** Before dry-run output, run the shared
   `scripts/lib/frontend-target-resolver.mjs` policy. `next-app` is a single
   Next.js app on Turbopack, `vite-spa` is a standalone Vite SPA,
   `monorepo-two-frontends` means separate app dirs, and `tooling-only` keeps
   the resolved app target unchanged. If the request says "React/Next.js/Vite"
   without an explicit separate frontend, default to `next-app`, mark `vite` as
   ignored for app generation, and show the alternatives in the dry-run.

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
   - `github-actions` - creates `.github/workflows/supervibe-ci.yml`; base scaffold creates no CI workflow.
   - `gitlab-ci` - creates `.gitlab-ci.yml`; base scaffold creates no CI workflow.
   - `ci-ready` - creates provider-neutral CI notes without choosing a provider.
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

6a. **Keep app generation separate.** Base stack-packs create truthful
   placeholders such as `backend/` and `frontend/`; they must not call these
   Laravel, Next.js, or Vite skeletons until real framework scaffolders run. The
   separate approved `generate-apps` step records commands such as
   `composer create-project laravel/laravel backend`,
   `npx create-next-app@latest frontend ... --disable-git`, or
   `npm create vite@latest frontend ...`. Do not run these commands without
   explicit approval and dependency availability. After a successful app
   scaffolder, normalize unintended nested `.git` and generated app-local host
   files back under the canonical Supervibe root. Record app generation and app
   verification separately; `appVerified=true` requires explicit lint/build
   verification such as `--verify-apps`.

6b. **Keep agent runtime proof separate.** `--dry-run`, `--apply`, and
   `--generate-apps` are bootstrap-pre-agent phases. They may write dry-run
   state, scaffold files, or approved framework apps, but they must not claim
   real-agent completion. Use the separate `--verify-agents` smoke gate for
   `agentReceiptsVerified=true`.

7. **Score the result.** Run `supervibe:confidence-scoring` against the scaffold using `confidence-rubrics/scaffold.yaml`. Required: ≥9 to declare done.

8. **Initialize and verify indexes.** From the target project root, first make source RAG ready with bounded atomic batches: `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress`. The indexer logs heartbeat/progress lines with stage, current file, processed/remaining counts, elapsed time, ETA and checkpoint path, and writes `.supervibe/memory/code-index-checkpoint.json` after each file/batch. It also uses `.supervibe/memory/code-index.lock` to block duplicate indexers and removes stale locks whose PID is gone. If the run stops at `SUPERVIBE_INDEX_BOUNDED_TIMEOUT`, inspect gaps with `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --list-missing`, then rerun the same `--resume --source-only --max-files 200 --max-seconds 120 --health --json-progress` command until source coverage is healthy. Graph warning output is not a genesis failure when source RAG coverage is healthy. Build graph/semantic data separately with `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health`; only use `--strict-index-health` when explicitly auditing graph extraction. Then run `npm run supervibe:status` or `node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs`. The banner should show source coverage as `indexed/eligible`, fresh code RAG counts, graph warnings separately, and `SUPERVIBE_INDEX_CONFIG` with `REFRESH_INTERVAL: 5m`.

8a. **Keep app builds separate.** Do not use application build scripts, framework builds, or other application verification commands as proof that genesis itself succeeded unless the user explicitly asked for that verification or the selected stack-pack lists it as a required post-genesis check. If an application build is run and fails in pre-existing project code, report it as `Project verification failed after genesis` with the command, exit code, and repo-relative error paths only. Do not include absolute local paths, project names, or claim the failure is unrelated unless a pre-genesis baseline proves it.

## Output contract

```
Detected stack:    <fingerprint summary>
Pack chosen:       <pack name>  (composition score: X.X/10)
Install profile:   <minimal | product-design | full-stack | research-heavy | custom>
Add-ons:           <none | security-audit | ai-prompting | project-adaptation | github-actions | gitlab-ci | ci-ready | network-ops | custom list>
Agent roles:       <agent id -> responsibility list or docs/agent-roster.md reference>
Files written:     <count>
Confidence:        <N>/10  Rubric: scaffold
Next:              open the project, restart your AI CLI, watch for [supervibe] welcome banner; after plugin updates use /supervibe-update then /supervibe-adapt
Verification:      artifactVerified=<bool> agentReceiptsVerified=<bool> appVerified=<bool> deployVerified=<bool>
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

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-genesis` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, `AGENT_SELECTION_MODE`, required agents, `REQUIRED_AGENT_SOURCES`, `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, `MISSING_CALLABLE_AGENTS`, and durable-write permission before any agent-owned artifact is produced. Role sources must distinguish definition availability from host-callable availability: `REQUIRED_AGENT_SOURCES` may include `plugin-only`, but `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, and `MISSING_CALLABLE_AGENTS` decide whether the selected host can actually invoke the role. Plugin-only definitions are not enough for a real-agent completion claim. For a first install into an empty project, the executable runner may use `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-genesis --dry-run|--apply|--generate-apps --installed-only` or `--bootstrap-pre-agent` to allow base scaffold/state/app-generation phases before project agents exist. This exception does not allow specialist-owned output or completion claims; rebuild the real-agent plan or run `--verify-agents` after the scaffold installs agents.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. For active workflows, build the plan with `--active --slug <slug> --handoff-id <handoff-id>`; `SCOPED_RECEIPT_GATE` must be trusted for the current run before durable agent-owned outputs are allowed. Old global receipts are diagnostic only and do not unlock a new command/handoff. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Scoped current-run receipts are required for active command/handoff claims; old global receipts are diagnostic only and cannot authorize a new agent-owned output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
