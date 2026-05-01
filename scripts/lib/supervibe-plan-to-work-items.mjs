import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateTaskGraph } from "./autonomous-loop-task-graph.mjs";
import { LOOP_SCHEMA_VERSION } from "./autonomous-loop-constants.mjs";
import { materializeEpicAndTasks } from "./supervibe-task-tracker-sync.mjs";
import { applyTemplateToWorkItem, inferWorkItemTemplate } from "./supervibe-work-item-template-catalog.mjs";

export const WORK_ITEM_TYPES = Object.freeze(["epic", "task", "bug", "chore", "review", "gate", "followup"]);

export const WORK_ITEM_REQUIRED_FIELDS = Object.freeze([
  "epicId",
  "itemId",
  "title",
  "type",
  "priority",
  "parentId",
  "blocks",
  "related",
  "discoveredFrom",
  "acceptanceCriteria",
  "verificationCommands",
  "writeScope",
  "scopeSafetyChecklist",
  "estimatedSize",
  "parallelGroup",
  "executionHints",
]);

export async function atomizePlanFile(planPath, options = {}) {
  const markdown = await readFile(planPath, "utf8");
  return atomizePlanToWorkItems(markdown, { ...options, planPath: normalizePath(planPath) });
}

export function atomizePlanToWorkItems(markdown, options = {}) {
  const planPath = normalizePath(options.planPath ?? "docs/plans/plan.md");
  const parsed = parsePlanForWorkItems(markdown, planPath);
  const epicId = options.epicId || createEpicId(parsed.title, planPath);
  const childItems = createChildItems(parsed, epicId, options);
  const gateItems = createGateItems(parsed, epicId, childItems, options);
  const followupItems = createFollowupItems(parsed, epicId, childItems, options);
  applyCriticalPathBlocks(childItems, parsed.criticalPath);

  const epic = createWorkItem({
    epicId,
    itemId: epicId,
    title: parsed.title,
    type: "epic",
    priority: "critical",
    parentId: null,
    blocks: childItems.filter((item) => item.type !== "gate").slice(0, 1).map((item) => item.itemId),
    related: [],
    discoveredFrom: { type: "plan", path: planPath },
    acceptanceCriteria: [
      "All child work items are complete or explicitly closed with rationale",
      "Final autonomous-loop confidence is at least 9/10",
    ],
    verificationCommands: parsed.planVerificationCommands,
    writeScope: [],
    estimatedSize: estimateEpicSize(childItems),
    parallelGroup: null,
    executionHints: {
      sourcePlan: planPath,
      reviewRequired: true,
      atomizedBy: "supervibe-plan-to-work-items",
    },
  });

  const items = [epic, ...childItems, ...gateItems, ...followupItems];
  const graph = createWorkItemGraph({
    epicId,
    planPath,
    title: parsed.title,
    items,
    metadata: {
      planReviewPassed: Boolean(options.planReviewPassed),
      dryRun: Boolean(options.dryRun),
      createdFrom: "plan",
    },
  });
  const validation = validateWorkItemGraph(graph);

  return {
    ...graph,
    parsed,
    validation,
    preview: createWorkItemPreview(graph, validation),
  };
}

