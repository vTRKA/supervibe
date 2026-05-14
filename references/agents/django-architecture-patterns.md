# Django Architecture Patterns

Reusable Django architecture decision depth relocated from `django-architect`.

## Slicing Contract

- Agent files keep persona, invocation boundary, procedure, output contract, skills, verification, dialogue discipline, and anti-patterns.
- This reference holds reusable depth: decision trees, workflow matrices, detailed examples, and output templates.
- Load this file only when the current task needs the deeper pattern; otherwise use the concise agent contract.
- Treat copied source sections as reference patterns, not mandatory steps for every task.

## Django Architect: Decision Tree

Source agent: `agents/stacks/django/django-architect.md`
Moved content type: Django app, ORM, Celery, Channels, settings, and middleware routing tree

## Decision tree

```
APP BOUNDARY (split / merge / introduce)
  Drivers (need ≥2 to split):
    - Two teams routinely edit the same app → boundary
    - Two distinct ubiquitous languages collide in one models.py → boundary
    - One subsystem's deploy/migration cadence diverges from another's → boundary
    - Read shape diverges from write shape (CQRS pressure) → boundary
    - Cyclic imports between current "modules" inside one app → boundary
  Anti-drivers (do NOT split on):
    - Aesthetic preference / "models.py is too long"
    - Single-developer convenience
    - Speculative future scale
    - "Microservices best practice"
  Output: PRD decision section naming the app, its models, its public API (URLs, signals emitted, tasks
          exposed), and its data ownership (which tables it owns exclusively)

MODEL DESIGN
  related_name discipline:
    - EVERY ForeignKey, OneToOneField, ManyToManyField MUST set related_name
    - related_name MUST be plural for FK/M2M (e.g., `posts`), singular for O2O (e.g., `profile`)
    - related_query_name SHOULD match related_name unless query semantics differ
    - Reverse accessor MUST be readable as English: `user.posts.filter(...)`
  Through models for M2M:
    - Default M2M when the relationship has no own attributes
    - Explicit `through=` model when the relationship carries data (joined_at, role, status)
    - Never add columns to an auto-through table; always promote to explicit through

ORM N+1 PREVENTION
  Mandatory:
    - Every list view that traverses FK → must `select_related(...)` or `prefetch_related(...)`
    - Every serializer / template that reads `obj.fk.attr` in a loop → must declare in queryset
    - Every admin `list_display` field crossing a relation → `list_select_related`
  Detection:
    - django-debug-toolbar in dev; assertion-based query-count tests in CI for hot paths
    - `CaptureQueriesContext` around the unit under test; budget enforced
  Anti-pattern:
    - Tolerating "we'll fix it later" — an N+1 in production is a paged engineer

CELERY TOPOLOGY
  Queue-per-priority:
    - critical (payments, auth events) — small dedicated worker pool
    - default (most app work)
    - low (analytics, exports, cache warming)
    - notifications (email, SMS, push — isolate provider latency)
  Worker strategy:
    - prefork pool default; gevent for I/O-bound at scale; solo only for debug
    - --concurrency tuned per queue; not one-size-fits-all
  Idempotency: every task MUST be safe to retry. Use distributed lock (redis-py-cluster
    or django-redis-cache lock), dedupe key in Redis, or natural idempotency (UPSERT,
    conditional updates). No exceptions.
  Retries: exponential with jitter via `autoretry_for`, `retry_backoff=True`,
    `retry_jitter=True`. Max retries 3-5 for transient; 0 for non-retryable.
  Result backend: Redis for ephemeral, database for durable forensic; never both casually.

CHANNELS TOPOLOGY
  Use Channels when:
    - WebSocket / SSE state must be held cross-request
    - Pub/sub fan-out across processes is needed
    - Background tasks must push to clients in real time
  Do NOT use Channels for:
    - Simple polling (HTTP + cache is cheaper)
    - One-shot async I/O (async views are sufficient since Django 4.x)
  Channel layer: Redis layer in prod (django-channels-redis); InMemoryChannelLayer
    only in tests. Group naming convention: `<app>.<resource>.<id>` (e.g., `chat.room.42`)
  Auth: `AuthMiddlewareStack` wraps `URLRouter`; never trust `scope['user']` without it
  Backpressure: design for slow consumers — bounded queues, drop-old policy declared

SETTINGS SPLIT
  Layout (mandatory above ~150 lines or 2+ environments):
    <project>/settings/__init__.py        (empty or imports default)
    <project>/settings/base.py            (everything shared)
    <project>/settings/dev.py             (DEBUG=True, console email, local DB)
    <project>/settings/prod.py            (DEBUG=False, sentry, real DB, real cache)
    <project>/settings/test.py            (test DB, eager Celery, in-memory channel layer)
  DJANGO_SETTINGS_MODULE selects environment; never branch on env vars inside one file
  Secrets: env vars via django-environ or pydantic-settings; NEVER committed
  base.py declares structure; per-env files OVERRIDE specific keys (don't redefine
    INSTALLED_APPS from scratch in dev.py)

MIDDLEWARE ORDERING
  Required order (top to bottom = outermost to innermost):
    1. SecurityMiddleware (HSTS, content-type sniffing)
    2. WhiteNoiseMiddleware (if static via whitenoise) — BEFORE SessionMiddleware
    3. SessionMiddleware
    4. LocaleMiddleware (if i18n)
    5. CommonMiddleware
    6. CsrfViewMiddleware (BEFORE AuthenticationMiddleware? NO — after SessionMiddleware)
    7. AuthenticationMiddleware (REQUIRES SessionMiddleware above)
    8. MessageMiddleware (REQUIRES SessionMiddleware above)
    9. XFrameOptionsMiddleware (clickjacking)
   10. Custom middleware — placement requires written rationale
  Rationale rule: every custom middleware must have a comment naming WHY at this position

PRD decision section TRIGGERS
  Write a PRD decision section for:
    - App split / merge / introduction
    - Celery introduction OR queue topology change
    - Channels introduction OR consumer redesign
    - Settings restructure (single → split)
    - New middleware (any custom middleware ships with a PRD decision section)
    - Switching ORM patterns (manager hierarchy, soft-delete, multi-tenancy strategy)
    - Auth strategy change (AbstractUser → AbstractBaseUser, SSO integration)
  No PRD decision section needed for:
    - Adding a model field
    - Adding a view to an existing app
    - Adding a Celery task to an existing topology
```

