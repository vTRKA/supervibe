# Loop Evidence Patterns

This reference is the one-hop detail pack for execution, handoff, and landing
skills. Use it when the entrypoint skill needs concrete evidence packets,
matrices, or examples without carrying long inline templates.

## Worker Packet Schema

```yaml
taskId: "<stable id>"
objective: "<one bounded deliverable>"
approvedScopeId: "<scope id or approval receipt>"
writeSet:
  - "<repo-relative path or glob>"
readOnlyContext:
  memory: ["<memory id/path or no-match query>"]
  ragCitations: ["<file:line or search result id>"]
  graphEvidence: ["<symbol/caller/impact evidence or N/A reason>"]
acceptanceCriteria:
  - "<observable criterion>"
verification:
  - "<command and expected signal>"
policyBoundaries:
  - "<tools/network/MCP/secrets/prod limits>"
sideEffectsAllowed:
  - "<local write/process/network action or none>"
stopConditions:
  - "<when to stop instead of improvise>"
outputContract: "<exact handoff fields>"
```

Missing packet fields mean the task is not ready.

## Context Pack Evidence

| Evidence | Required signal | Stop condition |
| --- | --- | --- |
| Project memory | Query, result count, freshness, relevant entries | Missing required prior decision |
| Code RAG or direct code search | Citations with file/line anchors | Stale or no citations for structural task |
| CodeGraph | Mode, impacted symbols, warnings, fallback | Structural claim depends on stale graph |
| Host instructions | Active verification and write rules | Conflicting instructions |
| Receipts | Runtime-issued source and invocation id | Durable delegated output lacks proof |
| Worktree/session registry | Active claims and write-set overlap | Overlap without conflict exception |

## Side-Effect Ledger

Record each side effect as soon as it happens:

```yaml
- kind: file-write | command | process | network | mcp | approval | receipt
  target: "<path, command, process id, URL, tool, or approval id>"
  reason: "<why this was necessary>"
  owner: "<controller | worker id | reviewer id>"
  evidence: "<output path, log id, receipt id, or command result>"
  cleanup: "<none | command | file path | process stop>"
```

The final report must reconcile the ledger against actual writes, running
processes, approval state, and receipts.

## Wave Planning Matrix

| Condition | Action |
| --- | --- |
| Disjoint write sets, independent verification | Parallel worker wave |
| Shared files or generated indexes | Serialize or split |
| Public contract, schema, migration, release state | Serialize plus reviewer gate |
| Known failing task blocks only itself | Quarantine with retry limit and continue unrelated work |
| Provider permission or receipt proof absent | Policy/readiness stop before dispatch |

Keep waves small enough that the controller can reconcile evidence and side
effects after every wave.

## Resume Evidence

Before resuming a long run, validate:

- Loop state exists under `.supervibe/memory/loops/<run-id>/`.
- Schema/migration version is current.
- Active task, active wave, ready front, and blockers are explicit.
- Side-effect ledger matches files, processes, receipts, and approvals.
- Approval leases and user gates are still current.
- Ready-front ordering still respects dependencies and write sets.
- The next action is safe to show as one user-facing choice when a gate is
  unresolved.

Do not rely on hidden conversation state for resume.

## Final Report Matrix

| Field | Meaning |
| --- | --- |
| STATUS | `COMPLETE`, `BLOCKED`, `PARTIAL`, `POLICY_STOP`, `BUDGET_STOP`, or `USER_PAUSED` |
| EXIT_SIGNAL | Whether the loop should stop now |
| CONFIDENCE | Evidence-backed score, below gate when evidence is partial |
| NEXT_ACTION | Concrete next safe action |
| STOP_REASON | Exact blocker or `none` |
| OPEN_BLOCKERS | Count and short names |
| SCOPE_SAFETY | `pass`, `blocked`, or `needs-tradeoff` |
| PRODUCTION_READINESS | Score plus reviewer evidence for release claims |

## Prototype Handoff Evidence Patterns

### Bundle Tree

