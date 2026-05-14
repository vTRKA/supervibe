# Spring Architecture Patterns

Reusable Spring architecture decision depth relocated from `spring-architect`.

## Slicing Contract

- Agent files keep persona, invocation boundary, procedure, output contract, skills, verification, dialogue discipline, and anti-patterns.
- This reference holds reusable depth: decision trees, workflow matrices, detailed examples, and output templates.
- Load this file only when the current task needs the deeper pattern; otherwise use the concise agent contract.
- Treat copied source sections as reference patterns, not mandatory steps for every task.

## Spring Architect: Decision Tree

Source agent: `agents/stacks/spring/spring-architect.md`
Moved content type: Spring Boot architecture routing tree

## Decision tree

```
RUNTIME MODEL: MVC vs WebFlux vs Virtual-Thread MVC
  Pick WebFlux when ALL hold:
    - Workload is I/O-bound and bursty (>1000 concurrent inflight requests typical)
    - Every downstream call has a non-blocking driver (R2DBC, WebClient, reactive Kafka, Lettuce)
    - Team has reactive experience or budget to learn it
    - Backpressure semantics are genuinely useful (streaming, server-sent events, slow consumers)
  Pick Virtual-Thread MVC (Boot 3.2+) when:
    - Workload is I/O-bound but you have blocking drivers (JDBC, JPA, blocking Kafka client)
    - Team is comfortable with imperative style and synchronous testing
    - Concurrency need is high but reactive complexity is not justified
    - Java 21+ available; set spring.threads.virtual.enabled=true
  Pick classic MVC (platform threads) when:
    - Workload is CPU-bound or low-concurrency (<200 inflight typical)
    - Existing codebase is Servlet-based; migration cost not justified
    - Tooling/profiler/debugger ecosystem favors platform threads
  NEVER mix:
    - Do not put @Controller (MVC) and @Controller-style WebFlux endpoints in the same context
    - Do not call blocking JDBC/JPA inside Mono.map / Flux.flatMap; either use R2DBC or
      explicitly Schedulers.boundedElastic() with a documented justification

CONFIGURATION & PROFILES
  Profile hierarchy:
    default          — minimal safe defaults, NO secrets, NO prod URLs
    local            — developer laptop; local DB, local Redis, mocked external services
    dev              — shared dev environment; real services but isolated data
    staging          — prod-shape; real integrations, sanitized data
    prod             — real load, real secrets, real users
  Sources, in precedence (top wins):
    1. Command-line args / env vars in container
    2. External config server (Spring Cloud Config) if present, encrypted with Vault/JCE
    3. application-{profile}.yml at runtime (mounted ConfigMap or baked image)
    4. application.yml (defaults only)
  Anti-patterns:
    - prod credentials checked into application-prod.yml
    - profile inheritance going upward (prod inheriting from dev)
    - @Value with hard-coded fallback that masks missing prod config
  Required:
    - Every secret-bearing property documented as @ConfigurationProperties with validation
    - Spring Cloud Config Server, if used, must encrypt secrets at rest

ACTUATOR & OBSERVABILITY
  Endpoints to expose by default in prod:
    /actuator/health (with probes: liveness, readiness)
    /actuator/info
    /actuator/prometheus (or /actuator/metrics if not Prometheus)
  Endpoints to expose ONLY behind auth (and ideally only on management port):
    /actuator/env, /actuator/configprops, /actuator/beans, /actuator/mappings,
    /actuator/threaddump, /actuator/heapdump, /actuator/loggers, /actuator/httptrace
  Security:
    - Use management.server.port to bind Actuator on a separate port not exposed to internet
    - OR secure /actuator/** with Spring Security: requireAuth + role MANAGEMENT
    - NEVER expose env/configprops/heapdump publicly — secrets and PII leak
  Observability stack (pick one, document it):
    - Metrics: Micrometer + Prometheus + Grafana
    - Tracing: Micrometer Tracing + Zipkin or Tempo (W3C tracecontext propagation)
    - Logs: Logback JSON encoder + Loki/CloudWatch/ELK
    - Required: every request gets traceId in MDC, every log line carries it

BOUNDED CONTEXTS & MODULE STRUCTURE
  Drivers to draw a context boundary (need ≥2):
    - Two teams routinely edit the same package set → boundary
    - Two distinct ubiquitous languages collide → boundary
    - One module's deploy cadence diverges from another's → boundary
    - Read shape diverges from write shape (CQRS pressure) → boundary
  Anti-drivers (do NOT split on):
    - Aesthetic preference / "feels too big"
    - Speculative future scale
    - Following a reference architecture diagram literally
  Module shape inside monolith:
    src/main/java/<base>/<context>/api          — public commands, queries, events, DTOs
    src/main/java/<base>/<context>/domain       — aggregates, value objects, domain services
    src/main/java/<base>/<context>/infra        — repositories, adapters, clients
    src/main/java/<base>/<context>/web          — controllers (only if context owns HTTP)
    src/main/java/<base>/<context>/<Context>Configuration.java  — @Configuration

MICROSERVICE EXTRACTION
  Extract a service when ALL hold:
    - Module is stable for ≥6 months (boundary doesn't shift quarterly)
    - Independent deploy cadence is required (regulatory, team autonomy, blast-radius)
    - Independent scaling envelope is required (10x the rest of the app)
    - The team owning the module has operational capacity (oncall, observability, CI/CD)
  Anti-pattern: distributed monolith — services that must deploy together are worse
                than a monolith that doesn't have to
  Extraction order: extract one service at a time; first extraction takes 2-3x the second
  Required infra before first extraction:
    - Service-to-service auth (mTLS or signed-JWT propagation via Spring Cloud Gateway)
    - Distributed tracing across services (W3C tracecontext)
    - Circuit breakers on every cross-service call (Resilience4j)
    - Centralized logging with traceId

NEED TO KNOW WHO/WHAT DEPENDS ON A SYMBOL?
  YES → use code-search GRAPH mode:
        --callers <name>      who calls this
        --callees <name>      what does this call
        --neighbors <name>    BFS expansion (depth 1-2)
  NO  → continue with existing branches
```

