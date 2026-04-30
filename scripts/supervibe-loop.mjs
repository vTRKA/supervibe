#!/usr/bin/env node
import { access, mkdir, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runAutonomousLoop, resumeAutonomousLoop, stopAutonomousLoop } from "./lib/autonomous-loop-runner.mjs";
import { createTasksFromRequest, loadPlanTasks } from "./lib/autonomous-loop-task-source.mjs";
import { buildPreflight } from "./lib/autonomous-loop-preflight-intake.mjs";
import { dispatchTask } from "./lib/autonomous-loop-dispatcher.mjs";
import { generateContracts, scoreAutonomyReadiness } from "./lib/autonomous-loop-contracts.mjs";
import { exportGraph, loadStateForGraphExport } from "./lib/autonomous-loop-graph-export.mjs";
import { formatDoctorReport, primeLoopRun, repairLoopRun } from "./lib/autonomous-loop-doctor.mjs";
import { archiveLoopRun, exportLoopBundle, importLoopBundle } from "./lib/autonomous-loop-archive.mjs";
import { atomizePlanFile, createWorkItemPreview, writeWorkItemGraph } from "./lib/supervibe-plan-to-work-items.mjs";
import { createMemoryTaskTrackerAdapter, createUnavailableTaskTrackerAdapter } from "./lib/supervibe-durable-task-tracker-adapter.mjs";
import { formatTaskTrackerDoctorReport, repairTaskTracker } from "./lib/supervibe-task-tracker-doctor.mjs";
import { defaultTrackerMappingPath, materializeEpicAndTasks, readTrackerMapping, syncPull } from "./lib/supervibe-task-tracker-sync.mjs";
import { createWorkItemIndex, groupWorkItemsByStatus } from "./lib/supervibe-work-item-query.mjs";
import { defaultWorkItemDaemonPath, createWorkItemWatchRecord, formatWorkItemWatchStatus, readWorkItemDaemonState, stopWorkItemWatch, upsertWorkItemWatch, writeWorkItemDaemonState } from "./lib/supervibe-work-item-daemon.mjs";
import { defaultDelegatedInboxPath, formatDelegatedInbox, readDelegatedInbox } from "./lib/supervibe-work-item-message-delegation.mjs";
import { formatImportPreview, importWorkItemsFromFile } from "./lib/supervibe-work-item-migration-importer.mjs";
import { formatPriorityExplanation, orderReadyWorkItems } from "./lib/supervibe-work-item-priority-formula.mjs";
import { createOnboardingReport, createQuickstartPlan, formatOnboarding, formatQuickstart, generateShellCompletions } from "./lib/supervibe-shell-completions.mjs";
import { createFederatedSyncBundle, importFederatedSyncBundle, writeFederatedSyncBundle } from "./lib/supervibe-federated-sync-bundle.mjs";
import { formatNotificationRouteResult, routeNotificationEvent } from "./lib/supervibe-notification-router.mjs";
import { deferWorkItemFile } from "./lib/supervibe-work-item-scheduler.mjs";
import { createGuidedWorkItemDraft, importGuidedWorkItemFromText, saveGuidedWorkItemDraft } from "./lib/supervibe-guided-work-item-forms.mjs";
import { createDryRunPreview, runInteractiveCli } from "./lib/supervibe-interactive-cli.mjs";
import { formatEvalHarnessReport, runAutonomousLoopEvals } from "./lib/autonomous-loop-eval-harness.mjs";
import { defaultApprovalReceiptLedgerPath, formatApprovalReceiptSummary, readApprovalReceipts } from "./lib/supervibe-approval-receipt-ledger.mjs";
import { detectPolicyConfigDrift, fixDerivedPolicyDefaults, formatPolicyDriftReport } from "./lib/supervibe-config-drift-detector.mjs";
import { loadPolicyProfile } from "./lib/supervibe-policy-profile-manager.mjs";
import { detectAnchorDrift, fixDerivedAnchorIndex, formatAnchorDriftReport, readDerivedAnchorIndex } from "./lib/supervibe-anchor-drift-detector.mjs";
import { appendChangeSummary, defaultChangeSummaryPath, formatChangeSummaryReport, readChangeSummaries } from "./lib/supervibe-change-summary-index.mjs";
import { buildSemanticAnchorIndex, formatSemanticAnchorReport, parseSemanticAnchors } from "./lib/supervibe-semantic-anchor-index.mjs";
import { formatAssignmentExplanation } from "./lib/supervibe-assignment-explainer.mjs";
import { buildExecutionWaves, formatWaveStatus } from "./lib/supervibe-wave-controller.mjs";
import { PRESET_NAMES, formatPresetSummary, selectWorkerPreset } from "./lib/supervibe-worker-reviewer-presets.mjs";
import {
  createWorktreeSessionRecord,
  defaultWorktreeRegistryPath,
  formatWorktreeSessionStatus,
  readWorktreeSessionRegistry,
  selectWorktreeDirectory,
  upsertWorktreeSession,
  upsertWorktreeSessionFile,
  validateExistingWorktree,
} from "./lib/supervibe-worktree-session-manager.mjs";

