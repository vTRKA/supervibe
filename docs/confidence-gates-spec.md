# Unified Confidence Gates Specification

> **Audience:** Plugin developers + agent authors. This is the contract every command + skill follows.
>
> **Version:** 1.0 (2026-04-28). Supersedes ad-hoc gate semantics that varied per command.

## Why this exists

Pre-spec, gates varied widely:
- `/supervibe-execute-plan` — explicit 10/10 dual gates (Stage A + Stage B)
- `/supervibe-design` — implicit gates via per-stage feedback loops
- `/supervibe-score` — gate at ≥9 with fuzzy override path
- `/supervibe-strengthen` — gate at ≥8.5 average per quantitative metric
- Various skills — `gate-on-exit: true` boolean with no threshold semantics

Result: users + agents couldn't predict gate behavior. This spec unifies the model so every gate has the same semantics, the same override path, the same telemetry.

---

## Three gate states (universal)

Every confidence-gated artifact lands in exactly one of three states:

| State | Score range | Meaning | What happens |
|---|---|---|---|
| `pass` | score ≥ `block-below`+1 (typically ≥10) | Quality target met | Continue without intervention |
| `warn` | `block-below` ≤ score < `warn-below`+1 (typically 9.0-9.99) | Acceptable but flagged | Continue + log warning to telemetry; user can act |
| `block` | score < `block-below` (typically <9.0) | Below quality threshold | Halt; require fix OR explicit override reason recorded by the caller |

**Default thresholds** (set in `confidence-rubrics/<artifact>.yaml`):
```yaml
gates:
  block-below: 9
  warn-below: 10
```

Some rubrics tighten these:
- `agent-quality-ab.yaml` — `block-below: 9.5` (stricter for A/B regression checks)
- `framework.yaml` — `block-below: 9` (foundational changes)

Loose `block-below: 8` allowed only with explicit rationale in rubric file.

---

## Override flow (universal)

When score = `block`, the artifact's owner can override IF:

1. **Justification is captured** as text (≥10 chars per `supervibe:_core:quality-gate-reviewer` enforcement).
2. **Logged to `.supervibe/confidence-log.jsonl`** with structured record:
   ```jsonl
   {
     "id": "<uuid>",
     "timestamp": "<ISO>",
     "artifact": "<type>",
     "path": "<path>",
     "score": <N>,
     "gate": "block",
     "override": true,
     "rationale": "<text>",
     "agent": "<agent-id-if-applicable>"
   }
   ```
3. **Override-rate budget enforced**: if override rate >5% over last 100 entries → SessionStart emits warning + recommends `/supervibe-audit`.
4. **Reviewable by `supervibe:_core:quality-gate-reviewer`** — it can dispute the override; user has final say.

If override would break this 5%-budget → command stops with: "Override budget exceeded; investigate via `/supervibe-audit` first."

---

## Remediation And Planned Auto-Fix

Current shipped behavior: scoring returns concrete remediation actions and the
caller asks before making changes. Low-risk auto-apply is planned, but it is not
part of the shipped gate contract until an implementation and validator are in
place.

| Gate state | Default user prompt | Shipped behavior |
|---|---|---|
| `block` (score < 9) | "Score is X/10. Options: [1] Fix gaps / [2] Override / [3] Cancel" | Halt and show remediation; write only after the caller gets approval |
| `warn` (9-9.99) | "Score is X/10. Optional improvements: [1] Fix / [2] Continue / [3] Cancel" | Continue with warning or apply approved remediation |
| `pass` (≥10) | (nothing — proceed) | Continue |

Planned auto-apply will be considered low-risk only when:
- Fix is a single section addition (not removal)
- Fix is a frontmatter field addition
- Fix is a rename of a token reference
- Fix has been categorised as `auto-fixable: yes` in the rubric's remediation hints

Auto-apply will remain blocked without confirmation when:
- Fix changes Persona / Decision tree / Anti-patterns (these shape every output)
- Fix removes content
- Fix touches multiple files
- Fix is categorised as `auto-fixable: no`

---

## Per-command gate semantics

Every user-facing command in `commands/` declares which rubric it uses + how it gates.

