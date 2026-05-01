# Supervibe Agent Roster

This file is generated from `agents/**/*.md` frontmatter. It is the human-readable map used by genesis, README onboarding, and host instruction files so users can see which specialists exist and what each one is responsible for.

Total agents: 89

## Core workflow

- `architect-reviewer` - Use WHEN reviewing changes that affect layer boundaries, dependency direction, or coupling to assess architectural soundness READ-ONLY. Stacks: any.
- `auth-architect` - Use BEFORE designing or modifying authentication/authorization (login, sessions, tokens, MFA, SSO) to choose protocols and prevent common auth flaws. Stacks: any.
- `code-reviewer` - Use BEFORE merging any change to systematically review code across 8 dimensions with severity-ranked findings. Stacks: any.
- `quality-gate-reviewer` - Use AS LAST gate before claiming any work done to verify all evidence present and confidence ≥9 across applicable rubrics. Stacks: any.
- `refactoring-specialist` - Use WHEN improving code structure WITHOUT changing behavior to apply preserve-behavior refactoring with caller-verification via grep and a green-test baseline. Stacks: any.
- `repo-researcher` - Use BEFORE making changes in unfamiliar code area to map existing structure, patterns, and risks via READ-ONLY exploration backed by supervibe:code-search semantic queries. Stacks: any.
- `root-cause-debugger` - Use WHEN encountering any bug, test failure, or unexpected behavior to find root cause via hypothesis-evidence-isolation method, never symptom suppression. Stacks: any.
- `security-auditor` - Use BEFORE merging changes touching auth/secrets/data-handling to audit OWASP Top 10 risks, secrets exposure, permissions, and attack surface; also use as the lead auditor for /supervibe-security-audit remediation loops. Stacks: any.

## Design and UI

- `accessibility-reviewer` - Use BEFORE shipping any UI to verify WCAG AA compliance, keyboard navigation, screen reader support, contrast measurement, motion sensitivity, and ARIA correctness. Stacks: any.
- `copywriter` - Use WHEN writing or reviewing UI copy (labels, body, CTAs, errors, microcopy) to ensure voice consistency, clarity, and localization-readiness. Stacks: any.
- `creative-director` - Use WHEN starting any new product or major visual direction shift to define brand language, mood, palette intent, typographic intent, motion intent, and emotional anchors. Stacks: any.
- `electron-ui-designer` - Use WHEN designing UI for an Electron desktop application — main window, settings, modals, tray dropdowns, multi-window experiences — to produce platform-faithful mockups that respect macOS / Windows / Linux HIG, nati... Stacks: electron.
- `extension-ui-designer` - Use WHEN designing UI for a browser extension (Chrome MV3, Edge, Brave, Firefox WebExtensions) — popup, side panel, options, new-tab override — to produce surface-aware mockups that respect host-browser etiquette, CSP... Stacks: chrome-extension.
- `mobile-ui-designer` - Use WHEN designing UI for a native mobile app — iOS (SwiftUI / UIKit), Android (Jetpack Compose / Views), React Native, or Flutter — to produce platform-faithful mockups that respect iOS HIG and Android Material 3, sa... Stacks: ios, android, react-native, flutter.
- `presentation-deck-builder` - Use WHEN a storyboard or presentation brief must become a browser-reviewed slide preview, revised through feedback, exported as PPTX, and prepared for Google Drive handoff. Stacks: any.
- `presentation-director` - Use WHEN a user needs a persuasive, educational, investor, sales, product, or internal presentation to define audience outcome, narrative spine, slide architecture, visual references, and design-system alignment. Stacks: any.
- `prototype-builder` - Use WHEN materializing design as 1:1 HTML/CSS prototype in prototypes/ for brandbook approval and 1:1 production transfer. Stacks: any.
- `tauri-ui-designer` - Use WHEN designing UI for a Tauri 2 desktop application — main window, secondary windows, tray, system dialogs — to produce mockups that work identically on WKWebView (macOS), WebView2 (Windows), and WebKitGTK (Linux)... Stacks: tauri.
- `ui-polish-reviewer` - Use BEFORE marking any UI implementation done to review across 8 dimensions (hierarchy/spacing/alignment/states/keyboard/responsive/copy/DS-consistency). Stacks: any.
- `ux-ui-designer` - Use WHEN designing screens or flows to produce screen specs with information architecture, component inventory, states matrix (loading/empty/error/success/partial), interaction notes, design tokens. Stacks: any.

## Operations and security