function parseArgs(argv) {
  const args = { _: [] };
  const booleanArgs = new Set([
    "dry-run",
    "guided",
    "manual",
    "fresh-context",
    "status",
    "readiness",
    "json",
    "commit-per-task",
    "graph",
    "doctor",
    "prime",
    "archive",
    "export",
    "import",
    "fix",
    "help",
    "atomize",
    "create-epic",
    "plan-review-passed",
    "reviewed",
    "worktree",
    "worktree-status",
    "watch",
    "quickstart",
    "onboard",
    "priority",
    "inbox",
    "tracker-sync-push",
    "tracker-sync-pull",
    "tracker-doctor",
    "interactive",
    "preview",
    "yes",
    "create-work-item",
    "eval",
    "eval-live",
    "approval-receipts",
    "policy-doctor",
    "fix-derived",
    "anchors",
    "anchor-doctor",
    "summarize-changes",
    "speculative",
    "assign-ready",
    "explain",
    "setup-worker-presets",
    "allow-session-conflict",
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "from-plan") {
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        args[key] = argv[i + 1];
        i += 1;
      } else {
        args[key] = true;
      }
    } else if (booleanArgs.has(key)) {
      args[key] = true;
    } else {
      args[key] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();

  if (args.help) {
    printHelp();
    return;
  }

  if (args.interactive) {
    const result = runInteractiveCli({
      mode: "loop",
      planPath: args["atomize-plan"] || args.plan || null,
      graphPath: args.file || ".claude/memory/work-items/<epic-id>/graph.json",
      selectedAction: args["create-work-item"] ? "create-work-item" : null,
      isTTY: process.stdin.isTTY && process.stdout.isTTY,
      confirmed: Boolean(args.yes),
      yes: Boolean(args.yes),
    });
    console.log(result.output);
    if (!result.ok) process.exitCode = result.exitCode;
    return;
  }

  if (args.eval || args["eval-live"]) {
    const report = await runAutonomousLoopEvals({
      rootDir,
      caseId: args.case || null,
      replayDir: args.replay ? resolve(rootDir, args.replay) : null,
      live: Boolean(args["eval-live"]),
      maxRuntimeMinutes: args["max-runtime-minutes"],
      maxIterations: args["max-iterations"],
      providerBudget: args["provider-budget"],
      writeReportPath: args.out || "docs/audits/autonomous-loop-evals/latest-report.json",
    });
    console.log(formatEvalHarnessReport(report));
    if (!report.pass) process.exitCode = report.blocked ? 2 : 1;
    return;
  }

  if (args["approval-receipts"]) {
    const receipts = await readApprovalReceipts(args.file || defaultApprovalReceiptLedgerPath(rootDir));
    console.log(formatApprovalReceiptSummary(receipts));
    return;
  }

  if (args["policy-doctor"]) {
    const drift = await detectPolicyConfigDrift({ rootDir });
    console.log(formatPolicyDriftReport(drift));
    if (args["fix-derived"]) {
      const fix = await fixDerivedPolicyDefaults({
        rootDir,
        derivedDefaults: {
          profile: args["policy-profile"] || "guided",
          deniedTools: ["provider-permission-bypass", "raw-secret-storage"],
          allowedTools: ["read", "status", "tests"],
        },
      });
      console.log(`FIX_DERIVED: changed=${fix.changed} file=${fix.outPath} backup=${fix.backupPath}`);
    }
    if (!drift.ok && !args["fix-derived"]) process.exitCode = 1;
    return;
  }

  if (args.anchors) {
    const anchors = args.file
      ? parseSemanticAnchors(await readFile(resolve(rootDir, args.file), "utf8"), { filePath: args.file })
      : (await buildSemanticAnchorIndex({ rootDir, files: [], sidecarPaths: [] })).anchors;
    console.log(formatSemanticAnchorReport({ anchors }));
    return;
  }

  if (args["anchor-doctor"]) {
    const indexPath = args.file || join(rootDir, ".claude", "memory", "anchors", "semantic-anchor-index.json");
    const index = await readDerivedAnchorIndex(indexPath);
    const drift = detectAnchorDrift({ anchors: index.anchors || [] });
    console.log(formatAnchorDriftReport(drift));
    if (args["fix-derived"]) {
      const fix = await fixDerivedAnchorIndex({ rootDir, anchors: index.anchors || [] });
      console.log(`FIX_DERIVED: changed=${fix.changed} file=${fix.outPath} backup=${fix.backupPath}`);
    }
    if (!drift.ok && !args["fix-derived"]) process.exitCode = 1;
    return;
  }

  if (args["summarize-changes"]) {
    const ledgerPath = args.out || defaultChangeSummaryPath(rootDir);
    if (args.task && args.file) {
      const summary = await appendChangeSummary(ledgerPath, {
        taskId: args.task,
        filePath: args.file,
        summary: args.summary || args.request || "Task changed file",
        why: args.why || "summarized by /supervibe-loop",
        evidenceRefs: args.evidence ? String(args.evidence).split(",") : [],
        verificationRefs: args.verification ? String(args.verification).split(",") : [],
        commit: args.commit || null,
        accepted: !args.speculative,
        speculative: Boolean(args.speculative),
      });
      console.log(`SUPERVIBE_CHANGE_SUMMARY\nSUMMARY: ${summary.summaryId}\nFILE: ${summary.filePath}\nLEDGER: ${ledgerPath}`);
      return;
    }
    console.log(formatChangeSummaryReport(await readChangeSummaries(ledgerPath)));
    return;
  }

  if (args["setup-worker-presets"]) {
    console.log("SUPERVIBE_WORKER_REVIEWER_PRESETS");
    console.log(`PRESETS: ${PRESET_NAMES.join(",")}`);
    console.log(formatPresetSummary(selectWorkerPreset({ category: "implementation" })));
    return;
  }

  if (args["plan-waves"]) {
    const tasks = await loadPlanTasks(resolve(rootDir, args["plan-waves"]));
    const plan = buildExecutionWaves({ tasks, maxConcurrency: args["max-concurrency"] || 3 });
    console.log(formatWaveStatus(plan));
    return;
  }

  if (args["assign-ready"]) {
    const state = args.file ? JSON.parse(await readFile(resolve(rootDir, args.file), "utf8")) : { tasks: [] };
    const tasks = (state.tasks || []).filter((task) => ["open", "ready", "pending"].includes(task.status || "open"));
    const dispatches = tasks.map((task) => dispatchTask(task, { useCapabilityRegistry: true }));
    if (args.json) console.log(JSON.stringify(dispatches, null, 2));
    else {
      console.log("SUPERVIBE_ASSIGN_READY");
      for (const dispatch of dispatches) {
        console.log(args.explain ? formatAssignmentExplanation(dispatch.assignmentExplanation) : `${dispatch.taskId}: ${dispatch.primaryAgentId} -> ${dispatch.reviewerAgentId}`);
      }
    }
    return;
  }

  if (args.completion) {
    console.log(generateShellCompletions({ shell: args.completion }));
    return;
  }

  if (args.quickstart) {
    const plan = createQuickstartPlan({ rootDir });
    for (const dir of plan.directories) await mkdir(join(rootDir, dir), { recursive: true });
    console.log(formatQuickstart(plan));
    return;
  }

  if (args.onboard) {
    const report = createOnboardingReport({
      rootDir,
      hasWorkItems: await pathExists(join(rootDir, ".claude", "memory", "work-items")),
      hasLoopState: await pathExists(join(rootDir, ".claude", "memory", "loops")),
      hasTrackerMapping: await pathExists(join(rootDir, ".claude", "memory", "loops", "task-tracker-map.json")),
    });
    console.log(formatOnboarding(report));
    return;
  }

  if (args["stop-watch"]) {
    const daemonPath = args.file || defaultWorkItemDaemonPath(rootDir);
    const state = await readWorkItemDaemonState(daemonPath);
    const stopped = stopWorkItemWatch(state, args["stop-watch"]);
    await writeWorkItemDaemonState(daemonPath, stopped);
    console.log(formatWorkItemWatchStatus(stopped));
    return;
  }

  if (args.inbox) {
    const inbox = await readDelegatedInbox(args.file || defaultDelegatedInboxPath(rootDir));
    console.log(formatDelegatedInbox(inbox));
    return;
  }

  if (args["import-tasks"]) {
    const result = await importWorkItemsFromFile(resolve(rootDir, args["import-tasks"]), { epicId: args.epic });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatImportPreview(result));
    return;
  }

  if (args.priority) {
    const graphPath = args.file || args.priority;
    const graph = JSON.parse(await readFile(resolve(rootDir, graphPath), "utf8"));
    const index = createWorkItemIndex({ graph });
    const ready = index.filter((item) => item.type !== "epic" && item.effectiveStatus === "ready");
    const ordered = orderReadyWorkItems(ready, { graph });
    console.log("SUPERVIBE_WORK_ITEM_PRIORITY");
    for (const item of ordered) console.log(formatPriorityExplanation(item));
    return;
  }

  if (args["create-work-item"]) {
    const draft = args.input
      ? importGuidedWorkItemFromText(await readFile(resolve(rootDir, args.input), "utf8"))
      : createGuidedWorkItemDraft({
        formType: args.template || args.type || "task",
        title: args.title || args.request || "Draft work item",
        owner: args.owner,
        priority: args.priority,
        labels: args.labels,
        acceptanceCriteria: args.acceptance || args["acceptance-criteria"],
        verificationHints: args.verification || args["verification-hints"],
        dependencies: args.dependencies,
        dueAt: args.until || args.due,
        risk: args.risk,
      });
    if (args.out) await saveGuidedWorkItemDraft(resolve(rootDir, args.out), draft);
    if (args.json) console.log(JSON.stringify(draft, null, 2));
    else console.log(draft.preview);
    if (args.out) console.log(`DRAFT: ${resolve(rootDir, args.out)}`);
    return;
  }

  if (args.defer) {
    const graphPath = args.file
      ? resolve(rootDir, args.file)
      : await findGraphContainingItem(rootDir, args.defer);
    const result = await deferWorkItemFile(graphPath, {
      itemId: args.defer,
      until: args.until,
      condition: args.condition || "timestamp",
      reason: args.reason || "deferred by /supervibe-loop",
      actor: args.actor || "user",
      dryRun: Boolean(args["dry-run"] || args.preview),
    });
    if (args.preview) {
      console.log(createDryRunPreview({
        action: "defer",
        before: { itemId: args.defer },
        after: result.deferred,
        risk: "low",
        command: `/supervibe-loop --defer ${args.defer} --until ${args.until} --file ${graphPath}`,
      }).output);
    }
    console.log("SUPERVIBE_WORK_ITEM_DEFER");
    console.log(`ITEM: ${result.itemId}`);
    console.log(`UNTIL: ${result.deferred.until || "manual"}`);
    console.log(`CONDITION: ${result.deferred.condition}`);
    console.log(`DRY_RUN: ${result.dryRun}`);
    console.log(`GRAPH: ${graphPath}`);
    if (result.backupPath) console.log(`BACKUP: ${result.backupPath}`);
    return;
  }

  if (args.watch) {
    const graph = args.file ? JSON.parse(await readFile(resolve(rootDir, args.file), "utf8")) : { items: [], tasks: [] };
    const index = createWorkItemIndex({ graph });
    const grouped = groupWorkItemsByStatus(index);
    const inbox = await readDelegatedInbox(defaultDelegatedInboxPath(rootDir));
    const record = createWorkItemWatchRecord({
      runId: args.loop || null,
      epicId: args.epic || graph.epicId || null,
      worktree: args.worktree || null,
      snapshot: {
        ready: grouped.ready.length,
        blocked: grouped.blocked.length,
        claimed: grouped.claimed.length,
        delegated: inbox.filter((message) => message.status === "open").length,
        review: grouped.review.length,
        done: grouped.done.length,
      },
    });
    const daemonPath = args.out || defaultWorkItemDaemonPath(rootDir);
    const state = await readWorkItemDaemonState(daemonPath);
    const next = upsertWorkItemWatch(state, record);
    await writeWorkItemDaemonState(daemonPath, next);
    console.log(formatWorkItemWatchStatus(next));
    return;
  }

  if (args["export-sync-bundle"]) {
    const runDir = resolve(rootDir, args["export-sync-bundle"]);
    const state = JSON.parse(await readFile(join(runDir, "state.json"), "utf8"));
    const packageJson = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));
    let mapping = {};
    try {
      mapping = await readTrackerMapping(defaultTrackerMappingPath(rootDir));
    } catch {
      mapping = {};
    }
    const bundle = createFederatedSyncBundle({
      graph: state.task_graph || { tasks: state.tasks || [] },
      status: state,
      comments: [],
      evidence: state.evidence || [],
      mapping,
      packageVersion: packageJson.version,
      sourceRoot: rootDir,
    });
    const outDir = resolve(rootDir, args.out || join(runDir, "sync-bundle"));
    const result = await writeFederatedSyncBundle(bundle, outDir);
    console.log("SUPERVIBE_SYNC_BUNDLE_EXPORT");
    console.log(`DIR: ${result.outDir}`);
    console.log(`FILES: ${result.files.length}`);
    return;
  }

  if (args["import-sync-bundle"]) {
    const result = await importFederatedSyncBundle(resolve(rootDir, args["import-sync-bundle"]), {
      dryRun: Boolean(args["dry-run"]),
      expectedPackageVersion: JSON.parse(await readFile(join(rootDir, "package.json"), "utf8")).version,
    });
    console.log("SUPERVIBE_SYNC_BUNDLE_IMPORT");
    console.log(`OK: ${result.ok}`);
    console.log(`DRY_RUN: ${result.dryRun}`);
    console.log(`REMOTE_MUTATION: ${result.remoteMutation}`);
    console.log(`CONFLICTS: ${result.conflictReport.summary}`);
    if (result.validation.issues.length) console.log(`ISSUES: ${result.validation.issues.map((issue) => issue.code).join(",")}`);
    return;
  }

  if (args.status) {
    if (args.epic && !args.file) {
      const graphPath = join(rootDir, ".claude", "memory", "work-items", args.epic, "graph.json");
      try {
        const graph = JSON.parse(await readFile(graphPath, "utf8"));
        const grouped = groupWorkItemsByStatus(createWorkItemIndex({ graph }));
        console.log("SUPERVIBE_EPIC_STATUS");
        console.log(`EPIC: ${args.epic}`);
        console.log(`READY: ${grouped.ready.length}`);
        console.log(`BLOCKED: ${grouped.blocked.length}`);
        console.log(`CLAIMED: ${grouped.claimed.length}`);
        console.log(`REVIEW: ${grouped.review.length}`);
        console.log(`DONE: ${grouped.done.length}`);
        console.log(`GRAPH: ${graphPath}`);
        return;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        console.log("SUPERVIBE_EPIC_STATUS");
        console.log(`EPIC: ${args.epic}`);
        console.log("STATUS: missing graph");
        console.log(`NEXT_ACTION: run /supervibe-loop --atomize-plan docs/plans/example.md --plan-review-passed`);
        return;
      }
    }
    const stateFile = args.file || join(rootDir, ".claude", "memory", "loops", args.loop || "", "state.json");
    const result = await runAutonomousLoop({ rootDir, statusFile: stateFile });
    console.log(result.statusText);
    return;
  }

  if (args.graph || args._[0] === "graph") {
    const stateFile = args.file || join(rootDir, ".claude", "memory", "loops", args.loop || "", "state.json");
    const state = await loadStateForGraphExport(resolve(rootDir, stateFile));
    process.stdout.write(exportGraph(state, { format: args.format || "text" }));
    return;
  }

  if (args.doctor || args._[0] === "doctor") {
    const target = args.file || join(rootDir, ".claude", "memory", "loops", args.loop || "", "state.json");
    if (args.fix) {
      const result = await repairLoopRun(resolve(rootDir, target), { fix: true });
      console.log(`SUPERVIBE_LOOP_REPAIR\nCHANGED: ${result.changed}\nBACKUP: ${result.backupPath}`);
    } else {
      console.log(await formatDoctorReport(resolve(rootDir, target)));
    }
    return;
  }

  if (args.prime || args._[0] === "prime") {
    const target = args.file || join(rootDir, ".claude", "memory", "loops", args.loop || "", "state.json");
    console.log(await primeLoopRun(resolve(rootDir, target)));
    return;
  }

  if (args.archive || args._[0] === "archive") {
    const target = args.file || join(rootDir, ".claude", "memory", "loops", args.loop || "");
    const result = await archiveLoopRun(resolve(rootDir, target), { archiveRoot: args.out, label: args.label });
    console.log(`SUPERVIBE_LOOP_ARCHIVE\nBUNDLE: ${result.bundleDir}\nRUN_ID: ${result.runId}`);
    return;
  }

  if (args.export || args._[0] === "export") {
    const target = args.file || join(rootDir, ".claude", "memory", "loops", args.loop || "");
    const result = await exportLoopBundle(resolve(rootDir, target), { outDir: args.out });
    console.log(`SUPERVIBE_LOOP_EXPORT\nBUNDLE: ${result.bundleDir}\nRUN_ID: ${result.runId}`);
    return;
  }

  if (args.import || args._[0] === "import") {
    const target = args.file || args.bundle || args._[1];
    if (!target) throw new Error("import requires --file <bundle-dir>");
    const result = await importLoopBundle(resolve(rootDir, target), { targetRoot: args.out || rootDir });
    console.log(`SUPERVIBE_LOOP_IMPORT\nTARGET: ${result.targetDir}\nRUN_ID: ${result.runId}`);
    return;
  }

  if (args["worktree-status"]) {
    const registry = await readWorktreeSessionRegistry(args.file || defaultWorktreeRegistryPath(rootDir));
    console.log(formatWorktreeSessionStatus(registry));
    return;
  }

  if (args["tracker-sync-push"] || args["tracker-sync-pull"] || args["tracker-doctor"]) {
    const graphPath = args.file || args["work-item-graph"] || args._[0];
    if (!graphPath) throw new Error("tracker command requires --file <work-item-graph.json>");
    const graph = JSON.parse(await readFile(resolve(rootDir, graphPath), "utf8"));
    const mappingPath = args["mapping-file"] ? resolve(rootDir, args["mapping-file"]) : defaultTrackerMappingPath(rootDir);
    const adapter = args.tracker === "memory"
      ? createMemoryTaskTrackerAdapter()
      : createUnavailableTaskTrackerAdapter("no external tracker selected; use --tracker memory for local smoke tests");

    if (args["tracker-sync-push"]) {
      const result = await materializeEpicAndTasks(graph, adapter, { rootDir, mappingPath, dryRun: Boolean(args["dry-run"]) });
      console.log("SUPERVIBE_TRACKER_SYNC_PUSH");
      console.log(`STATUS: ${result.status}`);
      console.log(`MAPPING: ${mappingPath}`);
      console.log(`NATIVE_GRAPH_PRESERVED: ${result.nativeGraphPreserved}`);
      return;
    }

    if (args["tracker-sync-pull"]) {
      const mapping = await readTrackerMapping(mappingPath);
      const result = await syncPull(adapter, mapping);
      console.log("SUPERVIBE_TRACKER_SYNC_PULL");
      console.log(`STATUS: ${result.status}`);
      console.log(`MAPPING: ${mappingPath}`);
      return;
    }

    const result = await repairTaskTracker({ graph, mappingPath, fix: Boolean(args.fix) });
    console.log(formatTaskTrackerDoctorReport(result.diagnosis));
    if (result.changed) console.log(`BACKUP: ${result.backupPath}`);
    return;
  }

  if (args["atomize-plan"] || args.atomize || args["create-epic"]) {
    const planPath = args["atomize-plan"]
      || (typeof args["from-plan"] === "string" ? args["from-plan"] : null)
      || args.plan
      || args._[0];
    if (!planPath) throw new Error("atomize requires --atomize-plan <plan-path> or --from-plan <plan-path>");
    const reviewed = Boolean(args["plan-review-passed"] || args.reviewed || args["dry-run"] || args.preview);
    if (!reviewed) {
      throw new Error("Atomization writes require --plan-review-passed. Use --dry-run for a preview before the review gate passes.");
    }
    const graph = await atomizePlanFile(resolve(rootDir, planPath), {
      planPath,
      epicId: args.epic,
      dryRun: Boolean(args["dry-run"] || args.preview),
      planReviewPassed: Boolean(args["plan-review-passed"] || args.reviewed),
    });
    if (args.json) {
      console.log(JSON.stringify(graph, null, 2));
      return;
    }
    if (args["dry-run"] || args.preview) {
      console.log(createWorkItemPreview(graph, graph.validation));
      if (args.preview) console.log("PREVIEW: true");
      console.log("DRY_RUN: true");
      return;
    }
    const writeResult = await writeWorkItemGraph(graph, { rootDir, outDir: args.out });
    console.log("SUPERVIBE_WORK_ITEMS");
    console.log(`EPIC: ${graph.epicId}`);
    console.log(`GRAPH: ${writeResult.graphPath}`);
    console.log(`PREVIEW: ${writeResult.previewPath}`);
    console.log(`VALID: ${graph.validation.valid}`);
    return;
  }

  if (args.readiness) {
    const positionalRequest = args.request || args._.join(" ");
    const sourcePlan = args.plan || args["from-prd"];
    const tasks = sourcePlan
      ? await loadPlanTasks(resolve(rootDir, sourcePlan))
      : createTasksFromRequest(positionalRequest || "validate integrations");
    const preflight = buildPreflight({
      request: positionalRequest || sourcePlan || "",
      tasks,
      options: {
        ...args,
        executionMode: deriveExecutionMode(args),
        commitPerTask: Boolean(args["commit-per-task"]),
        policyProfile: await maybeLoadPolicyProfile(rootDir, args),
      },
    });
    const contracts = generateContracts(tasks);
    const readiness = scoreAutonomyReadiness({ tasks, contracts, preflight });
    if (args.json) {
      console.log(JSON.stringify({ readiness, contracts, toolAdapters: preflight.tool_adapters }, null, 2));
    } else {
      console.log("SUPERVIBE_LOOP_READINESS");
      console.log(`SCORE: ${readiness.score}/10`);
      console.log(`PASS: ${readiness.pass}`);
      console.log(`MISSING: ${readiness.missing.join(", ") || "none"}`);
      console.log(`EXECUTION_MODE: ${preflight.execution_policy.mode}`);
      console.log(`ADAPTERS: ${preflight.tool_adapter_summary.available.join(",") || "none"}`);
      console.log(`NEXT_ACTION: ${readiness.pass ? "ready_for_safe_execution" : readiness.remediation[0]}`);
    }
    return;
  }

  if (args.resume) {
    const result = await resumeAutonomousLoop(resolve(rootDir, args.resume));
    console.log(`Resume status: ${result.status}`);
    return;
  }

  if (args.stop) {
    const stateFile = args.file || join(rootDir, ".claude", "memory", "loops", args.stop, "state.json");
    const state = await stopAutonomousLoop(stateFile);
    console.log(`Stopped ${state.run_id}: ${state.stop_reason}`);
    return;
  }

  const positionalRequest = args.request || args._.join(" ");
  const sourcePlan = args.plan || args["from-prd"];
  const worktreeSession = await maybePrepareWorktreeSession(args, rootDir);
  const policyProfile = await maybeLoadPolicyProfile(rootDir, args);
  const result = await runAutonomousLoop({
    rootDir,
    plan: sourcePlan,
    request: sourcePlan ? positionalRequest || undefined : positionalRequest || "validate integrations",
    dryRun: Boolean(args["dry-run"]),
    fixture: args.fixture,
    maxLoops: args["max-loops"],
    maxRuntimeMinutes: args["max-runtime-minutes"],
    environmentTarget: args.environment,
    executionMode: deriveExecutionMode(args),
    commitPerTask: Boolean(args["commit-per-task"]),
    adapterId: args.tool,
    worktreeSession,
    policyProfile,
  });

  console.log("SUPERVIBE_LOOP_STATUS");
  console.log(`STATUS: ${result.status}`);
  console.log(`RUN_ID: ${result.runId}`);
  console.log(`CONFIDENCE: ${result.finalScore}`);
  console.log(`STOP_REASON: ${result.stopReason || "none"}`);
  console.log(`REPORT: ${result.reportPath}`);
  if (policyProfile) console.log(`POLICY_PROFILE: ${policyProfile.name}`);
  if (args.notify) {
    const notification = routeNotificationEvent({
      class: result.status === "COMPLETE" ? "run-completed" : "run-failed",
      runId: result.runId,
      message: `Autonomous loop ${result.status}`,
      nextSafeAction: result.status === "COMPLETE" ? "review final report" : "inspect blockers",
    }, {
      routes: args.notify,
      webhookUrl: args.webhook,
      webhookAllowlist: args["webhook-allowlist"] ? String(args["webhook-allowlist"]).split(",") : [],
    });
    console.log(formatNotificationRouteResult(notification));
  }
}

