# Agent system (81 agents)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Routing by `namespace` in frontmatter:

| Namespace | Count | Examples | When to invoke |
|-----------|-------|----------|----------------|
| `_core` | 8 | `code-reviewer`, `refactoring-specialist`, `repo-researcher`, `architect-reviewer`, `root-cause-debugger`, `security-auditor`, `quality-gate-reviewer`, `auth-architect` | Cross-cutting reviews and analyses |
| `_meta` | 3 | `supervibe-orchestrator`, `memory-curator`, `rules-curator` | Maintenance + dispatch |
| `_design` | 12 | `ux-ui-designer`, `creative-director`, `ui-polish-reviewer`, `accessibility-reviewer`, `copywriter`, `prototype-builder`, `extension-ui-designer`, `electron-ui-designer`, `tauri-ui-designer`, `mobile-ui-designer`, plus presentation specialists | Design surface (web + extensions + desktop + mobile + decks) |
| `_ops` | 16 | `devops-sre`, `infrastructure-architect`, `db-reviewer`, `ai-integration-architect`, plus researchers + reviewers | Ops + research |
| `_product` | 6 | `product-manager`, `systems-analyst`, `qa-test-engineer`, `analytics-implementation`, `seo-specialist`, `email-lifecycle` | Product surface |
| `stacks/laravel` | 4 | `laravel-architect`, `laravel-developer`, `eloquent-modeler`, `queue-worker-architect` | Laravel projects |
| `stacks/nextjs` | 3 | `nextjs-architect`, `nextjs-developer`, `server-actions-specialist` | Next.js projects |
| `stacks/fastapi` | 2 | `fastapi-architect`, `fastapi-developer` | FastAPI projects |
| `stacks/react` | 1 | `react-implementer` | Standalone React/Vite |
| `stacks/postgres` | 1 | `postgres-architect` | Postgres-heavy projects |
| `stacks/redis` | 1 | `redis-architect` | Redis-heavy projects |
| `stacks/chrome-extension` | 2 | `chrome-extension-architect`, `chrome-extension-developer` | Chrome MV3 / Edge / Brave browser extensions (popup, options, side panel, content scripts, service worker) |
| `stacks/*` (other) | ~22 | django, rails, spring, vue, svelte, nuxt, ios, android, flutter, go, mongo, mysql, elasticsearch, graphql, nestjs, express, aspnet | Stack-specific architects/developers |

**All agents:** ≥250 lines, full Persona / Project Context / Skills / Decision tree / Procedure / Output contract / Anti-patterns / Verification / Common workflows / Out of scope / Related.

**Reference template:** `agents/_core/code-reviewer.md` (260 lines) — canonical structure for new agents.
