---
description: "Bootstrap a host-aware Supervibe scaffold from a stack-pack matched to the detected project stack. Invokes the supervibe:genesis skill end-to-end."
---

# /supervibe-genesis

Set up Supervibe for a fresh project or an existing project that needs host-aware Codex, Claude, Cursor, Gemini or OpenCode instructions.

## Shared Dialogue Contract

Lifecycle: `detected -> profile-review -> dry-run -> approved -> applied -> verified`. Persist state in `.supervibe/memory/genesis/state.json` before every lifecycle transition; dry-run diffs are state artifacts, not throwaway console text.

Every interactive step asks one question at a time using `Step N/M` or `Шаг N/M`. Each question lists the recommended/default option first, gives a one-line tradeoff summary for every option, allows a free-form answer, and names the stop condition.

Default behavior: choose the safest minimal profile, no add-ons, dry-run only until the user approves. Free-form path: the user can name exact agents, rules, host files, or stack constraints instead of choosing a listed profile.

Tool metadata contract: `/supervibe-genesis` exposes stable aliases, input shape, host/context requirements, token-cost hint, write side-effect level and dry-run approval policy through `scripts/lib/supervibe-tool-metadata-contract.mjs`; route only the intent-scoped metadata needed for the current setup.

After every material delivery, ask one explicit next-step question with choices:
- Approve - apply the dry-run scaffold or accept the verified scaffold.
- Refine - user gives one focused change to the scaffold plan.
- Alternative - produce another profile/host/stack-pack option with explicit tradeoffs.
- Deeper review - run status, audit, or confidence scoring before applying.
- Stop - persist current state and exit without claiming silent completion.

Scenario evals assert this post-delivery menu and persisted command state via
`tests/fixtures/scenario-evals/supervibe-user-flows.json`.

## Procedure

1. **Pre-flight check.** Run host detection before assuming `.claude`:
   - Read `CLAUDE.md`, `.claude`, `AGENTS.md`, `.codex`, `.cursor`, `.cursor/rules`, `GEMINI.md`, `.gemini`, `opencode.json` and active CLI hints.
   - Precedence is explicit user override (`SUPERVIBE_HOST`) -> active runtime/current chat hints -> project filesystem markers. Do not select OpenCode only because `.opencode` or `opencode.json` exists when the current chat is running in Codex.
   - If more than one host has strong evidence, ask exactly one host-selection question and stop until the user chooses.
   - If an existing host instruction file already has custom content, plan a dry-run managed-block update instead of overwriting it.

2. **Detect stack.** Invoke the `supervibe:stack-discovery` skill. It reads manifests (`package.json`, `composer.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, etc.) and returns a stack-fingerprint with primary language, framework(s), database(s), queue(s), and confidence per axis.

3. **Confirm intent.** Show the user the detected fingerprint and ask exactly one `Step N/M` question at a time (e.g. monorepo vs single-app first, deployment environments only if still needed). Wait for the answer before the next question.

4. **Choose agent install profile.** Before writing host adapter agents (`.claude/agents`, `.codex/agents`, `.cursor/agents`, `.gemini/agents` or `.opencode/agents`), present profile choices and wait for explicit selection:
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
   - Looks for an exact pack in `$CLAUDE_PLUGIN_ROOT/stack-packs/` (e.g. `laravel-nextjs-postgres-redis`).
   - If no exact match — composes from `stack-packs/_atomic/` per its decision tree, scoring the composition against `confidence-rubrics/scaffold.yaml`.

5a. **Explain index privacy policy.** Before dry-run file output, summarize skipped classes (`generated`, `binary`, `archive`, `secret-like`, `local-config`) using `node scripts/supervibe-status.mjs --index-policy-diagnostics`; never print secret values.

6. **Apply scaffold (with diff gate).** Before any write, present a file-by-file diff for the selected host adapter:
   - `<adapter agents folder>` — copies of profile-selected agents only
   - `<adapter rules folder>` — project-applicable rules
   - `.supervibe/memory/` — Supervibe-owned project memory, indexes and lifecycle state
   - `<adapter instruction file>` — generated or updated with the adapter managed block marker
   - `<adapter settings file>` — host-specific config only when supported
   Wait for user "yes" before writing.

   The dry-run artifact plan must also list selected rules, selected support skills,
   stack-pack root files, husky hooks, directories, and `missingArtifacts`. If
   `missingArtifacts` is non-empty, remediate or ask before applying.

7. **Score the result.** Run `supervibe:confidence-scoring` against the scaffold using `confidence-rubrics/scaffold.yaml`. Required: ≥9 to declare done.

8. **Initialize and verify indexes.** From the target project root, run `node $CLAUDE_PLUGIN_ROOT/scripts/build-code-index.mjs --root . --force --health` before the final status check, then run `npm run supervibe:status` (or `node $CLAUDE_PLUGIN_ROOT/scripts/supervibe-status.mjs`). The banner should show fresh code RAG + graph counts for the project.

8a. **Keep app builds separate.** Do not use application build scripts, framework builds, or other application verification commands as proof that genesis itself succeeded unless the user explicitly asked for that verification or the selected stack-pack lists it as a required post-genesis check. If an application build is run and fails in pre-existing project code, report it as `Project verification failed after genesis` with the command, exit code, and repo-relative error paths only. Do not include absolute local paths, project names, or claim the failure is unrelated unless a pre-genesis baseline proves it.

## Output contract

```
Detected stack:    <fingerprint summary>
Pack chosen:       <pack name>  (composition score: X.X/10)
Install profile:   <minimal | product-design | full-stack | research-heavy | custom>
Add-ons:           <none | security-audit | ai-prompting | project-adaptation | network-ops | custom list>
Files written:     <count>
Confidence:        <N>/10  Rubric: scaffold
Next:              open the project, restart your AI CLI, watch for [evolve] welcome banner
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