async function maybeLoadPolicyProfile(rootDir, args) {
  if (!args["policy-profile"]) return null;
  return loadPolicyProfile({
    rootDir,
    profileName: args["policy-profile"],
    filePath: args["policy-file"] || null,
  });
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findGraphContainingItem(rootDir, itemId) {
  const base = join(rootDir, ".claude", "memory", "work-items");
  const candidates = [];
  async function walk(dir, depth = 0) {
    if (depth > 3) return;
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.name === "graph.json") candidates.push(full);
    }
  }
  await walk(base);
  for (const candidate of candidates) {
    try {
      const graph = JSON.parse(await readFile(candidate, "utf8"));
      const ids = [...(graph.items || []), ...(graph.tasks || [])].map((entry) => entry.itemId || entry.id);
      if (ids.includes(itemId)) return candidate;
    } catch {
      // Ignore malformed graph files during discovery; explicit --file can surface them.
    }
  }
  throw new Error(`Could not find graph containing ${itemId}; pass --file <graph.json>`);
}

async function maybePrepareWorktreeSession(args, rootDir) {
  if (!args.worktree && !args["worktree-existing"] && !args["resume-session"]) return null;
  const registryPath = defaultWorktreeRegistryPath(rootDir);

  if (args["resume-session"]) {
    const registry = await readWorktreeSessionRegistry(registryPath);
    const session = registry.sessions.find((candidate) => candidate.sessionId === args["resume-session"]);
    if (!session) throw new Error(`Unknown worktree session: ${args["resume-session"]}`);
    return session;
  }

  const epicId = args.epic || args.plan || args.request || "epic-unassigned";
  const assignedTaskIds = parseCsvArg(args["assigned-task"] || args["assigned-tasks"] || args.task || args.tasks);
  const assignedWriteSet = parseCsvArg(args["assigned-write-set"] || args["write-set"] || args.files);
  const assignedWaveId = args["assigned-wave"] || args.wave || null;
  const branchName = args.branch || createScopedWorktreeBranchName(epicId, {
    assignedTaskIds,
    assignedWaveId,
    sessionId: args["session-id"],
  });
  let worktreePath = args["worktree-existing"];
  if (worktreePath) {
    const validation = validateExistingWorktree({
      rootDir,
      worktreePath: resolve(rootDir, worktreePath),
      gitignoreContent: "",
      dirty: false,
      baselineChecks: [],
    });
    if (!validation.valid) throw new Error(`Invalid existing worktree: ${validation.issues.join(", ")}`);
  } else {
    const selection = await selectWorktreeDirectory({
      rootDir,
      configWorktreeRoot: args["worktree-root"] || ".worktrees",
    });
    if (!selection.selected) {
      throw new Error(`No safe worktree root selected: ${selection.issues.join(", ") || "provide --worktree-existing or --worktree-root"}`);
    }
    worktreePath = join(selection.selected, branchName.replace(/[\\/]/g, "-"));
  }

  const session = createWorktreeSessionRecord({
    sessionId: args["session-id"],
    rootDir,
    epicId,
    branchName,
    worktreePath,
    baselineCommit: args["baseline-commit"] || "HEAD",
    baselineChecks: args["baseline-check"] ? [{ command: args["baseline-check"], status: "planned" }] : [],
    assignedWaveId,
    assignedTaskIds,
    assignedWriteSet,
    maxRuntimeMinutes: args["max-runtime-minutes"] || parseDurationToMinutes(args["max-duration"]) || 180,
    status: "ready",
  });
  const upsert = args["dry-run"]
    ? upsertWorktreeSession(await readWorktreeSessionRegistry(registryPath), session, { allowConflict: Boolean(args["allow-session-conflict"]) })
    : await upsertWorktreeSessionFile(registryPath, session, { allowConflict: Boolean(args["allow-session-conflict"]) });
  if (!upsert.ok) throw new Error(`Worktree session conflict: ${upsert.conflicts.map((item) => item.sessionId).join(", ")}`);
  return upsert.session;
}

