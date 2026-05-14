# Reviewer Output Template

Use this template for code, plan, artifact, or PR review output when another
worker must receive findings and act on them. Findings must be evidence-backed,
ranked by severity, tied to a file line, and clear about whether the reviewed
work can proceed.

Do not return only "LGTM", a summary paragraph, or generic advice. If there are
no findings, still record scope, evidence inspected, and a final verdict.

## Review Metadata

| Field | Required content |
| --- | --- |
| Review ID | Work item, PR, plan, artifact, or review request id. |
| Reviewer | Human, agent, specialist role, or validator producing the review. |
| Reviewed subject | Diff, commit, branch, plan path, artifact path, or package version. |
| Scope | Files, line ranges, artifacts, commands, runtime paths, and user outcomes reviewed. |
| Out of scope | Explicit exclusions and why they were not reviewed. |
| Evidence inspected | Source files, diff, spec, memory/RAG/CodeGraph status, commands, logs, screenshots, receipts, or external docs. |
| Independence | Whether the reviewer is independent of the implementer and any limitations. |

## Severity

Use one severity per finding:

| Severity | Blocks completion | Use when |
| --- | --- | --- |
| Critical | Yes | Data loss, security exposure, release compromise, destructive workflow state, broken primary path, or false completion claim. |
| Major | Yes | Correctness bug, contract break, missing required verification, missing reviewer/receipt gate, migration risk, or likely regression. |
| Minor | Usually no | Maintainability, naming, clarity, non-blocking coverage gap, or low-risk edge case. |
| Suggestion | No | Optional improvement that is helpful but not required for the current scope. |

Severity must reflect impact, not reviewer preference. If a finding is
speculative, mark it as a suggestion or request clarification unless evidence
shows a real failure.

## Finding Requirements

Every finding row must include all required fields:

| Required field | Rule |
| --- | --- |
| Severity | `Critical`, `Major`, `Minor`, or `Suggestion`. |
| File line | Use `path/to/file.ext:42`. For artifact reviews, use the artifact path and line. Do not use "various" unless every path is listed in evidence. |
| Impact | Explain the concrete user, runtime, security, data, workflow, maintenance, or verification consequence. |
| Suggested fix | State the smallest scoped fix or the exact decision needed. Use "needs clarification" only with a specific question. |
| Evidence | Cite code, diff, spec, test output, validator output, log, screenshot, CodeGraph result, memory/RAG result, or reproduced behavior. |
| Verdict | Per-finding verdict: `fix-required`, `needs-clarification`, `optional`, or `no-action-after-evidence`. |

## Findings

Use one row per issue. Do not combine unrelated findings.

| ID | Severity | File line | Finding | Impact | Suggested fix | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REV-001 | Critical/Major/Minor/Suggestion | path/to/file.ext:42 | Concrete problem. | Concrete consequence. | Smallest scoped fix or decision. | Source, command, log, screenshot, or artifact evidence. | fix-required/needs-clarification/optional/no-action-after-evidence |

## Positive Evidence

List evidence that materially supports approval. Keep this brief and concrete.

- `<path or command>`: what it proves and any limitation.
- `<path or command>`: what it proves and any limitation.

## Verification Requested

List the commands or manual checks the implementer should run after fixes:

| Finding | Verification | Expected result |
| --- | --- | --- |
| REV-001 | `npm run <target>` or manual check | Exit 0, screenshot state, reviewer re-check, or specific output. |

## Final Verdict

Choose exactly one:

- `BLOCKED`: at least one critical or major finding remains, required evidence
  is missing, or reviewer coverage is incomplete.
- `NEEDS_CHANGES`: findings are fixable and must be addressed before approval.
- `APPROVED_WITH_NOTES`: only minor or suggestion findings remain and residual
  risks are recorded.
- `APPROVED`: no blocking or advisory findings remain for the stated scope.

Record the verdict:

```text
Verdict: BLOCKED | NEEDS_CHANGES | APPROVED_WITH_NOTES | APPROVED
Blocking findings: <ids or none>
Residual risks: <ids, owner, trigger, or none>
Required next action: <fix, clarify, rerun verification, rereview, or none>
```

## Completion Checklist

- Scope and out-of-scope areas are explicit.
- Every finding has severity, file line, impact, suggested fix, evidence, and
  verdict.
- Blocking findings are Critical or Major and have a required fix or
  clarification.
- Advisory findings are Minor or Suggestion and do not block the final verdict.
- Final verdict matches the highest unresolved severity.
- Verification requested is specific enough for the receiver to run.
