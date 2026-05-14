# Reference Packs

Reference packs are compact, cited context bundles loaded for an active
decision. They keep agents and commands grounded without copying whole manuals,
large checklists, or unrelated history into the prompt.

## What A Pack Contains

A useful pack names:

- source path, artifact id, URL, or memory id;
- why the source is relevant to the current branch;
- freshness or readiness status;
- short cited summary, not bulk prose;
- token budget used and whether anything overflowed;
- omitted-context notes when nearby evidence was intentionally left out.

Context-pack source status follows
[context-intelligence-contract.md](references/context-intelligence-contract.md):
memory, RAG, Code Graph, host rules, citations, freshness, confidence, and
token budget must stay visible instead of being collapsed into one opaque
summary.

## How Packs Are Loaded

Load packs in this order:

1. Task contract, user constraints, write set, and active command state.
2. Current artifacts named by the task, such as an approved plan, work graph,
   design direction, reviewer finding, or owned doc.
3. Project memory for prior decisions, patterns, incidents, and corrections.
4. Code RAG chunks for local source patterns when code behavior or project
   structure matters.
5. Code Graph evidence for public-surface, dependency, caller/callee,
   ownership, move, rename, extraction, or blast-radius claims.
6. One-hop reference docs, templates, rubrics, or checklists only when the
   active decision branch needs them.
7. External or domain evidence only when facts are current-sensitive or the
   domain requires it.

Do not preload every reference directory. A pack should answer the next
decision, not become an archive of everything that might be useful later.

## Avoiding Token Bloat

Use these rules when a pack grows too large:

- Keep the task contract, acceptance criteria, write scope, verification
  commands, and receipt requirements.
- Prefer citations plus short summaries over copied sections.
- Trim broad history before trimming current source evidence.
- Deduplicate sources that prove the same fact.
- Move large examples, tables, and checklists to supporting references and load
  only the branch-specific excerpt.
- Summarize stale or low-confidence evidence with its repair command instead of
  embedding full failed output.
- Record what was omitted and why when the omission could affect confidence.

Token overflow is a workflow signal. It should cause smaller packs, narrower
queries, or a fresh-context handoff, not silent loss of acceptance criteria or
verification proof.

## Pack Types

| Pack type | Loaded when | Typical evidence |
|---|---|---|
| Onboarding pack | Starting or refreshing a project | host rules, setup state, status output, install/adapt evidence |
| Planning pack | Turning user intent into an approved plan | memory, requirements artifacts, domain evidence, risk and verification matrix |
| Execution pack | Running a scoped work item | assigned task, dependencies, write set, source citations, targeted checks |
| Review pack | Reviewing implementation or artifacts | diff summary, relevant source reads, validator output, prior findings |
| Design pack | Designing or prototyping UI | target surface, brand direction, design data, accessibility and browser evidence |
| Release pack | Preparing final acceptance | validator results, changelog or release notes, rollback and monitoring evidence |

## Boundaries

Reference packs do not replace command-owned receipts, specialist invocation
proof, reviewer findings, or validator output. They only explain which context
was available when a decision was made.

If a command owns the lifecycle, the command decides which pack is authoritative
for durable progress. If an agent is invoked directly, the agent can assemble a
small pack for its role but must state gaps that lower confidence.

## Related

- [Workflow Hardening](supervibe-workflow-hardening.md)
- [Agent Anatomy](agent-anatomy.md)
- [Skill Anatomy](skill-anatomy.md)
- [Context Intelligence Contract](references/context-intelligence-contract.md)

## Reference-Only Decision Template

The [Architecture Decision Record](../references/templates/adr.md) template is retained for reference-pack authors who need long-term engineering decision rationale. Active product workflow surfaces should use the decision brief template instead.