export function parsePlanForWorkItems(markdown, planPath = "docs/plans/plan.md") {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const title = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim()
    || planPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "")
    || "Implementation Plan";
  const tasks = [];
  const reviewGates = [];
  let current = null;
  let inCodeBlock = false;
  let codeLang = "";
  let inAcceptance = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const taskHeading = /^#{2,4}\s+(?:Task\s+)?([A-Za-z]?\d+|T\d+)\s*[:.-]\s*(.+)$/i.exec(line);
    const reviewGate = /^#{2,4}\s+REVIEW GATE\s*(\d+)?/i.exec(line);
    const codeFence = /^```(\w+)?/.exec(line.trim());

    if (codeFence) {
      inCodeBlock = !inCodeBlock;
      codeLang = inCodeBlock ? (codeFence[1] || "") : "";
      continue;
    }

    if (reviewGate) {
      const afterTaskRef = current?.ref ?? null;
      if (current) tasks.push(current);
      reviewGates.push({
        id: `gate-${reviewGate[1] || reviewGates.length + 1}`,
        title: line.replace(/^#+\s+/, "").trim(),
        line: index + 1,
        afterTaskRef,
      });
      current = null;
      inAcceptance = false;
      continue;
    }

    if (taskHeading) {
      if (current) tasks.push(current);
      current = createParsedTask({
        ref: normalizeTaskRef(taskHeading[1], tasks.length + 1),
        title: taskHeading[2].trim(),
        line: index + 1,
        planPath,
      });
      inAcceptance = false;
      continue;
    }

    if (!current) continue;

    if (/^\*\*Acceptance Criteria:\*\*/i.test(line.trim())) {
      inAcceptance = true;
      continue;
    }
    if (/^#{2,4}\s+/.test(line) || /^\*\*[^*]+:\*\*/.test(line.trim())) {
      inAcceptance = false;
    }
    if (inAcceptance && /^\s*[-*]\s+(.+)$/.test(line)) {
      current.acceptanceCriteria.push(line.replace(/^\s*[-*]\s+/, "").trim());
    }

    if (inCodeBlock && /^(bash|sh|shell|powershell|pwsh)?$/i.test(codeLang)) {
      const command = line.trim();
      if (/^(node|npm|pnpm|yarn|bun|python|pytest|git|npx)\b/.test(command)) {
        current.verificationCommands.push(command);
      }
    }

    const fileMatch = /^\s*-\s*(Create|Modify|Test):\s+`([^`]+)`/i.exec(line);
    if (fileMatch) {
      current.writeScope.push({ action: fileMatch[1].toLowerCase(), path: normalizePath(fileMatch[2]) });
    }

    const rollback = /^\*\*Rollback:\*\*\s*(.+)$/i.exec(line.trim());
    if (rollback) current.rollback = rollback[1].trim();

    const estimate = /^\*\*Estimated time:\*\*\s*([^,\n]+)/i.exec(line.trim());
    if (estimate) current.estimatedSize = estimate[1].trim();

    const followup = /^\s*[-*]\s*(?:Follow-up|Followup):\s*(.+)$/i.exec(line);
    if (followup) current.followups.push({ title: followup[1].trim(), line: index + 1 });

    const depends = /\b(?:depends on|after|blocked by)\s+((?:T?\d+|Task\s+\d+)(?:\s*,\s*(?:T?\d+|Task\s+\d+))*)/i.exec(line);
    if (depends) {
      current.dependencies.push(...depends[1].split(/\s*,\s*/).map((item) => normalizeTaskRef(item.replace(/^Task\s+/i, ""), 0)));
    }
  }

  if (current) tasks.push(current);

  return {
    title,
    planPath,
    tasks: tasks.length > 0 ? tasks : [createParsedTask({ ref: "T1", title: `Execute ${title}`, line: 1, planPath })],
    reviewGates,
    criticalPath: parseCriticalPath(markdown),
    parallelGroups: parseParallelGroups(markdown),
    planVerificationCommands: collectPlanVerificationCommands(markdown, planPath),
  };
}

export function createWorkItemGraph({ epicId, planPath, title, items, metadata = {} }) {
  return {
    schema_version: LOOP_SCHEMA_VERSION,
    kind: "supervibe-work-item-graph",
    graph_id: epicId,
    epicId,
    title,
    source: { type: "plan", path: normalizePath(planPath) },
    metadata,
    items,
    tasks: workItemsToLoopTasks(items),
  };
}