```text
.supervibe/artifacts/prototypes/<slug>/handoff/
|-- README.md
|-- index.html
|-- pages/
|-- styles/
|-- scripts/
|-- content/copy.md
|-- components-used.json
|-- tokens-used.json
|-- viewport-spec.json
|-- mocks/
|-- backend-integration.md
`-- stack-agnostic.md
```

Include target adapter files next to `stack-agnostic.md` for chrome-extension,
electron, tauri, or mobile-native targets when config requires them.

### Component Inventory

```json
{
  "components": [
    {
      "name": "button",
      "designSystemRef": ".supervibe/artifacts/prototypes/_design-system/components/button.md",
      "occurrences": [
        { "file": "index.html", "line": 47, "variant": "primary", "size": "md" }
      ]
    }
  ]
}
```

### Token Inventory

```json
{
  "tokens": {
    "color": ["--color-action", "--color-fg", "--color-bg"],
    "spacing": ["--space-1", "--space-4"],
    "radius": ["--radius-md"],
    "type": ["--text-base", "--text-2xl"],
    "motion": ["--duration-quick", "--ease-out-quad"]
  },
  "rawValues": {
    "_warning": "Direct values bypass tokens and must be investigated.",
    "hex": [],
    "px": [],
    "cubicBezier": []
  }
}
```

### README Fields

- Approved date, approver, approval marker path.
- Design-system version and final token status.
- Viewports and feedback rounds.
- How to consume `stack-agnostic.md`, component inventory, token inventory, and
  mocks.
- Production verification checklist for viewport rendering, token discipline,
  accessibility, performance, and reduced motion.

### Data-Fed Handoff Matrix

| Evidence | Required file |
| --- | --- |
| Contract status | `handoff/mocks/mock-contract.json` |
| Scenario coverage | `handoff/mocks/mock-scenarios.json` |
| Fixtures | `handoff/mocks/api-fixtures/` |
| Live mapping and questions | `handoff/backend-integration.md` |
| Drift rule | Backend integration notes |

If mock contract status is provisional, the handoff may be frontend-draft ready
but must not claim backend-ready integration.

## Landing Page Evidence Patterns

### Landing Structures

| Structure | Default use |
| --- | --- |
| SaaS classic | Hero, features, proof, CTA |
| Product-focused | Hero, demo, feature deep dive, pricing, CTA |
| Conversion | Problem, solution, testimonials, FAQ, CTA |
| Editorial | Storytelling scroll with controlled motion |
| Squeeze | One big CTA and no more than two sections |

Ask one structure question when the brief does not decide this.

### Landing File Layout

```text
.supervibe/artifacts/prototypes/landing-<topic>/
|-- config.json
|-- index.html
|-- styles/reset.css
|-- styles/system.css
|-- styles/landing.css
|-- scripts/analytics-stub.js
|-- assets/images/
|-- content/copy.md
|-- seo/og-image.png
|-- seo/meta.json
`-- _reviews/
```

### SEO Scaffold

```html
<title>Concise value proposition</title>
<meta name="description" content="Single sentence, under 160 characters.">
<link rel="canonical" href="https://example.com/path">
<meta property="og:title" content="Concise value proposition">
<meta property="og:description" content="Single sentence value prop.">
<meta property="og:image" content="seo/og-image.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{}</script>
```

### Analytics Hook Pattern

```html
<a href="#signup"
   data-analytics-event="hero-cta-click"
   data-analytics-section="hero">Get started</a>
```

Every CTA, form submit, and meaningful scroll milestone should have a stable
`data-analytics-event` name. Do not inline provider code in the prototype.

### Prototype Capability Plan Fields

- Mode: native-static, enhanced-native, bundled-dependency, framework-sandbox, or
  handoff-only.
- Library/API and why native HTML/CSS/JS is insufficient.
- Rejected native alternative.
- Artifact scope and bundle/performance budget.
- License, security, privacy, and network behavior.
- Accessibility and reduced-motion fallback.
- Verification commands and expected signals.

### Landing Review Matrix

| Review | Required evidence |
| --- | --- |
| Accessibility | Keyboard, focus, labels, contrast, reduced motion |
| UI polish | Responsive layout, token usage, visual consistency |
| SEO | Title, description, canonical, OG/Twitter, structured data |
| Performance | LCP, CLS, TBT, image dimensions, media strategy |
| Copy | Audience, CTA clarity, no placeholder copy past Stage 1 |

### Approval Marker

```json
{
  "status": "approved",
  "approvedAt": "<ISO>",
  "approvedBy": "<user>",
  "viewports": [375, 1440],
  "structure": "saas-classic",
  "tone": "warm",
  "designSystemVersion": "<sha>",
  "previewUrl": "http://localhost:3047",
  "lighthouseTarget": { "lcp": "2.5s", "cls": "0.1", "tbt": "200ms" },
  "approvalScope": "full"
}
```

Write this only after explicit user approval.

## Evidence Anti-Patterns

- Claiming final completion while evidence is stale or reviewer proof is missing.
- Presenting a preview URL before checking visible feedback controls.
- Treating provisional mock data as backend-ready.
- Parallelizing tasks with overlapping write sets.
- Copying visual style from a competitor rather than applying approved design
  system decisions.
