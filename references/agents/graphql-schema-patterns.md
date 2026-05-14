# GraphQL Schema Patterns

Reusable schema-design decision depth relocated from `graphql-schema-designer`.

## Slicing Contract

- Agent files keep persona, invocation boundary, procedure, output contract, skills, verification, dialogue discipline, and anti-patterns.
- This reference holds reusable depth: decision trees, workflow matrices, detailed examples, and output templates.
- Load this file only when the current task needs the deeper pattern; otherwise use the concise agent contract.
- Treat copied source sections as reference patterns, not mandatory steps for every task.

## GraphQL Schema Designer: Decision Tree

Source agent: `agents/stacks/graphql/graphql-schema-designer.md`
Moved content type: schema, federation, pagination, errors, subscriptions, and lifecycle routing tree

## Decision tree

```
SCHEMA-FIRST vs CODE-FIRST
  Default: schema-first IF the team has multi-language clients and SDL is the
           single source of truth shared in PRs.
  Code-first when ALL hold:
    - Backend is one strongly-typed language (TS/C#/Python with type hints/Go)
    - Refactoring tools (rename, find-references) are a daily activity
    - SDL is generated and committed; the generated SDL is the contract
  Switch criteria — pick whichever the TEAM, not the framework, can sustain:
    - Schema-first: SDL in PRs, codegen for resolver stubs, type-safe at runtime
    - Code-first: types in code, SDL emitted in CI, type-safe at compile time
  Anti-pattern: code-first WITHOUT typing — `resolve: (parent, args) => any`,
                resolver returns untyped objects, SDL drifts from runtime shape.
                If you go code-first, the language types MUST be the source of truth.

FEDERATION v2 — when to introduce
  Stay monolithic schema when:
    - Single team, single deploy, <50 types
    - All resolvers in one process
  Introduce federation v2 when ≥2 hold:
    - Multiple teams own distinct subgraphs (one team should not block another's deploy)
    - Distinct datastores: each subgraph owns its types with `@key` and resolves
      reference relationships
    - Independent scaling envelopes per subgraph
    - Clear domain boundaries (Catalog, Identity, Billing, Inventory)
  Federation invariants:
    - Each entity has exactly one owning subgraph (declared by `@key`)
    - Extensions use `extend type` with `@key` repeated; no field collisions
    - Composition checked in CI BEFORE any subgraph deploy (`rover supergraph compose`)
    - Breaking change check on every PR (`graphql-inspector diff` against last-published)
  Anti-pattern: subgraph-per-microservice without `@key` design — produces a federated
                schema that won't compose. Federation is a graph contract, not a deploy unit.

DATALOADER — N+1 prevention
  Every list-of-children resolver MUST go through a DataLoader, period.
  Loader scope: one loader instance PER REQUEST (never global, never long-lived).
  Batch key: the parent ID (or composite key); dedupe within the request.
  Batch function: ONE underlying call (DB query, RPC, HTTP) returning results
                  ordered to match the input keys; missing keys map to null.
  Coverage gate: code review must reject any new resolver that fetches by parent
                 without going through a loader. Static check: grep for direct
                 ORM calls inside resolvers — every hit is a candidate violation.

PERSISTED QUERIES — security + perf
  Required for production public APIs:
    - Allowlist mode: only registered query hashes execute; arbitrary ad-hoc
      queries rejected (defends against malicious deep queries, scraping, and
      complexity attacks)
    - APQ (Automatic Persisted Queries) — first-class for Apollo; equivalents
      exist in Hot Chocolate, Strawberry, gqlgen
    - Manifest publication: the build pipeline emits the manifest of allowed
      hashes; the gateway reads it; rotation is a deploy
  Bypass conditions (rare, must be explicit):
    - Internal-only tooling that needs ad-hoc queries → separate gateway with auth
    - Development environments → never the production gateway
  Anti-pattern: persisted-queries-bypassed — a "?bypass=true" query param, an
                "internal" header, a dev-only flag that ships to prod.
                If the gateway accepts arbitrary queries in prod, persisted queries
                are not actually enforced.

ERROR HANDLING
  Three legitimate strategies — pick ONE for the schema and apply uniformly:

  1. Envelope (`{ data, errors }`) — GraphQL spec default
     - Pros: works everywhere, clients know how to read it
     - Cons: `errors` is opaque; partial failures are easy to ignore;
             clients write generic error UIs that don't match domain semantics

  2. Nullable fields + `errors[].extensions.code`
     - Pros: failures map to null fields; codes give clients a typed taxonomy
     - Cons: nullability is overloaded ("absent" vs "failed"); requires discipline

  3. Union types (`UserResult = User | UserNotFound | UserBlocked`) — Stripe-style
     - Pros: errors are first-class types; clients pattern-match on `__typename`;
             non-fatal failures are explicit
     - Cons: more SDL surface; mutation results need result-types per operation

  Recommendation: union types for mutations and high-stakes queries (payments,
                  auth, anything where the client must distinguish failure modes);
                  envelope + extensions.code for routine queries.

  Anti-pattern: mixing all three in one schema with no policy — clients can't
                tell which error model applies where.

PAGINATION
  Cursor-based (Relay Connection spec) — DEFAULT for any list:
    - `Connection { edges: [Edge], pageInfo: PageInfo, totalCount: Int }`
    - `Edge { node: T, cursor: String }`
    - `PageInfo { hasNextPage, hasPreviousPage, startCursor, endCursor }`
    - Args: `first: Int, after: String` (forward) and `last: Int, before: String` (back)
    - Cursor opacity: opaque base64 of `(sort_key, id)` — clients must NOT parse
    - Stable order: cursor encodes the sort key + tiebreaker; result set must be
      reproducible across pages
  Offset-based (`limit`, `offset`):
    - Acceptable ONLY for: small bounded datasets (<1000 rows) and admin tooling
      that genuinely needs page numbers
    - Unacceptable for: public APIs, infinite scroll, anything where insertions
      shift the offset (duplicate / missed rows)
  Anti-pattern: pagination-by-offset-only — every list paginated by offset is a
                latent bug at scale; once a list crosses ~10K rows, deep offsets
                cost more than the entire query.

SUBSCRIPTIONS — transport
  graphql-ws (WebSocket subprotocol) — DEFAULT:
    - Bidirectional, low-latency, native to Apollo/Hot Chocolate/Strawberry/gqlgen
    - Requires a WS-capable infra (sticky session or shared backplane like Redis)
    - Auth: token in connection_init payload; revalidate on resubscribe

  graphql-sse (Server-Sent Events):
    - One-way, HTTP/1.1 friendly, simpler ops (no WS upgrade)
    - Use when: corporate proxies block WS, mobile clients on flaky networks,
                infra cannot guarantee WS at edge
    - Limitation: no client-to-server messages over the SSE channel; control
                  plane uses regular HTTP

  Pick WS if you don't have a specific reason to pick SSE.
  Anti-pattern: legacy `subscriptions-transport-ws` (the original Apollo protocol)
                — deprecated; new schemas use `graphql-ws` (graphql-ws library)

SCHEMA VERSIONING + DEPRECATION
  GraphQL has NO version numbers — the schema changes in place.
  Field lifecycle:
    1. Add new field (`v2` of the data) — never break the old one
    2. Mark old field `@deprecated(reason: "Use newField. Sunset: YYYY-MM-DD")`
       — sunset date is MANDATORY; "deprecated forever" is a permanent technical-debt
       beacon
    3. Track usage via persisted-query manifest + apollo studio / equivalent —
       no removal until usage is provably zero (or below the sunset threshold)
    4. Remove on sunset date — schema diff in CI flags the breaking change;
       the removal is itself a PRD decision section
  Breaking-change taxonomy (every PR runs this check):
    - Removed type / field / enum value — BREAKING
    - Made nullable field non-null — BREAKING (existing nulls become invalid)
    - Made non-null field nullable — non-breaking on read, breaking on write
    - Removed argument — BREAKING
    - Added required argument — BREAKING
    - Changed enum value — BREAKING
  Anti-pattern: deprecation-without-sunset-date — a `@deprecated` that lives
                forever; nobody removes it; schemas accumulate ghost fields;
                clients keep writing new code against deprecated paths.

MUTATIONS — single side effect rule
  One mutation = one logical side effect.
  Anti-pattern: mutation-with-multiple-side-effects — `createUserAndSendEmailAndChargeCardAndProvisionWorkspace`.
  Reason: partial failure is impossible to express in one return type; clients
          can't retry idempotently; the operation is not really one operation.
  Fix: orchestrate on the server (job pipeline, saga), expose either:
       - one mutation that kicks off the orchestration and returns a job handle,
         which the client polls / subscribes to, OR
       - multiple cohesive mutations the client can compose with explicit error
         handling between them.
```

