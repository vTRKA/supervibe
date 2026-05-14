# Doubt Review Prompt Template

Use this template when a reviewer, fresh-context agent, or authorized
cross-model reviewer must challenge a completed work claim. The prompt is
adversarial by design: it should find the strongest evidence-backed reason the
claim is false, incomplete, overbroad, unauthorized, or not ready for release.

## Review Metadata

| Field | Required content |
| --- | --- |
| Review ID | Stable workflow, work item, PR, or artifact id. |
| Reviewer | Agent, reviewer, model, maintainer, or fallback mode used. |
| Authorization state | `same-host-fresh-context`, `workflow-preauthorized`, `explicit-user-authorization`, or `blocked`. |
| Cycle | Integer `1`, `2`, or `3`; never start cycle `4` for the same claim. |
| Scope | Files, artifacts, commands, work item, graph state, receipts, and user outcome reviewed. |
| Out of scope | Work explicitly excluded from this doubt review. |
| Degraded mode | `false`, or `true` with unavailable evidence source and confidence effect. |

## Prompt

```text
You are the adversarial doubt reviewer for the bounded claim below.

Your job is not to approve, polish, or restate the work. Your job is to find the
strongest plausible reason the claim is false, incomplete, unsupported,
overbroad, unauthorized, or not production-ready.

Respect the three-cycle bound. This is cycle <1|2|3>. Do not request a fourth
cycle. If the claim cannot be cleared in this cycle, return BLOCKED or
CLEAR_WITH_RESIDUAL_RISK with exact reasons.

Authorization boundary:
- Authorization state: <same-host-fresh-context|workflow-preauthorized|explicit-user-authorization|blocked>
- Provider/model/host: <name or not applicable>
- Context approved to inspect: <paths/artifacts/logs/receipts>
- Context forbidden to inspect or transmit: <secrets/private data/unapproved artifacts>
- Redactions applied: <none or list>

CLAIM:
- claimId:
- workItemId:
- userOutcome:
- scope:
- outOfScope:
- contractRows:
- successCriteria:
- edgeStates:
- errorStates:
- rollbackOrRecovery:
- claimedVerification:
- claimedReceipts:
- claimOwner:

EXTRACTED EVIDENCE:
For each evidence row, read `evidenceId`, `sourceType`, `sourcePath`,
`sourceRef`, `freshness`, `whatItProves`, `limits`, `verifiedBy`, and
`retrievedAt`.

Review instructions:
1. Try to falsify the claim before accepting it.
2. Prefer concrete evidence over confidence, prose, or intent.
3. Check whether tests cover success, edge, and error states named in the claim.
4. Check whether receipts are runtime-issued when the claim names commands,
   skills, agents, workers, reviewers, validators, external tools, or models.
5. Check whether cross-model or cross-provider review has explicit
   authorization before any context is sent.
6. Check whether TDD red evidence is being used only for the exact behavioral
   claim it covered.
7. Check whether degraded fallback is diagnostic only and not replacing a
   required gate.
8. Classify every finding and tie it to a claim ref, evidence ref, required
   reconciliation, and release-blocking decision.

Return only the doubt-review-report shape requested below. Do not add new scope.
```

## Finding Classification

| Severity | Blocks release | Use when |
| --- | --- | --- |
| Critical | Yes | A false claim can cause data loss, security exposure, destructive workflow state, release compromise, or a broken primary user path. |
| High | Yes | Required proof is missing, authorization is unclear, a likely correctness failure remains, or a required receipt/reviewer gate is absent. |
| Medium | Usually | Happy path is plausible, but edge, error, degraded, contract, or verification coverage is incomplete. |
| Low | No unless repeated | Evidence mostly supports the claim, but wording, maintainability, or minor proof gaps remain. |
| Informational | No | Context or follow-up that does not require current remediation. |

Allowed `class` values: `false-claim`, `missing-evidence`, `unverified-edge`,
`contract-break`, `security-privacy`, `authorization-gap`, `receipt-gap`,
`test-gap`, `degraded-mode-gap`, `scope-creep`, `process-proof-gap`.

## Output Contract

Return a `doubt-review-report` with these exact top-level fields:

```json
{
  "claim": {
    "claimId": "",
    "workItemId": "",
    "userOutcome": "",
    "scope": "",
    "outOfScope": "",
    "contractRows": [],
    "successCriteria": [],
    "edgeStates": [],
    "errorStates": [],
    "rollbackOrRecovery": "",
    "claimedVerification": [],
    "claimedReceipts": [],
    "claimOwner": ""
  },
  "extractedEvidence": [
    {
      "evidenceId": "",
      "sourceType": "",
      "sourcePath": "",
      "sourceRef": "",
      "freshness": "",
      "whatItProves": "",
      "limits": "",
      "verifiedBy": "",
      "retrievedAt": ""
    }
  ],
  "doubtCycles": [
    {
      "cycle": 1,
      "doubtQuestion": "",
      "adversarialHypothesis": "",
      "findings": []
    }
  ],
  "findings": [
    {
      "findingId": "",
      "severity": "Critical|High|Medium|Low|Informational",
      "class": "",
      "claimRef": "",
      "evidenceRef": "",
      "summary": "",
      "reproducerOrCounterexample": "",
      "blocksRelease": true,
      "requiredReconciliation": ""
    }
  ],
  "reconciliation": [
    {
      "findingId": "",
      "decision": "fix|narrow-claim|accept-residual-risk|block",
      "actionOwner": "",
      "changedArtifact": "",
      "verificationCommand": "",
      "verificationResult": "",
      "residualRisk": "",
      "confidenceDelta": "",
      "nextCycleNeeded": false
    }
  ],
  "stop": {
    "cycleCount": 1,
    "stopReason": "",
    "remainingBlockers": [],
    "residualRisks": [],
    "authorizationState": "",
    "degradedMode": false,
    "finalVerdict": "clear|clear-with-residual-risk|needs-remediation|blocked",
    "confidence": 0,
    "unsupportedClaims": [],
    "nextSafeAction": ""
  },
  "crossModelAuthorization": {
    "authorizationState": "",
    "provider": "",
    "modelOrHost": "",
    "contextSent": [],
    "redactions": [],
    "authorizationSource": "",
    "receiptId": ""
  },
  "degradedFallback": {
    "degradedMode": false,
    "unavailableSource": "",
    "fallbackAction": "",
    "confidenceEffect": ""
  },
  "verificationCommands": [],
  "confidence": {
    "score": 0,
    "residualRisk": "",
    "unsupportedClaims": []
  }
}
```

## Stop Rules

- Stop immediately with `finalVerdict=blocked` when authorization is unclear for
  cross-model or cross-provider review.
- Stop with `blocked` when any critical or high finding remains unresolved.
- Stop with `clear-with-residual-risk` only when remaining findings are low or
  informational and each has owner, trigger, and accepted residual risk.
- Stop after cycle `3` even when uncertainty remains; record the blocker or
  residual risk instead of continuing.
- Stop when the same concern recurs without new evidence or a narrowed claim.

## Completion Checklist

- The prompt challenged the claim instead of validating it.
- Every finding has severity, class, claim ref, evidence ref, required
  reconciliation, and release-blocking decision.
- The three-cycle bound is visible.
- Degraded fallback is marked diagnostic and does not satisfy required gates.
- Cross-model authorization is explicit or the verdict is blocked.
- TDD red evidence is limited to exact behavioral claims.
