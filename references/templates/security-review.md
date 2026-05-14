# Security Review Template

Use this template when work touches secrets, credentials, authentication,
authorization, permissions, untrusted input, generated code, dependency changes,
network access, local filesystem access, release packaging, privacy, compliance,
or user data exposure. Keep findings evidence-backed and actionable.

## Review Metadata

| Field | Required content |
| --- | --- |
| Title | Short review name tied to the change. |
| Status | Clear, clear with residual risk, blocked, or needs remediation. |
| Reviewer | Responsible security reviewer, agent, skill, or maintainer role. |
| Scope | Files, commands, artifacts, data flows, runtime paths, and threat surfaces reviewed. |
| Out of scope | Security areas explicitly not reviewed and why they are excluded. |
| Evidence | Source reads, tests, dependency data, logs, docs, CodeGraph, or domain standards. |

## Scope And Assets

Record the assets and trust boundaries involved:

- Assets protected: secrets, tokens, user data, project memory, generated
  artifacts, workflow state, model outputs, release packages, or local files.
- Actors: user, maintainer, local agent, external service, plugin runtime,
  command workflow, reviewer, or untrusted input source.
- Entry points: command arguments, config files, prompts, file reads, network
  requests, package scripts, generated artifacts, UI input, or imported data.
- Trust boundaries: local workspace, runtime sandbox, host adapter, external
  API, package registry, browser context, or user-provided file.

## Threat Model

| Threat | Entry point | Impact | Existing control | Gap |
| --- | --- | --- | --- | --- |
| Secret disclosure | Logs, generated artifacts, command output, or telemetry. | Token leak, account access, or privacy breach. | Redaction, allowlist, or no-secret policy. | Missing test, missing redaction, or unreviewed path. |
| Privilege bypass | Command routing, permission checks, file writes, or workflow state. | Unauthorized mutation or policy bypass. | Scope gate, validator, runtime check, or review gate. | Missing enforcement or ambiguous ownership. |
| Untrusted input execution | Prompt, script, dependency, config, or generated code. | Code execution, data corruption, or supply-chain compromise. | Parser, sandbox, validation, pinned dependency, or manual review. | Missing validation or stale dependency evidence. |
| Data overexposure | Memory, logs, indexes, artifacts, screenshots, or exports. | Sensitive data retained or shared beyond need. | Minimization, retention limit, or redaction. | Undefined retention or overbroad artifact. |

## Findings

Use one row per finding. Do not combine unrelated risks.

| ID | Severity | Finding | Evidence | Required fix | Verification |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | Critical, high, medium, low, or informational. | Concrete risk and affected path. | File, line, command output, log, standard, or reviewer note. | Specific code, docs, policy, or workflow change. | Exact test, validator, manual check, or reviewer re-check. |

Severity guidance:

- Critical: exploitable secret exposure, remote execution, authorization bypass,
  destructive data loss, or release compromise.
- High: likely exploitation path with meaningful data, account, or system
  impact.
- Medium: plausible exploitation path, defense gap, or sensitive data handling
  drift.
- Low: hard-to-exploit issue, missing hardening, incomplete docs, or minor
  policy drift.
- Informational: evidence note with no required fix.

## Required Fixes

List fixes in dependency order:

1. Blocker fixes required before merge, release, or workflow completion.
2. Hardening fixes that can follow once blockers are closed.
3. Documentation or policy fixes needed to prevent recurrence.

Each fix must name an owner, target file or artifact, verification command, and
rollback or mitigation if the fix fails.

## Verification

Record exact proof:

- Commands: targeted tests, validators, dependency checks, or security scans run
  for this scope.
- Manual review: files, data flows, logs, command output, generated artifacts,
  or browser state inspected.
- Source evidence: standards, official docs, CodeGraph, Code RAG, project
  memory, or [security checklist](../checklists/security.md).
- Redaction check: confirm secrets, credentials, and private data are absent
  from logs and artifacts or intentionally redacted.
- Residual risk: accepted risk, owner, expiry trigger, and required follow-up.

## Decision

Record one decision:

- Clear: no blocking findings remain and verification evidence is complete.
- Clear with residual risk: non-blocking risk is recorded with owner and trigger.
- Blocked: one or more required fixes or evidence sources are missing.
- Needs remediation: fixes are known but unverified.

## Handoff

Use [Worker Handoff](worker-handoff.md) when another worker must implement fixes
or rerun verification. Use [Source Evidence Report](source-evidence-report.md)
when the review depends on current standards, official docs, dependency data, or
project retrieval evidence.

## Completion Checklist

- Scope and out-of-scope areas are explicit.
- Assets, actors, entry points, and trust boundaries are named.
- Findings have severity, evidence, required fix, and verification.
- Secrets and private data exposure were checked.
- Residual risks have owner and trigger.
- Final decision is clear, blocked, or needs remediation with evidence.
