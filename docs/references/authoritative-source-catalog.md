# Authoritative Source Catalog

Status: current seed catalog for A035 / T33.
Last verified: 2026-05-15.
Owner: systems-analyst.

This catalog is the central source list for Supervibe agents, skills, templates,
review packets, and evidence artifacts. Agents and skills should cite stable
`catalogId` values from this file instead of duplicating URLs in prompt bodies.
If a needed primary source is missing, record the missing catalog entry as a
blocker or local TODO for the owning source-catalog task; do not scatter a new
unmanaged URL across agent or skill instructions.

## Privacy And Secret Preflight

Catalog entries must contain only public official documentation, public
standards, public source repositories, or local Supervibe repository paths.
Never add private customer data, API tokens, auth headers, cookies,
localStorage, provider config dumps, private MCP/server URLs, user-home
secrets, proprietary snippets, or confidential vendor/customer docs to this
public catalog. If a workflow needs private evidence, store only a redacted
artifact reference and keep the private source out of this file.

Before adding or refreshing an entry:

1. Confirm the source is public, official/primary, and safe to cite.
2. Record `lastVerified` as the date the source was checked.
3. Choose a refresh cadence based on source volatility.
4. Define stale handling and fallback hierarchy.
5. Prefer versioned docs when local package/runtime versions are known.

## Catalog Id Rules

- Use lowercase, dash-separated ids with a cluster prefix, for example
  `frontend-react-docs` or `ai-openai-api-docs`.
- Treat ids as stable public contracts. If a URL moves, update the entry and
  preserve the id unless the source authority changes materially.
- Cite catalog ids in durable outputs: `sourceCatalogIds:
  [frontend-react-docs, testing-playwright-docs]`.
- Do not copy source URLs from this file into multiple agents or skills unless
  a template explicitly requires an inline human-readable citation.

## Shared Source Hierarchy

Use this order unless an entry below defines a stricter fallback:

1. Local Supervibe source of truth: repository docs, rules, scripts, lockfiles,
   generated artifacts, and project memory.
2. Official primary sources: standards bodies, vendor docs, API specs, release
   notes, source repositories, migration guides, and security advisories.
3. Runtime-discovered capability evidence: MCP registry, provider capability
   pages, status pages, and current API schema evidence.
4. Secondary sources only as search leads. They must not be final authority
   when a primary source exists.

## Cluster: Design, UX, And Accessibility

| catalogId | Primary source | Applicable specialties | lastVerified | refreshCadence | Stale handling | Fallback/source hierarchy |
| --- | --- | --- | --- | --- | --- | --- |
| `design-wcag-22` | https://www.w3.org/TR/WCAG22/ | accessibility, UI review, design-system architecture, prototype QA | 2026-05-15 | quarterly, plus on W3C Recommendation update | If stale, cap accessibility claims and re-check W3C latest published version before approval. | W3C WCAG latest published version -> W3C techniques/understanding docs -> local accessibility rules. |
| `design-mdn-accessibility` | https://developer.mozilla.org/en-US/docs/Web/Accessibility | browser accessibility implementation, ARIA, semantic HTML, frontend UX | 2026-05-15 | quarterly | If stale, use only as implementation guide after WCAG and platform docs are current. | WCAG -> MDN accessibility -> browser-specific docs -> local runtime verification. |
| `design-apple-hig` | https://developer.apple.com/design/human-interface-guidelines/ | iOS, macOS, desktop UX, native shell patterns | 2026-05-15 | quarterly, plus platform release season | If inaccessible or stale, mark native-platform guidance unverified and use local approved design-system constraints. | Apple HIG -> platform SDK docs -> local design-system artifacts. |
| `design-material-3` | https://m3.material.io/ | Android, Material UI, component behavior, motion, density | 2026-05-15 | quarterly | If stale, do not claim current Material guidance; use only local approved tokens and component contracts. | Material Design -> Android developer docs -> local component-library bridge. |
| `design-figma-api` | https://developers.figma.com/docs/rest-api/ | Figma extraction, design asset automation, design MCP workflows | 2026-05-15 | monthly | If stale, require MCP discovery or user-exported assets; do not promise Figma extraction. | Figma developer docs -> runtime MCP registry -> user-provided export/screenshot. |

