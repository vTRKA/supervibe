# Unified Confidence Gates Specification

> **Audience:** Plugin developers + agent authors. This is the contract every command + skill follows.
>
> **Version:** 1.0 (2026-04-28). Supersedes ad-hoc gate semantics that varied per command.

## Why this exists

Pre-spec, gates varied widely:
- `/evolve-execute-plan` — explicit 10/10 dual gates (Stage A + Stage B)
- `/evolve-design` — implicit gates via per-stage feedback loops
- `/evolve-score` — gate at ≥9 with fuzzy override path
- `/evolve-strengthen` — gate at ≥8.5 average per quantitative metric
- Various skills — `gate-on-exit: true` boolean with no threshold semantics

Result: users + agents couldn't predict gate behavior. This spec unifies the model so every gate has the same semantics, the same override path, the same telemetry.

---

## Three gate states (universal)

Every confidence-gated artifact lands in exactly one of three states:

| State | Score range | Meaning | What happens |
|---|---|---|---|
| `pass` | score ≥ `block-below`+1 (typically ≥10) | Quality target met | Continue without intervention |
| `warn` | `block-below` ≤ score < `warn-below`+1 (typically 9.0-9.99) | Acceptable but flagged | Continue + log warning to telemetry; user can act |
| `block` | score < `block-below` (typically <9.0) | Below quality threshold | Halt; require fix OR `/evolve-override` |

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

1. **Justification is captured** as text (≥10 chars per `evolve:_core:quality-gate-reviewer` enforcement).
2. **Logged to `.claude/confidence-log.jsonl`** with structured record:
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
3. **Override-rate budget enforced**: if override rate >5% over last 100 entries → SessionStart emits warning + recommends `/evolve-audit`.
4. **Reviewable by `evolve:_core:quality-gate-reviewer`** — it can dispute the override; user has final say.

If override would break this 5%-budget → command stops with: "Override budget exceeded; investigate via `/evolve-audit` first."

---

## Auto-fix step (NEW — Phase C of cmd-quality plan)

Where possible, commands now offer to **auto-apply** the suggested remediation:

| Gate state | Default user prompt | Auto-fix available? |
|---|---|---|
| `block` (score < 9) | "Score is X/10. Options: [1] Apply suggested fix / [2] Override / [3] Cancel" | YES for low-risk fixes |
| `warn` (9-9.99) | "Score is X/10. Optional improvements: [1] Apply / [2] Continue / [3] Cancel" | YES for low-risk fixes |
| `pass` (≥10) | (nothing — proceed) | n/a |

**Auto-fix is "low-risk" when:**
- Fix is a single section addition (not removal)
- Fix is a frontmatter field addition
- Fix is a rename of a token reference
- Fix has been categorised as `auto-fixable: yes` in the rubric's remediation hints

**Auto-fix is NOT applied without confirmation when:**
- Fix changes Persona / Decision tree / Anti-patterns (these shape every output)
- Fix removes content
- Fix touches multiple files
- Fix is categorised as `auto-fixable: no`

The auto-fix mechanism uses the rubric's `dimensions[].evidence-required` + a remediation hint per dimension. Implementation: `scripts/lib/auto-fix-suggester.mjs` (TODO: ship in next cycle).

---

## Per-command gate semantics

Every user-facing command in `commands/` declares which rubric it uses + how it gates.

### Two-stage commands (rare, high-stakes)

`/evolve-execute-plan` — Stage A readiness + Stage B completion. Both must `pass` independently. Override possible per stage; logged separately.

### Single-stage commands (most)