## Django Architect: Common Workflows

Source agent: `agents/stacks/django/django-architect.md`
Moved content type: Django architecture workflow matrix

## Common workflows

### New app introduction (splitting an existing one)
1. Read the active host instruction file + existing app structure + cross-app import graph
2. `supervibe:project-memory` — prior app-split PRD decision sections, retired apps
3. Identify the driver (team friction / language collision / migration cadence / cyclic imports / CQRS pressure)
4. Walk APP BOUNDARY decision tree; confirm ≥2 drivers hold; if not, REJECT and document
5. Name the app, its models, its public API (URLs, signals emitted, tasks exposed), its owned tables
6. Draft `apps/{name}/` skeleton: `apps.py`, `models.py`, `views.py`, `urls.py`, `admin.py`, `signals.py`, `tasks.py`, `migrations/`, `tests/`, `public_api.py`
7. Map cross-app touch points: which existing apps import this one's public API; which models migrate ownership; which signals receivers move
8. Write PRD decision section with migration plan (create app skeleton → move models with `--state` Django migrations → refactor callers → remove old paths)
9. Estimate migration: engineer-days (model migration is the long pole), deploy ordering, rollback path
10. Confidence score, deliver

### Celery introduction (project did not have Celery)
1. Read `pyproject.toml`, current task locations (probably synchronous in views or signals)
2. Inventory candidate tasks: I/O-bound work in views, slow loops in signals, scheduled jobs currently in cron + manage.py
3. Walk CELERY TOPOLOGY decision tree; classify by SLO (critical / default / low / notifications)
4. Design `<project>/celery.py`, broker (Redis vs RabbitMQ), result backend (Redis ephemeral vs DB durable)
5. Define queues with names matching priority class; map tasks to queues
6. Worker design: pool type per queue (prefork / gevent), concurrency, max-tasks-per-child for memory hygiene
7. Idempotency design: every task class gets a dedupe strategy (lock / dedupe key / natural)
8. Retry policy: `autoretry_for=(<transient>,)`, `retry_backoff=True`, `retry_jitter=True`, `max_retries` 3-5
9. Failure handling: `on_failure` hooks for ops alerting; failed-task retention ≥7 days
10. Observability: flower or celery-exporter; queue depth alerts, task latency dashboards
11. PRD decision section with config diff and migration plan (deploy worker config, migrate one task at a time, deprecate sync paths)

### Channels introduction (real-time over WebSocket)
1. Confirm the use case: WebSocket state across requests, pub/sub fan-out, server-pushed updates — NOT polling, NOT one-shot async
2. Read `<project>/asgi.py` (must exist; create if WSGI-only); confirm ASGI-compatible deployment (uvicorn/daphne/hypercorn)
3. Choose channel layer: `channels_redis.core.RedisChannelLayer` for prod; `InMemoryChannelLayer` for tests only
4. Design `routing.py`: `ProtocolTypeRouter` with `http` (Django) + `websocket` wrapped in `AuthMiddlewareStack`
5. Group naming convention: `<app>.<resource>.<id>` — stable, predictable, scoped to context
6. Backpressure design: bounded queues, drop-old policy declared, slow-consumer detection
7. Auth model: `scope['user']` from `AuthMiddlewareStack`; never trust without it; document anonymous-allowed channels explicitly
8. Test strategy: `WebsocketCommunicator` for unit, real client + browser for integration
9. PRD decision section with deploy plan: ASGI server cutover, channel layer provisioning, fallback to HTTP polling if WebSocket unavailable

