#!/usr/bin/env node
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  logInvocation,
  setInvocationLogPath,
} from "./lib/agent-invocation-logger.mjs";
import {
  runBrandbookProducer,
} from "./lib/brandbook-producer-runtime.mjs";
import {
  validatePrototypeBuilderHighConfidenceEvidence,
} from "./lib/design-quality-gate-aggregator.mjs";
import {
  syncDesignWorkflowStateAfterStage,
} from "./lib/design-workflow-state-sync.mjs";
import {
  issueWorkflowInvocationReceipt,
  validateWorkflowReceipts,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import {
  formatPostStageContinuation,
  buildPostStageContinuation,
} from "./lib/supervibe-stage-state.mjs";

const DESIGN_AGENT_STAGES = Object.freeze({
  "creative-direction": agentStage("creative-director", "stage-1-brand-direction", ".supervibe/artifacts/brandbook/direction.md"),
  "stage-1-brand-direction": agentStage("creative-director", "stage-1-brand-direction", ".supervibe/artifacts/brandbook/direction.md"),
  "screen-spec": agentStage("ux-ui-designer", "stage-3-screen-spec", ".supervibe/artifacts/prototypes/<slug>/spec.md"),
  "stage-3-screen-spec": agentStage("ux-ui-designer", "stage-3-screen-spec", ".supervibe/artifacts/prototypes/<slug>/spec.md"),
  copy: agentStage("copywriter", "stage-4-copy", ".supervibe/artifacts/prototypes/<slug>/content/copy.md"),
  "stage-4-copy": agentStage("copywriter", "stage-4-copy", ".supervibe/artifacts/prototypes/<slug>/content/copy.md"),
  "prototype-build": agentStage("prototype-builder", "stage-5-prototype-build", ".supervibe/artifacts/prototypes/<slug>/index.html"),
  "stage-5-prototype-build": agentStage("prototype-builder", "stage-5-prototype-build", ".supervibe/artifacts/prototypes/<slug>/index.html"),
  "polish-review": agentStage("ui-polish-reviewer", "stage-6-polish-review", ".supervibe/artifacts/prototypes/<slug>/_reviews/polish.md", "reviewer"),
  "stage-6-polish-review": agentStage("ui-polish-reviewer", "stage-6-polish-review", ".supervibe/artifacts/prototypes/<slug>/_reviews/polish.md", "reviewer"),
  "a11y-review": agentStage("accessibility-reviewer", "stage-6-a11y-review", ".supervibe/artifacts/prototypes/<slug>/_reviews/a11y.md", "reviewer"),
  "stage-6-a11y-review": agentStage("accessibility-reviewer", "stage-6-a11y-review", ".supervibe/artifacts/prototypes/<slug>/_reviews/a11y.md", "reviewer"),
  "quality-gate": agentStage("quality-gate-reviewer", "stage-7-quality-gate", ".supervibe/artifacts/prototypes/<slug>/_reviews/quality-gate.json", "reviewer"),
  "stage-7-quality-gate": agentStage("quality-gate-reviewer", "stage-7-quality-gate", ".supervibe/artifacts/prototypes/<slug>/_reviews/quality-gate.json", "reviewer"),
});

const HOST_INVOCATION_SOURCES = Object.freeze({
  claude: "claude-code-task-hook",
  codex: "codex-spawn-agent",
  cursor: "cursor-agent-run",
  gemini: "gemini-agent-run",
  opencode: "opencode-agent-run",
});

function parseArgs(argv) {
  const options = { operation: argv[2] || "help" };
  for (let index = 3; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function usage() {
  return [
    "SUPERVIBE_STAGE",
    "USAGE:",
    "  node scripts/supervibe-stage.mjs run --workflow design --stage design-system --source <scratch-dir> --handoff <id> --slug <slug>",
    "  node scripts/supervibe-stage.mjs run --workflow design --stage creative-direction --host codex --host-invocation-id <id> --output <path> --handoff <id> --confidence <0-10>",
    "",
    "NOTES:",
    "  Skill stages run their executable producer and issue receipts automatically.",
    "  Agent stages require a real host invocation id, then this runner logs the invocation, writes typed output, issues the receipt, validates receipts, and prints NEXT_USER_ACTIONS continuation actions.",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h || options.operation === "help" || options.operation === "--help") {
    console.log(usage());
    process.exit(0);
  }
  if (options.operation !== "run") {
    console.log(usage());
    process.exit(1);
  }

  try {
    const result = await runStage(options);
    console.log("SUPERVIBE_STAGE_RUN");
    console.log(`PASS: ${result.pass}`);
    console.log(`WORKFLOW: ${result.workflow}`);
    console.log(`STAGE: ${result.stage}`);
    console.log(`PRODUCER: ${result.producer}`);
    console.log(`RECEIPT: ${result.receiptPath || "none"}`);
    console.log(`VALIDATION_PASS: ${result.validation?.pass === true}`);
    if (result.stateSync) {
      console.log(`STATE_SYNC_PASS: ${result.stateSync.pass === true}`);
      console.log(`STATE_SYNC_UPDATED: ${(result.stateSync.updatedFiles || []).join(",") || "none"}`);
    }
    if (result.agentOutputJson) console.log(`AGENT_OUTPUT_JSON: ${result.agentOutputJson}`);
    if (result.producerOutputPath) console.log(`PRODUCER_OUTPUT: ${result.producerOutputPath}`);
    console.log(formatPostStageContinuation(result.continuation));
    process.exit(result.pass ? 0 : 2);
  } catch (error) {
    console.error("SUPERVIBE_STAGE_ERROR");
    console.error(`ERROR: ${error.message}`);
    console.error("NEXT_SAFE_ACTION: repair ledger, rerun the stage, or resume from the last trusted stage.");
    process.exit(2);
  }
}

export async function runStage(options = {}) {
  const rootDir = resolve(options.root || process.cwd());
  const workflow = normalizeWorkflow(options.workflow || options.command || "design");
  if (workflow !== "/supervibe-design") {
    throw new Error(`unsupported workflow for stage runner: ${workflow}`);
  }
  const stage = String(options.stage || "").trim();
  if (!stage) throw new Error("--stage required");
  if (isDesignSystemStage(stage)) return runDesignSystemStage({ rootDir, workflow, stage, options });
  return runDesignAgentStage({ rootDir, workflow, stage, options });
}

async function runDesignSystemStage({ rootDir, workflow, stage, options }) {
  const handoffId = options.handoff || options["handoff-id"] || options.slug;
  const pluginRoot = resolve(options["plugin-root"] || fileURLToPath(new URL("../", import.meta.url)));
  const result = await runBrandbookProducer({
    rootDir,
    pluginRoot,
    sourceDir: options.source,
    target: options.target || "web",
    slug: options.slug || null,
    handoffId,
    secret: options.secret || null,
  });
  const validation = validateWorkflowReceipts(rootDir, { secret: options.secret || null });
  return {
    pass: result.pass === true && validation.pass === true,
    workflow,
    stage: "stage-2-design-system",
    producer: "skill:supervibe:brandbook",
    receiptPath: result.receiptPath || null,
    producerOutputPath: result.producerOutputPath || null,
    validation,
    continuation: buildPostStageContinuation({
      workflow,
      currentStage: "candidate_design_system",
      artifact: ".supervibe/artifacts/prototypes/_design-system/styleboard.html",
      status: "review_required",
      prototypeUnlocked: false,
      handoffBlockedReason: "prototype unlock requires approved design system",
    }),
  };
}

async function runDesignAgentStage({ rootDir, workflow, stage, options }) {
  const config = DESIGN_AGENT_STAGES[stage];
  if (!config) throw new Error(`unsupported design stage: ${stage}`);
  const slug = options.slug || options.handoff || options["handoff-id"] || "prototype";
  const outputArtifact = normalizeOutput(options.output || options["output-artifacts"] || config.outputArtifact, slug);
  const outputPath = join(rootDir, ...outputArtifact.split("/"));
  if (!existsSync(outputPath)) throw new Error(`stage output artifact missing: ${outputArtifact}`);
  const invocationId = options["host-invocation-id"] || options["invocation-id"];
  if (!invocationId) throw new Error("--host-invocation-id required for agent stages");
  const host = String(options.host || "codex").toLowerCase();
  const source = options.source || options["host-invocation-source"] || HOST_INVOCATION_SOURCES[host];
  const confidence = Number(options.confidence ?? 9);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 10) {
    throw new Error("--confidence must be a number from 0 to 10");
  }
  const inputEvidence = splitList(options.input || options["input-evidence"]);
  const verificationEvidence = splitList(options.verification || options["verification-evidence"]);
  if (config.stageId === "stage-5-prototype-build") {
    const preflight = validatePrototypeBuilderHighConfidenceEvidence(rootDir, {
      confidence,
      evidencePaths: [...inputEvidence, ...verificationEvidence],
    });
    if (!preflight.pass) {
      throw new Error(`prototype-builder confidence >= 9 blocked: missing preflight evidence for ${preflight.missingChecks.join(", ")}`);
    }
  }

  const logPath = join(rootDir, ".supervibe", "memory", "agent-invocations.jsonl");
  mkdirSync(dirname(logPath), { recursive: true });
  setInvocationLogPath(logPath);
  const record = await logInvocation({
    agent_id: config.agentId,
    task_summary: options.task || options.reason || `${config.agentId} completed ${config.stageId}`,
    confidence_score: confidence,
    invocation_id: invocationId,
    host,
    host_invocation_source: source,
    status: "completed",
    changedFiles: [outputArtifact],
    risks: splitList(options.risks),
    recommendations: splitList(options.recommendations),
  });
  const receipt = await issueWorkflowInvocationReceipt({
    rootDir,
    command: workflow,
    subjectType: config.subjectType,
    subjectId: config.agentId,
    agentId: config.agentId,
    stage: config.stageId,
    invocationReason: options.reason || record.task_summary,
    inputEvidence,
    outputArtifacts: [outputArtifact],
    startedAt: record.ts,
    completedAt: record.ts,
    handoffId: options.handoff || options["handoff-id"] || slug,
    secret: options.secret || null,
    hostInvocation: {
      source,
      invocationId,
      agentId: config.agentId,
    },
  });
  const validation = validateWorkflowReceipts(rootDir, { secret: options.secret || null });
  const stateSync = await syncDesignWorkflowStateAfterStage(rootDir, {
    slug,
    stageId: config.stageId,
    owner: config.agentId,
    outputArtifact,
    receiptPath: receipt.receiptPath,
    confidence,
  });
  return {
    pass: validation.pass === true && stateSync.pass === true,
    workflow,
    stage: config.stageId,
    producer: `${config.subjectType}:${config.agentId}`,
    receiptPath: receipt.receiptPath,
    agentOutputJson: record.structured_output?.json || null,
    validation,
    stateSync,
    continuation: buildPostStageContinuation({
      workflow,
      currentStage: config.stageId,
      artifact: outputArtifact,
      status: "outputs_ready",
      prototypeUnlocked: config.stageId === "stage-5-prototype-build",
    }),
  };
}

function isDesignSystemStage(stage) {
  return ["design-system", "brandbook", "stage-2-design-system"].includes(String(stage || "").trim());
}

function normalizeWorkflow(value) {
  const normalized = String(value || "").trim();
  if (normalized === "design" || normalized === "supervibe-design") return "/supervibe-design";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeOutput(path, slug) {
  return String(path || "").replaceAll("<slug>", slug).split("\\").join("/");
}

function splitList(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function agentStage(agentId, stageId, outputArtifact, subjectType = "agent") {
  return { agentId, stageId, outputArtifact, subjectType };
}
