---
name: adapt
namespace: process
description: >-
  Use WHEN stack changed (new modules, renamed files, removed files, new major
  dependencies) to sync agents/skills with new state. Triggers: 'sync проектные
  агенты', 'подтяни upstream', 'обнови агентов под новый стек', 'adapt'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Adapt

## When to invoke

- New directory in `src/modules/` or `src/commands/`
- New major dependency in package.json/composer.json/Cargo.toml
- Files renamed/deleted that artifacts reference
- User runs `/supervibe-adapt`
- Plugin updated and project-level installed agents/rules/skills need refresh without manual deletion

## Shared Dialogue Contract

Lifecycle: `scan -> real-dry-run -> agent-plan -> review -> approved -> applied -> artifact/app/deploy verification`. Persist state in `.supervibe/memory/adapt/state.json` before every lifecycle transition. State must use layered fields: `artifactVerified`, `agentReceiptsVerified`, `appVerified`, and `deployVerified`.

Lifecycle gates are split by phase: `--dry-run` is read-only and may run
without real-agent receipts; `--apply` requires explicit user approval for
writes; `--verify-agents` is the separate runtime smoke gate that can set
`agentReceiptsVerified=true`.

Every interactive step asks one question at a time using `Step N/M` or `Step N/M`. Each question lists the recommended/default option first, gives a one-line tradeoff summary for every option, allows a free-form answer, and names the stop condition.

Default behavior: produce a dry-run adaptation plan and do not edit artifacts until approval. Free-form path: the user can name exact agents, rules, skills, paths, or stack changes to include or exclude.

After every material delivery, ask one explicit next-step question about the adaptation plan. Use `buildPostDeliveryQuestion({ intent: "adaptation_delivery" }, { locale })` when tooling is available. Visible labels must be language-matched and domain-specific; keep internal action ids only in saved state. Never show both English and Russian in the same visible option.

English visible labels:
- Apply adaptation - recommended when the dry-run adaptation plan looks right; apply the selected artifact updates.
- Adjust adaptation plan - user gives one focused agent, rule, skill, path or stack change; rebuild the dry-run without writing files.
- Compare another scope - produce another adaptation scope with explicit tradeoffs.
- Review adaptation deeper - run audit or confidence scoring before applying.
- Stop without adapting - persist current state and exit without changing project artifacts.

Russian visible labels are supplied by
`scripts/lib/supervibe-dialogue-contract.mjs` to keep this skill contract
ASCII-safe for validators. The ru locale must map to the same
adaptation-specific actions above and must not fall back to generic
apply/revise wording.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read `registry.yaml` for current state
2. Run `git diff <verified-against>..HEAD --stat` to find changes. If `.git`
   is absent, do not fail: compare against
   `.supervibe/memory/adapt/file-manifest.json`; after approved apply, write a
   fresh snapshot there.
3. Read changed manifest files for new deps
4. Run or consult `node scripts/supervibe-status.mjs --capabilities` so proposed agent, rule and skill updates are grounded in the capability registry.
5. Resolve the canonical project root before host selection: nearest parent `.supervibe/` wins over nested app host files, then workspace manifest/root `.git`. Resolve the active host adapter before reading or planning writes; use the same precedence as genesis: explicit override -> active runtime/current chat -> filesystem markers.
6. Read `.supervibe/memory/genesis/state.json` when present. Genesis
   decisions such as `appGenerated`, `appVerified`, `appChoice=next-app`, and
   `ignoredStackTags=["vite"]` are source-of-truth for Adapt stack drift.
7. For `/supervibe-adapt`, run `node scripts/supervibe-adapt.mjs --dry-run --summary-json --changed-only` before `command-agent-plan.mjs`, then pass the actual counts with `--dry-run`, `--adds`, `--updates`, `--project-only`, `--conflicts`, and `--memory-writes`.

## Decision tree

```
Stack drift is only tooling or a minor dependency inside the selected app
  -> Update affected context references and verification notes.

Stack drift indicates a new app, framework, service, or runtime boundary
  -> Suggest supervibe:genesis or a component plan before changing agents broadly.

Host instruction file or managed block changed
  -> Use the context migrator and preserve user-owned sections.

Deleted or renamed files are referenced by agents, skills, rules, or commands
  -> Update the artifact or flag the stale reference with grep evidence.

Adapt apply would write project artifacts
  -> Require dry-run evidence and explicit approval before mutation.
```

