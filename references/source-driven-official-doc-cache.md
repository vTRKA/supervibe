# Source Driven Official Doc Cache

Use cached official docs only as a speed optimization. Cached content is never
final implementation proof until the origin has revalidated it for the current
work item.

## User Outcome

Contributors can reuse official documentation snippets across Claude, Codex,
Gemini, Cursor, and OpenCode without turning a local cache into stale authority.
The cache answers "what should I ask the origin to validate?" rather than "what
is true forever?".

## Runtime Contract

The portable cache runtime lives in
[`scripts/lib/source-driven-doc-cache.mjs`](../scripts/lib/source-driven-doc-cache.mjs)
and is covered by
[`tests/source-driven-doc-cache.test.mjs`](../tests/source-driven-doc-cache.test.mjs).

- Cache entries record `url`, `body`, `etag`, `lastModified`, `fetchedAt`,
  optional `productVersion`, and optional `validatorCommand`.
- `planOfficialDocCacheRead` always returns `canServeCached: false` and
  `canUseAsFinalProof: false` for cache reads. It may return conditional
  revalidation headers, but the caller still needs an origin request.
- A cache hit is valid only after an origin `304` response with matching
  conditional request headers when those headers are supplied to the runtime.
- A fresh origin `200` response can refresh the cache only when the response
  includes `ETag` or `Last-Modified`.
- Missing validator headers, version mismatch, missing origin URL, or failed
  origin responses are miss/failure states and must not serve cached content.

## Dependency And Provider Binding

Every cache read must be bound to local version evidence before it can influence
implementation:

- Dependency docs: record the package manager, lockfile path, package name, and
  installed version. If only a semver range is available, mark the evidence
  `UNVERIFIED: installed version unresolved`.
- Framework docs: record framework version, router/runtime/build mode, and
  relevant config path because docs for the same framework can describe
  incompatible modes.
- Provider/API docs: record SDK version, provider id, model or endpoint id, API
  version header, auth mode, region when relevant, and local capability matrix
  or config path.
- Security-sensitive docs: record direct advisory, changelog, release note, or
  official hardening guide evidence, not just API reference pages.

If a cache entry has `productVersion`, pass the expected local version into the
cache planner. A mismatch is a miss and must trigger origin fetch or
`STALE-DOC:` evidence, not silent fallback to the cached body.

## Evidence States

- `origin-fetched`: an origin `200` response was received for the current work
  item. It can be final proof for the fetched body; it can refresh the cache only
  when validator headers are present.
- `origin-revalidated`: an origin `304` response matched the request validators
  derived from the cached entry. It can serve the cached body as final proof for
  the current work item.
- `origin-fetched-uncacheable`: an origin `200` response lacked `ETag` and
  `Last-Modified`. It can support the current work item, but it must not refresh
  the cache.
- `freshness-revalidate` or `stale-revalidate`: the cache can provide request
  headers only. The cached body is not final proof until origin revalidation
  succeeds.
- `miss`, `stale-miss`, `version-mismatch-miss`,
  `revalidation-proof-missing`, `uncacheable-miss`, or `fetch-failed`: do not
  serve cached content as authority.

## Revalidation Procedure

1. Detect the local dependency, framework, provider, API, or security-sensitive
   package version from lockfiles and config before selecting a cache entry.
2. Call `planOfficialDocCacheRead(entry, { expectedProductVersion })`.
3. If the plan returns conditional headers, request the origin with those
   headers. Preserve the request headers and response status as proof.
4. Call `applyOfficialDocCacheResponse` with the origin response.
5. Use cached body only when the result is `cache-hit` with
   `proofStatus: origin-revalidated`.
6. Use fresh body from origin when the result is `refreshed` or
   `origin-fetched-uncacheable`.
7. If origin access fails, record `STALE-DOC:` or `UNVERIFIED:` and choose a
   conservative local-code decision. For security, payment, auth, privacy,
   provider-config, release, or data-loss facts, stop or escalate instead of
   treating stale docs as enough.

## Unverified And Stale Markers

Use explicit markers in source-evidence reports and handoffs:

- `UNVERIFIED:` a fact was not confirmed at origin or local version evidence was
  incomplete.
- `STALE-DOC:` docs were cached, undated, version-mismatched, or failed origin
  revalidation.
- `LOCAL-WINS:` implementation follows repository compatibility because local
  code, tests, generated clients, or deployment config contradict current docs.
- `ORIGIN-WINS:` official source evidence proves the local pattern is unsafe,
  deprecated, security-sensitive, or incompatible with the intended version.

Markers should include the source path or URL, detected version, retrieval or
revalidation date, and why the marker does not block or does block the current
work.

## Citation Rules

Official-doc cache citations must include:

- Origin URL and section or anchor.
- Product, dependency, provider, API, or schema version.
- Retrieval or revalidation date.
- Cache decision status and proof status.
- Validator evidence: `ETag`, `Last-Modified`, `If-None-Match`, or
  `If-Modified-Since` when present.
- Local version source such as lockfile path, config path, generated client
  metadata, or provider capability matrix.

Secondary sources may appear only as discovery leads. They do not satisfy final
source-driven proof when official docs, source repositories, specs, release
notes, or advisories are available.

## Docs Versus Local Code

When official docs and local code disagree:

- Prefer local code for current deployed behavior and compatibility.
- Prefer official migration guides, release notes, security advisories, and API
  specs when local behavior is unsafe, deprecated, or outside the detected
  supported version.
- Add version guards, adapter isolation, or compatibility notes instead of
  broad rewrites when a narrow change can satisfy the task.
- Stop for user or reviewer input when the conflict affects auth, money,
  privacy, migrations, public API contracts, data loss, production provider
  behavior, or a package upgrade outside the claimed scope.

## Scope Boundary

This policy applies to source-driven official documentation evidence: vendor
docs, SDK docs, release notes, standards references, and provider configuration
docs. It does not replace local code evidence, project memory, Code RAG, or
CodeGraph checks. Local implementation still wins when the local compatibility
surface intentionally diverges from the upstream source.

## Non-Goals

- Do not mirror vendor documentation into repository source as a permanent
  authority.
- Do not copy Claude-specific hook shell patterns into shared Supervibe
  surfaces.
- Do not let a cache entry, receipt, or command alias substitute for real
  origin evidence when a regulated, security, payment, provider-config, or
  release fact is being claimed.

## Examples

- Frontend framework: a cached routing page for a newer framework major can
  guide what to revalidate, but local lockfile and router mode decide whether
  the example applies.
- Backend framework: a cached dependency-injection guide is stale if the local
  lockfile pins an older validation library major used by that framework.
- Provider/API: a cached model capability page must be revalidated against the
  provider origin and local API version header before changing defaults.
- API schema: generated client metadata and checked-in schema win over stale
  public docs until the schema source is refreshed.
- Security-sensitive dependency: a cache hit is not enough for crypto, auth,
  payment, deserialization, or sandbox behavior unless origin revalidation and
  advisory evidence are recorded.

## Host-Neutral Hook Portability

Hook behavior inspired by one host must be mapped through
[`docs/host-neutral-hook-portability.md`](../docs/host-neutral-hook-portability.md).
Shared Supervibe code should describe lifecycle intent, required proof, adapter
capability, and failure mode. Host-specific folders, shell commands, or runtime
events belong only in adapter-owned surfaces.

## Verification

Targeted verification for this contract:

```bash
node --test tests/source-driven-doc-cache.test.mjs
npm run validate:artifact-links
```
