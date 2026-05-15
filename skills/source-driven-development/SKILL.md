---
name: source-driven-development
namespace: development
description: >-
  Use before framework, dependency, provider, or API implementation to ground
  decisions in local code, package versions, and official current sources.
allowed-tools:
  - Bash
  - Read
phase: implementation
prerequisites: []
emits-artifact: source-evidence-report
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1
last-verified: 2026-05-13T00:00:00.000Z
---

# Source Driven Development

## Overview

Source-driven development prevents agents from coding from memory when local
versions, provider capabilities, security posture, or official API behavior
matter. The skill turns "check the docs" into a repeatable evidence workflow:
detect the exact local version, read nearby code and graph usage, verify primary
sources, resolve conflicts, mark anything unverified, and only then implement a
small source-backed change.

## User Outcome

Users get dependency, provider, framework, and API changes that match the
repository they actually have, not generic examples for another major version.
When evidence is incomplete, the output names the gap, the stale source, the
local fallback, and the residual risk instead of pretending the claim is current.

## When to Use

Use before coding, reviewing, or recommending changes against:

- Frontend or backend frameworks where behavior varies by version, router mode,
  compiler, runtime, build tool, or plugin.
- Dependencies, SDKs, CLIs, providers, model APIs, payment APIs, auth APIs,
  database drivers, schemas, migration tools, or config formats.
- Security-sensitive packages, cryptography, auth/session code, CORS, CSP,
  sandboxing, secrets handling, rate limits, permissions, and supply-chain
  settings.
- Any work where official docs, local lockfiles, local adapters, or provider
  capability matrices may disagree.

## Expert Operating Standard

Follow
[`docs/references/skill-expert-operating-standard.md`](../../docs/references/skill-expert-operating-standard.md):
start from source of truth, preserve retrieval evidence, apply scope safety, use
real producers with runtime receipts for durable delegated outputs, verify
before completion claims, and keep confidence below gate when evidence is
partial.

Also apply
[`docs/references/authoritative-source-catalog.md`](../../docs/references/authoritative-source-catalog.md)
and
[`docs/references/source-freshness-policy.md`](../../docs/references/source-freshness-policy.md):
map official sources to catalog ids when available, record freshness state and
fallback used, and treat unknown source freshness as a blocker for 10/10 claims
in the affected specialty.

## Step 0 - Read source of truth

Before implementation, read the local source of truth in this order:

1. User request, claimed task, host instructions, project memory, and scope
   boundary.
2. Local dependency manifests, lockfiles, runtime files, provider configs,
   environment schemas, generated clients, and existing adapters.
3. Code RAG for unfamiliar code, and CodeGraph before rename, move, delete,
   extraction, shared behavior, or public API changes.
4. Official docs, release notes, API references, source repositories, standards,
   provider capability matrices, and security advisories for the detected
   version, mapped to catalog ids and freshness states from
   [`docs/references/authoritative-source-catalog.md`](../../docs/references/authoritative-source-catalog.md)
   and
   [`docs/references/source-freshness-policy.md`](../../docs/references/source-freshness-policy.md).
5. [`references/source-driven-official-doc-cache.md`](../../references/source-driven-official-doc-cache.md)
   and [`scripts/lib/source-driven-doc-cache.mjs`](../../scripts/lib/source-driven-doc-cache.mjs)
   when cached official docs need freshness-aware revalidation decisions.

## When not to use

- Do not use this skill for stable local-only refactors with no dependency, provider, or API assumptions.
- Do not use cached docs as final proof without origin freshness evidence.
- Do not override established local patterns unless official sources prove the local pattern is unsafe or obsolete.
- Do not expand the work into dependency upgrades, provider migrations, or
  security rewrites unless the claimed task or user explicitly includes that
  scope.

## Scope Boundary

This skill governs evidence gathering and implementation decisions for
framework, dependency, provider, API, schema, and security-sensitive work. It can
recommend a pause, a targeted upgrade, a compatibility shim, or a smaller local
change, but it does not authorize broad migrations, package upgrades, provider
switches, or policy exceptions by itself.

## Non-Goals

- Do not produce a permanent mirror of vendor documentation.
- Do not treat Stack Overflow, blog posts, model memory, or cached snippets as
  primary authority when official sources exist.
- Do not resolve every unrelated stale dependency discovered during evidence
  collection.
- Do not replace reviewer, security-auditor, release, or receipt gates required
  by the active workflow.

## Decision tree

```text
Library version unknown? -> inspect lockfile/config before using docs or examples
Provider/model capability unknown? -> read provider config and current capability docs
Docs are stale, undated, cached, or version-mismatched? -> revalidate origin or mark unverified
Source freshness is unknown? -> cap confidence per policy and block 10/10 for the affected specialty
Local code contradicts current docs? -> preserve local compatibility unless security or data-loss risk is proven
Official docs contradict security advisory or changelog? -> prefer advisory/changelog and escalate risk
Security/compliance/payment/auth/API boundary? -> require primary source, exact citation, and residual-risk note
```

## Procedure

