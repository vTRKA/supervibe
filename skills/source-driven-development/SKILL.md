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

## When to invoke

Use before coding against libraries, frameworks, providers, CLIs, SDKs, config files, schemas, or APIs whose behavior can differ by version or host.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Read local dependency manifests, lockfiles, provider configs, existing adapters, and official docs for the exact version. Use `references/source-driven-official-doc-cache.md` for cache policy and `scripts/lib/source-driven-doc-cache.mjs` when tooling needs freshness-aware revalidation decisions.

## When not to use

- Do not use this skill for stable local-only refactors with no dependency, provider, or API assumptions.
- Do not use cached docs as final proof without origin freshness evidence.
- Do not override established local patterns unless official sources prove the local pattern is unsafe or obsolete.

## Decision tree

```text
Local code contradicts docs? -> prefer local behavior, then document version mismatch
Docs are stale or undated? -> revalidate at origin before implementation
Provider config changed? -> read provider capability matrix and user config
Library version unknown? -> detect from lockfile before using examples
Security/compliance API? -> use primary source and record citation
```

## Procedure

1. Detect exact dependency/provider versions from local files.
2. Read the closest existing implementation and CodeGraph callers/callees.
3. Fetch or verify official current docs when facts may have changed.
4. Resolve conflicts between docs and local code with a written decision.
5. Implement the smallest source-backed change and verify with targeted commands.

## Common rationalizations

- "I remember this API" - false for moving libraries, SDKs, and provider CLIs.
- "A blog example is enough" - false when official docs or source are available.
- "The lockfile does not matter" - false because examples often target a different major version.

## Red flags

- No package version or provider capability was recorded.
- The answer cites secondary content while official docs exist.
- CodeGraph or local usage was skipped before changing shared behavior.

## Checklist

- Version/source evidence recorded.
- Local pattern and CodeGraph usage checked.
- Official docs revalidated if unstable.
- Conflict handling documented.
- Targeted verification command run.

## Failure modes

- Shipping code for the wrong SDK major version.
- Treating stale docs as proof.
- Breaking local conventions by copying generic examples.

## Examples

- Provider config defaults require current provider docs, local capability matrix, and existing config applier behavior.
- Framework router changes require lockfile version, app directory pattern, and official routing docs.

## Output contract

Return `localVersionEvidence`, `officialSources`, `localPattern`, `conflicts`, `decision`, `verificationCommands`, and `residualRisk`.

## Guard rails

- Prefer official docs, source repositories, specs, and local code over generic summaries.
- Do not browse or cache secrets.
- Do not claim current behavior without dated/source evidence.

## Verification

- `npm run validate:skill-content-quality`
- `npm run validate:agent-skill-coverage`

## Related

- `supervibe:code-search`
- `supervibe:project-memory`
- `supervibe:verification`
