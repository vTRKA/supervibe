# Host Neutral Hook Portability

Host hook ideas are portable only after they are translated into Supervibe
adapter contracts. Shared guidance must name the lifecycle intent and required
proof; adapter-owned code decides how Claude, Codex, Gemini, Cursor, and
OpenCode express that intent.

## User Outcome

Contributors can preserve useful automation patterns from a single host without
making the framework depend on that host. A workflow that needs a preflight,
post-write check, receipt, cleanup, or provider diagnostic should behave
predictably across supported hosts or fail closed with a clear unsupported-host
message.

## Scope Boundary

This document covers host portability for Supervibe hook patterns,
session-start context bootstrap, source-cache revalidation, receipt proof,
artifact links, runtime cleanup, and provider diagnostics. It does not define
each host's private instruction file layout, shell integration, or UI event
model. Those details belong in adapter-specific docs and runtime code.

## Non-Goals

- Do not copy Claude-specific shell hooks into shared agents, skills, rules, or
  command docs.
- Do not require Codex, Gemini, Cursor, or OpenCode to emulate Claude hook
  events.
- Do not silently skip required proof when a host lacks a matching capability.

## Portability Pattern

1. Name the lifecycle intent in host-neutral terms: `before-write`,
   `after-write`, `before-command`, `after-command`, `receipt-issued`,
   `artifact-linked`, `cleanup`, or `provider-diagnostic`.
2. Define the proof contract: receipt id, artifact path, validation command,
   status code, or debug state.
3. Ask the active adapter whether it supports the capability.
4. Run the adapter implementation when supported.
5. Fail closed with a diagnostic when the capability is required but unsupported.

## Adapter Mapping

| Host-specific idea | Shared Supervibe contract | Portable failure mode |
| --- | --- | --- |
| Session start, startup, clear, or compact hook | `session-start` lifecycle with `context-bootstrap` intent | No-op when optional; report `unsupported-required-hook` when required |
| Pre-tool or pre-command hook | `before-command` or `before-write` capability with command/path intent | Block the action and report `unsupported-required-hook` |
| Post-tool hook | `after-command` or `after-write` capability with validation evidence | Mark proof missing and require targeted verification |
| Claude shell hook receipt | Runtime-issued workflow receipt with host invocation source and id | Reject hand-written or controller-authored proof |
| Host config doctor | Provider diagnostic capability scoped to the active adapter | Report unsupported provider diagnostic without mutating shared state |
| Cached official doc lookup | Source cache plan plus origin revalidation headers | Refuse cached content as final proof until origin validates it |

## Session Start Context Bootstrap

Session start is the shared lifecycle for startup, clear, and compact events.
Portable hook configuration must invoke shared code through
`SUPERVIBE_PLUGIN_ROOT`; provider-specific hook environment names stay inside
adapter-owned compatibility code. Missing host-neutral root is a quiet no-op so
unsupported hosts do not block the user before the adapter can report support.

The bootstrap output must be compact: active graph summary, tracker state,
stale-state diagnostics, and repair commands. It must not copy full
conversation history or claim durable workflow proof. Runtime cleanup remains
allowed only for Supervibe-owned transient state and does not replace required
workflow receipts.

See [Session Start Context Policy](session-start-context-policy.md) for the
full bootstrap contract and targeted verification command.

## Source Cache Interaction

The source-driven official doc cache is host-neutral by design:

- Cache entries store origin metadata and validators, not host event names.
- Reads produce conditional request headers and debug states.
- Cache reads never produce final proof before origin revalidation.
- Failed origins do not fall back to cached bodies.

See
[`references/source-driven-official-doc-cache.md`](../references/source-driven-official-doc-cache.md)
for the cache contract and targeted verification command.

## Rollback

Rollback is path-scoped: restore the adapter mapping docs, source cache runtime,
and source cache tests. Do not revert unrelated provider configuration or
workflow state changes owned by other work items.
