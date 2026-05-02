import { existsSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./supervibe-workflow-receipt-runtime.mjs";

const REQUIRED_RECEIPT_FIELDS = Object.freeze([
  "schemaVersion",
  "invokedBy",
  "stage",
  "status",
  "invocationReason",
  "inputEvidence",
  "outputArtifacts",
  "startedAt",
  "completedAt",
  "handoffId",
]);

export function buildDesignAgentPlan({
  brief = "",
  target = "unknown",
  referenceSources = [],
  flowType = "in-product",
  designSystemStatus = "missing",
} = {}) {
  const text = String(brief ?? "");
  const sources = Array.isArray(referenceSources) ? referenceSources : [];
  const stages = [];

  stages.push(stage({
    id: "stage-0-memory",
    skillId: "supervibe:project-memory",
    reason: "surface prior brand, product, and design decisions before new design work",
  }));
  stages.push(stage({
    id: "stage-0-design-intelligence",
    skillId: "supervibe:design-intelligence",
    reason: "ground the design in local expert knowledge, tokens, patterns, and accessibility constraints",
  }));

  for (const source of sources) {
    if (source.kind === "website" || source.kind === "figma") {
      stages.push(stage({
        id: `stage-0-reference-${source.kind}`,
        skillId: "supervibe:mcp-discovery",
        reason: `${source.kind} reference requires tool discovery before scraping, opening, or extracting data`,
        reference: source.value,
      }));
    }
    if (source.kind === "pdf" || source.kind === "image" || source.kind === "screenshot") {
      stages.push(stage({
        id: `stage-0-reference-${source.kind}`,
        skillId: "supervibe:design-intelligence",
        reason: `${source.kind} reference must be classified as functional, IA, visual inspiration, or authoritative source before use`,
        reference: source.value,
      }));
    }
  }

  stages.push(stage({
    id: "stage-1-brand-direction",
    agentId: "creative-director",
    reason: `creative direction is required for ${target}; must produce direction options before tokens`,
  }));

  if (designSystemStatus !== "approved") {
    stages.push(stage({
      id: "stage-2-design-system",
      skillId: "supervibe:brandbook",
      reason: "candidate tokens and design-system sections require the brandbook skill and explicit approval lifecycle",
    }));
  }

  stages.push(stage({
    id: "stage-3-screen-spec",
    agentId: "ux-ui-designer",
    reason: "screen architecture, states, and component inventory require an explicit UX/UI design pass",
  }));
  stages.push(stage({
    id: "stage-4-copy",
    agentId: "copywriter",
    reason: "visible UI text, empty states, and errors need a dedicated copy pass",
  }));
  stages.push(stage({
    id: "stage-5-prototype-build",
    agentId: "prototype-builder",
    reason: "native HTML/CSS/JS prototype build requires a builder receipt before claiming the agent ran",
  }));
  stages.push(stage({
    id: flowType === "landing" || /landing|marketing/i.test(text) ? "stage-5-landing-skill" : "stage-5-prototype-skill",
    skillId: flowType === "landing" || /landing|marketing/i.test(text) ? "supervibe:landing-page" : "supervibe:prototype",
    reason: "prototype builder must choose the concrete prototype skill based on target flow",
  }));
  stages.push(stage({
    id: "stage-6-polish-review",
    agentId: "ui-polish-reviewer",
    reason: "visual hierarchy, responsive behavior, token compliance, and interaction states require review",
  }));
  stages.push(stage({
    id: "stage-6-a11y-review",
    agentId: "accessibility-reviewer",
    reason: "accessibility review is required before prototype approval",
  }));

  return {
    schemaVersion: 1,
    command: "/supervibe-design",
    target,
    flowType,
    requiresReceipts: true,
    receiptDirectory: ".supervibe/artifacts/_workflow-invocations/supervibe-design/<handoff-id>/",
    stages: dedupeStages(stages),
  };
}

export function validateDesignAgentInvocationReceipts(rootDir = process.cwd(), options = {}) {
  const receipts = readAllReceipts(rootDir);
  const expected = expectedReceiptsForDurableOutputs(rootDir);
  const issues = [];

  for (const item of expected) {
    const matching = receipts.filter((receipt) => receiptMatches(receipt, item));
    if (matching.length === 0) {
      issues.push({
        code: "missing-design-agent-receipt",
        file: item.outputArtifact,
        expectedAgentId: item.agentId,
        message: `${item.outputArtifact}: missing completed ${item.agentId} invocation receipt`,
      });
      continue;
    }
    for (const receipt of matching) {
      for (const problem of validateReceiptShape(rootDir, receipt, item, options)) {
        issues.push({
          code: problem.code,
          file: receipt.__file,
          expectedAgentId: item.agentId,
          message: problem.message,
        });
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: expected.length,
    receipts: receipts.length,
    issues,
  };
}

function stage(fields) {
  return {
    receiptRequired: true,
    ...fields,
  };
}

function dedupeStages(stages) {
  const seen = new Set();
  const out = [];
  for (const item of stages) {
    const key = `${item.id}:${item.agentId || item.skillId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function expectedReceiptsForDurableOutputs(rootDir) {
  const expected = [];
  const add = (relPath, agentId, stageId) => {
    if (existsSync(join(rootDir, ...relPath.split("/")))) {
      expected.push({ outputArtifact: relPath, agentId, stageId });
    }
  };

  add(".supervibe/artifacts/brandbook/direction.md", "creative-director", "stage-1-brand-direction");
  add(".supervibe/artifacts/prototypes/_design-system/tokens.css", "supervibe:brandbook", "stage-2-design-system");
  add(".supervibe/artifacts/prototypes/_design-system/manifest.json", "supervibe:brandbook", "stage-2-design-system");
  add(".supervibe/artifacts/prototypes/_design-system/design-flow-state.json", "supervibe:brandbook", "stage-2-design-system");

  for (const prototype of listPrototypeDirs(rootDir)) {
    const base = `.supervibe/artifacts/prototypes/${prototype}`;
    add(`${base}/spec.md`, "ux-ui-designer", "stage-3-screen-spec");
    add(`${base}/content/copy.md`, "copywriter", "stage-4-copy");
    add(`${base}/index.html`, "prototype-builder", "stage-5-prototype-build");
    add(`${base}/_reviews/polish.md`, "ui-polish-reviewer", "stage-6-polish-review");
    add(`${base}/_reviews/a11y.md`, "accessibility-reviewer", "stage-6-a11y-review");
    add(`${base}/_reviews/seo.md`, "seo-specialist", "stage-6-seo-review");
  }

  return expected;
}

function listPrototypeDirs(rootDir) {
  const root = join(rootDir, ".supervibe", "artifacts", "prototypes");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("_"))
    .sort();
}

function readAllReceipts(rootDir) {
  return readWorkflowReceipts(rootDir).filter((receipt) => receipt.command === "/supervibe-design");
}

function receiptMatches(receipt, expected) {
  if (receipt.__invalidJson) return false;
  const id = receipt.agentId ?? receipt.agent_id ?? receipt.skillId ?? receipt.skill_id;
  if (id !== expected.agentId) return false;
  const outputs = Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : [];
  return outputs.some((output) => sameArtifact(output, expected.outputArtifact));
}

function validateReceiptShape(rootDir, receipt, expected, options = {}) {
  const issues = [];
  if (receipt.__invalidJson) return [{ code: "invalid-design-agent-receipt", message: "receipt is not valid JSON" }];
  for (const field of REQUIRED_RECEIPT_FIELDS) {
    if (receipt[field] === undefined || receipt[field] === null || receipt[field] === "") {
      issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: missing ${field}` });
    }
  }
  if (receipt.invokedBy !== "supervibe-design") {
    issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: invokedBy must be supervibe-design` });
  }
  if (receipt.status !== "completed") {
    issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: status must be completed for durable output ${expected.outputArtifact}` });
  }
  if (!Array.isArray(receipt.inputEvidence) || receipt.inputEvidence.length === 0) {
    issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: inputEvidence must be a non-empty array` });
  }
  if (!Array.isArray(receipt.outputArtifacts) || receipt.outputArtifacts.length === 0) {
    issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: outputArtifacts must be a non-empty array` });
  }
  const trust = validateWorkflowReceiptTrust(rootDir, receipt, options);
  for (const message of trust.issues) {
    issues.push({
      code: /artifact link manifest missing|artifact link missing/i.test(message)
        ? "missing-design-artifact-receipt-link"
        : "untrusted-design-agent-receipt",
      message: `${receipt.__file}: ${message}`,
    });
  }
  return issues;
}

function sameArtifact(left, right) {
  const a = normalizeRelPath(left);
  const b = normalizeRelPath(right);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/");
}
