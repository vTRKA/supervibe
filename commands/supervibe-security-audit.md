---
description: >-
  Use WHEN the user asks for security audit, vulnerability scan, safe-to-ship
  decision, or remediation loop TO run a read-only multi-agent security audit,
  rank findings, then optionally plan, execute, and re-audit until the security
  gate reaches 10/10. Triggers: 'security audit', 'vulnerability scan', 'safe to
  ship', 'секьюрити аудит', 'проверка уязвимостей'.
---

# /supervibe-security-audit

Run a Supervibe-native security audit loop. The command does not mutate code by
default; it applies broad agent coverage, severity-ranked findings, explicit
remediation planning, diff/approval before writes, and an independent verifier
pass after fixes.

## Invocation

```bash
/supervibe-security-audit
/supervibe-security-audit --scope .
/supervibe-security-audit --scope apps/api --severity high
/supervibe-security-audit --plan .supervibe/audits/security/security-2026-04-30.md
/supervibe-security-audit --execute .supervibe/artifacts/plans/security-remediation.md
/supervibe-security-audit --reaudit .supervibe/audits/security/security-2026-04-30.md
/supervibe-security-audit --quick --no-deps
```

Default mode is `--audit`. It is read-only.

## Agent Roster

Dispatch only agents that are installed in the target project. If a useful agent
is missing, report it as an optional add-on instead of silently installing it.

Core chain:

AI prompt, agent prompt, intent-router, tool-policy, and prompt-injection
surfaces also invoke `supervibe:_ops:prompt-ai-engineer` when the agent is
installed.

- `supervibe:_core:repo-researcher` — map codebase, trust boundaries, public surfaces
- `supervibe:_core:security-auditor` — OWASP/CWE audit, secrets, auth, access control
- `supervibe:_ops:dependency-reviewer` — lockfiles, CVEs, licenses, supply chain
- `supervibe:_ops:security-researcher` — fresh CVE/GHSA/NVD/CISA KEV validation
- `supervibe:_ops:devops-sre` — CI/CD, deployment, runtime detection gaps
- `supervibe:_ops:ai-integration-architect` — only when AI/LLM/MCP/RAG surfaces exist
- stack specialists — only for remediation, never for initial risk acceptance
- `supervibe:_core:quality-gate-reviewer` — final independent gate

Optional add-ons:

- `ai-prompting` add-on: installs `prompt-ai-engineer` for prompt, agent,
  router, tool-policy, and prompt-injection reviews.
- `security-audit` add-on: installs `security-auditor`, `dependency-reviewer`,
  `security-researcher`, `devops-sre`, and `ai-integration-architect`.
- `network-ops` add-on: installs `network-router-engineer`; never default because
  it may touch real infrastructure and needs scoped user approval.

## Coverage Matrix

Normalized to Supervibe agents:

| Surface | Required checks |
|---|---|
| Secrets | hardcoded keys, `.env` hygiene, logs, CI secrets exposure, git history hints |
| Injection | SQL/NoSQL/OS command/template/LDAP/XXE/path traversal/ReDoS/prototype pollution |
| Auth/access | session/JWT/OAuth, CSRF, BOLA/IDOR, role checks, tenant boundaries |
| SSRF/network egress | user-controlled URLs, metadata endpoints, internal CIDR blocking |
| API security | public routes, mass assignment, rate limits, debug endpoints, GraphQL introspection |
| Dependencies | CVEs, lockfile integrity, suspicious scripts, abandoned deps, license policy |
| Config/infra | Docker/Kubernetes/Terraform/Nginx/CORS/CSP/security headers/TLS defaults |
| CI/CD | unpinned actions, broad tokens, secret printing, artifact poisoning |
| AI/LLM/agents | prompt injection, tool poisoning, MCP trust, RAG poisoning, memory poisoning |
| Privacy/PII | PII in source/logs/fixtures, retention, scrubbed observability |
| Mobile/desktop | only if detected; platform storage, debug flags, WebView risks |

## Procedure

### 0. Safety preflight

1. Read `rules/operational-safety.md`, `rules/git-discipline.md`,
   `rules/privacy-pii.md`, and project host-adapter rule overrides.
2. Confirm the target scope and whether the user wants:
   - audit only
   - audit + plan
   - audit + plan + execute
3. If scope contains production config, remote servers, routers, DNS, secrets,
   billing, or credentials: audit remains read-only until the user grants an
   exact scoped approval.
4. Run `git status --short --branch`. Dirty trees are allowed for read-only
   audit. Remediation must not use `git stash`, `git reset --hard`, destructive
   cleanup, or hidden worktree isolation.

### 1. Evidence collection

Collect facts before findings:

- manifests and lockfiles
- auth middleware / route maps / policy files
- public API endpoints and background jobs
- config and deployment files
- `.github/workflows/`, CI configs, Docker/IaC
- AI/agent/MCP/RAG files if present
- previous audits under `.supervibe/audits/` and `.supervibe/memory/incidents/`

