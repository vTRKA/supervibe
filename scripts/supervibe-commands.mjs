#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import {
  buildProjectCommandCatalog,
  formatCommandCatalog,
  formatCommandMatch,
  resolveCommandRequest,
} from "./lib/supervibe-command-catalog.mjs";
import {
  buildActiveWorkflowResumeInfo,
  readCurrentActiveWorkflowState,
} from "./lib/supervibe-active-workflow-state.mjs";
import { resolveSupervibePluginRoot, resolveSupervibeProjectRoot } from "./lib/supervibe-plugin-root.mjs";
import { routeTriggerRequest } from "./lib/supervibe-trigger-router.mjs";
import {
  isBareWorkflowContinuationRequest,
  isWorkflowContinuationRequest,
} from "./lib/supervibe-workflow-router.mjs";

const args = parseArgs(process.argv.slice(2));
const SCRIPT_PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url));
const projectRoot = args.project || resolveSupervibeProjectRoot({ env: process.env, cwd: process.cwd() });
const pluginRoot = args["plugin-root"] || resolveSupervibePluginRoot({ env: process.env, cwd: SCRIPT_PLUGIN_ROOT });

try {
  if (args.help) {
    console.log(formatHelp());
  } else if (args.match) {
    const semanticPrecedenceMatch = semanticTriggerFallback(args.match, { pluginRoot, projectRoot });
    const useSemanticPrecedence = shouldUseSemanticPrecedence(semanticPrecedenceMatch);
    const catalogMatch = useSemanticPrecedence ? null : resolveCommandRequest(args.match, { pluginRoot, projectRoot });
    const semanticMatch = catalogMatch ? null : semanticPrecedenceMatch;
    const continuationMatch = activeWorkflowContinuationMatch(args.match, {
      projectRoot,
      closeCandidateMatches: [catalogMatch, semanticMatch].filter(Boolean),
    });
    const match = continuationMatch
      || semanticMatch
      || catalogMatch;
    if (args.json) console.log(JSON.stringify({ match }, null, 2));
    else console.log(formatCommandMatch(match));
    if (!match) process.exitCode = 2;
  } else {
    const catalog = buildProjectCommandCatalog({ pluginRoot, projectRoot });
    if (args.json) console.log(JSON.stringify(catalog, null, 2));
    else console.log(formatCommandCatalog(catalog));
  }
} catch (error) {
  console.error(`supervibe-commands error: ${error.message}`);
  process.exit(1);
}

function shouldUseSemanticPrecedence(match) {
  if (!match) return false;
  return [
    "pre_spec_summary_gate",
    "post_spec_summary_gate",
    "pre_plan_summary_gate",
    "post_plan_summary_gate",
    "plan_review",
  ].includes(match.intent);
}

function semanticTriggerFallback(request, { pluginRoot, projectRoot } = {}) {
  const route = routeTriggerRequest(request, { pluginRoot, projectRoot });
  if (!route || route.intent === "unknown") return null;
  return {
    id: `semantic-trigger:${route.intent}`,
    intent: route.intent,
    title: `Semantic route: ${route.intent}`,
    command: route.command,
    confidence: route.confidence,
    reason: `semantic trigger fallback: ${route.reason}`,
    doNotSearchProject: true,
    directRoute: false,
    mutationRisk: route.mutationRisk || "delegates-to-command",
    nextAction: route.command
      ? `Run ${route.command} through the routed workflow; use command-agent-plan.mjs when this is a Supervibe slash command.`
      : "Report the routed diagnostic and avoid broad repository search.",
    agentContract: route.agentContract || null,
    agentProfile: route.agentProfile || null,
    followUpCommands: route.followUpCommands || [],
  };
}

