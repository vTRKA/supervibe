# Template Ownership Contracts

Status: A038 / T36 contract.
Last updated: 2026-05-15.
Primary owner: systems-analyst.

This file assigns production ownership for repository templates under
`templates/`. Ownership is a runtime contract, not a decorative label: every
template group below names the owning agent, owning skill, producer or manual
path, output contract, validator, and receipt requirement.

Source catalog ids:
- `supervibe-active-plan-a035`
- `supervibe-agent-modern-standard`
- `supervibe-skill-operating-standard`
- `supervibe-tool-use-matrix`
- `design-wcag-22`

## Scope

All 73 files currently under `templates/` are treated as production or
production-support templates. No template is excluded as non-production in this
contract. If a future file is fixture-only, playground-only, or historical, it
must be listed in `Excluded Support Templates` with a rationale and must not be
used as a producer input.

## Receipt Requirement

Any durable workflow that renders, copies, promotes, or materially edits a
template output must issue a runtime workflow receipt with:

- `templateId`
- source template path or grouping rule
- output artifact path
- owner agent
- owner skill
- producer command or manual path
- validator command or deferred final-gate validator
- source catalog ids used for the decision

Receipts must be issued by `node scripts/workflow-receipt.mjs issue ...` or
repaired with the runtime receipt tools. Hand-written receipt JSON is not
trusted.

## Production Template Contracts