export function validateWorkItemGraph(graph = {}) {
  const issues = [];
  const items = Array.isArray(graph.items) ? graph.items : [];
  const ids = new Set();
  const duplicates = new Set();

  for (const item of items) {
    const missing = WORK_ITEM_REQUIRED_FIELDS.filter((field) => !(field in item));
    if (missing.length > 0) {
      issues.push(issue("missing-field", item.itemId ?? null, `Work item is missing: ${missing.join(", ")}`, { missing }));
    }
    if (!WORK_ITEM_TYPES.includes(item.type)) {
      issues.push(issue("bad-type", item.itemId, `Unsupported work item type ${item.type}.`));
    }
    if (ids.has(item.itemId)) duplicates.add(item.itemId);
    ids.add(item.itemId);
  }
  for (const id of duplicates) issues.push(issue("duplicate-item-id", id, `Duplicate work item id ${id}.`));

  const epics = items.filter((item) => item.type === "epic");
  if (epics.length !== 1) issues.push(issue("bad-epic-count", graph.epicId ?? null, `Expected exactly one epic, got ${epics.length}.`));

  for (const item of items) {
    for (const blocked of item.blocks ?? []) {
      if (!ids.has(blocked)) issues.push(issue("unknown-block", item.itemId, `${item.itemId} blocks unknown item ${blocked}.`, { blocked }));
    }
    if (item.parentId && !ids.has(item.parentId)) {
      issues.push(issue("unknown-parent", item.itemId, `${item.itemId} has unknown parent ${item.parentId}.`, { parentId: item.parentId }));
    }
    if (!["epic", "gate", "followup"].includes(item.type) && item.acceptanceCriteria.length === 0) {
      issues.push(issue("missing-acceptance", item.itemId, `${item.itemId} needs acceptance criteria.`));
    }
    if (!["epic", "gate", "followup"].includes(item.type) && item.verificationCommands.length === 0) {
      issues.push(issue("missing-verification", item.itemId, `${item.itemId} needs verification commands.`));
    }
  }

  const taskGraphValidation = validateTaskGraph({ graph_id: graph.graph_id, tasks: graph.tasks ?? [] });
  for (const graphIssue of taskGraphValidation.issues) {
    issues.push(issue(`task-graph-${graphIssue.code}`, graphIssue.taskId, graphIssue.message, graphIssue));
  }

  return {
    valid: issues.length === 0,
    issues,
    taskGraph: taskGraphValidation.graph,
  };
}

export function workItemsToLoopTasks(items = []) {
  const reverseBlocks = new Map();
  for (const item of items) {
    if (item.type === "epic") continue;
    for (const blockedId of item.blocks ?? []) {
      const dependencies = reverseBlocks.get(blockedId) ?? [];
      dependencies.push(item.itemId);
      reverseBlocks.set(blockedId, dependencies);
    }
  }

  return items
    .filter((item) => item.type !== "epic" && item.type !== "followup")
    .map((item, index) => ({
      id: item.itemId,
      title: item.title,
      goal: item.title,
      category: categoryForWorkItemType(item.type),
      status: "open",
      priority: item.priority,
      dependencies: [...new Set([...(reverseBlocks.get(item.itemId) ?? []), ...(item.blockedBy ?? [])])],
      parentId: item.parentId,
      epicId: item.epicId,
      acceptanceCriteria: item.acceptanceCriteria,
      verificationCommands: item.verificationCommands,
      policyRiskLevel: item.executionHints.policyRiskLevel ?? "low",
      stopConditions: item.executionHints.stopConditions ?? ["policy_stop", "budget_stop", "verification_failed"],
      requiredAgentCapability: item.executionHints.requiredAgentCapability ?? capabilityForWorkItem(item),
      confidenceRubricId: item.executionHints.confidenceRubricId ?? "autonomous-loop",
      writeScope: item.writeScope,
      labels: item.labels || [],
      severity: item.severity || null,
      owner: item.owner || null,
      component: item.component || null,
      stack: item.stack || null,
      repo: item.repo || null,
      package: item.package || null,
      workspace: item.workspace || null,
      subproject: item.subproject || null,
      requiredGates: item.requiredGates || [],
      verificationHints: item.verificationHints || [],
      contractChecklist: item.contractChecklist || [],
      scopeSafetyChecklist: item.scopeSafetyChecklist || [],
      productionReadinessChecklist: item.productionReadinessChecklist || [],
      tenOfTenChecklist: item.tenOfTenChecklist || [],
      estimatedSize: item.estimatedSize,
      parallelGroup: item.parallelGroup,
      sourceOrder: index,
      source: {
        type: "work-item",
        planPath: item.discoveredFrom?.path ?? null,
        itemId: item.itemId,
        epicId: item.epicId,
      },
    }));
}

export async function writeWorkItemGraph(graph, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const outDir = options.outDir ?? join(rootDir, ".claude", "memory", "work-items", graph.epicId);
  await mkdir(outDir, { recursive: true });
  const graphPath = join(outDir, "graph.json");
  const previewPath = join(outDir, "preview.txt");
  await writeFile(graphPath, `${JSON.stringify(stripParsedFields(graph), null, 2)}\n`);
  await writeFile(previewPath, `${createWorkItemPreview(graph, graph.validation ?? validateWorkItemGraph(graph))}\n`);
  return { outDir, graphPath, previewPath };
}

export function createNativeWorkItemAdapter(options = {}) {
  return {
    id: "native-json",
    mode: "native",
    async createGraph(graph) {
      const result = await writeWorkItemGraph(graph, options);
      return { ok: true, preservedNativeGraph: true, ...result };
    },
  };
}