### Settings split (single-file → split layout)
1. Audit current `settings.py`: count lines, count `if DEBUG:` branches, count env-var reads
2. Confirm threshold: ≥150 lines OR ≥2 environments OR `if DEBUG:` count ≥3 → split mandatory
3. Design layout: `settings/__init__.py`, `settings/base.py`, `settings/dev.py`, `settings/prod.py`, `settings/test.py`
4. Move every shared declaration to `base.py`; per-env files OVERRIDE specific keys (do not redefine `INSTALLED_APPS`)
5. Secrets via `django-environ` or `pydantic-settings`; document required env vars in `.env.example`
6. Update `manage.py`, `wsgi.py`, `asgi.py` to default to `dev` (or per-team convention); CI sets `DJANGO_SETTINGS_MODULE=<project>.settings.test`; prod sets `prod`
7. Verify: `python -c "from <project>.settings.dev import *; from <project>.settings.prod import *; from <project>.settings.test import *"` runs clean
8. Run `python manage.py check --deploy --settings=<project>.settings.prod`; address every warning
9. PRD decision section with migration plan (introduce split → cut over CI → cut over staging → cut over prod) and rollback path

### Middleware insertion (new custom middleware)
1. Identify the cross-cutting concern (auth augmentation, request logging, tenant resolution, request ID propagation)
2. Confirm middleware is the right tool — view decorator, signal, or app-level mixin may be cheaper
3. Walk MIDDLEWARE ORDERING tree; decide position; write inline comment justifying placement
4. Implement as a class (not function — class form is forward-compatible with async)
5. Async-compat: declare `sync_capable` / `async_capable` correctly; use `markcoroutinefunction` if needed
6. Test: request-cycle test with `Client`, plus a unit test calling `__call__` directly
7. PRD decision section with placement rationale, performance impact estimate, rollback (remove from `MIDDLEWARE`)

## Django Architect: Decision Template And Graph Evidence

Source agent: `agents/stacks/django/django-architect.md`
Moved content type: PRD decision and graph-evidence template

## Context

<2-4 paragraphs: what's true today, what driver forces this decision, what constraints
apply (team size, deploy cadence, scale envelope, regulatory). Cite specific evidence
from the codebase: file paths, model count, Celery queue throughput, incident IDs.>

## Decision

<1-3 paragraphs: what we will do, in concrete Django terms. App names, model names,
queue names, middleware position, settings file structure. No vague "we will adopt
DDD" — instead "we will split apps/billing/ into apps/billing/ and apps/invoicing/,
moving Invoice and LineItem models, with apps.billing.public_api as the only
cross-app entry point.">

## Alternatives Considered

1. **<Alternative A>** — <1-2 sentences>. Rejected because: <specific reason>.
2. **<Alternative B>** — <1-2 sentences>. Rejected because: <specific reason>.
3. **Status quo (do nothing)** — <1-2 sentences>. Rejected because: <specific reason>.

## Consequences

**Positive**:
- <consequence with measurable signal where possible>

**Negative**:
- <consequence; do not hide costs>

**Neutral / accepted trade-offs**:
- <e.g., new app requires apps.py + admin.py + tests/ scaffolding>

## Migration Plan

1. <Step 1 — concrete, owner, estimated effort>
2. <Step 2 — ...>

**Rollback path**: <how to undo if mid-migration failure>
**Reversibility**: One-way | Reversible
**Estimated effort**: N engineer-days, M calendar weeks
**Blast radius**: <which apps/users affected if migration fails>

## Graph evidence

This section is REQUIRED on every agent output. Pick exactly one of three cases:

**Case A — Structural change checked, callers found:**
- Symbol(s) modified: `<name>`
- Callers checked: N callers (file:line refs below)
  - <file:line refs, top 5>
- Callees mapped: M targets
- Neighborhood (depth=2): <comma-list of touched files/symbols>
- Resolution rate: X% of edges resolved
- **Decision**: callers updated in this diff / breaking change documented / escalated to architect-reviewer

**Case B — Structural change checked, ZERO callers (safe):**
- Symbol(s) modified: `<name>`
- Callers checked: **0 callers** — verified via `--callers "<old-name>"` AND `--callers "<new-name>"` (after rename)
- Resolution rate: X% (high confidence in zero result)
- **Decision**: refactor safe to proceed; no caller updates needed

**Case C — Graph N/A:**
- Reason: <one of: greenfield / pure-additive / non-structural-edit / read-only-architecture-doc>
- Verification: explicitly state why no symbols affect public surface
- **Decision**: graph not applicable to this task
