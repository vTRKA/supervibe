---
description: "Internal escape hatch for HARD BLOCK confidence gates. Records the override with required reason in .claude/confidence-log.jsonl. Prefer fixing score gaps first."
---

# /supervibe-override

Internal escape hatch for continuing past a confidence-scoring BLOCK status by recording the override decision in an append-only audit log.

This command is intentionally not part of the normal user path. It should be suggested only by `/supervibe-score`, `/supervibe-execute-plan`, or another confidence gate after the user has seen the gaps and explicitly accepts the risk.

## Path resolution for the audit log

`.claude/confidence-log.jsonl` is resolved **relative to the current working directory** (the project root where Claude Code is running), NOT relative to the plugin install path.

- When using Supervibe in a target project (`/path/to/their-project/`), the log lands at `/path/to/their-project/.claude/confidence-log.jsonl`.
- When testing the plugin inside its own dev repo, the log lands at `<plugin-repo>/.claude/confidence-log.jsonl`.

If `.claude/` does not exist yet, this command must create it.

## Implementation reference

The append/read/rate-compute logic is implemented in `$CLAUDE_PLUGIN_ROOT/scripts/lib/append-override-log.mjs` and tested by `tests/override-log-flow.test.mjs`. When this command executes, follow the schema and validation rules enforced by `appendOverrideEntry()` (required fields, minimum reason length).

## When this is appropriate

- Shipping a known-incomplete prototype where 10/10 is not the goal
- Time-critical hotfix where re-iterating is more risky than shipping
- Spike or experiment where the rubric is too strict by design

## When this is NOT appropriate

- Avoiding doing the work to get to 9/10
- Routine tasks where the gate is meant to enforce discipline
- Override rate already >5% of last 100 artifacts

## Argument parsing

- `$1..N` = the reason (must be present, ≥10 characters)

If reason is missing or shorter than 10 characters: respond "Override requires a reason of at least 10 characters explaining WHY the BLOCK is acceptable."

## What I do when invoked

1. Parse the reason from arguments.
2. Validate reason length ≥10 characters.
3. Read the most recent confidence-scoring result from the conversation context.
4. Construct the log entry with timestamp, artifact-type, score, gaps, agent, reason.
5. Append a single JSON line to `.claude/confidence-log.jsonl` (resolved relative to cwd).
   - Create `.claude/` and the log file if missing.
   - NEVER edit existing lines (append-only).
6. Confirm to user: "Override recorded. Artifact may proceed at score X/10 with the noted gaps."

## Audit interaction

`supervibe:audit` reads the log and computes:
- Override rate per N artifacts
- Most-overridden artifact types
- Reasons clustering

If override rate >5% of last 100 entries → flag systemic issue.

## Guard rails

- ONLY append, never edit, never delete log entries
- Reason is REQUIRED and validated for non-triviality
- Override does NOT change the artifact — it just authorizes the caller to ignore the BLOCK
- One override = one log line = one decision