1. Detect local versions and capabilities. Read package managers and config in
   priority order: lockfile, manifest, workspace file, generated client metadata,
   runtime config, provider config, environment schema, then deployment config.
   Record the exact file and field used.
2. Identify local behavior. Read the closest implementation, tests, adapters,
   generated clients, feature flags, and migration history. Use Code RAG for
   unfamiliar areas and CodeGraph for shared symbols, public APIs, or call-site
   impact.
3. Build the source hierarchy. Prefer local code for actual deployed behavior;
   prefer official current docs for intended upstream behavior; prefer release
   notes, migration guides, API specs, source repositories, and advisories over
   tutorials; use secondary sources only as search leads. Cite catalog ids from
   `docs/references/authoritative-source-catalog.md` when present.
4. Revalidate official docs. For unstable, provider, release, auth, payment,
   security, or API facts, fetch the origin or use the official doc cache runtime
   to plan conditional requests. A cached entry is not final proof until origin
   `200` or proven `304` revalidation succeeds.
5. Apply citation rules. Record source path and line for local code; record URL,
   retrieved/revalidated date, product version, and section or anchor for
   official sources; record lockfile/config path and package/provider version.
6. Mark uncertainty. Use `UNVERIFIED:` for facts that could not be revalidated,
   `STALE-DOC:` for cached/undated/version-mismatched docs, and `LOCAL-WINS:`
   when implementation follows repository compatibility instead of current docs.
7. Decide conflicts. If docs and local code disagree, choose the least risky
   compatibility decision: keep local behavior, add a version guard, isolate the
   change behind existing adapters, or stop for user/reviewer input when the
   mismatch affects data, auth, money, privacy, or public APIs.
8. Implement the smallest source-backed change. Keep changes inside scope,
   update tests or docs only where needed, and avoid opportunistic upgrades.
9. Verify with targeted commands and report residual risk. Completion claims
   need verification evidence; when origin docs, CodeGraph, or local tests were
   unavailable, keep confidence below gate and say why.

## Version and Provider Detection

- npm/pnpm/yarn/bun: read `package-lock.json`, `npm-shrinkwrap.json`,
  `pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb` first, then `package.json`,
  workspace files, and framework config.
- Python: read `uv.lock`, `poetry.lock`, `Pipfile.lock`, `requirements*.txt`,
  `pyproject.toml`, generated OpenAPI clients, and deployment images.
- Ruby/PHP/Java/.NET/Go/Rust/mobile: read `Gemfile.lock`,
  `composer.lock`, Gradle/Maven lock or resolved dependency reports,
  `.csproj`/`packages.lock.json`, `go.mod` plus `go.sum`, `Cargo.lock`,
  `Podfile.lock`, `Package.resolved`, and platform manifests.
- Providers and APIs: read local provider config, SDK version, model/provider
  capability matrix, API version headers, generated schema version, endpoint
  base URL, auth mode, retry/timeout settings, and environment-specific
  overrides.
- If only a semver range is available, do not assume the installed version.
  Mark `UNVERIFIED: installed version unresolved` and avoid version-specific
  APIs until lockfile, runtime output, or user confirmation resolves it.

## Source Hierarchy and Citations

Use this hierarchy unless the active workflow sets a stricter one:

1. Local runtime behavior: code, lockfiles, configs, tests, generated artifacts,
   migrations, feature flags, and deployment manifests.
2. Official primary sources: vendor docs, API specs, release notes, migration
   guides, standards, source repos, security advisories, provider status or
   capability pages.
3. Project memory, Code RAG, and CodeGraph: prior decisions, relevant symbols,
   impact radius, and known repository constraints.
4. Secondary sources: blog posts, issues, answers, examples, and model memory
   used only as leads to primary sources.

Citation format for the output contract:

- Local: `path:line`, symbol name when available, and detected version/config
  field.
- Official: URL, product/version, retrieved or revalidated date, response proof
  such as `origin-200`, `origin-304`, `etag`, or `last-modified`, and relevant
  section/anchor.
- Cache: cache status from `planOfficialDocCacheRead` or
  `applyOfficialDocCacheResponse`, revalidation headers used, and whether the
  result is final proof.
- Freshness: catalog id, freshness state, last verified date, refresh cadence,
  fallback used, and confidence cap from
  `docs/references/source-freshness-policy.md`.

## Common rationalizations

- "I remember this API" - false for moving libraries, SDKs, and provider CLIs.
- "A blog example is enough" - false when official docs or source are available.
- "The lockfile does not matter" - false because examples often target a different major version.
- "The docs page loaded, so it is current" - false unless the page matches the
  detected version and the retrieval or revalidation date is recorded.
- "The provider config is obvious" - false when model availability, regions,
  API versions, auth mode, quotas, or sandbox/production flags change behavior.
- "Local code is old, so docs win" - false until compatibility, migration risk,
  and tests prove the local behavior can change safely.

## Red flags

- No package version or provider capability was recorded.
- The answer cites secondary content while official docs exist.
- CodeGraph or local usage was skipped before changing shared behavior.
- A cached official doc is treated as final proof without origin `200` or proven
  `304` revalidation.