export async function applyWorkItemAdapter(graph, adapter, options = {}) {
  const nativeResult = options.skipNativeWrite ? null : await writeWorkItemGraph(graph, options);
  if (!adapter) return { ok: true, nativeResult, externalResult: null };
  try {
    const externalResult = typeof adapter.createGraph === "function"
      ? await adapter.createGraph(graph, options)
      : await materializeEpicAndTasks(graph, adapter, options);
    return { ok: true, nativeResult, externalResult };
  } catch (error) {
    return {
      ok: false,
      nativeResult,
      externalResult: null,
      error: error.message,
      remediation: [
        "Native JSON graph was preserved.",
        "Fix or disable the external task tracker adapter, then retry sync.",
      ],
    };
  }
}

export function createWorkItemPreview(graph, validation = validateWorkItemGraph(graph)) {
  const items = graph.items ?? [];
  const tasks = items.filter((item) => item.type !== "epic");
  const ready = (graph.tasks ?? []).filter((task) => task.dependencies.length === 0);
  return [
    "SUPERVIBE_WORK_ITEMS_PREVIEW",
    `EPIC: ${graph.epicId} ${graph.title}`,
    `ITEMS: ${items.length}`,
    `CHILDREN: ${tasks.length}`,
    `READY: ${ready.map((task) => task.id).join(",") || "none"}`,
    `VALID: ${validation.valid}`,
    validation.issues.length > 0 ? `ISSUES: ${validation.issues.map((item) => item.code).join(",")}` : "ISSUES: none",
  ].join("\n");
}

function createChildItems(parsed, epicId, options = {}) {
  const groups = parsed.parallelGroups;
  return parsed.tasks.map((task, index) => {
    const item = createWorkItem({
      epicId,
      itemId: taskItemId(epicId, task.ref, task.title),
      title: task.title,
      type: inferWorkItemType(task.title),
      priority: priorityForTask(task, parsed.criticalPath, index),
      parentId: epicId,
      blocks: [],
      related: task.dependencies.map((dependency) => taskItemId(epicId, dependency, dependency)),
      blockedBy: task.dependencies.map((dependency) => taskItemId(epicId, dependency, dependency)),
      discoveredFrom: { type: "plan", path: parsed.planPath, line: task.line, taskRef: task.ref },
      acceptanceCriteria: task.acceptanceCriteria.length > 0
        ? task.acceptanceCriteria
        : [`Complete ${task.title} from ${parsed.planPath}:${task.line}`],
      verificationCommands: task.verificationCommands.length > 0
        ? [...new Set(task.verificationCommands)]
        : parsed.planVerificationCommands,
      writeScope: task.writeScope,
      estimatedSize: task.estimatedSize,
      parallelGroup: groups.get(task.ref) ?? null,
      repo: options.repo || null,
      package: options.package || null,
      workspace: options.workspace || null,
      subproject: options.subproject || null,
      executionHints: {
        sourceTaskRef: task.ref,
        rollback: task.rollback,
        requiredAgentCapability: inferCapability(task.title),
        confidenceRubricId: "autonomous-loop",
        policyRiskLevel: inferPolicyRisk(`${task.title} ${task.writeScope.map((item) => item.path).join(" ")}`),
        stopConditions: ["policy_stop", "budget_stop", "verification_failed"],
        repo: options.repo || null,
        package: options.package || null,
        workspace: options.workspace || null,
        subproject: options.subproject || null,
      },
    });
    const template = inferWorkItemTemplate({ ...item, planText: parsed.title });
    return applyTemplateToWorkItem(item, template, options);
  });
}

function createGateItems(parsed, epicId, childItems) {
  return parsed.reviewGates.map((gate, index) => {
    const previous = gate.afterTaskRef
      ? childItems.find((item) => item.executionHints.sourceTaskRef === gate.afterTaskRef)
      : childItems[index] ?? childItems.at(-1);
    const itemId = `${epicId}-gate-${index + 1}`;
    if (previous && !previous.blocks.includes(itemId)) previous.blocks.push(itemId);
    return createWorkItem({
      epicId,
      itemId,
      title: gate.title,
      type: "gate",
      priority: "high",
      parentId: epicId,
      blocks: [],
      blockedBy: previous ? [previous.itemId] : [],
      related: previous ? [previous.itemId] : [],
      discoveredFrom: { type: "plan", path: parsed.planPath, line: gate.line },
      acceptanceCriteria: ["Review gate has explicit pass/fail evidence"],
      verificationCommands: parsed.planVerificationCommands,
      writeScope: [],
      estimatedSize: "review-gate",
      parallelGroup: null,
      executionHints: {
        requiredAgentCapability: "quality-gate-reviewer",
        confidenceRubricId: "autonomous-loop",
        policyRiskLevel: "low",
      },
    });
  });
}