### Two-stage commands (rare, high-stakes)

`/supervibe-execute-plan` — Stage A readiness + Stage B completion. Both must `pass` independently. Override possible per stage; logged separately.

### Single-stage commands (most)

| Command | Rubric | block-below | Remediation behavior |
|---|---|---|---|
| `/supervibe-brainstorm` | `requirements.yaml` | 9 | suggest missing sections/questions |
| `/supervibe-plan` | `plan.yaml` | 9 | suggest task splitting, evidence, rollback, or review fixes |
| `/supervibe-design` | implicit per stage; final scored against `prototype.yaml` or `brandbook.yaml` | 9 | no (design is human judgment) |
| `/supervibe-genesis` | `scaffold.yaml` | 9 | suggest missing generated files or config drift |
| `/supervibe-execute-plan` | `execute-plan.yaml` (Stage A) + per-rubric (Stage B) | 9 | suggest readiness/completion repairs |
| `/supervibe-score` | matches artifact-type rubric | 9 | returns rubric-specific remediation |
| `/supervibe-strengthen` | `agent-quality.yaml` | 9 | no (changes shape every output; user must approve) |
| `/supervibe-audit` | n/a (read-only inspection) | — | — |
| `/supervibe-update` | n/a (infrastructure) | — | — |
| `/supervibe-preview` | n/a (server) | — | — |
| `/supervibe-adapt` | propagates per-artifact gates | 9 | per-file diff gate |

Internal specs for legacy aliases, plugin QA, memory GC, changelog display, deployment integration, and override logging live in `references/internal-commands/`. They are intentionally outside the published slash-command directory and outside user-facing docs.

### Skills

Skills declare their gate via frontmatter:

```yaml
gate-on-exit: true             # bool: should this skill block on score?
confidence-rubric: rubric.yaml # which rubric scores the output
```

If `gate-on-exit: true` AND `score < block-below` → skill emits `BLOCKED` status; calling agent must address before continuing.

---

## Delivery Confidence Formula

Task, epic, plan, and agent-delivery readiness use `confidence-rubrics/delivery-readiness.yaml`
and `scripts/lib/delivery-confidence-score.mjs`. The score is not a subjective
single number; it is a three-part gate:

```text
ReadinessScore = 10 * weightedEarnedEvidence / totalDimensionWeight
RiskPenalty = min(4, 10 * weightedAverage(likelihood * impact * (6 - detectability) / 125 * (1 - mitigationCoverage)))
FinalConfidence = min(ReadinessScore - RiskPenalty, hard caps)
```

Readiness dimensions cover requirements completeness, specification completeness,
traceability, retrieval evidence, dependency readiness, implementation confidence,
testability, rollback/observability, independent review provenance, and scope
safety. A 10/10 claim requires every dimension to have concrete evidence and
zero residual risk after mitigation.

Residual risk is scored with four explicit inputs: likelihood 1..5, impact 1..5,
detectability 1..5 where higher means easier to catch before user impact, and
mitigationCoverage 0..1. Severe hidden risks can reduce an otherwise complete
checklist to review/block status.

Hard caps prevent inflated scores when mandatory evidence is missing. Examples:
missing acceptance criteria caps at 6, missing verification command caps at 7,
verification not run caps at 8, failed verification caps at 6, missing required
CodeGraph or retrieval index readiness caps at 8, high-risk work without user
approval caps at 6, missing rollback or traceability caps at 8, open critical
findings cap at 7, and unresolved critical security/privacy gaps cap at 6.
False provenance also caps below the 9/10 gate: a failed required evidence gate,
inline or emulated producer output, and missing/untrusted receipt evidence each
cap delivery confidence at 8 until real verification or scoped runtime receipts
are attached.

Agent outputs that use this formula should persist `confidenceDetails` alongside
the numeric score so reviewers can inspect `ReadinessScore`, `RiskPenalty`, hard
caps, dimensions, risks, and warnings.

---

## Continuation Marker UX

