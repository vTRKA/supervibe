#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCommandAgentProfiles } from "./lib/command-agent-orchestration-contract.mjs";

const REQUIRED_SECTIONS = Object.freeze([
  {
    code: "description-frontmatter",
    pattern: /^---\s*[\s\S]*?\ndescription\s*:/im,
  },
  {
    code: "invocation",
    pattern: /^##\s+(Invocation|Invocation forms|Usage|Local CLI)\b/im,
  },
  {
    code: "output-contract",
    pattern: /^##\s+(Output contract|Output Contract|Contract)\b/im,
  },
  {
    code: "safety",
    pattern: /^##\s+(Guard rails|Guard Rails|Safety Boundaries|Policy|Hard rules|When NOT to invoke)\b/im,
  },
  {
    code: "workflow-invocation-receipts",
    pattern: /^##\s+Workflow Invocation Receipts\b/im,
  },
  {
    code: "agent-orchestration-contract",
    pattern: /^##\s+Agent Orchestration Contract\b/im,
  },
]);

const WORKFLOW_RECEIPT_COMMAND_PATTERNS = Object.freeze([
  /workflow-receipt\.mjs issue/i,
  /Hand-written receipts are untrusted/i,
  /workflow-invocation-ledger\.jsonl/i,
  /artifact-links\.json/i,
  /validate:workflow-receipts/i,
  /validate:agent-producer-receipts/i,
  /hostInvocation\.source/i,
  /hostInvocation\.invocationId/i,
  /command or skill receipts must not substitute/i,
]);

const AGENT_ORCHESTRATION_COMMAND_PATTERNS = Object.freeze([
  /command-agent-orchestration-contract\.mjs/i,
  /command-agent-plan\.mjs/i,
  /SUPERVIBE_COMMAND_AGENT_PLAN/i,
  /rules\/command-agent-orchestration\.md/i,
  /ownerAgentId/i,
  /agentPlan/i,
  /requiredAgentIds/i,
  /real-agents/i,
  /agent-required-blocked/i,
  /hostInvocation\.source/i,
  /hostInvocation\.invocationId/i,
  /agent-invocation\.mjs/i,
  /spawn_agent/i,
  /CODEX_SPAWN_PAYLOAD_RULES/i,
  /CODEX_SPAWN_PAYLOADS/i,
  /fork_context=true/i,
  /agent_type/i,
  /reasoning_effort/i,
  /inline[\s\S]{0,80}diagnostic\/dry-run|diagnostic\/dry-run[\s\S]{0,80}inline/i,
  /Do not emulate|must not emulate|never emulate/i,
  /command or skill receipts must not substitute/i,
]);