## Spring Architect: Decision Template And Graph Evidence

Source agent: `agents/stacks/spring/spring-architect.md`
Moved content type: architecture decision and graph-evidence template

## Context

<2-4 paragraphs: what's true today, what driver forces this decision, what constraints
apply (team size, deploy cadence, scale envelope, regulatory). Cite specific evidence
from the codebase: file paths, bean counts, profile YAMLs, throughput numbers,
incident IDs, JFR/heap snapshots if performance-related.>

## Decision

<1-3 paragraphs: what we will do, in concrete Spring terms. Runtime model name,
module/package paths, profile names, Actuator exposure list, bean stereotypes, named
@ConfigurationProperties classes. No vague "we will adopt reactive" — instead
"we will move the quote-distribution module to WebFlux on Netty with R2DBC for
Postgres reads and Reactor Kafka for the event stream; existing JPA write path
stays on virtual-thread MVC in a separate module.">

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
- <e.g., new module requires its own @Configuration + @ConfigurationProperties>

## Migration Plan

1. <Step 1 — concrete, owner, estimated effort>
2. <Step 2 — ...>

**Rollback path**: <how to undo if mid-migration failure>
**Reversibility**: One-way | Reversible
**Estimated effort**: N engineer-days, M calendar weeks
**Blast radius**: <which modules/users affected if migration fails>

## Verification

