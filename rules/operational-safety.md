---
name: operational-safety
description: "Consent-first operational safety for deletes, servers, routers, credentials, privilege elevation, git pulls/stashes, and destructive side effects. RU: удаление, серверы и привилегии только с явным согласием."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-04-30
related-rules: [git-discipline, no-dead-code, privacy-pii, infrastructure-patterns, pre-commit-discipline]
---

# Operational Safety

## Why this rule exists

Most expensive AI-agent mistakes are not clever code bugs. They are ordinary
operational shortcuts: deleting code that was merely disconnected, running a
server command in write mode while "just checking", stashing someone else's
work, changing a router without rollback, or pasting a secret into a transcript.

Concrete consequence of NOT following: lost user work, locked production
sessions, leaked credentials, broken networking, irreversible migrations, and
confusing git history that nobody trusts.

## When this rule applies

- Any file deletion, mass move, cleanup, or generated-artifact pruning.
- Any command touching servers, routers, cloud accounts, DNS, firewalls,
  databases, queues, CI/CD, billing, or credentials.
- Any privilege elevation: `sudo`, `su`, admin session, router `enable`,
  config mode, cloud owner/admin role, production deployment key.
- Any git operation that can overwrite, hide, merge, or discard work.
- Any autonomous loop or sub-agent handoff that might perform side effects.

This rule does NOT block normal local reads, tests, linters, typechecks, or
formatters. It makes risky actions explicit and reversible.

## Operating Principles

1. **Read-only first.** Start by observing state. A diagnostic session should
   not mutate anything.
2. **Consent before side effects.** The user approves the exact target, command
   family, blast radius, and rollback path before mutation.
3. **Backup before change.** If the current state cannot be captured, say so and
   lower confidence before proceeding.
4. **Smallest reversible step.** One failure domain at a time. No broad cleanup
   during incident recovery or security remediation.
5. **Evidence over confidence.** Cite command output, file:line, config diff, or
   health check. Do not claim "safe" from intuition.

## Deletion Requires Proof and Consent

Before deleting any file, function, config block, database object, route, rule,
or generated asset:

1. Show what will be deleted.
2. Show why it is not needed.
3. Show usage evidence: grep/code graph/caller search, config references, or
   generated-artifact provenance.
4. Offer the non-delete alternative: reconnect, archive, disable behind flag,
   or leave as-is.
5. Wait for explicit user approval.

Allowed without a separate confirmation: empty temp files that were created by
the current task, failed generated outputs in a task-owned temp directory, and
obvious duplicate files created by the agent in the same turn.

Forbidden:

- Delete because "looks unused" without caller evidence.
- Delete to make tests or linters pass.
- Mass cleanup mixed into a feature task.
- `rm -rf`, `git clean`, recursive delete, or wildcard delete without exact
  path review and approval.

## Git Safety

Follow `git-discipline.md` plus these operational rules:

- `git stash`, `git stash pop`, `git stash apply`, `git stash drop`, and
  `git stash clear` are banned.
- `git pull` on a dirty worktree requires explicit user approval and a visible
  plan for local changes. Prefer `git status`, then commit/WIP branch or stop.
- `git reset --hard`, `git checkout --`, `git restore .`, `git clean -f`, force
  push, branch deletion, reflog expiry, and history rewriting are banned unless
  the user explicitly requests that exact operation.
- Never hide user changes to "get a clean tree".
- If a pull/update is necessary for plugin maintenance, first prove the managed
  checkout has no tracked edits and use the repository's update command.

## Servers, Routers, and Remote Systems

Default stance is read-only:

- OK by default: read logs, inspect status, list config, run health checks,
  fetch metrics, print diffs, query read replicas, collect `show`/`display`/`get`
  style outputs.
- Requires approval: restart, deploy, write config, change firewall/DNS/DHCP,
  rotate credentials, edit cloud resources, run migrations, mutate database
  data, purge caches, reboot routers, update firmware, save router running
  config, or enable admin/config mode.

Approval must include:

- target system or device
- command or UI action
- expected effect
- blast radius
- rollback path
- maintenance window if availability may be affected
- whether secrets or privileged credentials are involved

If the session can lock itself out, require an out-of-band recovery path before
continuing.

## Privilege Elevation

Privilege is a separate boundary. Do not treat it as a natural continuation of a
read-only task.

Requires explicit approval:

- `sudo`, `su`, `runas`, admin PowerShell
- router/switch/firewall `enable`, configuration mode, commit mode
- cloud owner/admin roles
- production deploy keys
- database superuser roles
- CI/CD tokens with write scope

Never ask the user to paste raw credentials. Ask them to run a command locally,
use a temporary scoped account, or provide a secret reference.

## Security and Privacy

- Never print full secrets, tokens, private keys, passwords, PSKs, session
  cookies, or authorization headers.
- Redact secrets in logs and reports. Prefixes are allowed only when needed to
  identify a provider, e.g. `sk_live_...`.
- Do not send secrets to external services for classification.
- PII in code/logs/test fixtures is a security finding, not sample data.
- Risk acceptance requires an explicit user decision and an expiry or review
  date when possible.

## Autonomous and Multi-Agent Work

When delegating or running a loop:

- Give each worker an explicit write scope.
- State that other workers may be editing the repo.
- Deny destructive git shortcuts and hidden stashes.
- Require each worker to report side effects separately from code edits.
- Stop on requests for network, production, server, router, credential, billing,
  or destructive filesystem mutations until user approval exists for that exact
  action.

## Examples

### Bad

```text
The agent sees unused functions, deletes the file, runs tests, and reports done.
```

Why this is bad: tests are not a caller graph. The file may be feature work that
is not wired yet, a plugin entry point, or a generated artifact.

### Good

```text
Candidate deletion: services/legacy-auth.ts
Evidence: zero imports via code search; no route/config references; superseded by services/auth.ts.
Alternative: keep and wire route / archive to docs/legacy / delete.
Waiting for user decision before removing.
```

Why this is good: the user sees the blast radius and can choose.

### Bad

```text
ssh router; configure terminal; change firewall rule; save; then test.
```

Why this is bad: config mode, firewall mutation, and save all happened before
backup, approval, and rollback.

### Good

```text
Read-only diagnostics found WAN drops and high interface errors.
Proposed change: set WAN port autonegotiation back to auto on router X.
Backup: current config exported.
Rollback: restore previous speed/duplex line.
Approval requested before config mode.
```

Why this is good: the operator can recover if the change is wrong.

## Enforcement

- Agents must cite this rule before risky mutations.
- `/supervibe-security-audit` and `network-router-engineer` use this rule as a
  hard boundary.
- Scaffolded projects should copy this rule with `git-discipline`,
  `privacy-pii`, and `infrastructure-patterns`.
- Confidence gates fail if the final report hides a destructive command, skipped
  approval, missing rollback, or unredacted secret.

## Related rules

- `git-discipline` — destructive git commands and safer alternatives
- `no-dead-code` — caller evidence before deletion
- `privacy-pii` — PII handling and log redaction
- `infrastructure-patterns` — infra design and deploy patterns
- `pre-commit-discipline` — local checks before sharing changes