- `ai-agent-orchestrator` - Use WHEN designing or reviewing multi-agent workflows, tool routing, handoffs, agent state, task graphs, autonomous loops, planner/executor splits, or production agent operating models. Stacks: ai, llm, any.
- `ai-integration-architect` - Use WHEN designing LLM/AI integration into product code (prompts, RAG, vector DB, embeddings, model routing, evaluation harnesses, prompt-injection defenses). Stacks: any.
- `api-contract-reviewer` - Use WHEN reviewing API changes (REST/GraphQL/gRPC) to detect breaking changes, version compatibility, and contract drift. Stacks: any.
- `api-designer` - Use BEFORE finalizing API contracts (REST/GraphQL/gRPC) to design versioning, error envelopes, idempotency, pagination, and deprecation strategy. Stacks: any.
- `best-practices-researcher` - Use WHEN needing current 2026 best practices for a stack/library to research authoritative sources, cite, and apply to project context. Stacks: any.
- `competitive-design-researcher` - Use WHEN researching market visual/UX patterns for product category to inform brand and design without copying. Stacks: any.
- `data-modeler` - Use BEFORE designing or evolving the data model (tables, documents, events) to choose normalization, polymorphism, soft delete, and temporal strategy. Stacks: any.
- `db-reviewer` - Use WHEN reviewing schema changes, migrations, or query patterns to verify safety, performance, replication impact, and lock duration. Stacks: any.
- `dependency-researcher` - Use WHEN evaluating new or upgrading deps to research latest stable, deprecation status, migration guides from authoritative registry sources. Stacks: any.
- `dependency-reviewer` - Use WHEN adding or auditing dependencies to ensure license compliance, security (CVE), maintenance signals, and supply chain hygiene. Stacks: any.
- `devops-sre` - Use WHEN designing CI/CD, runbooks, SLOs, observability, or incident response to ensure reliability and operability. Stacks: any.
- `infra-pattern-researcher` - Use WHEN designing HA/replication/cache/queue topology to research current vendor-recommended patterns for project's specific versions. Stacks: any.
- `infrastructure-architect` - Use WHEN designing infrastructure topology requiring HA, replication, sharding, queueing, or caching to choose patterns matching scale and reliability requirements. Stacks: any.
- `ipc-contract-reviewer` - Use WHEN reviewing desktop, webview, worker, extension, RPC or process IPC boundaries for request/response schemas, error semantics, permission scope, versioning and caller coverage. Stacks: any.
- `job-scheduler-architect` - Use BEFORE introducing background jobs, queues, or scheduled tasks to choose delivery semantics, retry policy, and queue technology. Stacks: any.
- `llm-evals-engineer` - Use WHEN building or reviewing LLM, prompt, agent, RAG, tool-use, routing, safety, or regression eval suites. Stacks: ai, llm, any.
- `llm-rag-architect` - Use WHEN designing, reviewing, or repairing LLM retrieval, RAG, embeddings, chunking, reranking, context packing, citation quality, memory retrieval, or graph-augmented context systems. Stacks: ai, llm, any.
- `model-ops-engineer` - Use WHEN designing or reviewing model selection, local/hosted inference, latency and cost budgets, model rollout, fallback, prompt/model versioning, eval-to-release promotion, or AI production operations. Stacks: ai, llm, any.
- `network-router-engineer` - Use WHEN diagnosing or planning work on routers, switches, Wi-Fi gateways, firewalls, NAT, VPN, DNS/DHCP, VLANs, routing stability, or ISP edge issues. Defaults to read-only diagnostics and requires explicit scoped ap... Stacks: network, any.
- `observability-architect` - Use BEFORE shipping a service to production to design tracing, metrics, logs, SLOs, and on-call so incidents are detectable and debuggable. Stacks: any.
- `performance-reviewer` - Use WHEN reviewing or improving performance to apply profile-first methodology with before/after benchmarks and root-cause bottleneck analysis. Stacks: any.
- `prompt-ai-engineer` - Use WHEN designing, reviewing, hardening, or debugging prompts, system instructions, agent prompts, tool-use policies, structured outputs, prompt evals, red-team suites, or user-intent interpretation. Stacks: any.
- `security-researcher` - Use WHEN auditing or planning security work to research CVE database, GitHub Security Advisories, and pattern-level vulnerabilities for project's stack. Stacks: any.

## Product planning

- `analytics-implementation` - Use WHEN adding tracking/analytics to features to ensure event taxonomy, naming consistency, GDPR compliance, consent gating, and tracking plan documentation. Stacks: any.
- `email-lifecycle` - Use WHEN designing transactional or marketing email flows to ensure deliverability, accessibility, brand consistency, and lifecycle correctness. Stacks: any.
- `product-manager` - Use WHEN making product decisions (priority, scope, roadmap, OKR) at PM/CPO level for any user-facing feature or product area. Stacks: any.
- `qa-test-engineer` - Use WHEN designing test strategy or test suites to ensure coverage across test pyramid (unit, integration, e2e) with stack-appropriate patterns. Stacks: any.
- `seo-specialist` - Use WHEN building or auditing public pages to ensure technical SEO (meta, schema.org, sitemaps, CWV) and content SEO (keyword targeting, structure, hreflang). RU: используется КОГДА создаются или аудятся публичные стр... Stacks: any.
- `systems-analyst` - Use WHEN converting vague requests into concrete contracts with acceptance criteria, edge cases, state machines, and system boundaries — READ-ONLY. Stacks: any.

