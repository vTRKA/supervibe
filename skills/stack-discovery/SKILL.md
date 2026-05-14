---
name: stack-discovery
namespace: process
description: 'Use WHEN session starts in unfamiliar project OR WHEN user mentions new stack to scan manifests, ask gap questions, build stack-fingerprint. Triggers: ''определи стек'', ''stack discovery'', ''какой тут стек'', ''разведай проект''.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: brainstorm
prerequisites: []
emits-artifact: requirements-spec
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-06T00:00:00.000Z
---

# Stack Discovery

## Overview

Stack Discovery provides a reusable Supervibe operating method for Use WHEN session starts in unfamiliar project OR WHEN user mentions new stack to scan manifests, ask gap questions, build stack-fingerprint. Triggers: 'определи стек', 'stack discovery', 'какой тут стек', 'разведай проект'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## When to Use

AT SESSION START in unfamiliar project, OR WHEN user mentions a stack the framework doesn't yet have configured. Output is consumed by `supervibe:genesis` and `supervibe:requirements-intake`.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Glob for known manifest files: `package.json`, `composer.json`, `Cargo.toml`, `pyproject.toml`, `requirements.txt`, `go.mod`, `Gemfile`, `pom.xml`, `build.gradle`, `*.csproj`, `mix.exs`, `pubspec.yaml`
2. Glob for IaC: `terraform/`, `*.tf`, `Dockerfile`, `docker-compose.yml`
3. Glob for CI: `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`
4. Read the active host instruction file if exists (may declare intended stack)

## Decision tree

```
Manifest detected?
├─ extension/manifest.json OR src/manifest.json with "manifest_version": 3
│                                       → runtime: chrome-extension (MV3)
│                                         pack: chrome-extension-mv3
├─ extension/manifest.json with "manifest_version": 2
│                                       → runtime: chrome-extension (MV2 — flag for migration)
├─ package.json + react → frontend: react (vite/cra/next - check deps)
├─ package.json + next → frontend: nextjs
├─ package.json + vue/nuxt → frontend: vue
├─ composer.json + laravel/framework → backend: laravel
├─ pyproject.toml + django → backend: django
├─ pyproject.toml + fastapi → backend: fastapi
├─ Gemfile + rails → backend: rails
├─ Cargo.toml + tauri → desktop: tauri (+ frontend from package.json)
│  └─ package.json + @tauri-apps/api + react + vite + src-tauri/Cargo.toml with tauri = "2"
│     → pack: tauri-react-rust-postgres when SQLx/Postgres evidence exists; otherwise tauri-react-rust
├─ go.mod + gin/echo → backend: go
└─ ... (use stack-fingerprint registry)

Chrome-extension sub-detection (when manifest_version: 3):
├─ devDeps include @crxjs/vite-plugin → bundler: vite-crxjs
├─ devDeps include wxt              → bundler: wxt
├─ devDeps include plasmo           → bundler: plasmo
├─ no bundler in devDeps + no src/  → bundler: vanilla (no-bundler)
└─ devDeps include typescript       → language: typescript

DB inferred from?
├─ Migration files (database/migrations/, db/migrate/, alembic/, migrations/)
├─ Connection string env vars
├─ Composer/npm deps (pg/mysql2/sqlite3/mongodb)
└─ Rust deps (sqlx with postgres feature, diesel postgres, sea-orm postgres)

Infra inferred from?
├─ docker-compose.yml services list
├─ Helm charts / k8s manifests
└─ Manual user confirmation
```

## Procedure

1. Scan manifests (Step 0)
   - Use the same broad evidence model as `scripts/lib/supervibe-agent-recommendation.mjs`: `package.json`, `composer.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`, `Gemfile`, `pom.xml`, Gradle files, `*.csproj`, `pubspec.yaml`, Chrome `manifest.json`, Docker Compose services, and migration/cache evidence.
   - Skip dependency/cache/generated directories while scanning (`node_modules`, package stores, virtualenvs, `site-packages`, `Pods`, build output, framework caches).
2. Build initial stack-fingerprint:
   ```yaml
   stack-fingerprint:
     project-type: web-app | api-only | spa | desktop | mobile | library
     backend: <id> | none
     frontend: <id> | none
     db: [<id>...]
     infra: [<id>...]
     architecture: <inferred or unknown>
   ```
3. For each unknown field → ask user one question at a time (multiple-choice from registered options)
4. Confirm fingerprint with user
5. Score with confidence-scoring (requirements-spec rubric)
6. Hand off to `supervibe:genesis` (if scaffolding) or `supervibe:requirements-intake` (if working in existing project)
   - Include selected stack tags so genesis can attach the matching frontend, backend, data, cache, mobile, extension, GraphQL, agent, skill, and rule groups without silent omissions.

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

Returns YAML stack-fingerprint with all fields populated, confidence ≥9.

## Guard rails

- DO NOT: assume stack from one signal (e.g., presence of `react` doesn't mean Next.js)
- DO NOT: invent stack components not in registry
- DO NOT: skip user confirmation (auto-detect ≠ correct)
- ALWAYS: cite manifest evidence per detected component

## Verification

- Stack-fingerprint YAML valid
- Each component cited with manifest+grep evidence
- User confirmation recorded

## Related

- `supervibe:genesis` — primary consumer
- `supervibe:requirements-intake` — alternative consumer
- `questionnaires/01-stack-foundation.yaml` — internal stack evidence reference; never expose raw rows as visible questions