| templateId | Template path or grouping rule | Count | Owner agent | Owner skill | Producer/manual path | Output contract | Validator | Receipt requirement |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `template:agent` | `templates/agent.md.tpl` | 1 | systems-analyst | `supervibe:genesis` | `scripts/supervibe-genesis.mjs` renders the base agent prompt template; manual edits require Docs/templates owner review. | Generated agent prompt keeps frontmatter, persona, scope, procedure, output contract, verification, anti-patterns, and at least the required skill coverage fields. | `node scripts/validate-template-quality.mjs`; final agent gates: `validate-agent-content-quality`, `validate-agent-skill-coverage`, `validate-agent-section-order`, `validate-agent-tool-use-matrix`. | Required for new or changed agent templates and generated agent prompt batches; include affected agent ids. |
| `template:rule` | `templates/rule.md.tpl` | 1 | systems-analyst | `supervibe:genesis` | `scripts/supervibe-genesis.mjs` or manual rule authoring through the Docs/templates lane. | Generated rule has stable frontmatter, applies-to scope, mandatory flag, rationale, checks, examples, and verification notes. | `node scripts/validate-template-quality.mjs`; final rule gate: `validate-rule-content-quality`. | Required for generated or changed rule templates; include affected rule ids. |
| `template:skill` | `templates/skill.md.tpl` | 1 | systems-analyst | `supervibe:genesis` | `scripts/supervibe-genesis.mjs` or skill-author manual path. | Generated skill keeps trigger, gate, allowed tools, procedure, output contract, verification, and ownership metadata. | `node scripts/validate-template-quality.mjs`; final skill gates: `validate-skill-content-quality`, `validate-skill-operational-contracts`. | Required for new or changed skill templates and generated skill folders; include affected skill ids. |
| `alternatives:tradeoff` | `templates/alternatives/tradeoff.md.tpl` | 1 | systems-analyst | `supervibe:explore-alternatives` | Manual artifact path through alternative-direction workflows. | Alternative artifact records variant, originating prototype or task, status, decision factors, tradeoffs, rejected options, and next action. | Final docs gate: `node scripts/validate-artifact-links.mjs`; decision gate: `node scripts/validate-decision-briefs.mjs` when promoted into a decision packet. | Required when an alternative direction becomes durable evidence or plan input. |
| `approval-marker:prototype-approval` | `templates/approval-markers/prototype-approval.json.tpl` | 1 | quality-gate-reviewer | `supervibe:prototype-handoff` | Manual approval marker emitted only after explicit user approval or approved prototype promotion. | JSON approval marker records approved status, timestamp, approver, prototype id/path, and immutable approval evidence. | `node scripts/validate-prototype-production-regression.mjs`; design final gates: `validate-design-active-completion`, `validate-design-workflow-state`. | Required for every approval marker; receipt must bind the user approval evidence and prototype path. |
| `brandbook-baseline:<target>` | `templates/brandbook-target-baselines/{chrome-extension,electron,mobile-native,tauri,web}.md` | 5 | design-system-architect | `supervibe:brandbook` | `node scripts/brandbook-producer.mjs run ...` via `scripts/lib/brandbook-producer-runtime.mjs`; runtime resolves the target baseline. | Brandbook baseline defines target density, platform constraints, accessibility expectations, token implications, and scope deltas for the target. | `node scripts/validate-design-readiness.mjs`; `node scripts/validate-design-source-coverage.mjs`; `node scripts/supervibe-design-maturity.mjs` at final gate. | Required for brandbook production or target change; include target, baseline path, produced design-system artifact path, and source catalog ids. |
| `ci:<name>` | `templates/ci/{ci-ready.md,github-actions-supervibe-ci.yml,gitlab-ci.yml}` | 3 | systems-analyst | `supervibe:genesis` | `scripts/supervibe-genesis.mjs` provider selection or manual CI opt-in. | CI output names supported package manager commands, avoids host-specific secrets, and preserves final `npm run check` as the release gate. | `node scripts/validate-artifact-links.mjs`; final release gate: `npm run check`. | Required when CI templates are copied into a project; include selected provider and generated CI path. |
| `claude-md:base` | `templates/claude-md/_base.md.tpl` | 1 | systems-analyst | `supervibe:genesis` | `scripts/supervibe-genesis.mjs`; host managed blocks must be updated by `scripts/lib/supervibe-context-migrator.mjs`. | Host instruction file preserves user-owned sections and clearly bounds Supervibe managed blocks. | `node scripts/validate-provider-config-scope.mjs`; `node scripts/validate-text-encoding.mjs`. | Required when host instruction files are generated or migrated; include managed-block boundaries and target host. |
| `component-adapter:<adapter>` | `templates/component-adapters/{headless-ui-mapping.md.tpl,mui-token-bridge.ts.tpl,shadcn-token-bridge.css.tpl}` | 3 | design-system-architect | `supervibe:component-library-integration` | Manual component-library bridge path after approved design system; regeneration required when `tokens.css` changes. | Adapter maps library tokens, variants, component states, focus, motion, and accessibility behavior back to approved design-system artifacts. | `node scripts/validate-design-source-coverage.mjs`; `node scripts/validate-design-styleboard-qa.mjs`; `node scripts/validate-design-readiness.mjs`. | Required for each generated bridge; include library, token source path, output bridge path, and token version/evidence. |
| `config:<name>` | `templates/configs/{.editorconfig,.gitattributes,.nvmrc,commitlint.config.js,lint-staged.config.js}` | 5 | systems-analyst | `supervibe:genesis` | `scripts/supervibe-genesis.mjs` copies baseline repository config; manual override requires project-owner approval. | Config output keeps UTF-8/LF policy, Node 22.5+ compatibility, commit hygiene, staged-file checks, and no provider-home leakage. | `node scripts/validate-terminal-file-policy.mjs`; `node scripts/validate-text-encoding.mjs`; `node scripts/validate-provider-config-scope.mjs`. | Required when baseline configs are installed or changed; include target project root and overwritten/user-preserved files. |
| `design-decision:animation-library-matrix` and `design-decision:graphics-medium-matrix` | `templates/design-decisions/{animation-library-matrix.md.tpl,graphics-medium-matrix.md.tpl}` | 2 | creative-director | `supervibe:design-intelligence` | Manual design decision packet path before prototype implementation. | Decision matrix records options, selected direction, rejected alternatives, capability implications, accessibility fallback, and verification path. | `node scripts/validate-design-capability-plan.mjs`; `node scripts/validate-design-reference-quality.mjs`; `node scripts/validate-creative-exploration.mjs`. | Required when the decision affects a prototype or production visual dependency; include selected source evidence. |
| `design-decision:prototype-capability-plan` | `templates/design-decisions/prototype-capability-plan.md.tpl` | 1 | design-system-architect | `supervibe:prototype-handoff` | `scripts/lib/design-capability-plan.mjs` owns the template reference; manual completion happens in design workflow artifacts. | Capability plan maps mode, dependencies, fallback, design-token bridge, interaction limits, and handoff risk. | `node scripts/validate-design-capability-plan.mjs`; `node scripts/validate-prototype-production-regression.mjs`. | Required before advanced prototype mode or handoff-only promotion; include prototype slug, mode, and fallback evidence. |
| `design-system:<artifact>` | `templates/design-system/{component-catalog.md,extension-request.md.tpl,motion.css.tpl,token-catalog.css.tpl,tokens.css.tpl}` | 5 | design-system-architect | `supervibe:brandbook` | `node scripts/brandbook-producer.mjs run ...` for generated system files; manual extension request path for proposed system changes. | Design-system output is the visual API: semantic tokens, motion tokens, component catalog, extension request rationale, approvals, and accessibility constraints. | `node scripts/validate-design-readiness.mjs`; `node scripts/validate-design-styleboard-qa.mjs`; `node scripts/validate-design-artifact-write-gates.mjs`; `node scripts/supervibe-design-maturity.mjs`. | Required for any generated or modified design-system source artifact; include approval state and memory writeback readiness. |
| `design-system-component:<component>` | `templates/design-system/components/*.md.tpl` | 23 | design-system-architect | `supervibe:component-library-integration` | Manual component spec selection from `templates/design-system/component-catalog.md` into `.supervibe/artifacts/prototypes/_design-system/components/`. | Component spec includes anatomy, states, variants, token references, keyboard behavior, focus, accessibility, responsive behavior, and implementation notes. | `node scripts/validate-design-readiness.mjs`; `node scripts/validate-design-styleboard-qa.mjs`; `node scripts/validate-design-artifact-write-gates.mjs`. | Required for each component spec promoted into an approved design system or production handoff. |
| `gitignore:<stack>` | `templates/gitignore/{_base,laravel,nextjs}` | 3 | systems-analyst | `supervibe:genesis` | `scripts/supervibe-genesis.mjs` composes managed gitignore blocks. | Output preserves ignored generated files, dependency folders, build artifacts, and managed block boundaries without deleting user-owned ignore rules. | `node scripts/validate-terminal-file-policy.mjs`; final repository check via `npm run check`. | Required when gitignore templates are installed or recomposed; include selected stack ids and preserved user block evidence. |
| `handoff-adapter:<target>` | `templates/handoff-adapters/{chrome-extension,electron,flutter,react-native,tauri}.md.tpl` | 5 | design-system-architect | `supervibe:prototype-handoff` | Manual prototype handoff path after approved prototype and approved design-system state. | Adapter records source prototype surfaces, target stack, token/component mapping, accessibility deltas, implementation constraints, and regression checks. | `node scripts/validate-prototype-production-regression.mjs`; `node scripts/validate-design-source-coverage.mjs`; `node scripts/validate-design-workflow-report.mjs`. | Required for each handoff adapter emitted; include prototype slug, target, approved marker, and output packet path. |
| `husky:<hook>` | `templates/husky/{commit-msg,pre-commit-base,pre-push-base}` | 3 | systems-analyst | `supervibe:genesis` | `scripts/supervibe-genesis.mjs` or manual hook opt-in during repository setup. | Hook output runs only documented package commands, keeps POSIX shell compatibility, and does not embed private paths. | `node scripts/validate-terminal-file-policy.mjs`; `node scripts/validate-text-encoding.mjs`; final `npm run check`. | Required when hooks are installed or changed; include hook path and command list. |
| `mock-data:<artifact>` | `templates/mock-data/{backend-integration.md.tpl,mock-contract.json.tpl,mock-scenarios.json.tpl}` | 3 | systems-analyst | `supervibe:mock-data-contract` | Manual mock-data contract path before frontend prototype or backend integration work. | Mock contract output records status, owner, source artifacts, schema/fixture scenarios, empty/error states, and provisional-data boundaries. | `node scripts/validate-mock-data-contracts.mjs`; final artifact gate: `node scripts/validate-artifact-links.mjs`. | Required for mock contracts and scenario fixtures used by durable prototypes or implementation plans. |
| `settings:base` | `templates/settings/_base.json` | 1 | systems-analyst | `supervibe:genesis` | `scripts/supervibe-genesis.mjs`; provider runtime configs are user-provider-home scoped only. | Settings output declares allowed commands and permissions without creating project runtime configs or storing secrets. | `node scripts/validate-provider-config-scope.mjs`; `node scripts/validate-text-encoding.mjs`; `node scripts/validate-agentic-security.mjs`. | Required when provider settings are generated or changed; include provider target and config destination. |
| `viewport-preset:<target>` | `templates/viewport-presets/{chrome-extension,electron,mobile-native,tauri,web}.json` | 5 | design-system-architect | `supervibe:prototype-handoff` | Manual target resolution path in design workflow; used before prototype sizing and handoff. | Viewport preset output records target, named viewports, dimensions, platform/surface metadata, and target-specific constraints. | `node scripts/validate-design-readiness.mjs`; `node scripts/validate-design-workflow-state.mjs`; `node scripts/validate-dialogue-ux.mjs` when surfaced as user choices. | Required when viewport presets drive durable design artifacts; include selected target and resolved design target evidence. |