## Stack: android

- `android-developer` - Use WHEN implementing Android features in Jetpack Compose, Coroutines + Flow, Hilt DI, Room + WorkManager, Material 3 with Espresso + Compose UI tests. Stacks: android.

## Stack: aspnet

- `aspnet-developer` - Use WHEN implementing ASP.NET Core features, controllers, minimal APIs, EF Core models, services, with xUnit tests and modern .NET patterns. RU: Используется КОГДА реализуешь фичи на ASP.NET Core — контроллеры, minima... Stacks: aspnet.

## Stack: chrome-extension

- `chrome-extension-architect` - Use WHEN designing Chrome MV3 extension architecture (manifest design, permissions strategy, service worker lifecycle, message-passing topology, content-script isolation, CSP, CWS publishing readiness) READ-ONLY. Stacks: chrome-extension.
- `chrome-extension-developer` - Use WHEN implementing Chrome MV3 extension features (popup, options page, side panel, content scripts, service worker, background events, message passing, storage) AFTER architecture is defined. Stacks: chrome-extension.

## Stack: django

- `django-architect` - Use WHEN designing Django application architecture (app boundaries, model graph, settings split, Celery + Channels topology, middleware ordering) READ-ONLY. Stacks: django.
- `django-developer` - Use WHEN implementing Django features (views/CBVs/DRF, ModelForms, signals, fixtures/factories, pytest-django) with disciplined ORM access. Stacks: django.
- `drf-specialist` - Use WHEN designing or implementing DRF APIs (serializers, viewsets, permissions, pagination, filtering, throttling, simple-jwt) with N+1 discipline. Stacks: django.

## Stack: elasticsearch

- `elasticsearch-architect` - Use WHEN designing Elasticsearch/OpenSearch mappings, analyzers, sharding, ILM, search vs aggregation, fork-aware tradeoffs. Stacks: elasticsearch, opensearch.

## Stack: express

- `express-developer` - Use WHEN implementing Express.js APIs, middleware pipelines, route modules, validators, and error handlers with supertest coverage. RU: Используется КОГДА реализуешь API на Express.js — middleware-пайплайны, модули ро... Stacks: express.

## Stack: fastapi

- `fastapi-architect` - Use WHEN designing FastAPI application architecture, dependency injection, async patterns, OpenAPI auto-gen, Alembic migrations READ-ONLY. Stacks: fastapi.
- `fastapi-developer` - Use WHEN implementing FastAPI endpoints, models, services, async DB queries with pytest tests. Stacks: fastapi.

## Stack: flutter

- `flutter-developer` - Use WHEN implementing Flutter features, screens, BLoC/Riverpod state, platform channels, Dio API clients, with flutter_test + integration_test discipline. Stacks: flutter.

## Stack: go

- `go-service-developer` - Use WHEN implementing Go HTTP services, handlers, repositories, workers with table-driven tests and idiomatic concurrency. Stacks: go.

## Stack: graphql

- `graphql-schema-designer` - Use WHEN designing GraphQL schemas (schema-first vs code-first, federation v2, DataLoader, persisted queries, pagination, error handling, subscriptions, deprecation lifecycle) — cross-stack across Apollo, Hot Chocolat... Stacks: graphql.

## Stack: ios

- `ios-developer` - Use WHEN implementing iOS features in SwiftUI + Combine, async/await + actors, MVVM, App Intents, with XCTest + ViewInspector and accessibility discipline. Stacks: ios.

## Stack: laravel

- `eloquent-modeler` - Use WHEN designing or refining Eloquent models, relationships, scopes, casts to optimize queries and prevent N+1. Stacks: laravel.
- `laravel-architect` - Use WHEN designing Laravel application architecture (modular monolith, DDD, Eloquent relationships, queue topology) READ-ONLY. Stacks: laravel.
- `laravel-developer` - Use WHEN implementing Laravel features, controllers, models, jobs, services with Pest tests and modern patterns. Stacks: laravel.
- `queue-worker-architect` - Use WHEN designing Laravel queue topology, jobs, retry strategies, Horizon configuration, idempotency, dead-letter handling, rate-limiting. Stacks: laravel.

## Stack: mongodb