const CONTINUATION_COMMAND_RULES = Object.freeze([
  {
    file: "supervibe-brainstorm.md",
    label: "brainstorm command",
    required: [/Do not stop after individual brainstorm sections/i],
  },
  {
    file: "supervibe-design.md",
    label: "design command",
    required: [/## Continuation Contract/i, /Continue through all applicable stages/i],
  },
  {
    file: "supervibe-execute-plan.md",
    label: "execute-plan command",
    required: [
      /## Continuation Contract/i,
      /Do not stop after the first phase, task, or green check/i,
      /Resume mode must continue/i,
    ],
  },
  {
    file: "supervibe-loop.md",
    label: "autonomous loop command",
    required: [/Do not stop after the first task or wave/i, /continue ready work until/i],
  },
  {
    file: "supervibe-plan.md",
    label: "plan command",
    required: [/Do not stop after individual plan phases/i],
  },
  {
    file: "supervibe-presentation.md",
    label: "presentation command",
    required: [/Do not stop after storyboard or first slide/i],
  },
]);

const COMMAND_LOOKUP_RULES = Object.freeze([
  {
    file: "scripts/lib/supervibe-agent-recommendation.mjs",
    label: "managed fast command lookup and workflow receipt hard stop",
    required: [
      /INTENT: missing_slash_command/i,
      /HARD_STOP: true/i,
      /do not inspect source files/i,
      /repository paths to emulate it/i,
      /workflow-receipt\.mjs issue/i,
      /hand-written receipts are untrusted/i,
      /validate:workflow-receipts/i,
      /Agent Orchestration Contract/i,
      /command-agent-plan\.mjs/i,
      /SUPERVIBE_COMMAND_AGENT_PLAN/i,
      /supervibe-orchestrator/i,
      /agentPlan/i,
      /requiredAgentIds/i,
      /real-agents/i,
      /agent-required-blocked/i,
      /hostInvocation\.invocationId/i,
      /agent-invocation\.mjs/i,
      /spawn_agent/i,
      /CODEX_SPAWN_PAYLOAD_RULES/i,
      /CODEX_SPAWN_PAYLOADS/i,
      /fork_context=true/i,
      /reasoning_effort/i,
      /Supervibe logical role/i,
      /do not emulate specialist output/i,
    ],
  },
  {
    file: "scripts/lib/supervibe-command-catalog.mjs",
    label: "command catalog missing slash hard stop",
    required: [
      /missing_slash_command/i,
      /hardStop/i,
      /Hard stop: report the missing slash command/i,
      /HARD_STOP: true/i,
      /COMMAND_AGENT_ORCHESTRATION_CONTRACT/i,
      /getCommandAgentProfile/i,
      /agentContract/i,
      /agentProfile/i,
      /AGENT_BLOCKED_MODE/i,
      /AGENT_PLAN_COMMAND/i,
      /AGENT_EMULATION/i,
      /REQUIRED_AGENTS/i,
    ],
  },
  {
    file: "scripts/lib/command-agent-orchestration-contract.mjs",
    label: "central executable command agent profiles",
    required: [
      /COMMAND_AGENT_ORCHESTRATION_CONTRACT/i,
      /defaultExecutionMode: "real-agents"/i,
      /COMMAND_AGENT_PROFILES/i,
      /HOST_AGENT_DISPATCHERS/i,
      /buildCommandAgentPlan/i,
      /formatCommandAgentPlan/i,
      /resolveHostAgentDispatcher/i,
      /validateCommandAgentProfiles/i,
      /ownerAgentId: "supervibe-orchestrator"/i,
      /requiredAgentIds/i,
      /agent-required-blocked/i,
      /hostInvocation\.invocationId/i,
      /codex-spawn-agent/i,
      /CODEX_SPAWN_PAYLOAD_RULES/i,
      /CODEX_FORK_CONTEXT_FORBIDDEN_OVERRIDES/i,
      /buildCodexSpawnPayloads/i,
      /resolveCodexExecutionModeHint/i,
      /fork_context/i,
      /reasoning_effort/i,
      /Do not emulate specialist agents/i,
    ],
  },
  {
    file: "scripts/command-agent-plan.mjs",
    label: "runtime command agent preflight",
    required: [
      /SUPERVIBE_COMMAND_AGENT_PLAN/i,
      /buildCommandAgentPlan/i,
      /formatCommandAgentPlan/i,
      /selectHostAdapter/i,
      /enforceHostProof/i,
      /agent-required-blocked/i,
      /installed-only/i,
    ],
  },
  {
    file: "scripts/agent-invocation.mjs",
    label: "host agent invocation proof logger",
    required: [
      /SUPERVIBE_AGENT_INVOCATION_LOGGED/i,
      /codex-spawn-agent/i,
      /host-invocation-id/i,
      /logInvocation/i,
      /agent-invocations\.jsonl/i,
    ],
  },
  {
    file: "rules/workflow-invocation-receipts.md",
    label: "shared workflow receipt rule",
    required: [
      /workflow-receipt\.mjs issue/i,
      /_workflow-invocations/i,
      /workflow-invocation-ledger\.jsonl/i,
      /Hand-written receipts/i,
      /validate:workflow-receipts/i,
      /validate:agent-producer-receipts/i,
      /hostInvocation\.source/i,
      /hostInvocation\.invocationId/i,
      /Do not substitute a command receipt/i,
      /validate-design-agent-receipts\.mjs/i,
    ],
  },
]);

export function validateCommandOperationalContracts(rootDir = process.cwd()) {
  const commandsDir = join(rootDir, "commands");
  const issues = [];
  if (!existsSync(commandsDir)) {
    return {
      pass: false,
      checked: 0,
      issues: [{
        file: "commands/",
        code: "missing-commands-dir",
        message: "commands/: directory not found",
      }],
    };
  }

  const files = readdirSync(commandsDir)
    .filter((file) => file.endsWith(".md"))
    .sort();

  for (const file of files) {
    const relPath = `commands/${file}`;
    const text = readFileSync(join(commandsDir, file), "utf8");
    for (const section of REQUIRED_SECTIONS) {
      if (!section.pattern.test(text)) {
        issues.push({
          file: relPath,
          code: `missing-${section.code}`,
          message: `${relPath}: missing required command section ${section.pattern}`,
        });
      }
    }
    for (const pattern of WORKFLOW_RECEIPT_COMMAND_PATTERNS) {
      if (!pattern.test(text)) {
        issues.push({
          file: relPath,
          code: "missing-workflow-receipt-contract",
          message: `${relPath}: command must require runtime workflow receipts via ${pattern}`,
        });
      }
    }
    for (const pattern of AGENT_ORCHESTRATION_COMMAND_PATTERNS) {
      if (!pattern.test(text)) {
        issues.push({
          file: relPath,
          code: "missing-agent-orchestration-contract",
          message: `${relPath}: command must require real agent orchestration via ${pattern}`,
        });
      }
    }
    if (/Every `\/supervibe-\*` command invocation has an explicit owner agent/i.test(text)) {
      issues.push({
        file: relPath,
        code: "duplicated-agent-orchestration-prose",
        message: `${relPath}: command duplicated the old prose contract instead of referencing the executable profile`,
      });
    }
  }

  const commandIds = files.map((file) => `/${file.replace(/\.md$/, "")}`);
  const profileResult = validateCommandAgentProfiles({
    commandIds,
    availableAgentIds: listAvailableAgentIds(rootDir),
  });
  for (const profileIssue of profileResult.issues) {
    issues.push({
      file: "scripts/lib/command-agent-orchestration-contract.mjs",
      code: profileIssue.code,
      message: `${profileIssue.commandId}: ${profileIssue.message}`,
    });
  }

  for (const rule of CONTINUATION_COMMAND_RULES) {
    const absPath = join(commandsDir, rule.file);
    const relPath = `commands/${rule.file}`;
    if (!existsSync(absPath)) {
      issues.push({
        file: relPath,
        code: "missing-continuation-command",
        message: `${relPath}: required continuation command file is missing`,
      });
      continue;
    }
    const text = readFileSync(absPath, "utf8");
    for (const pattern of rule.required) {
      if (!pattern.test(text)) {
        issues.push({
          file: relPath,
          code: "missing-continuation-contract",
          message: `${relPath}: ${rule.label} missing continuation contract ${pattern}`,
        });
      }
    }
  }

  for (const rule of COMMAND_LOOKUP_RULES) {
    const absPath = join(rootDir, ...rule.file.split("/"));
    if (!existsSync(absPath)) {
      issues.push({
        file: rule.file,
        code: "missing-command-lookup-contract-file",
        message: `${rule.file}: required command lookup contract file is missing`,
      });
      continue;
    }
    const text = readFileSync(absPath, "utf8");
    for (const pattern of rule.required) {
      if (!pattern.test(text)) {
        issues.push({
          file: rule.file,
          code: "missing-command-lookup-hard-stop",
          message: `${rule.file}: ${rule.label} missing ${pattern}`,
        });
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: files.length,
    issues,
  };
}

function listAvailableAgentIds(rootDir) {
  const agentsDir = join(rootDir, "agents");
  const ids = new Set();
  if (!existsSync(agentsDir)) return ids;
  const visit = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        visit(path);
      } else if (entry.endsWith(".md")) {
        ids.add(entry.replace(/\.md$/, ""));
      }
    }
  };
  visit(agentsDir);
  return ids;
}

export function formatCommandOperationalContractsReport(result) {
  const lines = [
    "SUPERVIBE_COMMAND_OPERATIONAL_CONTRACTS",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateCommandOperationalContracts(process.cwd());
  console.log(formatCommandOperationalContractsReport(result));
  process.exit(result.pass ? 0 : 1);
}
