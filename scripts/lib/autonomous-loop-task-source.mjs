import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const DEFAULT_RUBRIC = "autonomous-loop";

function stableId(prefix, text) {
  const hash = createHash("sha1").update(text).digest("hex").slice(0, 8);
  return `${prefix}-${hash}`;
}

export function validateTask(task) {
  const required = [
    "id",
    "goal",
    "category",
    "requiredAgentCapability",
    "dependencies",
    "acceptanceCriteria",
    "verificationCommands",
    "confidenceRubricId",
    "policyRiskLevel",
    "stopConditions",
  ];
  const missing = required.filter((key) => !(key in task));
  return { valid: missing.length === 0, missing };
}

function normalizeTask(task) {
  const normalized = {
    id: task.id || stableId("task", task.goal || JSON.stringify(task)),
    goal: task.goal || "Complete autonomous loop task",
    category: task.category || "implementation",
    requiredAgentCapability: task.requiredAgentCapability || "generalist",
    dependencies: task.dependencies || [],
    acceptanceCriteria: task.acceptanceCriteria || ["Task evidence is present", "Final score is at least 9.0"],
    verificationCommands: task.verificationCommands || [],
    confidenceRubricId: task.confidenceRubricId || DEFAULT_RUBRIC,
    policyRiskLevel: task.policyRiskLevel || "low",
    stopConditions: task.stopConditions || ["policy_stop", "budget_stop", "score_below_gate"],
    status: task.status || "pending",
    source: task.source || "generated",
  };
  const validation = validateTask(normalized);
  if (!validation.valid) {
    throw new Error(`Invalid autonomous loop task: missing ${validation.missing.join(", ")}`);
  }
  return normalized;
}

export function parsePlanTasks(markdown, planPath = "plan.md") {
  const lines = markdown.split(/\r?\n/);
  const tasks = [];
  let currentTask = null;
  let currentSection = "";
  const pendingCommands = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^##+\s+(.+)$/.exec(line);
    if (heading) currentSection = heading[1].trim();

    const unchecked = /^\s*-\s+\[\s?\]\s+\*\*Step\s+\d+:\s*(.+?)\*\*/.exec(line)
      || /^\s*-\s+\[\s?\]\s+(.+)$/.exec(line);
    if (unchecked) {
      if (currentTask) tasks.push(normalizeTask(currentTask));
      const goal = unchecked[1].replace(/\*\*/g, "").trim();
      currentTask = {
        id: stableId("plan", `${planPath}:${index + 1}:${goal}`),
        goal,
        category: inferCategory(`${currentSection} ${goal}`),
        requiredAgentCapability: inferCapability(`${currentSection} ${goal}`),
        dependencies: [],
        acceptanceCriteria: [`Complete plan item from ${planPath}:${index + 1}`],
        verificationCommands: [],
        confidenceRubricId: DEFAULT_RUBRIC,
        policyRiskLevel: inferPolicyRisk(`${currentSection} ${goal}`),
        stopConditions: ["policy_stop", "budget_stop", "verification_failed"],
        source: { type: "plan", path: planPath, line: index + 1, section: currentSection },
      };
      pendingCommands.length = 0;
      continue;
    }

    const commandLine = line.trim();
    if (currentTask && commandLine && !commandLine.startsWith("//")) {
      if (/^(node|npm|pnpm|yarn|bun|python|pytest|docker|git)\b/.test(commandLine)) {
        pendingCommands.push(commandLine);
        currentTask.verificationCommands = [...new Set([...currentTask.verificationCommands, ...pendingCommands])];
      }
    }
  }

  if (currentTask) tasks.push(normalizeTask(currentTask));

  if (tasks.length === 0 && markdown.trim()) {
    tasks.push(normalizeTask({
      id: stableId("plan", `${planPath}:summary`),
      goal: `Execute plan ${planPath}`,
      category: "plan",
      requiredAgentCapability: "orchestrator",
      acceptanceCriteria: ["Plan has been converted into executable tasks"],
      verificationCommands: ["node scripts/validate-plan-artifacts.mjs --file " + planPath.replace(/\\/g, "/")],
      policyRiskLevel: "low",
      source: { type: "plan", path: planPath },
    }));
  }

  return tasks;
}

