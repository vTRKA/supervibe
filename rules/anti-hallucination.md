---
name: anti-hallucination
description: "Never claim a path/function/contract/command exists without grep/read verification; never claim 'works' without command output. RU: Запрещает выдумывание путей, сигнатур и фактов без grep/read верификации; требует cite file:line. Trigger phrases: 'не выдумывай', 'cite file:line', 'верифицируй'."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-04-27
related-rules: [confidence-discipline, no-dead-code]
---

# Anti-Hallucination

## Why this rule exists

Language models confabulate plausible-but-wrong details. In a coding context, this manifests as claiming a function exists when it doesn't, citing a path that's misspelled, asserting "tests pass" without running them.

Hallucinations corrupt the codebase silently — they write to non-existent files, import non-existent symbols, claim verifications that didn't happen. The cost is debugging time multiplied across teammates.

Concrete consequence of NOT following: production deploy of code that imports `getUserById` when actual function is `findUserById`; rollback at 3am; trust loss in agent assistance.

## When this rule applies

- Every Read/Edit/Write that references existing code
- Every Bash command claiming verification
- Every Skill output claiming completion
- Every "works"/"fixed"/"complete"/"passing"/"done" assertion

## What to do

**Before writing code that references existing symbols:**
- `Grep` for the exact symbol name → confirm it exists at expected path
- `Read` the file → confirm the API matches what you're calling

**Before claiming verification:**
- Run the verification command via Bash tool
- Show output verbatim (no paraphrasing)
- Include exit code

**Before stating a fact about the codebase:**
- Provide grep evidence (file:line citation)
- Or `Read` a specific section confirming
- If a semantic anchor or file-local contract is cited, verify it with
  `/supervibe-status --anchors --file <path>` or by reading the sidecar/index.
  Never invent anchor IDs, invariants, or change-summary evidence.

**Before asserting "this is the convention":**
- Show ≥3 examples of the pattern (1 example = anecdote, 3 = pattern)

## Examples

### Bad

```
Agent: "I've imported the auth helper from src/lib/auth.ts"
[Reality: file is at src/utils/auth.ts; import fails]
```

Why this is bad: agent guessed the path; build fails; teammate debugs.

### Bad

```
Agent: "All tests pass."
[No Bash invocation; no test output shown.]
```

Why this is bad: no evidence; could be true or false; trust eroded.

### Good

```
Agent: I'll grep for the auth helper first.
[Grep "export.*auth" → src/utils/auth.ts:12]
Now importing from src/utils/auth.ts.
```

Why this is good: grep-verified path before writing import.

### Good

```
Agent: Running verification.
[Bash: npm test]
[Output captured verbatim, 47 tests pass, exit 0]
All 47 tests pass. Verification command output above.
```

Why this is good: command run, output shown, claim supported.

## Enforcement

- `supervibe:verification` skill enforces evidence-before-assertion at per-claim level
- `supervibe:confidence-scoring` `agent-delivery.yaml` rubric has `anti-hallucination` dim (weight 2)
- Code review checks for unverified claims
- `supervibe:audit` scans transcript for "done"/"works"/"fixed" claims preceded by no command output

## Related rules

- `confidence-discipline` — broader gate; this is per-claim
- `no-dead-code` — invented symbols become dead code

## See also

- `skills/verification/SKILL.md`
- `confidence-rubrics/agent-delivery.yaml`
