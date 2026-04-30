import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { graphToFlatTasks } from "./autonomous-loop-task-graph.mjs";
import { workItemsToLoopTasks } from "./supervibe-plan-to-work-items.mjs";

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
    priority: task.priority,
    source: task.source || "generated",
    targetFiles: task.targetFiles || task.filesTouched || [],
    anchorRefs: task.anchorRefs || [],
    semanticAnchors: task.semanticAnchors || [],
    fileLocalContracts: task.fileLocalContracts || [],
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
      const anchorMatch = /(?:anchors?|semantic-anchors?)\s*:\s*(.+)$/i.exec(commandLine);
      if (anchorMatch) {
        currentTask.anchorRefs = [...new Set([...(currentTask.anchorRefs || []), ...anchorMatch[1].split(/[,\s]+/).map((item) => item.trim()).filter(Boolean)])];
      }
      const fileMatch = /(?:files?|target-files?)\s*:\s*(.+)$/i.exec(commandLine);
      if (fileMatch) {
        currentTask.targetFiles = [...new Set([...(currentTask.targetFiles || []), ...fileMatch[1].split(/[,\s]+/).map((item) => item.trim()).filter(Boolean)])];
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
  const content = await readFile(planPath, "utf8");
  return parseTaskSource(content, planPath.replace(/\\/g, "/"));
}

export function parseTaskSource(content, sourcePath = "task-source") {
  const trimmed = String(content || "").trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (parsed?.kind === "supervibe-work-item-graph" || (Array.isArray(parsed?.items) && parsed?.epicId)) {
      return workItemsToLoopTasks(parsed.items);
    }
    if (Array.isArray(parsed) || Array.isArray(parsed.tasks)) {
      return graphToFlatTasks({
        graph_id: parsed.graph_id || sourcePath,
        source: { type: "task-graph", path: sourcePath },
        tasks: Array.isArray(parsed) ? parsed : parsed.tasks,
      });
    }
    const stories = Array.isArray(parsed.userStories)
      ? parsed.userStories
      : Array.isArray(parsed.stories)
        ? parsed.stories
        : parsed.records;
    if (Array.isArray(stories)) {
      return parsePrdStories(stories, sourcePath, {
        project: parsed.project,
        branchName: parsed.branchName,
        description: parsed.description,
      });
    }
  }
  if (looksLikePrdMarkdown(content, sourcePath)) return parsePrdMarkdown(content, sourcePath);
  return parsePlanTasks(content, sourcePath);
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
  if (/(integration|payment|provider|external|api)/.test(value)) return "integration";
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

function looksLikePrdMarkdown(content, sourcePath) {
  const text = String(content || "").toLowerCase();
  return /(^|\n)##+\s+(goals|requirements|user stories|stories|non-goals|risks)\b/.test(text)
    || /prd|spec/.test(sourcePath.toLowerCase());
}

function collectPrdSections(lines) {
  const sections = new Map();
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^##+\s+(.+)$/.exec(line);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (!current || !line.trim()) continue;
    if (/^\s*[-*]\s+/.test(line) || /^as\s+a\b/i.test(line.trim())) {
      sections.get(current).push({ text: line.trim(), line: index + 1 });
    }
  }
  return sections;
}

function requiredStoryAcceptance({ category, explicit = [], oversized = false }) {
  const criteria = [...explicit];
  criteria.push("Typecheck or equivalent static validation passes");
  if (category === "implementation" || category === "verification") criteria.push("Relevant automated tests pass or test gap is recorded");
  if (category === "design") criteria.push("Browser/preview evidence is captured for UI behavior");
  if (category === "integration") criteria.push("Access/env evidence exists or a blocked gate records the missing access");
  if (oversized) criteria.unshift("Split oversized story before execution");
  return [...new Set(criteria)];
}

function slug(value) {
  return String(value || "prd")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "prd";
}

export function parsePrdMarkdown(markdown, sourcePath = "prd.md") {
  const lines = String(markdown || "").split(/\r?\n/);
  const title = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim()
    || sourcePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "")
    || "PRD";
  const sections = collectPrdSections(lines);
  const storyLines = [];
  const userStorySection = sections.get("user stories") || sections.get("stories") || [];
  for (const item of userStorySection) {
    const story = item.text.replace(/^[-*]\s+/, "").replace(/^\[[ x]\]\s+/i, "").trim();
    if (story) storyLines.push({ text: story, line: item.line });
  }
  const source = {
    type: "prd",
    path: sourcePath,
    title,
    branchName: slug(title),
    goals: (sections.get("goals") || []).map((item) => item.text.replace(/^[-*]\s+/, "")),
    requirements: (sections.get("requirements") || []).map((item) => item.text.replace(/^[-*]\s+/, "")),
    risks: (sections.get("risks") || []).map((item) => item.text.replace(/^[-*]\s+/, "")),
    nonGoals: (sections.get("non-goals") || sections.get("non goals") || []).map((item) => item.text.replace(/^[-*]\s+/, "")),
  };

  const stories = storyLines.length > 0
    ? storyLines
    : (sections.get("requirements") || []).map((item) => ({ text: item.text.replace(/^[-*]\s+/, ""), line: item.line }));

  return parsePrdStories(stories.map((story, index) => ({
    id: stableId("prd", `${sourcePath}:${story.line}:${story.text}`),
    title: story.text,
    passes: false,
    priority: index === 0 ? "critical" : "medium",
    sourceLine: story.line,
  })), sourcePath, source);
}