export async function loadPlanTasks(planPath) {
  const markdown = await readFile(planPath, "utf8");
  return parsePlanTasks(markdown, planPath.replace(/\\/g, "/"));
}

export function createTasksFromRequest(request) {
  const text = String(request || "").trim();
  const lower = text.toLowerCase();
  const base = [
    ["repository discovery", "research", "repo-researcher", ["Repository structure and project commands are known"], []],
    ["dependency graph check", "dependency", "dependency-reviewer", ["Dependency files and lockfiles are checked"], []],
    ["build or typecheck check", "verification", "qa-test-engineer", ["Build or typecheck evidence is recorded"], []],
    ["test suite check", "verification", "qa-test-engineer", ["Relevant tests are run or a test gap is recorded"], []],
    ["runtime integration check", "integration", "stack-developer", ["Runtime integration evidence is captured"], []],
    ["bug triage", "debugging", "root-cause-debugger", ["Root cause and repair path are documented"], []],
    ["repair implementation", "implementation", "stack-developer", ["Code changes satisfy acceptance criteria"], []],
    ["verification and final review", "review", "quality-gate-reviewer", ["Final score is at least 9.0"], []],
  ];

  const tasks = base.map(([goal, category, capability, acceptanceCriteria, verificationCommands], index) =>
    normalizeTask({
      id: stableId("request", `${text}:${index}:${goal}`),
      goal,
      category,
      requiredAgentCapability: capability,
      dependencies: index === 0 ? [] : [stableId("request", `${text}:${index - 1}:${base[index - 1][0]}`)],
      acceptanceCriteria,
      verificationCommands,
      confidenceRubricId: DEFAULT_RUBRIC,
      policyRiskLevel: inferPolicyRisk(`${text} ${goal}`),
      stopConditions: ["policy_stop", "budget_stop", "verification_failed"],
      source: { type: "request", request: text },
    }),
  );

  if (lower.includes("design")) {
    tasks.unshift(normalizeTask({
      id: stableId("request", `${text}:design-handoff`),
      goal: "design-to-development handoff",
      category: "design",
      requiredAgentCapability: "ux-ui-designer",
      dependencies: [],
      acceptanceCriteria: ["Design states, tokens, accessibility, and responsive evidence are captured"],
      verificationCommands: [],
      confidenceRubricId: DEFAULT_RUBRIC,
      policyRiskLevel: "low",
      stopConditions: ["missing_design_evidence"],
      source: { type: "request", request: text },
    }));
  }

  return tasks;
}

function inferCategory(text) {
  const value = String(text).toLowerCase();
  if (value.includes("design") || value.includes("ui")) return "design";
  if (value.includes("docker") || value.includes("server") || value.includes("deploy")) return "runtime";
  if (value.includes("security") || value.includes("policy")) return "security";
  if (value.includes("test") || value.includes("verify") || value.includes("validation")) return "verification";
  if (value.includes("doc")) return "documentation";
  return "implementation";
}

function inferCapability(text) {
  const value = String(text).toLowerCase();
  if (value.includes("design")) return "ux-ui-designer";
  if (value.includes("security")) return "security-auditor";
  if (value.includes("dependency")) return "dependency-reviewer";
  if (value.includes("test") || value.includes("qa")) return "qa-test-engineer";
  if (value.includes("review")) return "quality-gate-reviewer";
  if (value.includes("server") || value.includes("docker") || value.includes("deploy")) return "devops-sre";
  return "stack-developer";
}

function inferPolicyRisk(text) {
  const value = String(text).toLowerCase();
  if (/(deploy\s+to\s+production|execute\s+production\s+deploy|production\s+(deploy|deployment)\s+action|destructive|credential\s+rotation|billing|account|dns)/.test(value)) return "high";
  if (/(external|server|docker|mcp|secret|privacy|security)/.test(value)) return "medium";
  if (/(production|deploy|remote|credential|migration)/.test(value)) return "medium";
  return "low";
}