| Command | Rubric | block-below | Auto-fix? |
|---|---|---|---|
| `/evolve-brainstorm` | `requirements.yaml` | 9 | yes (add missing sections) |
| `/evolve-plan` | `plan.yaml` | 9 | yes (split fat tasks) |
| `/evolve-design` | implicit per stage; final scored against `prototype.yaml` or `brandbook.yaml` | 9 | no (design is human judgment) |
| `/evolve-genesis` | `scaffold.yaml` | 9 | yes (regenerate missing files) |
| `/evolve-execute-plan` | `execute-plan.yaml` (Stage A) + per-rubric (Stage B) | 9 | partial (Stage A: yes, Stage B: case-by-case) |
| `/evolve-deploy` | `execute-plan.yaml` (delegated) | 9 | partial |
| `/evolve-evaluate` | matches artifact-type rubric | 9 | yes |
| `/evolve-score` | matches artifact-type rubric | 9 | yes |
| `/evolve-strengthen` | `agent-quality.yaml` | 9 | no (changes shape every output; user must approve) |
| `/evolve-audit` | n/a (read-only inspection) | — | — |
| `/evolve-test` | n/a (test runner) | — | — |
| `/evolve-debug` | n/a (diagnostic) | — | — |
| `/evolve-memory-gc` | n/a (utility) | — | — |
| `/evolve-changelog` | n/a (display) | — | — |
| `/evolve-update` | n/a (infrastructure) | — | — |
| `/evolve-override` | `override.yaml` (rationale quality) | n/a (override IS the gate) | n/a |
| `/evolve-preview` | n/a (server) | — | — |
| `/evolve-adapt` | propagates per-artifact gates | 9 | yes (per-file diff gate) |

### Skills

Skills declare their gate via frontmatter:

```yaml
gate-on-exit: true             # bool: should this skill block on score?
confidence-rubric: rubric.yaml # which rubric scores the output
```

If `gate-on-exit: true` AND `score < block-below` → skill emits `BLOCKED` status; calling agent must address before continuing.

---

## Telemetry contract

Every gate decision (pass / warn / block / override) flows into `.claude/memory/score-log.jsonl`:

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
- `/evolve-brainstorm` — find similar specs (avoids re-deriving)
- `/evolve-plan` — find similar plans (adapt vs re-plan)
- `/evolve-design` — find similar brand directions
- `/evolve-execute-plan` — find prior executions of similar plan
- `/evolve-debug` — find prior failures of same agent on same task type
- `/evolve-strengthen` — find prior strengthen attempts on same agent
- `/evolve-deploy` — find prior deploys of similar prototype

**Commands that DON'T call pre-flight:**
- Pure utility: `/evolve-test`, `/evolve-update`, `/evolve-changelog`, `/evolve-memory-gc`, `/evolve-preview`
- Read-only inspection: `/evolve-audit`, `/evolve-score --dry-run`

This makes memory integration **uniform**: any command that produces a new artifact must first ask "what does the project already know about this?".

---

## Anti-patterns this spec prevents

- **Implicit gates** — every command must declare its gate in this spec.
- **Silent override** — every override hits `.claude/confidence-log.jsonl`.
- **Override creep** — 5% budget hard-gated; `/evolve-audit` flags violators.
- **Vague remediation** — every dimension in every rubric must have an `evidence-required` field that names the specific evidence (file:line / artifact / output) the score depended on.
- **Inconsistent thresholds** — defaults are 9 / 10 unless rubric has explicit reason to deviate (documented in rubric YAML).
- **No memory pre-flight** — commands that produce artifacts MUST query memory first; reduces re-derivation.

---

## Migration from pre-1.0 gates

If any command/skill predates this spec:
1. Identify its rubric (or add one if missing)
2. Set `gates.block-below: 9` and `gates.warn-below: 10` (defaults)
3. Wire it to log to `.claude/memory/score-log.jsonl`
4. If it's an artifact-producing command, add memory pre-flight
5. Update its frontmatter to declare gate behavior

Validator `validate-confidence-gates.mjs` (TODO) will enforce this on every commit once shipped.

---

## Related

- `confidence-rubrics/_schema.json` — rubric file format
- `confidence-rubrics/*.yaml` — rubric instances (12 currently)
- `evolve:confidence-scoring` skill — the universal scoring mechanism
- `scripts/lib/load-rubrics.mjs` — programmatic rubric access
- `scripts/lib/append-override-log.mjs` — override telemetry writer
- `.claude/memory/score-log.jsonl` — unified gate telemetry
- `.claude/confidence-log.jsonl` — override-specific log (subset of score-log)
- `/evolve-override` — the formal override-with-rationale flow