- [ ] No blocking calls inside reactive operators (grep for JdbcTemplate/JPA inside Mono/Flux)
- [ ] Profiles isolate environments (no prod URLs in non-prod profiles, no prod secrets in repo)
- [ ] Actuator exposure list matches policy (sensitive endpoints behind auth or management port)
- [ ] Bean stereotypes correct (@Service for orchestration, @Repository for persistence, @Component only where none other fits)
- [ ] Bounded-context boundaries match domain language, not org chart
- [ ] Observability stack named (metrics + tracing + logs) with concrete components
```

## Graph evidence

This section is REQUIRED on every agent output. Pick exactly one of three cases:

**Case A — Structural change checked, callers found:**
- Symbol(s) modified: `<name>`
- Callers checked: N callers (file:line refs below)
- Callees mapped: M targets
- Neighborhood (depth=2): <comma-list>
- Resolution rate: X% of edges resolved
- **Decision**: callers updated / breaking change documented / escalated

**Case B — Structural change checked, ZERO callers (safe):**
- Symbol(s) modified: `<name>`
- Callers checked: **0 callers** — verified via `--callers "<old-name>"` AND `--callers "<new-name>"`
- Resolution rate: X%
- **Decision**: refactor safe to proceed

**Case C — Graph N/A:**
- Reason: <one of: greenfield / pure-additive / non-structural-edit / read-only / PRD decision section-only>
- Verification: explicitly state why no symbols affect public surface
- **Decision**: graph not applicable (typical for PRD decision section work)

## Spring Architect: Common Workflows

Source agent: `agents/stacks/spring/spring-architect.md`
Moved content type: Spring architecture workflow matrix

## Common workflows

### Runtime-model decision (MVC vs WebFlux vs Virtual-Thread MVC)
1. Read the active host instruction file + `pom.xml`/`build.gradle.kts` for current Boot version and dependencies
2. Inventory blocking drivers in use (JDBC, JPA, blocking Kafka, blocking SDKs)
3. Profile current latency / concurrency: p50/p95/p99 and concurrent-inflight-request peaks
4. Walk RUNTIME MODEL decision tree
5. If WebFlux: enumerate every downstream call and confirm reactive driver exists (R2DBC for Postgres, WebClient for HTTP, reactor-kafka for Kafka, Lettuce for Redis)
6. If Virtual-Thread MVC: confirm Java 21+, set `spring.threads.virtual.enabled=true`, identify any synchronized blocks or thread-locals that pin virtual threads
7. PRD decision section with chosen model, the alternative considered, the latency/concurrency targets, the migration steps if not greenfield
8. Migration cost honest: WebFlux migration is months for a non-trivial codebase

### Profile strategy design
1. Inventory existing `application*.yml` files; list every property and which profile sets it
2. Find all `@Value` and `@ConfigurationProperties` usages; classify as required / optional / secret
3. Define profile hierarchy: default → local → dev → staging → prod
4. Move every secret to env-var or Vault; remove from committed YAML
5. Add `@ConfigurationProperties` with `@Validated` for required bundles; fail-fast on missing
6. Document the "which profile gets activated where" matrix (laptop / CI / dev cluster / staging / prod)
7. PRD decision section with profile policy, secret strategy, fail-fast list

### Actuator + observability stack
1. List currently exposed endpoints (`management.endpoints.web.exposure.include`)
2. Classify endpoints: always-public (`health`, `info`), auth-required (everything else)
3. Decide management port: separate (`management.server.port=9090`, not internet-routable) vs same-port-with-auth
4. Pick metrics destination (Prometheus pull vs OTLP push), tracing destination (Zipkin/Tempo), log destination (Loki/CloudWatch/ELK)
5. Confirm trace propagation: W3C tracecontext via Micrometer Tracing
6. Confirm MDC propagation across async boundaries (`@Async`, reactive contexts)
7. PRD decision section with stack named, endpoint exposure list, security mechanism, dashboards/alerts to be created

### Bounded-context split (within monolith)
1. Read current package layout; identify candidate context to extract
2. Walk BOUNDED-CONTEXT decision tree; ≥2 drivers must hold
3. Sketch new module: `<base>/<context>/{api,domain,infra,web}` and `<Context>Configuration`
4. Define public surface: which command/query/event classes, which DTOs cross the boundary
5. Identify aggregate root and owned tables
6. Map cross-context call sites; plan refactor to route them through the new public API only
7. PRD decision section with module skeleton, public API list, owned tables, migration plan

### Microservice extraction evaluation
1. Read deploy history, ownership, scale numbers per module
2. Walk MICROSERVICE EXTRACTION decision tree; ALL conditions must hold
3. If any fail: REJECT; recommend continued monolith with module-boundary hardening
4. If all hold: design service contract (HTTP via Spring Cloud Gateway, gRPC, or events via Kafka/Stream)
5. Required infra checklist: service-to-service auth, tracing, circuit breakers, centralized logs
6. Data ownership transfer plan; identify what becomes async-replicated
7. Operational readiness check: oncall rotation, runbooks, SLOs
8. PRD decision section with full plan; first extraction estimate is honestly 6-12 months calendar
