import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildRuntimeCommandAgentPlan,
  commandAgentPlanStrictReady,
} from "../scripts/command-agent-plan.mjs";
import {
  validateCommandAgentEnforcement,
  validateProfileShape,
} from "../scripts/validate-command-agent-enforcement.mjs";

const ROOT = process.cwd();

function profile(commandId, requiredAgentIds, overrides = {}) {
  return {
    commandId,
    ownerAgentId: "supervibe-orchestrator",
    defaultExecutionMode: "real-agents",
    requiredAgentIds,
    inlineScope: "diagnostic/dry-run only",
    emulationAllowed: false,
    emulationPolicy: "Do not emulate specialist agents; command or skill receipts must not substitute for specialist output.",
    ...overrides,
  };
}

test("plugin-wide command-agent enforcement passes current command profiles", () => {
  const result = validateCommandAgentEnforcement(ROOT);
  assert.equal(result.pass, true);
  assert.ok(result.checked > 0);
  assert.equal(result.syntheticChecked, result.checked);
  assert.ok(result.syntheticChecks.every((item) => item.strictReady === false));
});

test("command profiles must always require owner and quality gate agents", () => {
  const issues = validateProfileShape(profile("/supervibe-bad", []));
  const codes = issues.map((issue) => issue.code);
  assert.ok(codes.includes("missing-required-agents"));
  assert.ok(codes.includes("missing-owner-agent"));
  assert.ok(codes.includes("missing-quality-gate-agent"));
});

test("command profiles must forbid emulation and keep inline mode diagnostic", () => {
  const issues = validateProfileShape(profile("/supervibe-bad", [
    "supervibe-orchestrator",
    "quality-gate-reviewer",
  ], {
    inlineScope: "implementation",
    emulationAllowed: true,
    emulationPolicy: "Emulation is allowed.",
  }));
  const codes = issues.map((issue) => issue.code);
  assert.ok(codes.includes("emulation-not-forbidden"));
  assert.ok(codes.includes("inline-scope-not-diagnostic"));
});

test("normal design flow must require design specialists", () => {
  const issues = validateProfileShape(profile("/supervibe-design", [
    "supervibe-orchestrator",
    "quality-gate-reviewer",
  ]));
  const missing = issues.filter((issue) => issue.code === "missing-design-flow-agent").map((issue) => issue.message);
  assert.ok(missing.some((item) => item.includes("creative-director")));
  assert.ok(missing.some((item) => item.includes("tauri-ui-designer")));
  assert.ok(missing.some((item) => item.includes("prototype-builder")));
  assert.ok(missing.some((item) => item.includes("ui-polish-reviewer")));
  assert.ok(missing.some((item) => item.includes("accessibility-reviewer")));
});

test("prototype preview flow must require prototype builder and reviewers", () => {
  const issues = validateProfileShape(profile("/supervibe-preview", [
    "supervibe-orchestrator",
    "quality-gate-reviewer",
  ]));
  const missing = issues.filter((issue) => issue.code === "missing-prototype-preview-agent").map((issue) => issue.message);
  assert.ok(missing.some((item) => item.includes("prototype-builder")));
  assert.ok(missing.some((item) => item.includes("ui-polish-reviewer")));
  assert.ok(missing.some((item) => item.includes("accessibility-reviewer")));
});

test("CLI reports plugin-wide command agent enforcement", () => {
  const output = execFileSync(process.execPath, [
    join(ROOT, "scripts", "validate-command-agent-enforcement.mjs"),
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.match(output, /SUPERVIBE_COMMAND_AGENT_ENFORCEMENT/);
  assert.match(output, /PASS: true/);
  assert.match(output, /SYNTHETIC_ACTIVE_CHECKED:/);
});

test("enforcement validates Codex host invocation evidence contract", () => {
  const result = validateCommandAgentEnforcement(ROOT);
  const codes = (result.issues || []).map((issue) => issue.code);
  assert.ok(!codes.includes("missing-host-invocation-source-receipt-field"));
  assert.ok(!codes.includes("missing-host-invocation-id-receipt-field"));
  assert.ok(!codes.includes("codex-native-tool-mismatch"));
  assert.ok(!codes.includes("codex-invocation-proof-mismatch"));
  assert.ok(!codes.includes("codex-evidence-path-missing"));
});

test("command agent plan reports Codex logical fallback as non-strict proof", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-command-logical-fallback-"));
  try {
    const report = buildRuntimeCommandAgentPlan({
      command: "/supervibe-plan",
      projectRoot: root,
      pluginRoot: ROOT,
      host: "codex",
    });

    assert.ok(report.plan.logicalFallbackRequiredAgents.includes("supervibe-orchestrator"));
    assert.equal(commandAgentPlanStrictReady(report), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("command agent strict readiness accepts Codex logical roles after trusted scoped receipts", () => {
  const report = {
    pass: true,
    plan: {
      executionMode: "real-agents",
      durableWritesAllowed: true,
      agentOwnedOutputRequiresReceipts: false,
      agentDispatchRequired: false,
      missingAgents: [],
      missingCallableAgents: [],
      logicalFallbackRequiredAgents: ["repo-researcher"],
      scopedReceiptTrust: { pass: true, missingSubjects: [] },
      agentInvocationsCompleted: true,
      agentReceiptsTrusted: true,
      receiptGate: "trusted-scoped-runtime-agent-receipts",
    },
  };

  assert.equal(commandAgentPlanStrictReady(report), true);
});

test("command agent plan discovers nested Codex host-callable agent files", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-command-nested-agents-"));
  try {
    for (const [folder, agentId] of [
      ["_meta", "supervibe-orchestrator"],
      ["_product", "systems-analyst"],
      ["_core", "architect-reviewer"],
      ["_core", "quality-gate-reviewer"],
    ]) {
      const path = join(root, ".codex", "agents", folder, `${agentId}.md`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `# ${agentId}\n`, "utf8");
    }
    const report = buildRuntimeCommandAgentPlan({
      command: "/supervibe-plan",
      projectRoot: root,
      pluginRoot: ROOT,
      host: "codex",
    });

    assert.deepEqual(report.plan.logicalFallbackRequiredAgents, []);
    assert.ok(report.plan.callableAgentSources.every((item) => item.source === "host callable"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
