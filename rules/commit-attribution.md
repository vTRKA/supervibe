---
name: commit-attribution
description: "AI agents must commit as the user — never add Co-Authored-By Claude / Codex / Gemini footers, never write Generated-by signatures, never sign commits as themselves"
applies-to: [any]
mandatory: true
severity: high
version: 1.0
last-verified: 2026-04-28
related-rules: [commit-discipline, git-discipline]
---

# Commit Attribution

## Why this rule exists

Commits authored on the user's behalf must look indistinguishable from commits the user made by hand. AI signatures create three concrete problems:

1. **Audit-trail noise** — hiring reviews, blame, ownership tracking all become harder when half the history is co-authored by a bot. The user is responsible for the change either way; their name should be the only attribution.
2. **Contractual risk** — some employers / clients have policies about declaring AI assistance. The decision to disclose is the *user's* — not something we should pre-emptively bake into every commit message.
3. **Tool-flavor leakage** — `🤖 Generated with Claude Code` or `Co-Authored-By: Claude <noreply@anthropic.com>` exposes which tool was used; this is not information that belongs in the public record of the user's project.

## When this rule applies

- Every `git commit` performed by an AI agent on the user's behalf
- Every PR / MR description authored by an AI agent
- Every changelog entry, release note, or commit body
- Both `claude` / `codex` / `gemini` and any future AI assistant

This rule does NOT apply when:
- The user explicitly asks for AI attribution ("add a Co-Authored-By Claude trailer")
- The repo has a documented policy mandating AI disclosure (then attribution is the user's policy, not the agent's preference)

## What to do

### Required

1. **Authorship**: rely on the local `git config user.name` / `user.email` already set by the user. Never override.
2. **Sign-off**: never add `Signed-off-by:`, `Co-Authored-By:`, `Generated-by:`, `Authored-by-AI:`, or any synonym referring to an AI tool.
3. **No tool-branded footers**: never end a commit with marketing text like `🤖 Generated with [Claude Code](...)` or `Made with Codex` or `via Gemini`.
4. **No AI watermarks in body**: if the body explains *why*, write it from the user's voice — first person, not "the assistant proposes...".
5. **PR descriptions**: same rule — no `🤖` icon, no "Generated with X" footer.

### Examples

**Bad** — these will FAIL the rule:

```
feat(auth): add Google OAuth provider

Implements #142.

Co-Authored-By: Claude <noreply@anthropic.com>
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

```
fix(api): handle null response from upstream

This commit was prepared by the AI assistant under user direction.
```

**Good** — same content, no AI attribution:

```
feat(auth): add Google OAuth provider

Implements #142.
```

```
fix(api): handle null response from upstream

Upstream service intermittently returns 200 with empty body during cold-start.
Treating empty body as a transient error so the retry layer kicks in instead
of a hard fail.
```

## How to apply

When generating a commit:
1. Compose the subject + body normally per `commit-discipline` rule.
2. Stop after the body. Do **not** append an attribution footer.
3. Use the user's git identity (`git config user.name/user.email`) — never pass `--author` or `-c user.email=...` to override.
4. Use Conventional Commits format from `commit-discipline` rule.
5. Pass the message via heredoc / single-quoted here-string to preserve formatting (see `commit-discipline` for syntax).

When generating a PR:
1. Title = imperative summary (≤70 chars, mirrors commit subject style)
2. Body = `## Summary` + bullets + `## Test plan` checklist
3. **Stop**. Do not add any `🤖 Generated with...` line.

## Override

If the user explicitly says "add Co-Authored-By: Claude" or "include the Claude footer in this commit" — comply for that specific commit only. The override does not propagate to subsequent commits in the same session.

Log overrides as you would for any rule: append a single line to `.claude/confidence-log.jsonl` with `{ rule: "commit-attribution", override: true, reason: "user requested attribution" }`.

## Verification

Quick local check that no commits in current branch carry AI attribution:

```bash
git log main..HEAD --format="%B" | grep -iE "co-authored-by:.*(claude|codex|gemini|chatgpt|copilot)|generated with|🤖|authored-by-ai" || echo "clean"
```

Expected output: `clean`. Any matches → strip them via interactive rebase or amend.

## Related

- `commit-discipline` — Conventional Commits format itself
- `git-discipline` — never force-push to main, never `--no-verify`
- `pre-commit-discipline` — Husky hooks must pass before commit lands
