# Durable Output Evidence Gates

Status: current contract for A043 / T41.
Last verified: 2026-05-15.
Owner: quality-gate-reviewer.

This contract defines the minimum evidence fields for durable Supervibe outputs:
plans, handoffs, reviews, evidence packets, workflow summaries, state files,
design artifacts, source catalogs, and any artifact used to support a claim of
completion, maturity, readiness, approval, or provenance.

Diagnostic scratch notes, controller-local drafts, search transcripts, and
other non-durable outputs may omit fields only when they label themselves as
diagnostic and include an explicit omission reason.

## Required Evidence Fields

Every durable output must include these fields or clearly named sections:

| Field or section | Required content |
| --- | --- |
| `memoryEvidence` | Memory entry ids and paths used, or `none` with `degradedReason`. |
| `codeRagEvidence` | Code RAG/search command, top cited files or chunks, retrieval quality, and fallback reason when weak or unavailable. |
| `codeGraphEvidence` | Graph symbols, callers/callees/neighbors/impact evidence, Case A/B/C result, or `not-applicable` with reason. |
| `sourceCatalogIds` | Catalog ids from `docs/references/authoritative-source-catalog.md`, or `none` with `degradedReason`. |
| `sourceFreshness` | Freshness state, `lastVerified`, `refreshCadence`, fallback used, and confidence cap from `docs/references/source-freshness-policy.md`. |
| `receiptProvenance` | Runtime receipt ids, host/tool invocation ids, producer/reviewer identity, artifact paths, and whether the producer was real or diagnostic. |
| `verification` | Commands or runtime checks run, timestamps when available, result summary, and any skipped final-only validator reason. |
| `redactionPrivacy` | Confirmation that stored evidence excludes secrets, raw provider config, private URLs, cookies, localStorage, customer data, proprietary docs, and user-home dumps; include redacted artifact references when private evidence was required. |
| `degradedReason` | Required when any evidence source is `none`, `unknown`, `unavailable`, `not-applicable`, stale, partial, or diagnostic-only. |

Null, missing, empty array, or placeholder values are allowed only for
diagnostic non-durable outputs, and only when paired with `degradedReason`.
Durable outputs must not use silent nulls for memory, RAG, CodeGraph, source,
freshness, provenance, verification, or privacy evidence.

## Minimum Durable Schema

Use this shape directly when a more specific schema does not already exist:

```yaml
evidence:
  durability: durable
  memoryEvidence:
    status: cited | none
    entries: []
    degradedReason: null
  codeRagEvidence:
    status: cited | weak | unavailable | none
    command: null
    citations: []
    retrievalQuality: null
    degradedReason: null
  codeGraphEvidence:
    status: case-a-callers-found | case-b-zero-callers | case-c-not-applicable | unavailable
    symbols: []
    query: null
    degradedReason: null
  sourceCatalogIds: []
  sourceFreshness:
    freshnessState: current | aging | stale | unknown | unavailable
    lastVerified: null
    refreshCadence: null
    fallbackUsed: null
    confidenceCap: null
  receiptProvenance:
    receiptIds: []
    hostInvocationIds: []
    producer: null
    reviewer: null
    artifactPaths: []
    diagnosticOnly: false
    degradedReason: null
  verification:
    commands: []
    result: pass | fail | skipped-final-only | not-run
    degradedReason: null
  redactionPrivacy:
    status: clear | redacted | blocked
    statement: null
    redactedArtifactRefs: []
    degradedReason: null
  degradedReason: null
```

If `durability: diagnostic` is used, the artifact must also include:

```yaml
diagnosticOmissions:
  omittedFields: []
  reason: null
  durableReplacementPath: null
```

## Source And Taxonomy References

This contract uses the A041 creative reference taxonomy in
`docs/references/creative-reference-taxonomy.md` for design evidence quality:
durable design outputs must preserve reference role, quality tier, pack id/path,
borrow/avoid notes, and fit rationale when creative references affect a claim.
If the output is not design-facing, record a domain-specific not-applicable
reason rather than leaving taxonomy evidence blank.

This contract also uses the A035 authoritative source catalog in
`docs/references/authoritative-source-catalog.md` and the A036 freshness policy
in `docs/references/source-freshness-policy.md`. Durable outputs must cite
catalog ids and freshness states instead of copying unmanaged URLs into each
artifact. Missing catalog entries become degraded evidence, not silent
substitutes.

## Gate Rules

1. A durable output cannot claim complete, approved, release-ready, 10/10, or
   production-ready while any required evidence field is missing or silently
   null.
2. Missing memory, RAG, CodeGraph, source, provenance, verification, or privacy
   evidence must lower confidence and name the affected claim.
3. CodeGraph may be `case-c-not-applicable` for pure documentation, policy, or
   diagnostic work only when the output states why no structural code impact is
   being claimed.
4. Final-only validators and tests may be deferred only when repository policy
   requires deferral; the durable output must name the deferred command and the
   final gate that owns it.
5. Private evidence must be summarized through redacted references. Durable
   public artifacts must not store secrets or private provider/user data.
6. Receipt or provenance evidence must identify the actual producer path. A
   controller-authored draft may support diagnostics but cannot satisfy a
   specialist, reviewer, worker, executable skill, or external-tool producer
   claim.

## Review Checklist

- Memory evidence is present or degraded with a reason.
- Code RAG evidence is present or degraded with a reason.
- CodeGraph evidence is Case A, Case B, or Case C with a reason.
- Source catalog ids and freshness fields match A035/A036 policy.
- Receipt/provenance evidence names real runtime receipts or explicitly marks
  diagnostic-only output.
- Verification evidence names commands run or final-only deferral.
- Redaction/privacy boundary is explicit.
- No durable claim depends on a silent null, missing field, or untrusted manual
  receipt.