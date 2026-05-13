import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateTaskGraph } from "./autonomous-loop-task-graph.mjs";
import { LOOP_SCHEMA_VERSION } from "./autonomous-loop-constants.mjs";
import { materializeEpicAndTasks } from "./supervibe-task-tracker-sync.mjs";
import { updateActiveWorkItemGraph } from "./supervibe-work-item-registry.mjs";
import { applyTemplateToWorkItem, inferWorkItemTemplate } from "./supervibe-work-item-template-catalog.mjs";
import { createEpicAgentContract } from "./supervibe-epic-agent-contract.mjs";
import {
  assertTaskBudgetAllowsGraphWrite,
  evaluateTaskBudgetPolicy,
  parseTaskBudgetPolicyFromText,
} from "./supervibe-task-budget-policy.mjs";

export const WORK_ITEM_TYPES = Object.freeze(["epic", "task", "subtask", "bug", "chore", "review", "gate", "followup"]);

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
  "taskScore",
  "reviewerScore",
  "evidenceScore",
  "estimatedSize",
  "parallelGroup",
  "executionHints",
]);

export async function atomizePlanFile(planPath, options = {}) {
  const markdown = await readFile(planPath, "utf8");
  return atomizePlanToWorkItems(markdown, { ...options, planPath: normalizePath(planPath) });
}