function createFollowupItems(parsed, epicId, childItems) {
  const byRef = new Map(parsed.tasks.map((task, index) => [task.ref, childItems[index]]));
  return parsed.tasks.flatMap((task) => task.followups.map((followup, index) => {
    const parent = byRef.get(task.ref);
    return createWorkItem({
      epicId,
      itemId: `${parent.itemId}-followup-${index + 1}`,
      title: followup.title,
      type: "followup",
      priority: "low",
      parentId: epicId,
      blocks: [],
      related: [parent.itemId],
      discoveredFrom: { type: "plan", path: parsed.planPath, line: followup.line, taskRef: task.ref },
      acceptanceCriteria: ["Follow-up is triaged into scope, deferred, or closed"],
      verificationCommands: [],
      writeScope: [],
      estimatedSize: "followup",
      parallelGroup: null,
      executionHints: {
        requiredAgentCapability: "orchestrator",
        confidenceRubricId: "autonomous-loop",
        policyRiskLevel: "low",
      },
    });
  }));
}

function createWorkItem(item) {
  return {
    ...item,
    blocks: uniqueStrings(item.blocks ?? []),
    related: uniqueStrings(item.related ?? []),
    blockedBy: uniqueStrings(item.blockedBy ?? []),
    acceptanceCriteria: uniqueStrings(item.acceptanceCriteria ?? []),
    verificationCommands: uniqueStrings(item.verificationCommands ?? []),
    writeScope: Array.isArray(item.writeScope) ? item.writeScope : [],
    labels: uniqueStrings(item.labels ?? []),
    severity: item.severity ?? null,
    owner: item.owner ?? null,
    component: item.component ?? null,
    stack: item.stack ?? null,
    repo: item.repo ?? null,
    package: item.package ?? null,
    workspace: item.workspace ?? null,
    subproject: item.subproject ?? null,
    requiredGates: uniqueStrings(item.requiredGates ?? []),
    verificationHints: uniqueStrings(item.verificationHints ?? []),
    contractChecklist: uniqueStrings(item.contractChecklist ?? []),
    scopeSafetyChecklist: uniqueStrings(item.scopeSafetyChecklist ?? []),
    productionReadinessChecklist: uniqueStrings(item.productionReadinessChecklist ?? []),
    tenOfTenChecklist: uniqueStrings(item.tenOfTenChecklist ?? []),
    estimatedSize: item.estimatedSize ?? "medium",
    parallelGroup: item.parallelGroup ?? null,
    executionHints: item.executionHints ?? {},
  };
}

function applyCriticalPathBlocks(items, criticalPath) {
  for (let index = 0; index < criticalPath.length - 1; index += 1) {
    const current = findByTaskRef(items, criticalPath[index]);
    const next = findByTaskRef(items, criticalPath[index + 1]);
    if (current && next && !current.blocks.includes(next.itemId)) {
      current.blocks.push(next.itemId);
      next.blockedBy = uniqueStrings([...(next.blockedBy ?? []), current.itemId]);
    }
  }
}

function parseCriticalPath(markdown) {
  const match = /Critical path:\s*([^\n]+)/i.exec(String(markdown ?? ""));
  if (!match) return [];
  return match[1]
    .split(/(?:->|→|,|\|)/)
    .map((item) => normalizeTaskRef(item.replace(/\[.*?\]/g, "").trim(), 0))
    .filter(Boolean);
}

function parseParallelGroups(markdown) {
  const groups = new Map();
  const lines = String(markdown ?? "").split(/\r?\n/);
  for (const line of lines) {
    const match = /(?:Parallelizable|Batch\s+([A-Za-z0-9_-]+)).*?:\s*(.+)$/i.exec(line);
    if (!match) continue;
    const group = match[1] ? `batch-${match[1]}` : "parallel";
    for (const ref of match[2].split(/(?:\|\||,|;)/)) {
      const taskRef = normalizeTaskRef(ref.trim(), 0);
      if (taskRef) groups.set(taskRef, group);
    }
  }
  return groups;
}

