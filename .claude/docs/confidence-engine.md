# Confidence Engine

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Every agent output is scored against an applicable rubric (0–10). Gate threshold: **≥9** for non-blocking acceptance, **≥8** with override allowed once-per-task with logged rationale.

**12 rubrics** (in `confidence-rubrics/*.yaml`):

| Rubric | Applies to |
|--------|-----------|
| `agent-delivery` | Any agent's task output (most common) |
| `agent-quality` | Newly authored / strengthened agent files |
| `skill-quality` | Skill markdown files |
| `rule-quality` | Rule markdown files |
| `requirements` | Requirements docs from systems-analyst |
| `plan` | Implementation plans from writing-plans skill |
| `scaffold` | Output of /supervibe-genesis or stack-pack apply |
| `framework` | Foundational framework changes |
| `prototype` | Prototype-builder outputs |
| `research-output` | Research notes from *-researcher agents |
| `memory-entry` | Memory entries before persistence |
| `brandbook` | Brandbook deliverables |

**Override flow:** when a justified result scores 8.x, agent may override with `supervibe:_core:quality-gate-reviewer` reviewing the rationale. Override is logged to `.claude/confidence-log.jsonl`. Override rate >5% in a 100-entry window triggers SessionStart warning.

**Skill:** `supervibe:confidence-scoring` — applies the rubric and emits structured score + evidence.

See also: `docs/confidence-gates-spec.md` for unified gate semantics across commands + skills.