function parseCsvArg(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function createScopedWorktreeBranchName(epicId, options = {}) {
  const epicSlug = String(epicId).replace(/[^A-Za-z0-9_-]+/g, "-");
  const scope = options.sessionId || options.assignedTaskIds?.[0] || options.assignedWaveId || "";
  const scopeSlug = String(scope).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return scopeSlug ? `supervibe/${epicSlug}/${scopeSlug}` : `supervibe/${epicSlug}`;
}

function parseDurationToMinutes(value) {
  if (!value) return null;
  const match = /^(\d+)\s*(m|min|h|hr|hour|hours)?$/i.exec(String(value).trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] || "m").toLowerCase();
  return unit.startsWith("h") ? amount * 60 : amount;
}

function deriveExecutionMode(args) {
  if (args.guided) return "guided";
  if (args.manual) return "manual";
  if (args["fresh-context"]) return "fresh-context";
  if (args["execution-mode"]) return args["execution-mode"];
  return args["dry-run"] ? "dry-run" : "dry-run";
}

function printHelp() {
  console.log(`SUPERVIBE_LOOP_HELP
Primary:
  supervibe-loop --request "validate integrations"
  supervibe-loop --plan docs/plans/example.md
  supervibe-loop --from-prd docs/specs/example.md
  supervibe-loop --atomize-plan docs/plans/example.md --plan-review-passed
  supervibe-loop --status --file .claude/memory/loops/<run-id>/state.json
  supervibe-loop --status --epic <epic-id>
  supervibe-loop --stop <run-id>
  supervibe-loop --watch --file .claude/memory/work-items/<epic-id>/graph.json
  supervibe-loop --create-work-item --interactive
  supervibe-loop --create-work-item --title "Fix checkout bug" --template bug --dry-run
  supervibe-loop --quickstart
  supervibe-loop --onboard
  supervibe-loop --completion bash|zsh|powershell
  supervibe-loop --worktree-status
  supervibe-loop --eval
  supervibe-loop --eval --case plan-review-loop
  supervibe-loop --eval --replay .claude/memory/loops/<run-id>
  supervibe-loop --eval-live --case worktree-run --max-runtime-minutes 30 --max-iterations 3 --provider-budget 1
  supervibe-loop --policy-profile guided --request "validate integrations"
  supervibe-loop --approval-receipts
  supervibe-loop --policy-doctor
  supervibe-loop --policy-doctor --fix-derived
  supervibe-loop --anchors --file src/example.ts
  supervibe-loop --anchor-doctor
  supervibe-loop --anchor-doctor --fix-derived
  supervibe-loop --summarize-changes --task task-123 --file src/example.ts --summary "Changed parser"
  supervibe-loop --plan-waves docs/plans/example.md
  supervibe-loop --assign-ready --explain --file .claude/memory/loops/<run-id>/state.json
  supervibe-loop --setup-worker-presets

Advanced:
  supervibe-loop --readiness --plan docs/plans/example.md
  supervibe-loop graph --file .claude/memory/loops/<run-id>/state.json --format text|json|mermaid|dot
  supervibe-loop doctor --file .claude/memory/loops/<run-id>/state.json [--fix]
  supervibe-loop prime --file .claude/memory/loops/<run-id>/state.json
  supervibe-loop --import-tasks docs/plans/example.md --dry-run
  supervibe-loop --atomize-plan docs/plans/example.md --preview
  supervibe-loop --priority --file .claude/memory/work-items/<epic-id>/graph.json
  supervibe-loop --defer task-123 --until 2026-05-01T09:00:00Z --file .claude/memory/work-items/<epic-id>/graph.json
  supervibe-loop --notify terminal,inbox --request "validate integrations"
  supervibe-loop --export-sync-bundle .claude/memory/loops/<run-id>
  supervibe-loop --import-sync-bundle path/to/sync-bundle --dry-run
  supervibe-loop export --file .claude/memory/loops/<run-id>/state.json --out <bundle-dir>
  supervibe-loop import --file <bundle-dir> --out <target-root>

Execution modes:
  --dry-run
  --guided
  --manual
  --fresh-context --tool codex|claude|gemini|opencode
  --commit-per-task
  --worktree --epic <epic-id> --max-duration 3h
  --worktree --epic <epic-id> --assigned-task T1 --assigned-write-set src/file.ts
  --worktree-existing .worktrees/<session>
  --resume-session <session-id>`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