## GraphQL Schema Designer: Decision Template

Source agent: `agents/stacks/graphql/graphql-schema-designer.md`
Moved content type: schema decision and migration template

## Context

<2-4 paragraphs: what's true in the current schema, what driver forces this decision,
what constraints apply (client population, federation topology, deprecation policy,
runtime — Apollo / Hot Chocolate / Strawberry / gqlgen). Cite specific evidence:
SDL line refs, persisted-query manifest counts, N+1 incident IDs, breaking-change
diff output, composition error logs.>

## Decision

<1-3 paragraphs: what we will do, in concrete SDL terms. Type names, field names,
directive usage (`@key`, `@deprecated(reason: "...", sunset: "...")`),
DataLoader keys, error union members, pagination type names. No vague
"we will adopt federation" — instead "we will split Catalog into its own subgraph
owning Product / Category / Listing with `@key(fields: \"id\")` on each entity,
publishing a supergraph composed via rover in CI.">

## Alternatives Considered

1. **<Alternative A>** — <1-2 sentences>. Rejected because: <specific reason>.
2. **<Alternative B>** — <1-2 sentences>. Rejected because: <specific reason>.
3. **Status quo (do nothing)** — <1-2 sentences>. Rejected because: <specific reason>.

## Consequences

**Positive**:
- <consequence with measurable signal where possible — e.g., "P99 query latency
  for Product.reviews drops from 1200ms to 80ms once DataLoader batches the
  per-product author lookup">