- A security, auth, payment, privacy, or provider API decision lacks exact
  primary-source citation and residual-risk language.
- Examples from a different router mode, runtime, SDK major, API version,
  provider region, or schema version are copied into local code.

## Checklist

- Version/source evidence recorded.
- Local pattern and CodeGraph usage checked.
- Official docs revalidated if unstable.
- Conflict handling documented.
- Targeted verification command run.
- `UNVERIFIED:`, `STALE-DOC:`, or `LOCAL-WINS:` markers used where evidence is
  partial, stale, or intentionally local-first.
- Security-sensitive changes include advisory/source citations, rollback or
  disable path, and sandbox/production distinction.

## Failure modes

- Shipping code for the wrong SDK major version.
- Treating stale docs as proof.
- Breaking local conventions by copying generic examples.
- Upgrading a package or provider setting as a side effect of a narrow bug fix.
- Implementing against current docs while the repository is pinned to an older
  runtime, router mode, schema, or API version.
- Omitting provider failure states such as rate limits, auth errors, regional
  capability differences, retries, timeouts, and partial responses.

## Examples

- Frontend framework: for a Next.js router change, detect `next` from the
  lockfile, read `next.config.*`, app/pages directory shape, closest route
  tests, and official routing docs for that exact major. If docs describe the
  App Router but local code uses Pages Router, mark `LOCAL-WINS:` and implement
  the Pages-compatible fix unless the task is a migration.
- Backend framework: for a FastAPI dependency injection change, detect FastAPI
  and Pydantic versions from `uv.lock`, `poetry.lock`, or `requirements*.txt`,
  read existing dependency/test patterns, then cite official docs for the
  detected major. If Pydantic v2 docs conflict with a v1-pinned app, do not copy
  v2 examples.
- Provider config: for an LLM provider feature, read local provider config,
  model id, API version headers, retry/timeout policy, and capability matrix.
  Cite current provider docs and record rate-limit, auth, region, and fallback
  behavior before changing defaults.
- API schema: for an OpenAPI or GraphQL change, read generated client metadata,
  schema version, server route, validation layer, and contract tests. Prefer the
  checked-in schema for local compatibility and mark `STALE-DOC:` if public docs
  describe fields absent from the generated client.
- Security-sensitive dependency: for JWT, OAuth, crypto, CORS, CSP, or
  serialization work, detect installed library and transitive version, read
  security advisories and official migration notes, cite exact versions, and
  stop for reviewer input if the safe fix needs a major upgrade or auth contract
  change outside scope.
- Anti-example: do not patch a payment provider SDK call from a blog post when
  the local lockfile pins an older SDK, the provider has API-version headers,
  and the origin docs have not been revalidated.

## Output contract

Return:

- `userOutcome`: the concrete user-facing behavior or risk reduction the
  source-driven work enables.
- `scopeBoundary`: what was intentionally included and excluded.
- `localVersionEvidence`: lockfile/config paths, detected package/provider/API
  versions, and unresolved version gaps.
- `localPattern`: local files, tests, symbols, adapters, Code RAG chunks, and
  CodeGraph symbols or fallback reason.
- `officialSources`: primary-source citations with URL, product version,
  retrieval/revalidation date, cache status, proof status, and catalog ids when
  available.
- `freshnessPolicy`: freshness state, last verified date, refresh cadence,
  fallback used, confidence cap, and whether unknown freshness blocks 10/10 for
  the affected specialty.
- `sourceHierarchy`: sources used in priority order and any secondary sources
  used only as leads.
- `conflicts`: docs-vs-local-code, stale-doc, version, provider-capability, or
  security-advisory conflicts.
- `decision`: chosen compatibility behavior, markers used, and why it is the
  smallest safe source-backed change.
- `verificationCommands`: exact targeted commands run and results.
- `residualRisk`: remaining unverified facts, stale evidence, reviewer needs,
  or release risks.

## Guard rails

- Prefer official docs, source repositories, specs, and local code over generic summaries.
- Do not browse or cache secrets.
- Do not claim current behavior without dated/source evidence.
- Do not claim 10/10 for an affected specialty when source freshness is
  `unknown`, `stale`, or `unavailable`; apply the confidence caps in
  `docs/references/source-freshness-policy.md`.
- Never paste secrets, tokens, customer data, private provider responses, or
  proprietary docs into the official doc cache.
- Do not let source-driven evidence bypass workflow receipts, specialist
  producers, reviewer gates, or security review required elsewhere.
- If official docs are inaccessible and the decision affects security, money,
  privacy, data loss, or production provider behavior, stop or mark the work
  blocked instead of inventing an answer.

## Verification

- `npm run validate:skill-content-quality`
- `npm run validate:artifact-links`

## Related

- `supervibe:code-search`
- `supervibe:project-memory`
- `supervibe:verification`
- `supervibe:doubt-driven-development`
- `supervibe:security-audit`
- [Source Evidence Report](../../references/templates/source-evidence-report.md)
  is the durable template for the evidence table, freshness, conflicts, and
  confidence boundary emitted by this skill.