export function atomizePlanToWorkItems(markdown, options = {}) {
  const planPath = normalizePath(options.planPath ?? ".supervibe/artifacts/plans/plan.md");
  const sourcePlanSnapshot = createSourcePlanSnapshot(markdown, planPath, options);
  const parsed = parsePlanForWorkItems(markdown, planPath, {
    requireTasks: Boolean(options.requireTasks || options.planReviewPassed),
  });
  const epicId = options.epicId || createEpicId(parsed.title, planPath);
  const childItems = createChildItems(parsed, epicId, options);
  const gateItems = createGateItems(parsed, epicId, childItems, options);
  const followupItems = createFollowupItems(parsed, epicId, childItems, options);
  applyCriticalPathBlocks(childItems, parsed.criticalPath);
  const taskBudgetPolicy = options.taskBudgetPolicy
    ? { ...parsed.globalMetadata.taskBudgetPolicy, ...options.taskBudgetPolicy }
    : parsed.globalMetadata.taskBudgetPolicy;
  const taskBudgetDecision = options.taskBudgetDecision || {};

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
  const taskBudgetReport = evaluateTaskBudgetPolicy({
    items,
    policy: taskBudgetPolicy,
    decision: taskBudgetDecision,
  });
  const graph = createWorkItemGraph({
    epicId,
    planPath,
    title: parsed.title,
    items,
    metadata: {
      planReviewPassed: Boolean(options.planReviewPassed),
      dryRun: Boolean(options.dryRun),
      createdFrom: "plan",
      epicAgentContract: createEpicAgentContract({
        required: Boolean(options.planReviewPassed && !options.dryRun),
        agentIds: options.epicAgentIds,
      }),
      taskBudgetPolicy: {
        policy: taskBudgetReport.policy,
        decision: taskBudgetReport.decision,
        report: taskBudgetReport,
      },
      sourcePlanSnapshot,
      atomicInventory: parsed.atomicInventory.map((item) => ({
        id: item.id,
        title: item.title,
        line: item.line,
      })),
      atomicInventoryIds: parsed.atomicInventory.map((item) => item.id),
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

export function parsePlanForWorkItems(markdown, planPath = ".supervibe/artifacts/plans/plan.md", options = {}) {
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
    const taskHeading = /^#{2,4}\s+(?:Task\s+)?(T?\d+[A-Za-z]?|[A-Za-z]?\d+[A-Za-z]?)\s*[:.-]\s*(.+)$/i.exec(line);
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

    const stepMatch = /^\s*-\s+\[[ xX]\]\s+\*\*Step\s+(\d+)\s*:\s*(.+?)\*\*/i.exec(line);
    if (stepMatch) {
      current.steps.push({
        number: Number(stepMatch[1]),
        title: stepMatch[2].trim(),
        line: index + 1,
        verificationCommands: [],
      });
      current.activeStepIndex = current.steps.length - 1;
    }

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
        const activeStep = Number.isInteger(current.activeStepIndex) ? current.steps[current.activeStepIndex] : null;
        if (activeStep) activeStep.verificationCommands.push(command);
      }
    }

    const fileMatch = /^\s*-\s*(Create|Modify|Test):\s+`([^`]+)`/i.exec(line);
    if (fileMatch) {
      current.writeScope.push({ action: fileMatch[1].toLowerCase(), path: normalizePath(fileMatch[2]) });
    }

    const rollback = /^\*\*Rollback:\*\*\s*(.+)$/i.exec(line.trim());
    if (rollback) current.rollback = rollback[1].trim();

    const scopeIds = /^\*\*Scope IDs:\*\*\s*(.+)$/i.exec(line.trim());
    if (scopeIds) current.scopeIds.push(...splitInlineList(scopeIds[1]));

    const requirementIds = /^\*\*Requirement IDs:\*\*\s*(.+)$/i.exec(line.trim());
    if (requirementIds) current.requirementIds.push(...splitInlineList(requirementIds[1]));

    const contractRows = /^\*\*Contract rows touched:\*\*\s*(.+)$/i.exec(line.trim());
    if (contractRows) current.contractRows.push(...splitInlineList(contractRows[1]));

    const stopConditions = /^\*\*Stop conditions:\*\*\s*(.+)$/i.exec(line.trim());
    if (stopConditions) current.stopConditions.push(...splitInlineList(stopConditions[1]));

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
    globalMetadata: parsePlanGlobalMetadata(markdown),
    tasks: tasks.length > 0 || options.requireTasks
      ? tasks
      : [createParsedTask({ ref: "T1", title: `Execute ${title}`, line: 1, planPath })],
    taskParseRequired: Boolean(options.requireTasks),
    taskParseFallbackUsed: tasks.length === 0 && !options.requireTasks,
    reviewGates,
    criticalPath: parseCriticalPath(markdown),
    parallelGroups: parseParallelGroups(markdown),
    atomicInventory: parseAtomicTaskInventory(markdown),
    planVerificationCommands: collectPlanVerificationCommands(markdown, planPath),
  };
}

export function createWorkItemGraph({ epicId, planPath, title, items, metadata = {} }) {
  const sourcePlanSnapshot = metadata.sourcePlanSnapshot || null;
  return {
    schema_version: LOOP_SCHEMA_VERSION,
    kind: "supervibe-work-item-graph",
    graph_id: epicId,
    epicId,
    title,
    source: {
      type: "plan",
      path: normalizePath(planPath),
      sha256: sourcePlanSnapshot?.sha256 || null,
      snapshotPath: sourcePlanSnapshot?.storedPath || null,
    },
    metadata,
    items,
    dependencyEdges: createDependencyEdges(items),
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

  const implementationItems = items.filter((item) => !["epic", "gate", "followup"].includes(item.type));
  if (implementationItems.length === 0) {
    issues.push(issue("missing-child-task", graph.epicId ?? null, "Reviewed plans must contain at least one parseable implementation task."));
  }
  const atomicInventoryIds = Array.isArray(graph.metadata?.atomicInventoryIds)
    ? graph.metadata.atomicInventoryIds
    : Array.isArray(graph.metadata?.atomicInventory)
      ? graph.metadata.atomicInventory.map((item) => item.id).filter(Boolean)
      : [];
  if (atomicInventoryIds.length > 0) {
    const covered = new Map();
    for (const item of implementationItems) {
      const atomicId = item.executionHints?.sourceAtomicId
        || (item.executionHints?.scopeIds || []).find((scopeId) => /^A\d{3,}$/i.test(scopeId));
      if (!atomicId) continue;
      const key = String(atomicId).toUpperCase();
      covered.set(key, [...(covered.get(key) || []), item.itemId]);
    }
    for (const atomicId of atomicInventoryIds) {
      const key = String(atomicId).toUpperCase();
      const itemIds = covered.get(key) || [];
      if (itemIds.length === 0) {
        issues.push(issue("missing-atomic-inventory-item", graph.epicId ?? null, `Atomic inventory item ${key} is not represented as a child work item.`, { atomicId: key }));
      }
      if (itemIds.length > 1) {
        issues.push(issue("duplicate-atomic-inventory-item", graph.epicId ?? null, `Atomic inventory item ${key} is represented by multiple work items: ${itemIds.join(", ")}.`, { atomicId: key, itemIds }));
      }
    }
  }

  for (const item of items) {
    for (const blocked of item.blocks ?? []) {
      if (!ids.has(blocked)) issues.push(issue("unknown-block", item.itemId, `${item.itemId} blocks unknown item ${blocked}.`, { blocked }));
    }
    if (item.parentId && !ids.has(item.parentId)) {
      issues.push(issue("unknown-parent", item.itemId, `${item.itemId} has unknown parent ${item.parentId}.`, { parentId: item.parentId }));
    }
    if (!["epic", "gate", "followup"].includes(item.type) && (!Array.isArray(item.acceptanceCriteria) || item.acceptanceCriteria.length === 0)) {
      issues.push(issue("missing-acceptance", item.itemId, `${item.itemId} needs acceptance criteria.`));
    }
    if (!["epic", "gate", "followup"].includes(item.type) && (!Array.isArray(item.verificationCommands) || item.verificationCommands.length === 0)) {
      issues.push(issue("missing-verification", item.itemId, `${item.itemId} needs verification commands.`));
    }
    for (const field of ["taskScore", "reviewerScore", "evidenceScore"]) {
      if (!(field in item)) continue;
      const score = validateScoreField(item[field], field, item.itemId);
      issues.push(...score);
    }
  }
  const budgetReport = graph.metadata?.taskBudgetPolicy?.report;
  if (budgetReport?.exceeded && budgetReport.pass === false) {
    issues.push(issue(
      "task-budget-exceeded",
      graph.epicId ?? null,
      budgetReport.prompt || "Task budget exceeded; phase split decision is required before graph write.",
      {
        violations: budgetReport.violations || [],
        totals: budgetReport.totals || {},
      },
    ));
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
    const itemId = item.itemId || item.id;
    for (const blockedId of item.blocks ?? []) {
      const dependencies = reverseBlocks.get(blockedId) ?? [];
      if (itemId) dependencies.push(itemId);
      reverseBlocks.set(blockedId, dependencies);
    }
  }

  return items
    .filter((item) => !["epic", "followup"].includes(item.type))
    .map((item, index) => ({
      id: item.itemId || item.id,
      title: item.title,
      goal: item.title,
      category: categoryForWorkItemType(item.type),
      status: item.status || "open",
      priority: item.priority,
      dependencies: [...new Set([...(reverseBlocks.get(item.itemId || item.id) ?? []), ...(item.blockedBy ?? [])])],
      parentId: item.parentId,
      epicId: item.epicId,
      acceptanceCriteria: item.acceptanceCriteria,
      verificationCommands: item.verificationCommands,
      policyRiskLevel: item.executionHints?.policyRiskLevel ?? "low",
      stopConditions: item.executionHints?.stopConditions ?? ["policy_stop", "budget_stop", "verification_failed"],
      requiredAgentCapability: item.executionHints?.requiredAgentCapability ?? capabilityForWorkItem(item),
      confidenceRubricId: item.executionHints?.confidenceRubricId ?? "autonomous-loop",
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
      taskScore: item.taskScore || null,
      reviewerScore: item.reviewerScore || null,
      evidenceScore: item.evidenceScore || null,
      productionReadinessChecklist: item.productionReadinessChecklist || [],
      tenOfTenChecklist: item.tenOfTenChecklist || [],
      estimatedSize: item.estimatedSize,
      parallelGroup: item.parallelGroup,
      sourceOrder: index,
      source: {
        type: "work-item",
        planPath: item.discoveredFrom?.path ?? null,
        itemId: item.itemId || item.id,
        epicId: item.epicId,
      },
    }));
}

export async function writeWorkItemGraph(graph, options = {}) {
  const budgetGate = assertTaskBudgetAllowsGraphWrite(graph, options);
  if (!budgetGate.pass) {
    throw new Error(budgetGate.message);
  }
  const validation = graph.validation ?? validateWorkItemGraph(graph);
  if (!validation.valid && !options.allowInvalidGraph) {
    const issueSummary = validation.issues
      .map((item) => `${item.code}${item.itemId ? `:${item.itemId}` : ""}`)
      .join(",");
    throw new Error(`invalid work-item graph: ${issueSummary || "validation failed"}`);
  }
  const rootDir = options.rootDir ?? process.cwd();
  const outDir = options.outDir ?? join(rootDir, ".supervibe", "memory", "work-items", graph.epicId);
  await mkdir(outDir, { recursive: true });
  const graphPath = join(outDir, "graph.json");
  const previewPath = join(outDir, "preview.txt");
  const sourcePlanSnapshot = graph.metadata?.sourcePlanSnapshot;
  if (sourcePlanSnapshot?.content && sourcePlanSnapshot?.storedPath) {
    await writeFile(join(outDir, normalizePath(sourcePlanSnapshot.storedPath)), String(sourcePlanSnapshot.content), "utf8");
  }
  await writeFile(graphPath, `${JSON.stringify(stripParsedFields(graph), null, 2)}\n`);
  await writeFile(previewPath, `${createWorkItemPreview(graph, validation)}\n`);
  await updateActiveWorkItemGraph({
    rootDir,
    graphPath,
    graph,
    reason: options.registryReason || "graph-write",
  });
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
  const previewLimit = Number(graph.metadata?.previewItemLimit ?? 0);
  const previewItems = (previewLimit > 0 ? tasks.slice(0, previewLimit) : tasks).map(formatPreviewItem);
  return [
    "SUPERVIBE_WORK_ITEMS_PREVIEW",
    `EPIC: ${graph.epicId} ${graph.title}`,
    `ITEMS: ${items.length}`,
    `CHILDREN: ${tasks.length}`,
    `READY: ${ready.map((task) => task.id).join(",") || "none"}`,
    `VALID: ${validation.valid}`,
    validation.issues.length > 0 ? `ISSUES: ${validation.issues.map((item) => item.code).join(",")}` : "ISSUES: none",
    graph.metadata?.taskBudgetPolicy?.report
      ? `TASK_BUDGET: ${graph.metadata.taskBudgetPolicy.report.pass ? "pass" : "exceeded"} childItems=${graph.metadata.taskBudgetPolicy.report.totals.childItems} maxChildItems=${graph.metadata.taskBudgetPolicy.report.policy.maxChildItemsPerAtomizationRun} largestPhase=${graph.metadata.taskBudgetPolicy.report.totals.largestPhase.count}/${graph.metadata.taskBudgetPolicy.report.policy.maxTasksPerPhase}`
      : "TASK_BUDGET: not-recorded",
    graph.metadata?.taskBudgetPolicy?.report?.prompt
      ? `TASK_BUDGET_PROMPT: ${safeInline(graph.metadata.taskBudgetPolicy.report.prompt, 220)}`
      : "TASK_BUDGET_PROMPT: none",
    "SCOPE_EDIT_HINT: Before approval, answer with item ids to exclude, defer, split, or reprioritize.",
    "ITEMS_DETAIL:",
    ...(previewItems.length > 0 ? previewItems : ["- none"]),
    tasks.length > previewItems.length ? `ITEMS_DETAIL_TRUNCATED: ${tasks.length - previewItems.length} more` : "ITEMS_DETAIL_TRUNCATED: 0",
  ].join("\n");
}

function formatPreviewItem(item) {
  const scope = (item.writeScope || [])
    .slice(0, 3)
    .map((entry) => `${entry.action || "touch"}:${entry.path || entry}`)
    .join(",");
  const blockedBy = (item.blockedBy || []).slice(0, 3).join(",");
  const requiredGates = (item.requiredGates || []).slice(0, 3).join(",");
  return [
    `- ${safeInline(item.itemId || "unknown")}: [${item.type || "task"}] ${safeInline(item.title || "untitled")}`,
    scope ? `scope=${safeInline(scope)}` : null,
    blockedBy ? `blockedBy=${safeInline(blockedBy)}` : null,
    requiredGates ? `gates=${safeInline(requiredGates)}` : null,
  ].filter(Boolean).join(" | ");
}

function createChildItems(parsed, epicId, options = {}) {
  if (parsed.atomicInventory.length > 0) {
    return createAtomicInventoryItems(parsed, epicId, options);
  }
  const groups = parsed.parallelGroups;
  const expandSteps = shouldExpandPlanSteps(parsed, options);
  const items = [];
  for (const [index, task] of parsed.tasks.entries()) {
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
      requiredGates: parsed.reviewGates.map((gate) => gate.id),
      verificationHints: uniqueStrings([
        ...task.stopConditions.map((item) => `stop:${item}`),
        ...task.contractRows.map((item) => `contract:${item}`),
      ]),
      contractChecklist: uniqueStrings([
        ...task.contractRows,
        ...parsed.globalMetadata.contractRows.map((row) => row.id),
      ]),
      scopeSafetyChecklist: parsed.globalMetadata.scopeSafetyChecklist,
      productionReadinessChecklist: parsed.globalMetadata.productionReadinessChecklist,
      tenOfTenChecklist: parsed.globalMetadata.tenOfTenChecklist,
      estimatedSize: task.estimatedSize,
      parallelGroup: groups.get(task.ref) ?? null,
      repo: options.repo || null,
      package: options.package || null,
      workspace: options.workspace || null,
      subproject: options.subproject || null,
      executionHints: {
        sourceTaskRef: task.ref,
        rollback: task.rollback,
        scopeIds: task.scopeIds,
        requirementIds: task.requirementIds,
        contractRows: task.contractRows,
        stopConditions: task.stopConditions.length > 0
          ? task.stopConditions
          : ["policy_stop", "budget_stop", "verification_failed"],
        receiptHints: parsed.globalMetadata.receiptHints,
        requiredAgentCapability: inferCapability(task.title),
        confidenceRubricId: "autonomous-loop",
        policyRiskLevel: inferPolicyRisk(`${task.title} ${task.writeScope.map((item) => item.path).join(" ")}`),
        repo: options.repo || null,
        package: options.package || null,
        workspace: options.workspace || null,
        subproject: options.subproject || null,
      },
    });
    const template = inferWorkItemTemplate({ ...item, planText: parsed.title });
    const taskItem = applyTemplateToWorkItem(item, template, options);
    const subtaskItems = expandSteps
      ? createStepSubtaskItems({ parsed, epicId, task, parentItem: taskItem, options })
      : [];
    if (!expandSteps && task.steps.length > 0) {
      taskItem.executionHints.planStepsCollapsed = true;
      taskItem.executionHints.planStepCount = task.steps.length;
      taskItem.executionHints.planSteps = task.steps.map((step) => ({
        number: step.number,
        title: step.title,
        line: step.line,
      }));
      taskItem.verificationHints = uniqueStrings([
        ...(taskItem.verificationHints ?? []),
        `plan-steps-collapsed:${task.steps.length}`,
      ]);
      taskItem.acceptanceCriteria = uniqueStrings([
        ...taskItem.acceptanceCriteria,
        ...task.steps.map((step) => `Complete plan step ${step.number}: ${step.title}`),
      ]);
    }
    if (subtaskItems.length > 0 && !taskItem.blocks.includes(subtaskItems[0].itemId)) {
      taskItem.blocks.push(subtaskItems[0].itemId);
    }
    for (let stepIndex = 0; stepIndex < subtaskItems.length - 1; stepIndex += 1) {
      const current = subtaskItems[stepIndex];
      const next = subtaskItems[stepIndex + 1];
      if (!current.blocks.includes(next.itemId)) current.blocks.push(next.itemId);
      next.blockedBy = uniqueStrings([...(next.blockedBy ?? []), current.itemId]);
    }
    items.push(taskItem, ...subtaskItems);
  }
  return items;
}

function shouldExpandPlanSteps(parsed, options = {}) {
  if (options.expandSteps === true) return true;
  if (options.expandSteps === false || options.collapseSteps === true) return false;
  const taskCount = parsed.tasks.length;
  const stepCount = parsed.tasks.reduce((sum, task) => sum + (task.steps?.length || 0), 0);
  const gateCount = parsed.reviewGates.length;
  const followupCount = parsed.tasks.reduce((sum, task) => sum + (task.followups?.length || 0), 0);
  const projectedChildItems = taskCount + stepCount + gateCount + followupCount;
  const maxChildItems = parsed.globalMetadata?.taskBudgetPolicy?.maxChildItemsPerAtomizationRun;
  if (Number.isInteger(maxChildItems) && projectedChildItems > maxChildItems) return false;
  return true;
}

function createAtomicInventoryItems(parsed, epicId, options = {}) {
  const ownerByAtomicId = new Map();
  for (const task of parsed.tasks) {
    for (const scopeId of task.scopeIds) {
      if (/^A\d{3,}$/i.test(scopeId)) ownerByAtomicId.set(scopeId.toUpperCase(), task);
    }
  }

  const items = parsed.atomicInventory.map((entry) => {
    const ownerTask = ownerByAtomicId.get(entry.id);
    const verificationCommands = ownerTask?.verificationCommands?.length
      ? ownerTask.verificationCommands
      : parsed.planVerificationCommands;
    const item = createWorkItem({
      epicId,
      itemId: `${epicId}-${entry.id.toLowerCase()}`,
      title: `${entry.id}: ${entry.title}`,
      type: inferAtomicWorkItemType(entry.title),
      priority: ownerTask && parsed.criticalPath.includes(ownerTask.ref) ? "critical" : "medium",
      parentId: epicId,
      blocks: [],
      related: [],
      discoveredFrom: {
        type: "atomic-inventory",
        path: parsed.planPath,
        line: entry.line,
        atomicId: entry.id,
        taskRef: ownerTask?.ref ?? null,
      },
      acceptanceCriteria: [
        `${entry.id} is implemented exactly as described in the reviewed Atomic Task Inventory.`,
        "Work item has verification evidence, rollback notes, and runtime receipt evidence before completion.",
      ],
      verificationCommands: [...new Set(verificationCommands)],
      writeScope: ownerTask?.writeScope ?? [],
      requiredGates: uniqueStrings([
        ...parsed.reviewGates.map((gate) => gate.id),
        "atomic-inventory-coverage",
      ]),
      verificationHints: uniqueStrings([
        `atomic:${entry.id}`,
        ownerTask?.ref ? `parent-task:${ownerTask.ref}` : "parent-task:unmapped",
        ...(ownerTask?.stopConditions || []).map((item) => `stop:${item}`),
        ...(ownerTask?.contractRows || []).map((item) => `contract:${item}`),
      ]),
      contractChecklist: uniqueStrings([
        ...(ownerTask?.contractRows || []),
        ...parsed.globalMetadata.contractRows.map((row) => row.id),
      ]),
      scopeSafetyChecklist: parsed.globalMetadata.scopeSafetyChecklist,
      productionReadinessChecklist: parsed.globalMetadata.productionReadinessChecklist,
      tenOfTenChecklist: parsed.globalMetadata.tenOfTenChecklist,
      estimatedSize: "atomic",
      parallelGroup: ownerTask ? parsed.parallelGroups.get(ownerTask.ref) ?? null : null,
      owner: inferCapability(entry.title),
      repo: options.repo || null,
      package: options.package || null,
      workspace: options.workspace || null,
      subproject: options.subproject || null,
      executionHints: {
        sourceTaskRef: entry.id,
        sourceAtomicId: entry.id,
        parentTaskRef: ownerTask?.ref ?? null,
        parentTaskTitle: ownerTask?.title ?? null,
        rollback: ownerTask?.rollback ?? null,
        scopeIds: [entry.id],
        parentScopeIds: ownerTask?.scopeIds ?? [],
        requirementIds: ownerTask?.requirementIds ?? [],
        contractRows: ownerTask?.contractRows ?? [],
        stopConditions: ownerTask?.stopConditions?.length
          ? ownerTask.stopConditions
          : ["policy_stop", "budget_stop", "verification_failed"],
        receiptHints: uniqueStrings([
          ...parsed.globalMetadata.receiptHints,
          "runtime scoped agent receipt required for atomic work item completion",
        ]),
        receiptRequirement: "runtime scoped agent receipt required",
        evidenceExpectation: "verification command output plus scoped agent receipt",
        requiredAgentCapability: inferCapability(entry.title),
        confidenceRubricId: "autonomous-loop",
        policyRiskLevel: inferPolicyRisk(`${entry.title} ${(ownerTask?.writeScope || []).map((item) => item.path).join(" ")}`),
        repo: options.repo || null,
        package: options.package || null,
        workspace: options.workspace || null,
        subproject: options.subproject || null,
      },
    });
    const template = inferWorkItemTemplate({ ...item, planText: parsed.title });
    return applyTemplateToWorkItem(item, template, options);
  });

  applyAtomicOwnerTaskBlocks(items, parsed.tasks);
  return items;
}

function applyAtomicOwnerTaskBlocks(items, tasks) {
  const byParentTask = new Map();
  for (const item of items) {
    const parentTaskRef = item.executionHints?.parentTaskRef || "unmapped";
    byParentTask.set(parentTaskRef, [...(byParentTask.get(parentTaskRef) || []), item]);
  }

  for (const group of byParentTask.values()) {
    for (let index = 0; index < group.length - 1; index += 1) {
      const current = group[index];
      const next = group[index + 1];
      if (!current.blocks.includes(next.itemId)) current.blocks.push(next.itemId);
      next.blockedBy = uniqueStrings([...(next.blockedBy || []), current.itemId]);
    }
  }

  let previousTail = null;
  for (const task of tasks) {
    const group = byParentTask.get(task.ref) || [];
    if (group.length === 0) continue;
    if (previousTail && !previousTail.blocks.includes(group[0].itemId)) {
      previousTail.blocks.push(group[0].itemId);
      group[0].blockedBy = uniqueStrings([...(group[0].blockedBy || []), previousTail.itemId]);
    }
    previousTail = group.at(-1);
  }
}

function createStepSubtaskItems({ parsed, epicId, task, parentItem, options = {} }) {
  return (task.steps || []).map((step) => {
    const stepRef = `${task.ref}.S${step.number}`;
    const item = createWorkItem({
      epicId,
      itemId: `${parentItem.itemId}-s${step.number}`,
      title: step.title,
      type: "subtask",
      priority: parentItem.priority,
      parentId: parentItem.itemId,
      blocks: [],
      blockedBy: [parentItem.itemId],
      related: [parentItem.itemId],
      discoveredFrom: {
        type: "plan-step",
        path: parsed.planPath,
        line: step.line,
        taskRef: task.ref,
        stepNumber: step.number,
        parentItemId: parentItem.itemId,
      },
      acceptanceCriteria: [`Complete step ${step.number}: ${step.title}`],
      verificationCommands: step.verificationCommands.length > 0
        ? [...new Set(step.verificationCommands)]
        : parentItem.verificationCommands.length > 0
          ? parentItem.verificationCommands
          : parsed.planVerificationCommands,
      writeScope: parentItem.writeScope,
      requiredGates: parentItem.requiredGates,
      verificationHints: uniqueStrings([
        ...(parentItem.verificationHints ?? []),
        `parent:${parentItem.itemId}`,
      ]),
      contractChecklist: parentItem.contractChecklist,
      scopeSafetyChecklist: parentItem.scopeSafetyChecklist,
      productionReadinessChecklist: parentItem.productionReadinessChecklist,
      tenOfTenChecklist: parentItem.tenOfTenChecklist,
      estimatedSize: "small",
      parallelGroup: parentItem.parallelGroup,
      repo: options.repo || null,
      package: options.package || null,
      workspace: options.workspace || null,
      subproject: options.subproject || null,
      executionHints: {
        ...(parentItem.executionHints ?? {}),
        sourceTaskRef: stepRef,
        parentTaskRef: task.ref,
        sourceStepNumber: step.number,
        requiredAgentCapability: inferCapability(step.title),
        policyRiskLevel: inferPolicyRisk(`${step.title} ${parentItem.writeScope.map((entry) => entry.path).join(" ")}`),
      },
    });
    const template = inferWorkItemTemplate({ ...item, planText: parsed.title });
    return applyTemplateToWorkItem(item, template, options);
  });
}

function createGateItems(parsed, epicId, childItems) {
  return parsed.reviewGates.map((gate, index) => {
    const previousCandidates = gate.afterTaskRef
      ? childItems.filter((item) => item.executionHints.sourceTaskRef === gate.afterTaskRef || item.executionHints.parentTaskRef === gate.afterTaskRef)
      : [];
    const previous = gate.afterTaskRef
      ? previousCandidates.at(-1)
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
  const byRef = new Map(parsed.tasks.map((task, index) => [
    task.ref,
    childItems.find((item) => item.executionHints.parentTaskRef === task.ref || item.executionHints.sourceTaskRef === task.ref)
      ?? childItems[index],
  ]));
  return parsed.tasks.flatMap((task) => task.followups.map((followup, index) => {
    const parent = byRef.get(task.ref);
    if (!parent) return [];
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
  })).flat();
}

function createWorkItem(item) {
  return {
    ...item,
    status: item.status ?? "open",
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
    taskScore: normalizeScoreField(item.taskScore, "task"),
    reviewerScore: normalizeScoreField(item.reviewerScore, "reviewer"),
    evidenceScore: normalizeScoreField(item.evidenceScore, "evidence"),
    estimatedSize: item.estimatedSize ?? "medium",
    parallelGroup: item.parallelGroup ?? null,
    executionHints: item.executionHints ?? {},
  };
}

function normalizeScoreField(value, kind) {
  const input = value && typeof value === "object" ? value : {};
  const score = Number.isFinite(Number(input.score)) ? Number(input.score) : null;
  return {
    schemaVersion: 1,
    kind,
    score: score === null ? null : Math.max(0, Math.min(10, score)),
    status: input.status || "pending",
    source: input.source || "not-scored",
    updatedAt: input.updatedAt || null,
  };
}

function validateScoreField(value, field, itemId) {
  const issues = [];
  if (!value || typeof value !== "object") {
    issues.push(issue("bad-score-field", itemId, `${itemId} has invalid ${field}.`));
    return issues;
  }
  if (value.schemaVersion !== 1) {
    issues.push(issue("bad-score-schema", itemId, `${itemId} ${field} schemaVersion must be 1.`));
  }
  if (!["task", "reviewer", "evidence"].includes(String(value.kind || ""))) {
    issues.push(issue("bad-score-kind", itemId, `${itemId} ${field} kind is invalid.`));
  }
  if (!(value.score === null || (Number.isFinite(Number(value.score)) && Number(value.score) >= 0 && Number(value.score) <= 10))) {
    issues.push(issue("bad-score-value", itemId, `${itemId} ${field} score must be null or 0..10.`));
  }
  if (!value.status) {
    issues.push(issue("missing-score-status", itemId, `${itemId} ${field} status is required.`));
  }
  return issues;
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

function parsePlanGlobalMetadata(markdown) {
  const deliveryStrategy = sectionBody(markdown, "Delivery Strategy");
  return {
    contractRows: parseContractRows(sectionBody(markdown, "Development Contract Map")),
    scopeSafetyChecklist: checklistFromSection(sectionBody(markdown, "Scope Safety Gate")),
    productionReadinessChecklist: checklistFromSection(sectionBody(markdown, "Production Readiness")),
    tenOfTenChecklist: checklistFromSection(sectionBody(markdown, "Final 10/10 Acceptance Gate")),
    receiptHints: collectReceiptHints(markdown),
    deliveryStrategy,
    taskBudgetPolicy: parseTaskBudgetPolicyFromText(deliveryStrategy),
  };
}

function parseAtomicTaskInventory(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const items = [];
  let inSection = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+Atomic Task Inventory\s*$/i.test(line.trim())) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line.trim())) break;
    if (!inSection) continue;
    const match = /^\|\s*(A\d{3,})\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (!match) continue;
    items.push({
      id: match[1].trim().toUpperCase(),
      title: match[2].trim(),
      line: index + 1,
    });
  }
  return items;
}

function parseContractRows(body) {
  return String(body ?? "")
    .split(/\r?\n/)
    .map((line) => /^\|\s*(C-[A-Z0-9_-]+)\s*\|\s*([^|]+)\|/.exec(line))
    .filter(Boolean)
    .map((match) => ({
      id: match[1].trim(),
      label: match[2].trim(),
    }));
}

function checklistFromSection(body) {
  return uniqueStrings(
    String(body ?? "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*]\s+(?:\[[ xX]\]\s*)?/, "").trim())
      .filter((line) => line && !line.startsWith("|") && !/^[-:]+$/.test(line))
      .map((line) => safeInline(line, 180)),
  );
}

function collectReceiptHints(markdown) {
  const hints = [];
  for (const line of String(markdown ?? "").split(/\r?\n/)) {
    if (/\breceipt\b/i.test(line)) hints.push(safeInline(line.replace(/^\s*[-*]\s+/, ""), 180));
  }
  return uniqueStrings(hints);
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

function sectionBody(markdown, section) {
  const re = new RegExp(`^##\\s+${escapeRegex(section)}\\s*$`, "im");
  const match = re.exec(String(markdown ?? ""));
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = String(markdown ?? "").slice(start);
  const next = /^##\s+/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function createParsedTask({ ref, title, line, planPath }) {
  return {
    ref,
    title,
    line,
    planPath,
    scopeIds: [],
    requirementIds: [],
    contractRows: [],
    stopConditions: [],
    dependencies: [],
    acceptanceCriteria: [],
    verificationCommands: [],
    writeScope: [],
    estimatedSize: "medium",
    rollback: null,
    followups: [],
    steps: [],
    activeStepIndex: null,
  };
}

