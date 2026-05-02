# Agent Modern Expert Standard

This reference is the shared 2026 operating baseline for Supervibe agents. It
does not replace stack-specific official documentation; it tells agents which
modern standards to map into concrete task behavior.

## External Baseline

- NIST SSDF SP 800-218: secure practices must be part of every SDLC, not a
  final release-only audit.
- NIST AI RMF and NIST AI 600-1 GenAI Profile: AI features need explicit risk
  framing, evaluation, trustworthiness, monitoring, and human impact review.
- OWASP Top 10 for LLM Applications 2025, OWASP Top 10 for Agentic Applications 2026,
  and OWASP Agentic Skills Top 10: agentic systems need
  prompt-injection resistance, tool-permission boundaries, memory poisoning
  defense, approval controls, audit logs, and incident response.
- OpenSSF SLSA: release, dependency, artifact, provenance, and installer work
  must treat supply-chain integrity as a first-class acceptance criterion.
- OpenTelemetry semantic conventions: production systems need stable,
  correlation-friendly telemetry for traces, metrics, logs, events, and
  generative AI operations where applicable.
- W3C WCAG 2.2: user-facing UI work must include accessibility acceptance
  criteria, keyboard/focus behavior, target size, redundant entry, accessible
  authentication, and human/manual checks where automation cannot prove quality.

## How Agents Apply It

1. Start from project memory and code search; do not rely on pretrained memory
   for current stack behavior.
2. When a claim may have changed, check official docs, primary standards, or
   source repositories before presenting it as current.
3. Translate standards into concrete contracts: inputs, outputs, permissions,
   data boundaries, failure modes, tests, observability, rollout, rollback,
   and residual risk.
4. Prefer production-ready SDLC thinking over isolated implementation slices:
   discovery, MVP boundary, architecture, implementation, verification,
   security/privacy, accessibility, observability, release, support, learning.
5. Apply `docs/references/scope-safety-standard.md` before broadening scope:
   modern expertise includes saying "do not add this now" when the addition
   lacks evidence or increases product risk.
6. Treat external side effects, production access, credentials, billing, DNS,
   account mutations, and destructive operations as approval-gated work.
7. Use a 10/10 standard only when evidence proves it: passing verification,
   no known blockers, explicit tradeoffs, and no hidden safety or quality gaps.

## Final Upgrade Operating Standard

- Retrieval is a dependency, not a convenience. Agents must surface source
  coverage, per-language readiness, graph warnings, failed file diagnostics,
  and repair commands before relying on Code RAG or CodeGraph for major work.
- Agent quality changes need measurement. Use the flight recorder and
  task-level evals to record task id, skill route, retrieval evidence, tool
  class, approval state, verification command, score, outcome, and redaction
  status.
- MCP usage is capability-based. Prefer tools with clear purpose, inputs, side
  effects, auth, failure modes, examples, and cost. High-risk external writes
  need a human approval checkpoint.
- Beginner bootstrap must be dry-run first: stack-pack registry evidence,
  runtime doctor output, exact next repair action, and no project mutation
  until the user approves.
- Release readiness requires provenance evidence: package/version alignment,
  checksums, rollback manifest, install integrity, dependency provenance,
  plugin package audit, and release security audit at 10/10.

## Source Links

- https://csrc.nist.gov/pubs/sp/800/218/final
- https://www.nist.gov/itl/ai-risk-management-framework
- https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- https://owasp.org/www-project-agentic-skills-top-10/
- https://openssf.org/projects/slsa/
- https://opentelemetry.io/docs/specs/semconv/
- https://www.w3.org/TR/wcag/
- docs/references/scope-safety-standard.md
