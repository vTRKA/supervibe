---
name: security-and-hardening
namespace: app-excellence
description: "Use WHEN changing auth, data, secrets, dependencies, integrations, or tool access to reduce attack surface and prove hardening evidence."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: review
prerequisites: []
emits-artifact: security-hardening-report
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Security And Hardening

## Overview

Security And Hardening turns security-sensitive work into a concrete attack-surface, trust-boundary, validation, secret-safety, dependency, logging, and fail-closed review. It is the direct skill counterpart for security agents and local security references.

## When to Use

Use before merging or releasing changes that touch auth, authorization, secrets, PII, payments, file access, network egress, dependencies, AI/tool permissions, webhooks, admin actions, CI/CD, browser security headers, or data storage.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read the diff, spec, or task scope and identify security-sensitive surfaces.
2. Search project memory for prior incidents, accepted risks, credential decisions, and security patterns.
3. Use Code RAG and CodeGraph to find entry points, validation, policy checks, sinks, and callers.
4. Read `references/checklists/security.md` and any project-specific security rules when deeper checklist evidence is needed.
5. Use official security advisories or source-driven evidence for dependency/provider claims that may change.

## When not to use

- Do not use to perform unauthorized penetration testing or destructive scans.
- Do not mutate source in audit mode; hand remediation to the implementation owner unless the workflow explicitly authorizes fixes.
- Do not report a high severity finding from grep alone; prove reachability or label uncertainty.
- Do not accept risk without owner, expiry, and evidence.

## Decision tree

```text
Does the change touch trust boundary, sensitive data, secrets, dependencies, or external input?
  NO  -> use standard review unless policy requires security signoff.
  YES -> continue.

Can a user or external system influence the input?
  YES -> validate, normalize, authorize, and encode before sinks.
  NO  -> still check internal misuse, logs, and privilege boundaries.

Is a vulnerable pattern reachable from an entry point?
  YES -> block or require remediation.
  NO  -> record as candidate or defense-in-depth note.
```

## Procedure

1. Map assets: secrets, credentials, tokens, PII, payment data, user content, admin actions, tenant data, and CI/CD credentials.
2. Map trust boundaries: browser, mobile, external API, webhook, queue, plugin host, MCP/tool call, filesystem, database, and internal service.
3. Trace entry to sink for each risk: input -> validation -> authz -> transformation -> storage/action/log/output.
4. Verify authentication and authorization at every layer that can execute the sensitive action.
5. Verify input validation, output encoding, file path safety, SSRF/egress controls, CSRF/session controls, and tenant isolation where relevant.
6. Check secrets: no hardcoded credentials, safe test secrets, redacted logs, no token leakage in errors or telemetry.
7. Check dependency and supply-chain risk: lockfile version, advisory reachability, maintainer/package trust, and safe upgrade path.
8. Check AI/agent surfaces when present: prompt injection, tool permission drift, RAG/memory poisoning, schema poisoning, and system-prompt leakage.
9. Define hardening changes with owner, tests, rollout, rollback, and re-audit command.
10. Score with `supervibe:confidence-scoring`; do not mark complete while critical/high reachable findings remain open.

## Common rationalizations

- "This is behind auth" fails when authorization, tenant boundary, CSRF, or role downgrade behavior is not proven.
- "The dependency CVE is low" fails when exploit availability and project reachability raise practical risk.
- "It is only logged internally" fails when logs can contain PII, secrets, tokens, or tenant data.

## Red flags

- User-controlled URL, path, command, SQL, HTML, template, regex, or deserialization sink.
- Permission check exists in UI but not server or service layer.
- Secrets, tokens, or PII appear in source, fixtures, errors, logs, traces, or screenshots.
- Dependency fix uses a forced downgrade or major bump without compatibility evidence.
- AI/tool surface can call external tools with attacker-controlled instructions.

## Checklist

- Assets and trust boundaries mapped.
- Reachability proven or uncertainty labeled.
- Authn, authz, validation, encoding, secrets, logging, dependencies, and egress checked.
- Findings have severity, evidence, owner, remediation, verification, and residual risk.
- Re-audit path exists for every claimed fix.

## Failure modes

- Security review becomes generic checklist with no code-path evidence.
- Findings are overstated from pattern hits.
- Fixes patch the symptom but leave adjacent sinks reachable.
- Risk acceptance has no expiry or business owner.

## Output contract

- `scope`: files, routes, commands, services, or surfaces reviewed.
- `assets`: protected data/actions and trust boundaries.
- `findings`: severity, CWE/OWASP where relevant, reachability, evidence, remediation, owner.
- `hardeningPlan`: concrete fixes, tests, rollout, rollback.
- `verificationCommands`: audit, grep, test, or re-audit commands.
- `acceptedRisk`: owner, reason, expiry, compensating controls.
- `residualRisk`: incomplete evidence or deferred checks.

## Guard rails

- Do not expose secrets in reports.
- Do not run destructive security tools or external scans without authorization.
- Do not claim fixed until source read and verification both support it.
- Keep findings actionable and scoped to reachable risk.

## Verification

- Dependency audit command for the stack when dependencies changed.
- Grep or scanner output for secrets and unsafe sinks where relevant.
- Targeted tests for authz, validation, encoding, or regression behavior.
- `npm run validate:skill-content-quality` when this skill changes.

## Related

- `supervibe:auth-flow-design`
- `supervibe:incident-response`
- `supervibe:rule-audit`
- `supervibe:source-driven-development`
- `supervibe:pre-pr-check`