export function parsePrdStories(stories, sourcePath, metadata = {}) {
  const normalizedStories = stories
    .map((story, index) => ({
      ...story,
      id: story.id || stableId("prd", `${sourcePath}:${index}:${story.title || story.goal}`),
      sourceOrder: index,
    }))
    .sort((a, b) => {
      const priority = priorityValue(b.priority) - priorityValue(a.priority);
      if (priority !== 0) return priority;
      if (a.passes === b.passes) return a.sourceOrder - b.sourceOrder;
      return a.passes === false ? -1 : 1;
    });

  return normalizedStories.map((story, index) => {
    const category = story.category || inferCategory(`${story.title || story.goal || ""} ${story.description || ""}`);
    const size = validateStorySize(story);
    const status = size.ok ? (story.passes === true ? "complete" : "open") : "blocked";
    return normalizeTask({
      id: story.id,
      goal: story.goal || story.title || `Repair PRD story ${index + 1}`,
      category,
      requiredAgentCapability: story.requiredAgentCapability || inferCapability(`${category} ${story.title || story.goal || ""}`),
      dependencies: story.dependencies || (index === 0 || story.passes === true ? [] : [normalizedStories[index - 1].id]),
      acceptanceCriteria: requiredStoryAcceptance({
        category,
        explicit: story.acceptanceCriteria || story.acceptance_criteria || [],
        oversized: !size.ok,
      }),
      verificationCommands: story.verificationCommands || story.verification_commands || [],
      confidenceRubricId: story.confidenceRubricId || DEFAULT_RUBRIC,
      policyRiskLevel: story.policyRiskLevel || inferPolicyRisk(`${category} ${story.title || story.goal || ""}`),
      stopConditions: story.stopConditions || ["policy_stop", "budget_stop", "story_still_failing"],
      status,
      source: {
        type: "prd",
        path: sourcePath,
        storyId: story.id,
        project: metadata.project || null,
        branchName: metadata.branchName || slug(metadata.title || metadata.project || sourcePath),
        description: metadata.description || null,
        title: metadata.title || null,
        line: story.sourceLine || metadata.line || null,
        goals: metadata.goals || [],
        requirements: metadata.requirements || [],
        risks: metadata.risks || [],
        nonGoals: metadata.nonGoals || [],
      },
      storySize: size,
    });
  }).map((task, index, all) => ({
    ...task,
    dependencies: task.status === "complete" ? [] : task.dependencies.filter((dependencyId) => all.some((candidate) => candidate.id === dependencyId)),
    storySize: normalizedStories[index] ? validateStorySize(normalizedStories[index]) : task.storySize,
  }));
}

export function validateStorySize(story = {}) {
  const text = `${story.title || story.goal || ""} ${story.description || ""}`.toLowerCase();
  const issues = [];
  if (text.length > 280) issues.push("story text is too broad for one context window");
  if (/\b(build|create|add)\s+(dashboard|authentication|auth|platform|admin|cms)\b/.test(text)) {
    issues.push("broad product surface");
  }
  if (/\b(refactor|rewrite|migrate)\s+(api|backend|frontend|app|system)\b/.test(text)) {
    issues.push("broad refactor surface");
  }
  const domains = ["schema", "backend", "api", "ui", "frontend", "integration", "auth", "tests"].filter((word) => text.includes(word));
  if (domains.length >= 4) issues.push("too many implementation domains");
  return {
    ok: issues.length === 0,
    issues,
    splitSuggestions: issues.length === 0 ? [] : ["schema", "backend", "UI", "integration", "verification"],
  };
}

function priorityValue(priority) {
  if (typeof priority === "number") return priority;
  const value = String(priority || "").toLowerCase();
  const match = /^p(\d+)$/.exec(value);
  if (match) return 100 - Number(match[1]);
  if (value === "critical") return 100;
  if (value === "high") return 75;
  if (value === "medium") return 50;
  if (value === "low") return 25;
  return 0;
}