function activeWorkflowContinuationMatch(request, { projectRoot, closeCandidateMatches = [] } = {}) {
  if (!isWorkflowContinuationRequest(request)) return null;
  const current = readCurrentActiveWorkflowState(projectRoot);
  const resume = buildActiveWorkflowResumeInfo(current.state);
  const closeCandidates = closeCandidateMatches.map((candidate) => ({
    id: candidate.id,
    intent: candidate.intent,
    confidence: candidate.confidence,
    reason: candidate.reason,
  }));

  if (resume.canResume && resume.nextCommand) {
    return continuationCommandMatch({
      id: "active-workflow-continuation",
      intent: intentForContinuationCommand(resume.nextCommand),
      command: resume.nextCommand,
      confidence: 0.99,
      reason: `Active workflow continuation selected from ${resume.stage}; nextAction=${resume.nextAction}.`,
      nextAction: `Resume active workflow: ${resume.nextAction}.`,
      diagnostics: {
        selectedBecause: "bare-continuation-active-workflow",
        closeCandidates,
      },
    });
  }

  if (current.exists && current.issues.length > 0) {
    return continuationCommandMatch({
      id: "active-workflow-state-repair",
      intent: "active_workflow_state_repair",
      command: "/supervibe-loop --resume-dispatch",
      confidence: 0.93,
      reason: `Continuation phrase found but active workflow state is invalid: ${current.issues.map((issue) => issue.code).join(", ")}.`,
      nextAction: "Repair active workflow state, then dispatch the next ready parallel agent wave before durable work.",
      diagnostics: {
        selectedBecause: "continuation-state-invalid",
        closeCandidates,
      },
    });
  }

  if (!isBareWorkflowContinuationRequest(request)) return null;
  return continuationCommandMatch({
    id: "workflow-continuation-fallback",
    intent: "task_graph_resume",
    command: "/supervibe-loop --resume-dispatch",
    confidence: 0.88,
    reason: "Continuation phrase found without active workflow state; routing to resume-dispatch so the next ready parallel agent wave is preferred over status-only guessing.",
    nextAction: "Dispatch the next ready parallel agent wave for the active workflow/task graph, with no-active-graph fallback.",
    diagnostics: {
      selectedBecause: "bare-continuation-no-active-state",
      closeCandidates,
    },
  });
}

function continuationCommandMatch(fields) {
  return {
    title: "Resume active Supervibe workflow",
    doNotSearchProject: true,
    directRoute: false,
    mutationRisk: "delegates-to-command",
    ...fields,
  };
}

function intentForContinuationCommand(command = "") {
  const value = String(command || "");
  if (value.includes("--review")) return "plan_review";
  if (value.includes("--atomize")) return "atomize_plan";
  if (value.includes("/supervibe-ui")) return "workflow_ui";
  if (value.includes("--claim-ready")) return "task_graph_claim_ready";
  if (value.includes("--resume-dispatch") || value.includes("--status")) return "task_graph_resume";
  if (value.includes("--guided") || value.includes("--epic")) return "single_session_epic_run";
  if (value.includes("/supervibe-plan")) return "continue_plan";
  return "active_workflow_continue";
}

function parseArgs(argv) {
  const parsed = {};
  const booleans = new Set(["json", "no-color", "help"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (booleans.has(key)) parsed[key] = true;
    else {
      parsed[key] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

function formatHelp() {
  return [
    "SUPERVIBE_COMMANDS_HELP",
    "Usage:",
    "  node scripts/supervibe-commands.mjs",
    "  node scripts/supervibe-commands.mjs --match \"npm run code:index вот запусти индексацию\"",
    "  node scripts/supervibe-commands.mjs --match \"сделай дизайн макет UI\"",
    "  node scripts/supervibe-commands.mjs --match \"pnpm run supervibe:status -- --json\"",
    "  node scripts/supervibe-commands.mjs --json",
    "",
    "Purpose:",
    "  Print deterministic Supervibe command shortcuts, slash commands, project npm scripts, and plugin npm scripts.",
    "  Use --match before broad project search when the user asks to run a known command or describes a primary workflow.",
  ].join("\n");
}