## Procedure

1. **Diff analysis** — what changed since last `verified-against` commit
2. **Stale references** — grep deleted/renamed paths in artifacts; update or flag
3. **New modules** — determine which agent should cover; update Project Context
4. **New deps**:
   - Minor (new lib in existing stack) → update agent context
   - Major (new framework / new layer) → suggest `supervibe:genesis` for new component
5. **Deleted files** — remove references from artifacts
6. **Host context migration** — if the active host instruction file, `AGENTS.md`, `GEMINI.md`, `.cursor/rules` or `opencode.json` changes, use `scripts/lib/supervibe-context-migrator.mjs` dry-run planning and never overwrite user-owned sections.
7. **Capability registry** — propose affected agents, rules and skills together, including registry evidence and confidence for each linked artifact.
8. **Related-rule closure** - when installed rules reference upstream `related-rules` that are missing from the selected profile, surface them as explicit `ADD` candidates with `mandatory: true/false` instead of leaving validator-only failures.
9. **Version marker** — after approved writes, update `.supervibe/memory/.supervibe-version` so future sessions know the project artifacts match the plugin version.
10. **User-requested project fit** - when the user asks to adapt rules or agents to the project, compare stack tags, selected install profile, existing host artifacts, and capability registry links; then produce an add/keep/defer plan with reasons.
11. **Bump versions** + update `last-verified` + `verified-against`
12. Run `supervibe:audit` to verify clean state
13. For deploy scope, keep add-ons separate from base scaffold. `--scope deploy --target docker|dokploy` may create compose/Docker/env/docs artifacts, but must not auto-migrate or claim `deployVerified` without a real deploy health check.

Additional drift policy:

- `vite` inside an existing Genesis `next-app` is an ambiguity, not an
  automatic stack switch. Classify it as accidental, tooling-only, or a
  separate Vite SPA.
- `next` inside an existing `vite-spa` is migration/new-app evidence and needs
  a Genesis/component plan.
- Dependency drift blocks `npm audit fix --force` when it downgrades a
  framework major/minor line. Compatible nested dependency repair must surface
  `overrides`/`resolutions`, remediation reason, and the rerun sequence:
  `npm install`, `npm audit`, lint, build, and `dependency-health`.
- Deploy drift is service-evidence based, not folder-name based. Detect any
  number of supported services from manifests:
  `next-only`, `laravel-postgres`, or `laravel-next-postgres`. Generate
  service-local Dockerfiles only for detected supported services. Never create a
  Laravel/backend service, Postgres, queue, scheduler, or `php artisan` command
  without Laravel evidence; never create a Next/frontend service without Next.js
  evidence. Unsupported services must be listed as unsupported and require a
  new stack pack or explicit user approval before Dockerfiles are generated.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

## Output contract

Returns:
- List of updated artifacts
- List of project-fit agent/rule/skill recommendations with evidence
- List of suggestions (where genesis is needed for major changes)
- Pre/post audit diff

## Guard rails

- DO NOT: delete agents/skills (rename/archive instead)
- DO NOT: tell the user to delete all generated project artifacts after plugin updates; use diff-gated adapt instead
- DO NOT: write `.supervibe/memory/index.json` during dry-run unless the user requested `--refresh-memory-index`
- DO NOT: treat no `.git` as fatal; use the Adapt file-manifest snapshot fallback.
- DO NOT: let package tags override Genesis app choice without a frontend target decision.
- DO NOT: assume a project has exactly `frontend/` and `backend/`; service
  discovery must support multiple service directories and must block unknown
  technologies instead of guessing.
- DO NOT: claim real agents completed when `.supervibe/memory/agent-invocations.jsonl` or trusted runtime receipts are absent
- DO NOT: invent new agent (suggest genesis for new components)
- ALWAYS: re-audit after adapt to verify clean

## Verification

- Confirm every emitted artifact exists and matches the Output contract.
- Run the validator, test, dry-run, or audit command named by this skill when one exists.
- Include concrete command/output evidence before claiming the skill completed successfully.
- If verification cannot run, state the blocker and keep confidence below the passing gate.

## Related

- `supervibe:audit` — pre + post check
- `supervibe:genesis` — invoked for new major components
