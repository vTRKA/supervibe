# Semantic Anchors

Semantic anchors are optional local navigation hints for high-value files. They
name stable code regions, module responsibilities, public/private context,
invariants, and verification refs without making every file carry markup.

## Comment Format

```ts
// @supervibe-anchor id=auth.login symbol=loginUser visibility=public responsibility="Authenticate users" invariant="No raw password logs" verify="npm test -- auth"
export function loginUser(input) {
  return input.email;
}
```

The parser also accepts sidecar JSON:

```json
{
  "anchors": [
    {
      "filePath": "src/auth.ts",
      "symbolName": "loginUser",
      "responsibility": "Authenticate users",
      "invariants": ["No raw password logs"],
      "verificationRefs": ["npm test -- auth"]
    }
  ]
}
```

Anchor IDs are stable when explicitly supplied. Generated IDs are derived from
file path, symbol, and responsibility so they survive formatting and small edits.
Anchors are redacted and must not store secrets, raw prompts, credentials, or
private user data.

## File-Local Contracts

File-local contracts are private implementation context for touched files:

```ts
// @supervibe-contract purpose="Parse payments" inputs="raw payload" outputs="normalized payment" invariant="idempotency key required" forbidden="network call"
```

They can describe purpose, inputs, outputs, side effects, invariants, known
dependencies, and forbidden changes. They do not override shared project
contracts; fresh-context packets include only relevant local contracts for files
the task touches.

## Change Summaries

Successful tasks can append concise per-file summaries linked to task ID,
commit, evidence refs, and verification refs. Accepted summaries become active
file-local context after dedupe. Rejected or speculative summaries remain in the
run/archive ledger and are excluded from active context.

## Commands

```bash
/supervibe-status --anchors --file src/example.ts
/supervibe-loop --anchors --file src/example.ts
/supervibe-loop --anchor-doctor
/supervibe-loop --anchor-doctor --fix-derived
/supervibe-loop --summarize-changes --task task-123 --file src/example.ts --summary "Changed parser"
```

`--anchor-doctor --fix-derived` only updates derived indexes after backup.
Source comments and contracts require manual review.