## Excluded Support Templates

None. Every file under `templates/` is covered by a production or
production-support ownership contract above.

Future exclusions must include:

- template path
- reason it is non-production
- proof no producer consumes it
- owner responsible for deletion or archival
- validator proving the exclusion does not create a missing-template gap

## Design-System Ownership Notes

Design-system templates are owned by `design-system-architect` where they affect
tokens, component contracts, target baselines, viewport policy, component-library
bridges, prototype capability, or handoff. This follows the architect input that
the design system is the product visual API: token files, motion files,
component specs, adapter bridges, and target baselines are production contracts.

Design templates must not be rendered from taste-only or library-default input.
They require approved design-system state, source catalog ids, accessibility
constraints, and receipts binding the produced artifact to its template id.

## Count Check

Current inventory count: 73 files under `templates/`.

Contract coverage count: 73 files by grouping rules.

Breakdown:

| Group | Count |
| --- | ---: |
| Root artifact templates | 3 |
| Alternatives | 1 |
| Approval markers | 1 |
| Brandbook target baselines | 5 |
| CI | 3 |
| Claude host base | 1 |
| Component adapters | 3 |
| Configs | 5 |
| Design decisions | 3 |
| Design-system core | 5 |
| Design-system components | 23 |
| Gitignore | 3 |
| Handoff adapters | 5 |
| Husky hooks | 3 |
| Mock data | 3 |
| Settings | 1 |
| Viewport presets | 5 |