## Cluster: Frontend And Runtime

| catalogId | Primary source | Applicable specialties | lastVerified | refreshCadence | Stale handling | Fallback/source hierarchy |
| --- | --- | --- | --- | --- | --- | --- |
| `frontend-react-docs` | https://react.dev/reference/react | React, hooks, component patterns, client UI | 2026-05-15 | monthly, plus on local React major change | If stale or version-mismatched, read local lockfile and preserve repository patterns. | Local lockfile/code -> React docs for detected major -> migration notes -> local tests. |
| `frontend-mdn-web-docs` | https://developer.mozilla.org/en-US/docs/Web | Web platform APIs, CSS, HTML, browser behavior | 2026-05-15 | quarterly | If stale, verify the specific API page and browser compatibility table before implementation. | Specs/vendor docs -> MDN page -> browser compatibility data -> runtime proof. |
| `frontend-typescript-docs` | https://www.typescriptlang.org/docs/ | TypeScript, tsconfig, type-system behavior, declaration files | 2026-05-15 | monthly, plus on local TypeScript major change | If stale, avoid version-specific compiler flags until local version is detected. | Local lockfile/tsconfig -> TypeScript docs -> release notes -> compiler output. |
| `frontend-vite-docs` | https://vite.dev/guide/ | Vite, build pipeline, dev server, plugin API, frontend bundling | 2026-05-15 | monthly, plus on local Vite major change | If stale, inspect local Vite major and use versioned docs before editing config. | Local package version -> matching Vite docs -> plugin docs -> build verification. |
| `runtime-node-api` | https://nodejs.org/api/ | Node.js runtime, node:sqlite, ESM/CJS, CLI behavior | 2026-05-15 | monthly, plus on runtime upgrade | If stale, run local Node version detection and use matching Node docs. | Local runtime version -> Node API docs for that version -> local script behavior. |

## Cluster: Backend, API, And Data

| catalogId | Primary source | Applicable specialties | lastVerified | refreshCadence | Stale handling | Fallback/source hierarchy |
| --- | --- | --- | --- | --- | --- | --- |
| `backend-openapi-spec` | https://spec.openapis.org/oas/latest.html | OpenAPI contracts, generated clients, API schemas | 2026-05-15 | quarterly, plus on spec/version change | If stale, pin to the local schema generator version and mark latest spec unverified. | Local checked-in schema -> OpenAPI spec -> generator docs -> contract tests. |
| `backend-http-semantics-rfc9110` | https://www.rfc-editor.org/rfc/rfc9110 | HTTP APIs, status codes, headers, caching semantics | 2026-05-15 | semiannual | If stale, re-check RFC Editor and any newer successor RFCs before changing public API semantics. | RFC Editor -> framework docs -> local API behavior. |
| `data-sqlite-docs` | https://www.sqlite.org/docs.html | SQLite, node:sqlite storage, local indexes, generated DBs | 2026-05-15 | monthly, plus on SQLite/runtime upgrade | If stale, inspect local Node/SQLite version and avoid migration decisions until verified. | Local DB/schema/scripts -> SQLite docs -> Node node:sqlite docs -> integrity checks. |
| `data-postgresql-docs` | https://www.postgresql.org/docs/current/ | PostgreSQL, SQL behavior, migrations, production data stores | 2026-05-15 | quarterly, plus on server major change | If stale, use the server's exact major-version docs rather than `current`. | Local server/version config -> versioned PostgreSQL docs -> migration tests. |

## Cluster: Testing, Quality, And Security