- ...

**Negative**:
- <consequence; do not hide costs — e.g., "subgraph split adds ~40ms median
  query latency due to gateway hop; mitigated by query plan caching">
- ...

**Neutral / accepted trade-offs**:
- <e.g., "code-first decorators introduce one more codegen step in CI">

## Migration Plan

1. <Step 1 — concrete, owner, estimated effort, sunset date if applicable>
2. <Step 2 — ...>
3. ...

**Rollback path**: <how to undo if mid-migration failure — e.g., "republish
prior supergraph manifest; gateway hot-swaps within 60s">
**Reversibility**: One-way | Reversible
**Estimated effort**: N engineer-days, M calendar weeks
**Sunset date** (if deprecation): YYYY-MM-DD
**Blast radius**: <which clients / queries affected if migration fails>

## Verification

- [ ] SDL valid — `graphql-schema-linter` or runtime introspection clean
- [ ] Federation composes — `rover supergraph compose` exit 0 (if federated)
- [ ] Breaking-change diff classified — `graphql-inspector diff` reviewed
- [ ] DataLoader coverage — every list-of-children resolver routed through a loader
- [ ] Persisted-query manifest regenerated and published
- [ ] Pagination Relay-compliant — Connection / Edge / PageInfo present where required
- [ ] Deprecation has sunset date — every `@deprecated` carries `sunset: "YYYY-MM-DD"`
- [ ] PRD decision section linked from affected SDL files' header comments
```

## GraphQL Schema Designer: Common Workflows

Source agent: `agents/stacks/graphql/graphql-schema-designer.md`
Moved content type: schema workflow matrix

## Common workflows

### New federation v2 subgraph introduction
1. Read the active host instruction file + current supergraph manifest + existing subgraph ownership map
2. `supervibe:project-memory` — prior federation PRD decision sections, retired subgraphs, prior `@key` discussions
3. Identify the driver — team autonomy / data ownership / scaling envelope / domain boundary
4. Walk FEDERATION decision tree; confirm ≥2 drivers hold
5. Name the subgraph, its entities, its `@key` fields, the types it owns vs extends
6. Draft the subgraph SDL with `extend schema @link(url: "https://specs.apollo.dev/federation/v2.0")`
7. For every `@key`, define the entity reference resolver in the runtime (Apollo `__resolveReference`, Hot Chocolate `[ReferenceResolver]`, Strawberry `@strawberry.federation.type(keys=...)`, gqlgen `Entity_*`)
8. Run `rover supergraph compose` against the proposed config; capture output verbatim
9. Run `graphql-inspector diff` against the last-published supergraph; classify changes
10. Write PRD decision section with composition output + diff output + migration plan (subgraph deploy order, gateway cutover, rollback)
11. Estimate effort: engineer-days for subgraph extraction, calendar weeks for client migration if any types moved ownership
12. Confidence score, deliver

### DataLoader retrofit (N+1 incident response)
1. Read incident report — identify the offending query and the per-parent fetch
2. `supervibe:code-search` for the resolver implementation; confirm it calls the data source per parent
3. Design the loader: batch key (parent ID), batch function (single underlying call), result ordering (must match input keys, missing → null)
4. Specify loader scope: per-request (NEVER global, NEVER long-lived); registered in the request context
5. Map all resolvers that share the batch key — every one uses the same loader instance
6. Identify cache strategy: per-request memoization is mandatory; cross-request caching is a separate decision
7. Update the resolver signature to receive `context.loaders.<X>` and call `loader.load(parent.id)`
8. Add a regression test that asserts batch size ≤ N for a query returning N parents (e.g., 10 parents → 1 underlying call, not 10)
9. PRD decision section documents the loader registration, the batch key, the cache strategy, and the regression test
10. Verify against `no-DataLoader` anti-pattern across the rest of the schema; flag any other resolvers fetching by parent

### Pagination retrofit (offset-to-cursor migration)
1. Identify the list field paginated by offset; measure current usage (persisted-query manifest)
2. Walk PAGINATION decision tree; confirm offset is unacceptable (unbounded list, public API, insertion-shift risk)
3. Design the Connection types: `<T>Connection`, `<T>Edge`, reuse global `PageInfo`
4. Define cursor encoding: opaque base64 of `(sort_key, tiebreaker_id)`; document that clients MUST NOT parse cursors
5. Add the new `<field>Connection` field alongside the existing offset-paginated field; do NOT remove the old field
6. Mark the old field `@deprecated(reason: "Use <field>Connection. Sunset: YYYY-MM-DD")`
7. Migrate clients (coordinate via persisted-query manifest); track adoption
8. Sunset removal: separate PRD decision section on the agreed date; SDL diff shows the breaking change
9. Anti-pattern check: confirm pagination-by-offset-only is no longer present in the affected list

### Error-model migration (envelope → union types for mutations)
1. Inventory mutations and their failure modes; identify which mutations have rich domain failures (payments, auth, provisioning)
2. Design result unions per mutation: `<Mutation>Result = <Success> | <DomainFailure1> | <DomainFailure2>`
3. Define each failure type as a concrete object type with at least `message: String!` and any domain-relevant fields (e.g., `BlockedReason`, `MinimumChargeAmount`)
4. Add the new `<mutation>V2` mutation returning the union; do NOT remove the v1 mutation
5. Coordinate client migration; track adoption via persisted-query manifest
6. Once adoption is ≥99%, deprecate v1 with a sunset date
7. Sunset removal: separate PRD decision section; SDL diff captures the breaking change
8. Document the policy in the schema header: "Mutations use union result types per PRD decision section-NNNN"

### Persisted-queries enforcement rollout
1. Audit the current gateway: does it accept ad-hoc queries in production?
2. Inventory clients: every client team must adopt the persisted-query workflow (build-time hash, manifest publication, runtime hash-only sends)
3. Choose enforcement mode: APQ (clients can register on first miss) or strict allowlist (only pre-published hashes accepted)
4. Stage rollout: warn mode (log ad-hoc queries, allow them) → enforce mode (reject ad-hoc with persisted-query-not-found)
5. Coordinate with client teams; track ad-hoc query volume in warn mode until it reaches zero
6. Flip to enforce; monitor error rates
7. PRD decision section documents the policy, the rollout sequence, the rollback (revert to warn mode)
8. Anti-pattern check: confirm no bypass path exists in production gateway config

### Deprecation lifecycle (field removal)
1. Identify the field to remove; measure current usage via persisted-query manifest
2. Confirm a replacement exists (or document why removal without replacement is correct)
3. Mark `@deprecated(reason: "Use <replacement>. Sunset: YYYY-MM-DD")` with a sunset date ≥3 months out
4. Write PRD decision section for the deprecation: context (why deprecate), decision (mark + sunset date), migration (replacement field, client guidance), consequences (clients on the old field break at sunset)
5. Coordinate client migration; track via persisted-query manifest; weekly status until usage is near-zero
6. On sunset date: write removal PRD decision section, run `graphql-inspector diff` to confirm BREAKING, remove the field, deploy
7. Anti-pattern check: confirm no `@deprecated` without sunset remains in the schema

### Subscription transport selection (WS vs SSE)
1. Inventory subscription use cases — order updates, chat, presence, notifications
2. Walk SUBSCRIPTIONS decision tree; pick `graphql-ws` unless infra constraint forces SSE
3. If WS: confirm sticky-session capability OR shared backplane (Redis pub/sub, NATS); design the auth handshake (token in `connection_init`, revalidate on resubscribe)
4. If SSE: design the parallel HTTP control plane for client-to-server messages (subscribe / unsubscribe / params change)
5. Specify the runtime hook: Apollo `useServer` (graphql-ws), Hot Chocolate `AddInMemorySubscriptions` / `AddRedisSubscriptions`, Strawberry `Schema(subscription=...)`, gqlgen `gqlgen.Server` with WS handler
6. Define the subscription event payload shape — same Connection/Edge conventions if streaming a list
7. PRD decision section documents the transport choice, the backplane, the auth model, the rollout (parallel transports during migration if any)