- `mongo-architect` - Use WHEN designing MongoDB schema, indexes, sharding, aggregation pipelines, transactions, replica-set topology. Stacks: mongodb.

## Stack: mysql

- `mysql-architect` - Use WHEN designing MySQL/InnoDB schema, indexes, partitioning, replication, online DDL at scale. Stacks: mysql, mariadb.

## Stack: nestjs

- `nestjs-developer` - Use WHEN implementing NestJS modules, providers, controllers, guards, pipes, interceptors, repositories, and e2e tests with @nestjs/testing. Stacks: nestjs.

## Stack: nextjs

- `nextjs-architect` - Use WHEN designing Next.js 14+ application architecture (server components default, streaming, ISR, edge runtime, route organization) READ-ONLY. RU: Используется КОГДА проектируешь архитектуру Next.js 14+ — server com... Stacks: nextjs.
- `nextjs-developer` - Use WHEN implementing Next.js 14+ pages, layouts, server actions, route handlers, mutations with TypeScript strict. RU: Используется КОГДА реализуешь Next.js 14+ — pages, layouts, server actions, route handlers, мутац... Stacks: nextjs.
- `server-actions-specialist` - Use WHEN implementing Server Actions for mutations to enforce input validation, error handling, revalidation, and optimistic updates. Stacks: nextjs.

## Stack: nuxt

- `nuxt-architect` - Use WHEN designing Nuxt 3 application architecture (server vs client routing, Nitro engine choice, hybrid rendering SSR/SSG/ISR/CSR, Pinia stores, modules, layers, runtime config) READ-ONLY. Stacks: nuxt.
- `nuxt-developer` - Use WHEN implementing Nuxt 3 features (pages, layouts, middleware, server/api routes, useFetch + transform + key, useRuntimeConfig, useState SSR-aware, error.vue) with Vitest. RU: Используется КОГДА реализуешь фичи Nu... Stacks: nuxt.

## Stack: postgres

- `postgres-architect` - Use WHEN designing Postgres schema, migrations, indexes, replication, partitioning at scale. Stacks: postgres.

## Stack: rails

- `rails-architect` - Use WHEN deciding Rails architecture — Hotwire vs SPA, queue backend, ActionCable namespacing, engine boundaries, ADR-worthy choices. Stacks: rails, ruby.
- `rails-developer` - Use WHEN implementing Rails features — controllers, models, jobs, channels, Hotwire views with RSpec/Minitest and FormObject patterns. Stacks: rails, ruby.

## Stack: react

- `react-implementer` - Use WHEN building standalone React (Vite/SWC) components requiring hooks-first patterns, state colocation, Suspense. Stacks: react.

## Stack: redis

- `redis-architect` - Use WHEN designing Redis topology (single/Sentinel/Cluster), key schema, expiration policy, eviction, persistence, pub/sub vs streams, distributed locks. Stacks: redis.

## Stack: spring

- `spring-architect` - Use WHEN designing Spring Boot 3 / Spring 6 architecture, choosing WebFlux vs MVC, profiles, Actuator + observability, microservice boundaries READ-ONLY. Stacks: spring.
- `spring-developer` - Use WHEN implementing Spring Boot features — REST controllers, services, JPA repositories, Bean Validation, Spring Security, Testcontainers integration tests. Stacks: spring.

## Stack: svelte

- `sveltekit-developer` - Use WHEN implementing SvelteKit features, routes, hooks, form actions, load functions with Svelte 5 runes and Vitest/Playwright tests. Stacks: svelte, sveltekit.

## Stack: tauri

- `tauri-rust-engineer` - Use WHEN implementing or reviewing Tauri 2 Rust backend commands, plugins, window lifecycle, filesystem permissions, sidecars, updater flow, IPC boundaries, or desktop packaging. Stacks: tauri, rust.

## Stack: vue

- `vue-implementer` - Use WHEN building Vue 3 components with Composition API, <script setup>, Pinia stores, typed props/emits, custom composables, Vitest + Vue Test Utils. Stacks: vue.

## System improvement

- `memory-curator` - Use WHEN auditing project memory hygiene OR after sync-rules to deduplicate, retire stale entries, normalize tags, regenerate index, and audit cross-link integrity. Stacks: any.
- `rules-curator` - Use WHEN adding/modifying/auditing/retiring project rules to maintain the selected host rules folder, detect contradictions, normalize format, and sync across sibling repos. RU: используется КОГДА добавляются/изменяют... Stacks: any.
- `supervibe-orchestrator` - Use WHEN deciding which Supervibe phase to invoke based on weighted context (system-reminders, effectiveness, confidence-log, user message, stack-fingerprint) — never auto-executes state changes. Stacks: any.