Do not list a vulnerability until the exact code path is read. A pattern hit is
a candidate, not a finding.

### 2. Multi-agent audit

Run the agent chain in bounded parallel batches:

1. Recon batch: `repo-researcher` + stack fingerprint.
2. AppSec batch: `security-auditor` over auth, input, data, secrets, SSRF.
3. Supply-chain batch: `dependency-reviewer` + `security-researcher`.
4. Ops batch: `devops-sre` for CI/CD, runtime config, detection and runbooks.
5. AI/agent batch: `ai-integration-architect` and `prompt-ai-engineer` only if matching files exist.
6. Aggregate with `quality-gate-reviewer`.

Every finding must include file:line evidence, exploitability or reachability,
affected asset, remediation, verification command, and owner agent.

### 3. Prioritize

Severity is determined by impact plus reachability:

- `CRITICAL`: auth bypass, RCE, exploitable injection, active secret, sensitive
  data leak, KEV-listed reachable CVE, production network mutation risk.
- `HIGH`: reachable high CVE, missing auth on protected route, SSRF path, weak
  session/JWT controls, CI token exposure, dangerous CORS/config.
- `MEDIUM`: hardening gap with plausible abuse path, stale security dependency,
  missing security header, incomplete logging/detection.
- `LOW`: defense-in-depth, hygiene, docs/runbook gaps, low-confidence candidate.

Never inflate severity for report volume. If reachability is not proven, mark
`UNCERTAIN` and list the missing proof.

### 4. Plan handoff

If findings exist and the user wants fixes:

1. Write or update `.supervibe/audits/security/YYYY-MM-DD-security-audit.md`.
2. Create a remediation spec or directly a plan:
   `.supervibe/artifacts/plans/YYYY-MM-DD-security-remediation.md`.
3. Each task must be atomic and carry:
   - finding id and severity
   - files to modify
   - expected security behavior
   - verification command
   - rollback plan
   - re-audit check
4. Route to `/supervibe-plan` if the plan is not ready.
5. Route to `/supervibe-execute-plan` or `/supervibe-loop --plan` only after
   user approval.

### 5. Execute and re-audit loop

For each remediation batch:

1. Apply minimal changes via the owning implementation agent.
2. Run the task's tests and security-specific verification.
3. Run the relevant auditor again against the touched scope.
4. Update the audit doc: fixed / still open / false positive with proof.
5. Continue until:
   - all `CRITICAL` and `HIGH` findings are fixed or explicitly risk-accepted
   - `security-auditor` scores 10/10 for the remediated scope
   - `quality-gate-reviewer` scores 10/10 for completion evidence
   - no new regression findings are introduced

Risk acceptance is never implicit. It requires a user-visible rationale and an
entry under `.supervibe/memory/incidents/` or `.supervibe/memory/decisions/`.

## Output Contract

```markdown
# Supervibe Security Audit: <scope>

**Date**: YYYY-MM-DD
**Mode**: audit | plan | execute | reaudit
**Scope**: <paths/modules>
**Agents used**: <list>
**Missing optional agents**: <list or none>

## Score
- Security gate: <N>/10
- Critical: <N>
- High: <N>
- Medium: <N>
- Low: <N>

## Findings
### [CRITICAL|HIGH|MEDIUM|LOW] <id> <title>
- Evidence: `<file:line>`
- Path: <entry -> sink / affected asset>
- CWE/OWASP: <mapping>
- Exploitability: REACHABLE | UNREACHABLE | UNCERTAIN
- Fix: <specific remediation>
- Verification: `<command>`
- Owner: <agent>

## Remediation Plan
1. <priority ordered item>

## Re-audit
- Previous finding status: fixed | open | accepted | false-positive
- New findings introduced: <N>

Final score: <N>/10
Status: PASS | BLOCKED | PARTIAL
Confidence: <N>.<dd>/10
Rubric: agent-delivery
```

## Safety Boundaries

- Audit mode is read-only.
- No secret values in output. Redact to prefixes or provider names.
- No dependency upgrades, code writes, secret rotation, remote server changes,
  DNS/firewall/router changes, production deploys, or account mutations without
  explicit scoped user approval.
- No `git stash`, `git stash pop`, `git reset --hard`, `git clean -f`, force
  push, or deletion as a shortcut.
- Delete code only after caller evidence and explicit user confirmation.

## When NOT to Invoke

- General plugin health check only -> `/supervibe-audit`.
- User only wants dependency upgrade review -> `dependency-reviewer`.
- User wants active penetration testing against a third-party target without
  authorization -> refuse and limit to defensive review.

## Related

- `supervibe:_core:security-auditor`
- `supervibe:_ops:dependency-reviewer`
- `supervibe:_ops:security-researcher`
- `supervibe:_ops:devops-sre`
- `/supervibe-plan`
- `/supervibe-execute-plan`
- `/supervibe-loop`

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-security-audit` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, required agents, and durable-write permission before any agent-owned artifact is produced.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