function taskItemId(epicId, taskRef, title) {
  const normalizedRef = normalizeTaskRef(taskRef, 0).toLowerCase();
  return `${epicId}-${normalizedRef || stableHash(title)}`;
}

function createEpicId(title, planPath) {
  return `epic-${slug(title)}-${stableHash(planPath).slice(0, 6)}`;
}

function createDependencyEdges(items = []) {
  const edges = [];
  const add = (from, to, type) => {
    if (!from || !to) return;
    edges.push({ from, to, type });
  };
  for (const item of items) {
    if (item.parentId) add(item.parentId, item.itemId, "parent-child");
    for (const blocked of item.blocks || []) add(item.itemId, blocked, "blocks");
    for (const related of item.related || []) add(item.itemId, related, "related");
    if (item.discoveredFrom?.itemId) add(item.discoveredFrom.itemId, item.itemId, "discovered-from");
  }
  const seen = new Set();
  return edges.filter((edge) => {
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findByTaskRef(items, taskRef) {
  const normalized = normalizeTaskRef(taskRef, 0);
  return items.find((item) => item.executionHints.sourceTaskRef === normalized || item.itemId.endsWith(`-${normalized.toLowerCase()}`));
}

function normalizeTaskRef(value, fallbackIndex) {
  const raw = String(value ?? "").trim();
  const number = /(?:Task\s*)?T?([A-Za-z]?\d+[A-Za-z]?)/i.exec(raw)?.[1];
  if (number) return `T${number.replace(/^T/i, "").toUpperCase()}`;
  return fallbackIndex > 0 ? `T${fallbackIndex}` : "";
}

function priorityForTask(task, criticalPath, index) {
  if (criticalPath.includes(task.ref)) return "critical";
  if (index === 0) return "high";
  return "medium";
}

function inferWorkItemType(title) {
  const text = String(title).toLowerCase();
  if (/\b(review|audit)\b/.test(text)) return "review";
  if (/\b(bug|fix)\b/.test(text)) return "bug";
  if (/\b(doc|docs|changelog|readme)\b/.test(text)) return "chore";
  if (/\bgate\b/.test(text)) return "gate";
  return "task";
}

function inferAtomicWorkItemType(title) {
  const text = String(title).toLowerCase();
  if (/\b(bug|fix)\b/.test(text)) return "bug";
  if (/\b(doc|docs|changelog|readme)\b/.test(text)) return "chore";
  return "task";
}

function categoryForWorkItemType(type) {
  if (type === "review" || type === "gate") return "review";
  if (type === "bug") return "debugging";
  if (type === "chore") return "documentation";
  if (type === "subtask") return "implementation";
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
  const sourcePlanSnapshot = serializable.metadata?.sourcePlanSnapshot;
  if (sourcePlanSnapshot?.content != null) {
    const { content, ...compactSnapshot } = sourcePlanSnapshot;
    return {
      ...serializable,
      metadata: {
        ...serializable.metadata,
        sourcePlanSnapshot: {
          ...compactSnapshot,
          contentLength: Buffer.byteLength(String(content), "utf8"),
        },
      },
    };
  }
  return serializable;
}

function createSourcePlanSnapshot(markdown, planPath, options = {}) {
  const content = String(markdown ?? "");
  return {
    path: normalizePath(planPath),
    sha256: createHash("sha256").update(content).digest("hex"),
    storedPath: normalizePath(options.sourcePlanSnapshotPath || "source-plan.md"),
    capturedAt: options.capturedAt || new Date().toISOString(),
    content,
  };
}

function normalizePath(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

function splitInlineList(value) {
  return uniqueStrings(
    String(value ?? "")
      .split(/[,;]/)
      .map((item) => item.replace(/`/g, "").trim())
      .filter(Boolean),
  );
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueStrings(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function safeInline(value, maxLength = 120) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function issue(code, itemId, message, extra = {}) {
  return { code, itemId, message, ...extra };
}