function collectPlanVerificationCommands(markdown, planPath) {
  const commands = [];
  let inCodeBlock = false;
  let codeLang = "";
  for (const line of String(markdown ?? "").split(/\r?\n/)) {
    const fence = /^```(\w+)?/.exec(line.trim());
    if (fence) {
      inCodeBlock = !inCodeBlock;
      codeLang = inCodeBlock ? (fence[1] || "") : "";
      continue;
    }
    if (inCodeBlock && /^(bash|sh|shell|powershell|pwsh)?$/i.test(codeLang)) {
      const command = line.trim();
      if (/^(node|npm|pnpm|yarn|bun|python|pytest|git|npx)\b/.test(command)) commands.push(command);
    }
  }
  if (commands.length === 0) commands.push(`node scripts/validate-plan-artifacts.mjs --file ${normalizePath(planPath)}`);
  return [...new Set(commands)];
}

function createParsedTask({ ref, title, line, planPath }) {
  return {
    ref,
    title,
    line,
    planPath,
    dependencies: [],
    acceptanceCriteria: [],
    verificationCommands: [],
    writeScope: [],
    estimatedSize: "medium",
    rollback: null,
    followups: [],
  };
}

function taskItemId(epicId, taskRef, title) {
  const normalizedRef = normalizeTaskRef(taskRef, 0).toLowerCase();
  return `${epicId}-${normalizedRef || stableHash(title)}`;
}

function createEpicId(title, planPath) {
  return `epic-${slug(title)}-${stableHash(planPath).slice(0, 6)}`;
}

function findByTaskRef(items, taskRef) {
  const normalized = normalizeTaskRef(taskRef, 0);
  return items.find((item) => item.executionHints.sourceTaskRef === normalized || item.itemId.endsWith(`-${normalized.toLowerCase()}`));
}

function normalizeTaskRef(value, fallbackIndex) {
  const raw = String(value ?? "").trim();
  const number = /(?:Task\s*)?T?([A-Za-z]?\d+)/i.exec(raw)?.[1];
  if (number) return `T${number.replace(/^T/i, "")}`;
  return fallbackIndex > 0 ? `T${fallbackIndex}` : "";
}

function priorityForTask(task, criticalPath, index) {
  if (criticalPath.includes(task.ref)) return "critical";
  if (index === 0) return "high";
  return "medium";
}

function inferWorkItemType(title) {
  const text = String(title).toLowerCase();
  if (text.includes("review") || text.includes("audit")) return "review";
  if (text.includes("bug") || text.includes("fix")) return "bug";
  if (text.includes("doc") || text.includes("changelog") || text.includes("readme")) return "chore";
  if (text.includes("gate")) return "gate";
  return "task";
}

function categoryForWorkItemType(type) {
  if (type === "review" || type === "gate") return "review";
  if (type === "bug") return "debugging";
  if (type === "chore") return "documentation";
  return "implementation";
}

function capabilityForWorkItem(item) {
  if (item.type === "review" || item.type === "gate") return "quality-gate-reviewer";
  return inferCapability(item.title);
}

function inferCapability(title) {
  const text = String(title).toLowerCase();
  if (text.includes("security") || text.includes("policy")) return "security-auditor";
  if (text.includes("test") || text.includes("verify")) return "qa-test-engineer";
  if (text.includes("review") || text.includes("gate")) return "quality-gate-reviewer";
  if (text.includes("doc") || text.includes("readme")) return "technical-writer";
  return "stack-developer";
}

function inferPolicyRisk(text) {
  const value = String(text).toLowerCase();
  if (/(production|deploy|credential|billing|dns|account|destructive)/.test(value)) return "high";
  if (/(external|server|mcp|secret|security|policy)/.test(value)) return "medium";
  return "low";
}

function estimateEpicSize(items) {
  if (items.length > 20) return "large";
  if (items.length > 8) return "medium";
  return "small";
}

function stripParsedFields(graph) {
  const { parsed, validation, preview, ...serializable } = graph;
  return serializable;
}

function normalizePath(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

function slug(value) {
  return String(value || "plan")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "plan";
}

function stableHash(value) {
  return createHash("sha1").update(String(value)).digest("hex").slice(0, 10);
}

function uniqueStrings(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function issue(code, itemId, message, extra = {}) {
  return { code, itemId, message, ...extra };
}