| catalogId | Primary source | Applicable specialties | lastVerified | refreshCadence | Stale handling | Fallback/source hierarchy |
| --- | --- | --- | --- | --- | --- | --- |
| `testing-playwright-docs` | https://playwright.dev/docs/intro | browser/runtime verification, E2E tests, screenshots, accessibility snapshots | 2026-05-15 | monthly, plus on local Playwright major change | If stale, use local package version and avoid new APIs until verified. | Local package version -> Playwright docs -> browser evidence artifact. |
| `testing-vitest-docs` | https://vitest.dev/guide/ | unit tests, workspace tests, Vite test harnesses | 2026-05-15 | monthly, plus on local Vitest major change | If stale, inspect lockfile and use matching version docs before editing config. | Local package version -> Vitest docs -> test command output. |
| `security-owasp-asvs` | https://owasp.org/www-project-application-security-verification-standard/ | application security review, auth, session, input validation | 2026-05-15 | quarterly, plus on OWASP release | If stale, mark security control mapping unverified and require security reviewer review. | OWASP ASVS -> framework/vendor security docs -> local threat model. |
| `security-owasp-llm-top10` | https://owasp.org/www-project-top-10-for-large-language-model-applications/ | LLM/agent security, prompt injection, tool abuse, AI workflow review | 2026-05-15 | quarterly, plus on OWASP release | If stale, cap AI-security confidence and re-check OWASP before final guidance. | OWASP LLM Top 10 -> provider safety docs -> local agent rules. |
| `security-nist-ai-rmf` | https://www.nist.gov/itl/ai-risk-management-framework | AI risk, governance, trust, safety, evaluation framing | 2026-05-15 | semiannual | If stale, treat governance mapping as advisory until NIST page is rechecked. | NIST AI RMF -> agency publications -> local confidence rubrics. |
| `security-slsa-spec` | https://slsa.dev/spec/v1.1/ | supply chain, build provenance, release hardening | 2026-05-15 | semiannual, plus on SLSA spec release | If stale, do not claim current SLSA conformance; record as stale control evidence. | SLSA spec -> package manager provenance docs -> local release evidence. |

## Cluster: Observability And Infrastructure

| catalogId | Primary source | Applicable specialties | lastVerified | refreshCadence | Stale handling | Fallback/source hierarchy |
| --- | --- | --- | --- | --- | --- | --- |
| `observability-opentelemetry-spec` | https://opentelemetry.io/docs/specs/otel/ | telemetry, traces, metrics, logs, semantic conventions | 2026-05-15 | monthly | If stale, re-check OpenTelemetry spec before changing telemetry schema or malformed links. | OpenTelemetry spec -> language SDK docs -> local telemetry artifacts. |
| `infra-kubernetes-docs` | https://kubernetes.io/docs/home/ | deployment, cluster behavior, workloads, config, operations | 2026-05-15 | quarterly, plus on cluster major change | If stale, use exact cluster-version docs or mark infra guidance unverified. | Local cluster/version config -> Kubernetes docs -> provider docs. |
| `infra-docker-docs` | https://docs.docker.com/ | containers, images, compose, build/runtime boundaries | 2026-05-15 | quarterly, plus on Docker major change | If stale, inspect local Docker/Compose version before changing container guidance. | Local Docker files/version -> Docker docs -> build output. |
| `infra-github-actions-docs` | https://docs.github.com/en/actions | CI, workflow syntax, release automation, GitHub-hosted runners | 2026-05-15 | monthly | If stale, verify workflow syntax and permissions pages before editing CI guidance. | Local workflow files -> GitHub Actions docs -> action README/source. |

## Cluster: AI, OpenAI, And Agent Workflows

