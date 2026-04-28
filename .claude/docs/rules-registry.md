# Rules / discipline (20 rules)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Files in `rules/`. Each enforced by `supervibe:rule-audit` skill and applies-when frontmatter.

| Rule | Severity | What it enforces |
|------|----------|------------------|
| `anti-hallucination` | critical | Cite file:line for every claim; never invent function signatures |
| `confidence-discipline` | critical | Score work; gate at ≥9; log overrides |
| `no-half-finished` | critical | No commented code, no orphan TODOs, no half-applied refactors |
| `no-dead-code` | high | Knip-clean; remove unused exports + functions |
| `no-hardcode` | high | Tokens / config / strings via config or env, not literals |
| `use-codegraph-before-refactor` | critical | --callers MUST run before rename/move/extract/delete |
| `commit-discipline` | high | Conventional Commits via commitlint |
| `commit-attribution` | high | AI agents commit as the user — no Co-Authored-By Claude/Codex/Gemini, no `🤖 Generated with` footers |
| `git-discipline` | high | No force-push to main; no skip hooks |
| `pre-commit-discipline` | high | Husky pre-commit hooks must pass |
| `rule-maintenance` | medium | Rules quarterly reviewed; `last-verified` kept fresh |
| `best-practices-2026` | medium | Apply 2026-current patterns; no 2018 idioms |
| `infrastructure-patterns` | medium | Sentinel/Cluster decision, replication, queue topology |
| `modular-backend` | medium | Bounded contexts, no god-services |
| `routing` | medium | Routing conventions (REST / GraphQL / Server Actions) |
| `i18n` | medium | Externalized strings, locale fallback chain |
| `privacy-pii` | high | No PII in logs, masked outputs, GDPR-compliant retention |
| `observability` | medium | Logs / metrics / traces wired for new services |
| `prototype-to-production` | medium | Hardening checklist before promote |
| `fsd` | medium | Feature-Sliced Design for frontend (when stack matches) |
| `single-question-discipline` | high | Interactive agents ask one question at a time with markdown + Шаг N/M progress |
