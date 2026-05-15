# Source Freshness And Fallback Policy

Status: current policy for A036 / T34.
Last verified: 2026-05-15.
Owner: quality-gate-reviewer.

This policy defines how Supervibe agents and skills decide whether source
evidence is current enough to support a high-confidence or 10/10 claim. It is
used with `docs/references/authoritative-source-catalog.md`; the catalog names
authoritative sources and cadences, while this policy defines freshness states,
fallback behavior, and confidence caps.

## Privacy And Secret Boundary

Freshness evidence must be safe to store in public repository artifacts. Record
only source ids, public URLs, local repository paths, timestamps, response
metadata, safe tool names, and redacted fallback reasons.

Never record raw provider config, secrets, private URLs, cookies, localStorage,
auth headers, API keys, user-home dumps, private MCP endpoint details, customer
data, proprietary docs, or copied private provider responses. If private
evidence is required, store only a redacted artifact reference and cap
confidence until a safe reviewer-approved evidence path exists.

## Freshness States

Use one of these states for each source or capability that affects the claim:

| State | Meaning | 10/10 eligibility |
| --- | --- | --- |
| `current` | Source was verified within its catalog cadence, matches the local version or target specialty, and has safe citation evidence. | Eligible when all other gates pass. |
| `aging` | Source is still within cadence but close to expiry, or the exact version match is inferred from local evidence instead of proven by official docs. | Eligible only for low-risk claims with explicit residual risk; not eligible for provider, security, privacy, money, data, or public API decisions. |
| `stale` | Source is past its cadence, version-mismatched, superseded, cached without successful revalidation, or contradicted by newer local/provider evidence. | Not eligible. |
| `unknown` | Freshness date, cadence, authority, version match, registry timestamp, or source provenance is missing or malformed. | Not eligible. |
| `unavailable` | Required source or runtime capability cannot be reached, discovered, or safely cited. | Not eligible; may be blocked for high-risk work. |

Unknown source freshness blocks 10/10 for the affected specialty even when the
implementation appears correct. The output must name the affected specialty and
the missing freshness evidence.

## Cadence Rules

1. Use the `refreshCadence` in
   `docs/references/authoritative-source-catalog.md` when a catalog entry
   exists.
2. If no catalog entry exists, treat the source as `unknown` until the owning
   source-catalog task adds one or the workflow records a task-scoped exception.
3. Revalidate before relying on facts that are volatile, including model/API
   behavior, provider capability, MCP availability, release notes, security
   advisories, pricing, auth, permissions, platform policy, browser/runtime
   support, and production operations.
4. Prefer exact-version docs when local package, runtime, provider, API, schema,
   or platform versions are known. A `current` generic docs page does not prove
   exact-version behavior when the local version is pinned elsewhere.
5. Cached docs need origin freshness proof before they can be `current`: a
   successful origin fetch, a proven conditional revalidation, or another
   runtime-approved freshness proof. Cache age alone is not proof.

## Stale Handling

When a source is `stale`, `unknown`, or `unavailable`:

1. Mark the specific source or capability with `STALE-DOC:`, `UNVERIFIED:`, or
   `UNAVAILABLE-SOURCE:`.
2. Use the catalog fallback hierarchy for the relevant `catalogId` if one
   exists; otherwise use the shared fallback hierarchy below.
3. Preserve local compatibility unless current primary evidence proves the
   local behavior is unsafe, unsupported, or outside the requested scope.
4. Stop or mark the work blocked when the stale/missing source affects security,
   privacy, auth, payments, regulated data, data loss, production provider
   behavior, or public API contracts.
5. Include residual risk and the confidence cap in the handoff or evidence
   artifact.

## Fallback Hierarchy

Use this fallback order unless the catalog entry defines a stricter path:

1. Local repository truth: code, lockfiles, configs, generated artifacts, tests,
   scripts, rules, project memory, Code RAG, and CodeGraph evidence.
2. Current official primary sources: vendor docs, versioned docs, API specs,
   standards, source repositories, release notes, migration guides, status
   pages, capability matrices, and security advisories.
3. Runtime-discovered capability evidence: MCP registry, safe host capability
   bindings, current API schema evidence, and runtime command output.
4. Secondary sources only as search leads to primary sources.
5. User-provided evidence only when safe, scoped, and cited; never as a silent
   replacement for missing public primary evidence.

Fallback does not erase freshness risk. It only defines the least risky path
when the preferred source is not current enough.

## Confidence Caps

Apply the lowest applicable cap to claims affected by source freshness:

| Condition | Maximum confidence |
| --- | --- |
| All relevant sources are `current`, local evidence is cited, and required verification passed. | No freshness cap. |
| At least one relevant source is `aging`, but risk is low and fallback evidence is strong. | 8/10. |
| Any relevant source is `stale`, or cache revalidation did not prove origin freshness. | 7/10. |
| Any relevant source or runtime capability freshness is `unknown`. | 6/10. |
| Required source is `unavailable` but low-risk local fallback is acceptable. | 6/10. |
| Missing/stale source affects security, privacy, auth, payments, regulated data, data loss, production provider behavior, or public API contracts. | 5/10 or blocked until current primary evidence exists. |
| Privacy boundary would require exposing secrets, private URLs, raw provider config, cookies, localStorage, or user-home dumps. | Blocked until a safe evidence path exists. |

Claims about a specialty inherit the cap from every source required for that
specialty. A general workflow may still complete with a lower confidence score,
but it must not claim 10/10 maturity for the affected specialty until freshness
is restored.

## Required Output Fields

Durable source or MCP evidence must include:

- `sourceCatalogIds`: catalog ids used or `none` with fallback reason.
- `freshnessState`: one of `current`, `aging`, `stale`, `unknown`, or
  `unavailable`.
- `lastVerified`: date or `unknown`.
- `refreshCadence`: catalog cadence or `unknown`.
- `fallbackUsed`: fallback source path or capability.
- `confidenceCap`: numeric cap or `none`.
- `privacyBoundary`: confirmation that no raw provider config, secrets,
  private URLs, cookies, localStorage, or user-home dumps were stored.