`NEXT_USER_ACTIONS[]` and `NEXT_STEP_HANDOFF` are machine-readable continuation
markers for command artifacts and validators. In normal conversational summaries,
agents should translate the available actions into a short human-readable next
step sentence and avoid exposing the raw `NEXT_USER_ACTIONS[]` marker as prose
unless the command output contract explicitly requires the machine block.

---

## Telemetry contract

Every gate decision (pass / warn / block / override) flows into `.supervibe/memory/score-log.jsonl`:

```jsonl
{
  "id": "<uuid>",
  "timestamp": "<ISO>",
  "command": "<cmd-or-skill-id>",
  "artifact": "<type>",
  "path": "<path>",
  "score": <N>,
  "gate": "pass|warn|block",
  "override": <bool>,
  "override_rationale": "<text-if-override>",
  "auto_fix_applied": <bool>,
  "agent": "<agent-id-if-applicable>"
}
```

This unified log enables:
- Override-rate monitoring (5% budget enforcement)
- Score trends per artifact-type (improving / regressing over time)
- Auto-fix effectiveness measurement (what % of auto-fixes succeed)
- Cross-command gate consistency audit

---

## Memory pre-flight contract (NEW)

**Before any non-trivial command runs, it queries memory** for prior similar work. This prevents duplication and surfaces relevant precedent.

Standard pre-flight call (now wrapped by `scripts/lib/memory-preflight.mjs`):

```js
import { preflight } from 'scripts/lib/memory-preflight.mjs';

const matches = await preflight({
  query: '<topic>',
  agent: '<agent-id>',
  limit: 5,
  similarity: 0.75,
});
// matches: array of { path, snippet, similarity, category }
// If matches found → command should reference them in output
```

**Commands that call pre-flight:**
- `/supervibe-brainstorm` — find similar specs (avoids re-deriving)
- `/supervibe-plan` — find similar plans (adapt vs re-plan)
- `/supervibe-design` — find similar brand directions
- `/supervibe-execute-plan` — find prior executions of similar plan
- `/supervibe-strengthen` — find prior strengthen attempts on same agent

**Commands that DON'T call pre-flight:**
- Pure utility: `/supervibe-update`, `/supervibe-preview`
- Read-only inspection: `/supervibe-audit`, `/supervibe-score --dry-run`

This makes memory integration **uniform**: any command that produces a new artifact must first ask "what does the project already know about this?".

---

## Anti-patterns this spec prevents

- **Implicit gates** — every command must declare its gate in this spec.
- **Silent override** — every override hits `.supervibe/confidence-log.jsonl`.
- **Override creep** — 5% budget hard-gated; `/supervibe-audit` flags violators.
- **Vague remediation** — every dimension in every rubric must have an `evidence-required` field that names the specific evidence (file:line / artifact / output) the score depended on.
- **Inconsistent thresholds** — defaults are 9 / 10 unless rubric has explicit reason to deviate (documented in rubric YAML).
- **No memory pre-flight** — commands that produce artifacts MUST query memory first; reduces re-derivation.

---

## Migration from pre-1.0 gates

If any command/skill predates this spec:
1. Identify its rubric (or add one if missing)
2. Set `gates.block-below: 9` and `gates.warn-below: 10` (defaults)
3. Wire it to log to `.supervibe/memory/score-log.jsonl`
4. If it's an artifact-producing command, add memory pre-flight
5. Update its frontmatter to declare gate behavior

Validator `scripts/validate-confidence-gates.mjs` enforces rubric gate fields,
gated skill rubric references, user-facing command gate mapping, and this spec's
no-unshipped-placeholder rule during `npm run check`.

---

## Related

- `confidence-rubrics/_schema.json` — rubric file format
- `confidence-rubrics/*.yaml` — rubric instances
- `supervibe:confidence-scoring` skill — the universal scoring mechanism
- `scripts/lib/load-rubrics.mjs` — programmatic rubric access
- `scripts/lib/append-override-log.mjs` — override telemetry writer
- `.supervibe/memory/score-log.jsonl` — unified gate telemetry
- `.supervibe/confidence-log.jsonl` — override-specific log (subset of score-log)
- `references/internal-commands/supervibe-override.md` — internal override-with-rationale spec