| catalogId | Primary source | Applicable specialties | lastVerified | refreshCadence | Stale handling | Fallback/source hierarchy |
| --- | --- | --- | --- | --- | --- | --- |
| `ai-openai-api-docs` | https://developers.openai.com/api/docs | OpenAI API, model behavior, tools, SDK/API integration | 2026-05-15 | weekly, plus before any OpenAI API implementation | If stale, revalidate official OpenAI docs before changing model/API behavior. | OpenAI docs -> OpenAI OpenAPI spec/SDK docs -> local provider config. |
| `ai-openai-platform-docs` | https://platform.openai.com/docs/ | OpenAI product docs, platform guidance, capability updates | 2026-05-15 | weekly | If stale, use official OpenAI docs MCP or browser verification; avoid model memory. | OpenAI platform docs -> official OpenAI developer docs -> local config. |
| `ai-owasp-agent-security` | https://owasp.org/www-project-top-10-for-large-language-model-applications/ | agent workflows, tool security, prompt injection, data leakage controls | 2026-05-15 | quarterly, plus on OWASP release | If stale, require security reviewer confirmation for AI risk claims. | OWASP LLM Top 10 -> provider safety docs -> Supervibe agent rules. |
| `ai-nist-ai-rmf` | https://www.nist.gov/itl/ai-risk-management-framework | AI governance, risk framing, maturity scoring, residual-risk language | 2026-05-15 | semiannual | If stale, treat only as governance framing and revalidate before maturity claims. | NIST AI RMF -> local confidence rubrics -> reviewer evidence. |

## Cluster: Supervibe Local Docs

| catalogId | Primary source | Applicable specialties | lastVerified | refreshCadence | Stale handling | Fallback/source hierarchy |
| --- | --- | --- | --- | --- | --- | --- |
| `supervibe-root-readme` | `README.md` | user setup, installation, command overview | 2026-05-15 | on release branch changes | If stale, do not quote setup behavior until README and package scripts are rechecked. | README -> package scripts -> command docs. |
| `supervibe-agent-modern-standard` | `docs/references/agent-modern-expert-standard.md` | agent quality, current expert behavior, standards mapping | 2026-05-15 | monthly or agent-policy changes | If stale, cap agent maturity claims and re-check updated reference docs. | Local reference doc -> AGENTS.md -> validators. |
| `supervibe-skill-operating-standard` | `docs/references/skill-expert-operating-standard.md` | skill execution, source of truth, scope safety, receipts | 2026-05-15 | monthly or skill-policy changes | If stale, re-read skill policy before editing skill instructions. | Local reference doc -> skill frontmatter -> validators. |
| `supervibe-tool-use-matrix` | `docs/references/agent-tool-use-matrix.md` | host-neutral capabilities, MCP/tool mapping, adapter boundaries | 2026-05-15 | on MCP registry or adapter change | If stale, require MCP discovery and registry evidence before tool claims. | Tool-use matrix -> MCP registry -> adapter bindings. |
| `supervibe-local-tool-metadata` | `docs/references/local-tool-metadata-contract.md` | local tool metadata, capability contracts, safe tool naming | 2026-05-15 | on tool registry changes | If stale, re-check registry helper and tool-use matrix before updating contracts. | Local metadata contract -> scripts/lib registry code -> validators. |
| `supervibe-privacy-indexing-policy` | `docs/references/privacy-and-indexing-policy.md` | privacy, indexing boundaries, memory/RAG data minimization | 2026-05-15 | quarterly or privacy rule changes | If stale, block public artifact additions that could expose private data. | Privacy policy -> AGENTS.md guardrails -> security preflight. |
| `supervibe-active-plan-a035` | `.supervibe/artifacts/plans/2026-05-15-supervibe-logic-10of10-modernization-plan.md` | A035/T33 scope, acceptance criteria, final gate alignment | 2026-05-15 | task-scoped, retire after final evidence packet | If stale, defer to current task ledger/review artifacts before further source-catalog changes. | Active plan -> task ledger -> final evidence packet. |

## Adding Or Refreshing Entries

When a new agent or skill needs a source:

```markdown
sourceCatalogIds:
  - frontend-react-docs
  - testing-playwright-docs
```

For a new catalog entry, include:

- `catalogId`
- official/primary source URL or local primary path
- applicable specialties
- `lastVerified`
- `refreshCadence`
- stale handling
- fallback/source hierarchy

For an updated entry, keep the id stable, update the source URL only when the
authoritative location moved, and record the verification date. If the source
cannot be verified and the affected task is security, privacy, data, money,
provider API, or production release critical, mark the task blocked or
degraded instead of inventing guidance.