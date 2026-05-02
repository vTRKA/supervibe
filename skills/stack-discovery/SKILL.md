---
name: stack-discovery
namespace: process
description: >-
  Use WHEN session starts in unfamiliar project OR WHEN user mentions new stack
  to scan manifests, ask gap questions, build stack-fingerprint. Triggers:
  'определи стек', 'stack discovery', 'какой тут стек', 'разведай проект'.
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
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Stack Discovery

## When to invoke

AT SESSION START in unfamiliar project, OR WHEN user mentions a stack the framework doesn't yet have configured. Output is consumed by `supervibe:genesis` and `supervibe:requirements-intake`.

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
- `questionnaires/01-stack-foundation.yaml` — question source
