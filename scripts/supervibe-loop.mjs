#!/usr/bin/env node
import { access, mkdir, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  forkAutonomousLoopCheckpoint,
  recordUserGoalAcceptance,
  runAutonomousLoop,
  resumeAutonomousLoop,
  stopAutonomousLoop,
} from "./lib/autonomous-loop-runner.mjs";
import { createTasksFromRequest, loadPlanTasks, loadPlanTasksWithSource } from "./lib/autonomous-loop-task-source.mjs";
import { buildPreflight } from "./lib/autonomous-loop-preflight-intake.mjs";
import { dispatchTask } from "./lib/autonomous-loop-dispatcher.mjs";
import { generateContracts, scoreAutonomyReadiness } from "./lib/autonomous-loop-contracts.mjs";
import { exportGraph, loadStateForGraphExport } from "./lib/autonomous-loop-graph-export.mjs";
import { formatDoctorReport, primeLoopRun, repairLoopRun } from "./lib/autonomous-loop-doctor.mjs";
import { archiveLoopRun, exportLoopBundle, importLoopBundle } from "./lib/autonomous-loop-archive.mjs";
import { atomizePlanFile, createWorkItemPreview, writeWorkItemGraph } from "./lib/supervibe-plan-to-work-items.mjs";
import { createCliTaskTrackerAdapter, createMemoryTaskTrackerAdapter, createUnavailableTaskTrackerAdapter } from "./lib/supervibe-durable-task-tracker-adapter.mjs";
import { createTaskTrackerMcpAdapter } from "./lib/supervibe-task-tracker-mcp-bridge.mjs";
import { formatTaskTrackerDoctorReport, repairTaskTracker } from "./lib/supervibe-task-tracker-doctor.mjs";
import { defaultTrackerMappingPath, materializeEpicAndTasks, readTrackerMapping, syncPull } from "./lib/supervibe-task-tracker-sync.mjs";
import { createTaskTrackerPrimeSummary, formatTaskTrackerPrimeReminder } from "./lib/supervibe-task-tracker-prime.mjs";
import { createWorkItemIndex, groupWorkItemsByStatus } from "./lib/supervibe-work-item-query.mjs";
import { defaultWorkItemDaemonPath, createWorkItemWatchRecord, formatWorkItemWatchStatus, readWorkItemDaemonState, stopWorkItemWatch, upsertWorkItemWatch, writeWorkItemDaemonState } from "./lib/supervibe-work-item-daemon.mjs";
import { defaultDelegatedInboxPath, formatDelegatedInbox, readDelegatedInbox } from "./lib/supervibe-work-item-message-delegation.mjs";
import { formatImportPreview, importWorkItemsFromFile } from "./lib/supervibe-work-item-migration-importer.mjs";
import { formatPriorityExplanation, orderReadyWorkItems } from "./lib/supervibe-work-item-priority-formula.mjs";
import { createOnboardingReport, createQuickstartPlan, formatOnboarding, formatQuickstart, generateShellCompletions } from "./lib/supervibe-shell-completions.mjs";
import { createFederatedSyncBundle, importFederatedSyncBundle, writeFederatedSyncBundle } from "./lib/supervibe-federated-sync-bundle.mjs";
import { formatNotificationRouteResult, routeNotificationEvent } from "./lib/supervibe-notification-router.mjs";
import { deferWorkItemFile } from "./lib/supervibe-work-item-scheduler.mjs";
import { mutateWorkItemGraphFile } from "./lib/supervibe-work-item-actions.mjs";
import { resolveActiveWorkItemGraph, resolveActiveWorkItemGraphPath } from "./lib/supervibe-work-item-registry.mjs";
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
import { createHappyPathPlan, formatHappyPathPlan } from "./lib/supervibe-happy-path.mjs";
import { formatEpicCompletionReport, validateEpicCompletion } from "./lib/supervibe-epic-completion-validator.mjs";
import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import { PRESET_NAMES, formatPresetSummary, selectWorkerPreset } from "./lib/supervibe-worker-reviewer-presets.mjs";
import { checkpointDiagnostics, formatCheckpointDiagnostics, readAgentCheckpoint, resumeAgentCheckpoint } from "./lib/supervibe-agent-checkpoints.mjs";
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
import {
  formatLoopProviderCapabilityMatrix,
  getLoopProviderCapabilityMatrix,
} from "./lib/autonomous-loop-tool-adapters.mjs";
import { startBackgroundNodeScript } from "./lib/supervibe-process-manager.mjs";

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
    "tracker-prime",
    "interactive",
    "preview",
    "yes",
    "force",
    "create-work-item",
    "claim-ready",
    "eval",
    "eval-live",
    "approval-receipts",
    "policy-doctor",
    "fix-derived",
    "approve-mcp-tracker",
    "anchors",
    "anchor-doctor",
    "summarize-changes",
    "speculative",
    "assign-ready",
    "explain",
    "setup-worker-presets",
    "allow-session-conflict",
    "happy-path",
    "checkpoint-status",
    "repair-checkpoints",
    "provider-matrix",
    "require-user-acceptance",
    "accept-goals",
    "reject-goals",
    "fork-checkpoint",
    "allow-spawn",
    "permission-prompt-bridge",
    "network-approved",
    "mcp-approved",
    "allow-flat-plan",
    "no-tracker-sync",
    "validate-completion",
    "completion-status",
    "close-eligible",
    "allow-dry-run-evidence",
    "require-trusted-evidence",
    "disallow-legacy-evidence",
    "allow-legacy-evidence",
    "allow-open-epic",
    "no-evidence-required",
    "non-production",
    "indefinite",
    "auto-ui",
    "auto-ui-dry-run",
    "no-auto-ui",
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

  if (args["checkpoint-status"] || args["repair-checkpoints"]) {
    const report = await checkpointDiagnostics({ rootDir });
    console.log(formatCheckpointDiagnostics(report));
    if (!report.pass && !args["repair-checkpoints"]) process.exitCode = 2;
    return;
  }

  if (args["resume-task"]) {
    const checkpoint = await readAgentCheckpoint(args["resume-task"], { rootDir });
    if (!checkpoint) {
      console.error(`SUPERVIBE_RESUME_TASK_ERROR: checkpoint not found for ${args["resume-task"]}`);
      process.exitCode = 2;
      return;
    }
    const resume = resumeAgentCheckpoint(checkpoint, {
      now: new Date().toISOString(),
      requestedSideEffect: args["side-effect"] || null,
    });
    console.log([
      "SUPERVIBE_RESUME_TASK",
      `TASK: ${checkpoint.taskId}`,
      `PASS: ${resume.pass}`,
      `NEXT_SAFE_ACTION: ${resume.nextSafeAction}`,
      `REPLAY_GUARD: ${resume.replayGuard}`,
    ].join("\n"));
    if (!resume.pass) process.exitCode = 2;
    return;
  }

  if (args["happy-path"]) {
    const plan = createHappyPathPlan({
      prdPath: args["from-prd"] || args.prd,
      planPath: args.plan || args["atomize-plan"],
      request: args.request || args._.join(" "),
      epicId: args.epic || "<epic-id>",
      graphPath: args.file,
      maxDuration: args["max-duration"] || "until-goal-complete",
      tool: args.tool || "codex",
      dryRun: !args.apply,
    });
    if (args.json) console.log(JSON.stringify(plan, null, 2));
    else console.log(formatHappyPathPlan(plan));
    return;
  }

  if (args.interactive) {
    const result = runInteractiveCli({
      mode: "loop",
      planPath: args["atomize-plan"] || args.plan || null,
      graphPath: args.file || ".supervibe/memory/work-items/<epic-id>/graph.json",
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
      writeReportPath: args.out || ".supervibe/audits/autonomous-loop-evals/latest-report.json",
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
    const indexPath = args.file || join(rootDir, ".supervibe", "memory", "anchors", "semantic-anchor-index.json");
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

  if (args["provider-matrix"]) {
    console.log(formatLoopProviderCapabilityMatrix(getLoopProviderCapabilityMatrix()));
    return;
  }

  if (args["plan-waves"]) {
    const { tasks, source } = await loadPlanTasksWithSource(resolve(rootDir, args["plan-waves"]), { rootDir });
    for (const warning of source.warnings || []) console.log(warning);
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
      hasWorkItems: await pathExists(join(rootDir, ".supervibe", "memory", "work-items")),
      hasLoopState: await pathExists(join(rootDir, ".supervibe", "memory", "loops")),
      hasTrackerMapping: await pathExists(join(rootDir, ".supervibe", "memory", "loops", "task-tracker-map.json")),
    });
    console.log(formatOnboarding(report));
    return;
  }

  if (args["tracker-prime"]) {
    const summary = await createTaskTrackerPrimeSummary({ rootDir });
    if (args.json) console.log(JSON.stringify(summary, null, 2));
    else console.log(formatTaskTrackerPrimeReminder(summary) || [
      "SUPERVIBE_TASK_TRACKER_PRIME",
      "STATUS: no active work graph",
      "NEXT_ACTION: atomize a reviewed plan or continue native loop setup",
      "ATOMIZE_COMMAND: /supervibe-loop --atomize-plan <plan-path> --plan-review-passed",
      "RUNTIME_GATE: node scripts/supervibe-task-graph-maturity.mjs --require-active-graph",
      "UI_COMMAND: /supervibe-ui",
    ].join("\n"));
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
    if (args.file && (args.yes || args.preview || args["dry-run"])) {
      if (!draft.validation.valid && !args.force) {
        throw new Error(`create-work-item draft is invalid: ${draft.validation.issues.map((issue) => `${issue.field}:${issue.code}`).join(",")}`);
      }
      const graphPath = resolve(rootDir, args.file);
      const result = await mutateWorkItemGraphFile(graphPath, {
        type: "create",
        item: {
          ...draft.item,
          parentId: args.parent || args.parentId || draft.item.parentId,
          itemType: draft.item.type,
        },
        actor: args.actor || args.owner || "user",
        reason: args.reason || "created from /supervibe-loop --create-work-item",
        dryRun: Boolean(args.preview || args["dry-run"]),
        rootDir,
      });
      console.log("SUPERVIBE_WORK_ITEM_ACTION");
      console.log(`ACTION: ${result.action}`);
      console.log(`ITEM: ${result.itemId}`);
      console.log(`CHANGED: ${result.changed}`);
      console.log(`DRY_RUN: ${result.dryRun}`);
      if (result.createdItems?.length) console.log(`CREATED_ITEMS: ${result.createdItems.join(",")}`);
      console.log(`GRAPH: ${graphPath}`);
      if (result.backupPath) console.log(`BACKUP: ${result.backupPath}`);
      return;
    }
    if (args.out) await saveGuidedWorkItemDraft(resolve(rootDir, args.out), draft);
    if (args.json) console.log(JSON.stringify(draft, null, 2));
    else console.log(draft.preview);
    if (args.out) console.log(`DRAFT: ${resolve(rootDir, args.out)}`);
    return;
  }

  const workItemAction = resolveWorkItemAction(args);
  if (args["claim-ready"]) {
    const graphPath = args.file
      ? resolve(rootDir, args.file)
      : await resolveActiveWorkItemGraphPath({ rootDir });
    if (!graphPath) throw new Error("claim-ready requires --file <graph.json> or an active work graph");
    const graph = JSON.parse(await readFile(graphPath, "utf8"));
    const index = createWorkItemIndex({ graph });
    const ready = orderReadyWorkItems(index.filter((item) => item.type !== "epic" && item.effectiveStatus === "ready"), { graph });
    const selected = ready[0];
    if (!selected) throw new Error("claim-ready found no ready work items; inspect blockers or status");
    const dryRun = Boolean(args["dry-run"] || args.preview);
    const result = await mutateWorkItemGraphFile(graphPath, {
      type: "claim",
      itemId: selected.itemId || selected.id,
      actor: args.actor || args.owner || "user",
      reason: args.reason || "claimed next ready work item from /supervibe-loop --claim-ready",
      dryRun,
      force: Boolean(args.force),
      rootDir,
    });
    console.log("SUPERVIBE_WORK_ITEM_ACTION");
    console.log("ACTION: claim-ready");
    console.log(`ITEM: ${result.itemId}`);
    console.log(`CHANGED: ${result.changed}`);
    console.log(`DRY_RUN: ${result.dryRun}`);
    console.log(`GRAPH: ${graphPath}`);
    if (result.backupPath) console.log(`BACKUP: ${result.backupPath}`);
    return;
  }

  if (workItemAction) {
    const graphPath = args.file
      ? resolve(rootDir, args.file)
      : await findGraphContainingItem(rootDir, workItemAction.itemId || workItemAction.from || workItemAction.to);
    const dryRun = Boolean(args["dry-run"] || args.preview);
    if (workItemAction.type === "delete" && !dryRun && !args.yes && !args.force) {
      throw new Error("delete requires --preview, --dry-run, --yes, or --force");
    }
    if (workItemAction.type === "close" && !args.force) {
      const graph = JSON.parse(await readFile(graphPath, "utf8"));
      const target = (graph.items || []).find((item) => (item.itemId || item.id) === workItemAction.itemId);
      if (target?.type === "epic" || workItemAction.itemId === graph.epicId || workItemAction.itemId === graph.graph_id) {
        const report = validateEpicCompletion(graph, {
          production: !args["non-production"],
          requireEvidence: !args["no-evidence-required"],
          allowDryRunEvidence: Boolean(args["allow-dry-run-evidence"]),
          requireTrustedEvidence: Boolean(args["require-trusted-evidence"]),
          trustedReceiptIds: trustedReceiptIdsForValidation(rootDir, {
            explicitReceiptIds: splitCsv(args["trusted-receipts"]),
          }),
          disallowLegacyEvidence: Boolean(args["disallow-legacy-evidence"]),
          allowLegacyEvidence: Boolean(args["allow-legacy-evidence"]),
          requireEpicClosed: false,
        });
        if (!report.pass) {
          console.log(formatEpicCompletionReport(report));
          console.log(`GRAPH: ${graphPath}`);
          console.log("NEXT_ACTION: fix completion blockers or rerun with --force after explicit user override");
          process.exitCode = 1;
          return;
        }
      }
    }
    const result = await mutateWorkItemGraphFile(graphPath, {
      ...workItemAction,
      actor: args.actor || args.owner || "user",
      reason: args.reason || null,
      dryRun,
      force: Boolean(args.force),
      rootDir,
    });
    if (args.preview) {
      console.log(createDryRunPreview({
        action: workItemAction.type,
        before: { itemId: workItemAction.itemId || workItemAction.from },
        after: {
          changed: result.changed,
          action: result.action,
          itemId: result.itemId,
          dependency: result.dependency || null,
          createdItems: result.createdItems || [],
        },
        risk: workItemAction.type === "delete" ? "high" : "medium",
        command: `/supervibe-loop --${workItemAction.type} ${workItemAction.itemId || workItemAction.from || ""} --file ${graphPath}`,
      }).output);
    }
    console.log("SUPERVIBE_WORK_ITEM_ACTION");
    console.log(`ACTION: ${result.action || workItemAction.type}`);
    console.log(`ITEM: ${result.itemId || workItemAction.itemId || workItemAction.from || "graph"}`);
    console.log(`CHANGED: ${result.changed}`);
    console.log(`DRY_RUN: ${result.dryRun}`);
    if (result.conflict) console.log(`CONFLICT: ${result.conflict.reason}`);
    if (result.createdItems?.length) console.log(`CREATED_ITEMS: ${result.createdItems.join(",")}`);
    if (result.dependency) console.log(`DEPENDENCY: ${result.dependency.from}->${result.dependency.to}:${result.dependency.type}`);
    console.log(`GRAPH: ${graphPath}`);
    if (result.backupPath) console.log(`BACKUP: ${result.backupPath}`);
    return;
  }

  if (args.defer) {
    if (!args.until && !args.reason && !args.indefinite) {
      throw new Error("defer requires --until or --reason for indefinite deferral");
    }
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
    if (args.file) {
      try {
        const graphPath = resolve(rootDir, args.file);
        const graph = JSON.parse(await readFile(graphPath, "utf8"));
        if (graph.kind === "supervibe-work-item-graph" || Array.isArray(graph.items)) {
          printEpicStatus({ graph, graphPath });
          printAutoUiStatus({ rootDir, args, graphPath });
          return;
        }
      } catch (error) {
        if (error.code !== "ENOENT" && error.name !== "SyntaxError") throw error;
      }
    }
    if (args.epic && !args.file) {
      const graphPath = join(rootDir, ".supervibe", "memory", "work-items", args.epic, "graph.json");
      try {
        const graph = JSON.parse(await readFile(graphPath, "utf8"));
        printEpicStatus({ graph, graphPath, epicId: args.epic });
        printAutoUiStatus({ rootDir, args, graphPath });
        return;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        console.log("SUPERVIBE_EPIC_STATUS");
        console.log(`EPIC: ${args.epic}`);
        console.log("STATUS: missing graph");
        console.log(`NEXT_ACTION: run /supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --plan-review-passed`);
        return;
      }
    }
    if (!args.loop) {
      const activeGraph = await resolveActiveWorkItemGraph({ rootDir });
      if (activeGraph.status === "ambiguous") {
        console.log("SUPERVIBE_EPIC_STATUS");
        console.log("STATUS: ambiguous active work graph");
        console.log(`CANDIDATES: ${activeGraph.candidates.length}`);
        for (const candidate of activeGraph.candidates) console.log(`- ${candidate}`);
        console.log(`NEXT_ACTION: ${activeGraph.nextAction}`);
        process.exitCode = 2;
        return;
      }
      if (activeGraph.graphPath) {
        const activeGraphPath = activeGraph.graphPath;
        const graph = JSON.parse(await readFile(activeGraphPath, "utf8"));
        printEpicStatus({ graph, graphPath: activeGraphPath, source: "active-registry" });
        printAutoUiStatus({ rootDir, args, graphPath: activeGraphPath });
        return;
      }
    }
    const stateFile = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "", "state.json");
    try {
      const result = await runAutonomousLoop({ rootDir, statusFile: stateFile });
      console.log(result.statusText);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      console.log("SUPERVIBE_LOOP_STATUS");
      console.log("STATUS: no loop state found");
      console.log(`STATE: ${stateFile}`);
      console.log(`PROVIDER_CAPABILITIES: ${getLoopProviderCapabilityMatrix().map((entry) => `${entry.id}:${entry.nativeContinuation}`).join(",")}`);
      console.log("NEXT_ACTION: start a loop with npm run supervibe:loop -- --request \"validate integrations\" --dry-run");
    }
    return;
  }

  if (args.graph || args._[0] === "graph") {
    const stateFile = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "", "state.json");
    const state = await loadStateForGraphExport(resolve(rootDir, stateFile));
    process.stdout.write(exportGraph(state, { format: args.format || "text" }));
    return;
  }

  if (args.doctor || args._[0] === "doctor") {
    const target = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "", "state.json");
    if (args.fix) {
      const result = await repairLoopRun(resolve(rootDir, target), { fix: true });
      console.log(`SUPERVIBE_LOOP_REPAIR\nCHANGED: ${result.changed}\nBACKUP: ${result.backupPath}`);
    } else {
      console.log(await formatDoctorReport(resolve(rootDir, target)));
    }
    return;
  }

  if (args.prime || args._[0] === "prime") {
    const target = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "", "state.json");
    console.log(await primeLoopRun(resolve(rootDir, target)));
    return;
  }

  if (args.archive || args._[0] === "archive") {
    const target = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "");
    const result = await archiveLoopRun(resolve(rootDir, target), { archiveRoot: args.out, label: args.label });
    console.log(`SUPERVIBE_LOOP_ARCHIVE\nBUNDLE: ${result.bundleDir}\nRUN_ID: ${result.runId}`);
    return;
  }

  if (args.export || args._[0] === "export") {
    const target = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "");
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
    const adapter = createTaskTrackerAdapterFromArgs(args, {
      fallbackReason: "no external tracker selected; use --tracker memory for local smoke tests or --tracker cli --tracker-command <command>",
    });

    if (args["tracker-sync-push"]) {
      const result = await materializeEpicAndTasks(graph, adapter, { rootDir, mappingPath, dryRun: Boolean(args["dry-run"]) });
      console.log("SUPERVIBE_TRACKER_SYNC_PUSH");
      console.log(`STATUS: ${result.status}`);
      console.log(`MAPPING: ${mappingPath}`);
      console.log(`NATIVE_GRAPH_PRESERVED: ${result.nativeGraphPreserved}`);
      if (result.recovery?.nextAction) console.log(`RECOVERY: ${result.recovery.nextAction}`);
      if (result.issues?.length) console.log(`ISSUES: ${result.issues.length}`);
      if (result.ok === false) process.exitCode = 1;
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

  if (args["validate-completion"] || args["completion-status"] || args["close-eligible"]) {
    const graphPath = await resolveCompletionGraphPath({ rootDir, args });
    const graph = JSON.parse(await readFile(graphPath, "utf8"));
    const report = validateEpicCompletion(graph, {
      production: !args["non-production"],
      requireEvidence: !args["no-evidence-required"],
      allowDryRunEvidence: Boolean(args["allow-dry-run-evidence"]),
      requireTrustedEvidence: Boolean(args["require-trusted-evidence"]),
      trustedReceiptIds: trustedReceiptIdsForValidation(rootDir, {
        explicitReceiptIds: splitCsv(args["trusted-receipts"]),
      }),
      disallowLegacyEvidence: Boolean(args["disallow-legacy-evidence"]),
      allowLegacyEvidence: Boolean(args["allow-legacy-evidence"]),
      requireEpicClosed: args["close-eligible"] ? false : !args["allow-open-epic"],
    });
    console.log(formatEpicCompletionReport(report));
    console.log(`GRAPH: ${graphPath}`);
    if (!report.pass) process.exitCode = 1;
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
    const mappingPath = args["mapping-file"] ? resolve(rootDir, args["mapping-file"]) : defaultTrackerMappingPath(rootDir);
    const trackerAdapter = args["no-tracker-sync"]
      ? null
      : args.tracker
        ? createTaskTrackerAdapterFromArgs(args, {
          fallbackReason: "no external tracker selected; using native graph only",
        })
        : createMemoryTaskTrackerAdapter();
    const trackerResult = trackerAdapter
      ? await materializeEpicAndTasks(graph, trackerAdapter, { rootDir, mappingPath })
      : null;
    console.log("SUPERVIBE_WORK_ITEMS");
    console.log(`EPIC: ${graph.epicId}`);
    console.log(`GRAPH: ${writeResult.graphPath}`);
    console.log(`PREVIEW: ${writeResult.previewPath}`);
    console.log(`VALID: ${graph.validation.valid}`);
    if (trackerResult) {
      console.log(`TRACKER_MAPPING: ${mappingPath}`);
      console.log(`TRACKER_STATUS: ${trackerResult.status}`);
      const mapped = Object.keys(trackerResult.mapping?.items || {}).length;
      console.log(`TRACKER_MAPPED_ITEMS: ${mapped}`);
    }
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
    const nextReadinessAction = preflight.blocked_actions.includes("fresh-context execution")
      ? `use --${preflight.provider_capabilities.recommendedMode} or --${preflight.provider_capabilities.fallbackMode} for ${args.tool || preflight.execution_policy.provider.selected_tool}`
      : readiness.pass ? "ready_for_safe_execution" : readiness.remediation[0];
    if (args.json) {
      console.log(JSON.stringify({
        readiness,
        contracts,
        toolAdapters: preflight.tool_adapters,
        providerCapabilities: preflight.provider_capabilities,
        providerCapabilitySummary: preflight.provider_capability_summary,
        nextAction: nextReadinessAction,
      }, null, 2));
    } else {
      console.log("SUPERVIBE_LOOP_READINESS");
      console.log(`SCORE: ${readiness.score}/10`);
      console.log(`PASS: ${readiness.pass}`);
      console.log(`MISSING: ${readiness.missing.join(", ") || "none"}`);
      console.log(`EXECUTION_MODE: ${preflight.execution_policy.mode}`);
      console.log(`ADAPTERS: ${preflight.tool_adapter_summary.available.join(",") || "none"}`);
      console.log(`CONTINUATION_MODE: ${preflight.provider_capabilities.nativeContinuation}`);
      console.log(`PROVIDER_RECOMMENDED_MODE: ${preflight.provider_capabilities.recommendedMode}`);
      console.log(`PROVIDER_FALLBACK_MODE: ${preflight.provider_capabilities.fallbackMode}`);
      console.log(`NEXT_ACTION: ${nextReadinessAction}`);
    }
    return;
  }

  if (args.resume) {
    const result = await resumeAutonomousLoop(resolve(rootDir, args.resume));
    console.log(`Resume status: ${result.status}`);
    if (result.state?.resume_work_graph) {
      const resumeGraph = result.state.resume_work_graph;
      console.log("SUPERVIBE_RESUME_WORK_GRAPH");
      console.log(`STATUS: ${resumeGraph.status}`);
      if (resumeGraph.epicId) console.log(`EPIC: ${resumeGraph.epicId}`);
      console.log(`READY: ${resumeGraph.ready ?? 0}`);
      console.log(`BLOCKED: ${resumeGraph.blocked ?? 0}`);
      console.log(`CLAIMED: ${resumeGraph.claimed ?? 0}`);
      console.log(`STALE: ${resumeGraph.stale ?? 0}`);
      console.log(`NEXT_READY: ${resumeGraph.nextReady || "none"}`);
      console.log(`NEXT_ACTION: ${resumeGraph.nextAction || "inspect resume state"}`);
      console.log(`GRAPH: ${resumeGraph.graphPath}`);
    }
    return;
  }

  if (args.stop) {
    const stateFile = args.file || join(rootDir, ".supervibe", "memory", "loops", args.stop, "state.json");
    const state = await stopAutonomousLoop(stateFile);
    console.log(`Stopped ${state.run_id}: ${state.stop_reason}`);
    return;
  }

  if (args["accept-goals"] || args["reject-goals"]) {
    if (!args.file) throw new Error("--accept-goals/--reject-goals requires --file <state.json>");
    const accepted = Boolean(args["accept-goals"]);
    const state = await recordUserGoalAcceptance(resolve(rootDir, args.file), {
      accepted,
      acceptedBy: args["accepted-by"] || args.actor || "user",
      feedback: args.feedback || args.reason || null,
    });
    console.log("SUPERVIBE_LOOP_USER_GOAL_ACCEPTANCE");
    console.log(`RUN_ID: ${state.run_id}`);
    console.log(`STATUS: ${state.status}`);
    console.log(`USER_GOAL_ACCEPTANCE: ${state.user_goal_acceptance?.status || "unknown"}`);
    console.log(`NEXT_ACTION: ${state.next_action || "none"}`);
    return;
  }

  if (args["fork-checkpoint"]) {
    if (!args.file) throw new Error("--fork-checkpoint requires --file <state.json>");
    const result = await forkAutonomousLoopCheckpoint(resolve(rootDir, args.file), {
      outPath: args.out ? resolve(rootDir, args.out) : null,
      reason: args.reason || args.feedback || "user_goal_replan",
    });
    console.log("SUPERVIBE_LOOP_CHECKPOINT_FORK");
    console.log(`RUN_ID: ${result.state.run_id}`);
    console.log(`STATUS: ${result.state.status}`);
    console.log(`STATE: ${result.path}`);
    console.log(`NEXT_ACTION: ${result.state.next_action}`);
    return;
  }

  const positionalRequest = args.request || args._.join(" ");
  const sourcePlan = args.plan || args["from-prd"];
  const executionSource = await resolveLoopExecutionSource({
    rootDir,
    args,
    sourcePlan,
    positionalRequest,
  });
  const worktreeSession = await maybePrepareWorktreeSession(args, rootDir);
  const policyProfile = await maybeLoadPolicyProfile(rootDir, args);
  const taskTrackerAdapter = shouldUseTaskTrackerAdapter(args)
    ? createTaskTrackerAdapterFromArgs(args)
    : null;
  const result = await runAutonomousLoop({
    rootDir,
    runId: args["run-id"],
    plan: executionSource.plan,
    request: executionSource.request,
    dryRun: Boolean(args["dry-run"]),
    fixture: args.fixture,
    maxLoops: args["max-loops"],
    maxRuntimeMinutes: args["max-runtime-minutes"] || parseDurationToMinutes(args["max-duration"]),
    environmentTarget: args.environment,
    executionMode: deriveExecutionMode(args),
    commitPerTask: Boolean(args["commit-per-task"]),
    adapterId: args.tool,
    adapterCommand: args["adapter-command"],
    adapterArgs: parseCsvArg(args["adapter-args"] || args["provider-args"]),
    adapterConfig: buildAdapterConfig(args),
    allowSpawn: Boolean(args["allow-spawn"]),
    permissionPromptBridge: Boolean(args["permission-prompt-bridge"]),
    networkApproved: Boolean(args["network-approved"]),
    networkTargets: parseCsvArg(args["network-targets"] || args["network-allowlist"]),
    mcpApproved: Boolean(args["mcp-approved"]),
    mcpServers: parseCsvArg(args["mcp-servers"]),
    mcpToolsAllowed: parseCsvArg(args["mcp-tools"]),
    worktreeSession,
    policyProfile,
    requireUserAcceptance: Boolean(args["require-user-acceptance"]),
    taskTrackerAdapter,
    taskTrackerMappingPath: args["mapping-file"],
  });

  console.log("SUPERVIBE_LOOP_STATUS");
  console.log(`STATUS: ${result.status}`);
  console.log(`RUN_ID: ${result.runId}`);
  console.log(`CONFIDENCE: ${result.finalScore}`);
  console.log(`STOP_REASON: ${result.stopReason || "none"}`);
  console.log(`REPORT: ${result.reportPath}`);
  console.log(`TASK_SOURCE: ${executionSource.source}`);
  if (result.state?.completion_semantics) {
    console.log(`COMPLETION_SEMANTICS: ${result.state.completion_semantics.status}`);
    console.log(`PRODUCTION_READY: ${result.state.completion_semantics.productionReady === true}`);
    console.log(`NEXT_COMPLETION_ACTION: ${result.state.completion_semantics.nextAction}`);
  }
  if (result.state?.native_work_graph_sync) {
    console.log(`NATIVE_WORK_GRAPH_SYNC: ${result.state.native_work_graph_sync.status}`);
  }
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

async function resolveLoopExecutionSource({ rootDir, args, sourcePlan = null, positionalRequest = "" } = {}) {
  const explicitGraphPath = args.file || args["work-item-graph"] || null;
  if (explicitGraphPath) {
    return {
      plan: resolve(rootDir, explicitGraphPath),
      request: sourcePlan ? positionalRequest || `execute work graph for ${sourcePlan}` : positionalRequest || undefined,
      source: "explicit-work-graph",
    };
  }

  if (args.epic) {
    const graphPath = join(rootDir, ".supervibe", "memory", "work-items", args.epic, "graph.json");
    if (!await pathExists(graphPath)) {
      if (sourcePlan && !args["allow-flat-plan"]) {
        throw new Error([
          "PLAN_EXECUTION_REQUIRES_WORK_GRAPH",
          `EPIC: ${args.epic}`,
          `PLAN: ${sourcePlan}`,
          `NEXT_ACTION: run /supervibe-loop --atomize-plan ${sourcePlan} --plan-review-passed`,
        ].join("\n"));
      }
      return {
        plan: sourcePlan ? resolve(rootDir, sourcePlan) : null,
        request: sourcePlan ? positionalRequest || undefined : positionalRequest || `validate epic ${args.epic}`,
        source: sourcePlan ? "legacy-flat-plan" : "epic-without-graph-request",
      };
    }
    return {
      plan: graphPath,
      request: sourcePlan ? positionalRequest || `execute epic ${args.epic} for ${sourcePlan}` : positionalRequest || undefined,
      source: "epic-work-graph",
    };
  }

  if (sourcePlan && !args["allow-flat-plan"]) {
    const atomizeCommand = `/supervibe-loop --atomize-plan ${sourcePlan} --plan-review-passed`;
    throw new Error([
      "PLAN_EXECUTION_REQUIRES_WORK_GRAPH",
      `PLAN: ${sourcePlan}`,
      `NEXT_ACTION: run ${atomizeCommand}`,
      "THEN: run /supervibe-loop --file .supervibe/memory/work-items/<epic-id>/graph.json --guided",
      "DETAIL: direct flat-plan execution is legacy-only; use --allow-flat-plan only for diagnostic previews.",
    ].join("\n"));
  }

  if (!sourcePlan && !positionalRequest) {
    const activeGraphPath = await resolveActiveWorkItemGraphPath({ rootDir });
    if (activeGraphPath) {
      return {
        plan: activeGraphPath,
        request: undefined,
        source: "active-work-graph",
      };
    }
  }

  return {
    plan: sourcePlan ? resolve(rootDir, sourcePlan) : null,
    request: sourcePlan ? positionalRequest || undefined : positionalRequest || "validate integrations",
    source: sourcePlan ? "legacy-flat-plan" : "request",
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveCompletionGraphPath({ rootDir, args } = {}) {
  if (args.file || args["work-item-graph"]) return resolve(rootDir, args.file || args["work-item-graph"]);
  if (args.epic) return join(rootDir, ".supervibe", "memory", "work-items", args.epic, "graph.json");
  const activeGraphPath = await resolveActiveWorkItemGraphPath({ rootDir });
  if (!activeGraphPath) throw new Error("completion validation requires --file <graph.json>, --epic <epic-id>, or an active work graph");
  return activeGraphPath;
}

function printEpicStatus({ graph, graphPath, epicId = null, source = "explicit" }) {
  const grouped = groupWorkItemsByStatus(createWorkItemIndex({ graph }));
  console.log("SUPERVIBE_EPIC_STATUS");
  console.log(`EPIC: ${epicId || graph.epicId || graph.graph_id || "unknown"}`);
  console.log(`SOURCE: ${source}`);
  console.log(`READY: ${grouped.ready.length}`);
  console.log(`BLOCKED: ${grouped.blocked.length}`);
  console.log(`CLAIMED: ${grouped.claimed.length}`);
  console.log(`DEFERRED: ${grouped.deferred.length}`);
  console.log(`REVIEW: ${grouped.review.length}`);
  console.log(`DONE: ${grouped.done.length}`);
  console.log(`NEXT_READY: ${grouped.ready[0]?.itemId || grouped.ready[0]?.id || "none"}`);
  console.log(`NEXT_ACTION: ${nextActionForEpicStatus(grouped)}`);
  console.log(`GRAPH: ${graphPath}`);
}

function printAutoUiStatus({ rootDir, args, graphPath }) {
  if (!shouldEmitAutoUi(args)) return;
  const plan = createAutoUiPlan({ rootDir, args, graphPath });
  console.log("SUPERVIBE_AUTO_UI");
  if (args["auto-ui-dry-run"] || args.preview || args["dry-run"]) {
    console.log("STATUS: dry-run");
    console.log(`URL: ${plan.url}`);
    console.log(`BIND: 127.0.0.1`);
    console.log(`COMMAND: ${plan.command}`);
    console.log(`GRAPH: ${graphPath || "active"}`);
    return;
  }
  const child = startBackgroundNodeScript({
    scriptPath: plan.scriptPath,
    args: plan.childArgs,
    cwd: rootDir,
    name: "supervibe-ui",
    port: plan.port,
  });
  console.log("STATUS: started");
  console.log(`URL: ${plan.url}`);
  console.log(`BIND: 127.0.0.1`);
  console.log(`PID: ${child.pid}`);
  console.log(`LOG_STDOUT: ${child.logs.stdout}`);
  console.log(`LOG_STDERR: ${child.logs.stderr}`);
  console.log(`COMMAND: ${plan.command}`);
  console.log(`GRAPH: ${graphPath || "active"}`);
}

function shouldEmitAutoUi(args = {}) {
  if (args["no-auto-ui"]) return false;
  return Boolean(args["auto-ui"] || args["auto-ui-dry-run"]);
}

function createAutoUiPlan({ rootDir, args, graphPath }) {
  const port = normalizeLocalPort(args["ui-port"] || args.port || 3057);
  const scriptPath = fileURLToPath(new URL("./supervibe-ui.mjs", import.meta.url));
  const childArgs = ["--port", String(port), "--root", rootDir, "--foreground"];
  const commandParts = ["npm run supervibe:ui --", "--daemon", "--port", String(port)];
  if (graphPath) {
    childArgs.push("--file", graphPath);
    commandParts.push("--file", graphPath);
  }
  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    scriptPath,
    childArgs,
    command: commandParts.join(" "),
  };
}

function normalizeLocalPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--ui-port must be an integer between 1 and 65535, got ${value}`);
  }
  return port;
}

function trustedReceiptIdsForValidation(rootDir, { explicitReceiptIds = [] } = {}) {
  const explicit = new Set((explicitReceiptIds || []).map(String).filter(Boolean));
  const trusted = [];
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (!receipt?.receiptId) continue;
    if (explicit.size > 0 && !explicit.has(String(receipt.receiptId))) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt);
    if (trust.pass) trusted.push(String(receipt.receiptId));
  }
  return trusted;
}

function splitCsv(value = "") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function nextActionForEpicStatus(grouped = {}) {
  const nextReady = grouped.ready?.[0]?.itemId || grouped.ready?.[0]?.id || null;
  if (nextReady) return `claim ${nextReady} or run /supervibe-loop --claim-ready`;
  if ((grouped.blocked || []).length > 0) return "inspect blockers, unblock tasks, or validate dependency completion";
  if ((grouped.review || []).length > 0) return "complete required review and gate work items";
  return "run /supervibe-loop --validate-completion";
}

function resolveWorkItemAction(args) {
  const actionKeys = ["claim", "close", "complete", "reopen", "delete", "skip", "cancel", "block", "unblock", "comment", "handoff", "recover-stale", "edit", "split"];
  for (const key of actionKeys) {
    if (!args[key]) continue;
    const itemId = String(args[key]);
    if (key === "edit") {
      return {
        type: "edit",
        itemId,
        patch: {
          title: args.title,
          description: args.description,
          status: args["set-status"] || args.statusValue,
          priority: args.priority,
          owner: args.owner,
          assignee: args.assignee,
          labels: args.labels,
          acceptanceCriteria: args.acceptance || args["acceptance-criteria"],
          verificationCommands: args.verification || args["verification-commands"],
          dueAt: args.until || args.due,
        },
      };
    }
    if (key === "split") {
      return {
        type: "split",
        itemId,
        titles: parseCsvArg(args.titles || args.subtasks || args.title),
      };
    }
    if (key === "block") {
      return {
        type: "block",
        itemId,
        reason: args.reason,
        nextAction: args["next-action"] || args.nextAction,
      };
    }
    if (key === "comment") {
      return {
        type: "comment",
        itemId,
        body: args.body || args.message || args.reason,
        commentType: args["comment-type"] || args.commentType,
        links: args.links || args.link,
      };
    }
    if (key === "handoff") {
      return {
        type: "handoff",
        itemId,
        producer: args.producer || args.from,
        recipient: args.recipient || args.to,
        receiptId: args.receipt || args.receiptId,
        summary: args.summary || args.reason,
      };
    }
    return { type: key, itemId, status: args["set-status"] };
  }
  if (args["dep-add"] || args["dependency-add"]) {
    return {
      type: "dep-add",
      from: args["dep-add"] || args["dependency-add"] || args.from,
      to: args.to || args.blocks || args.dependsOn,
      depType: args["dep-type"] || args.dependencyType || "blocks",
    };
  }
  if (args["dep-remove"] || args["dependency-remove"]) {
    return {
      type: "dep-remove",
      from: args["dep-remove"] || args["dependency-remove"] || args.from,
      to: args.to || args.blocks || args.dependsOn,
      depType: args["dep-type"] || args.dependencyType || "blocks",
    };
  }
  if (args.reparent) {
    return {
      type: "reparent",
      itemId: args.reparent,
      parentId: args.parent || args.parentId || null,
    };
  }
  return null;
}

async function findGraphContainingItem(rootDir, itemId) {
  const base = join(rootDir, ".supervibe", "memory", "work-items");
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
    maxRuntimeMinutes: args["max-runtime-minutes"] || parseDurationToMinutes(args["max-duration"]),
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

function buildAdapterConfig(args) {
  const config = {};
  if (args["adapter-command"]) config.command = args["adapter-command"];
  const adapterArgs = parseCsvArg(args["adapter-args"] || args["provider-args"]);
  if (adapterArgs.length > 0) config.args = adapterArgs;
  return Object.keys(config).length > 0 ? config : undefined;
}

function shouldUseTaskTrackerAdapter(args) {
  return Boolean(args.tracker || args["tracker-command"] || process.env.SUPERVIBE_TASK_TRACKER_COMMAND);
}

function createTaskTrackerAdapterFromArgs(args, options = {}) {
  if (args.tracker === "memory") return createMemoryTaskTrackerAdapter();
  if (args.tracker === "mcp") {
    return createTaskTrackerMcpAdapter({
      servers: parseCsvArg(args["tracker-mcp-servers"] || args["tracker-mcp-server"] || args["mcp-servers"]),
      allowedTools: parseCsvArg(args["tracker-mcp-tools"] || args["mcp-tools"]),
      approved: Boolean(args["approve-mcp-tracker"]),
    });
  }
  if (args.tracker === "cli" || args["tracker-command"] || process.env.SUPERVIBE_TASK_TRACKER_COMMAND) {
    return createCliTaskTrackerAdapter({
      command: args["tracker-command"] || process.env.SUPERVIBE_TASK_TRACKER_COMMAND,
      baseArgs: parseCsvArg(args["tracker-base-args"]),
      timeoutMs: args["tracker-timeout-ms"],
    });
  }
  return createUnavailableTaskTrackerAdapter(options.fallbackReason || "no external tracker configured");
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
  supervibe-loop --happy-path --plan .supervibe/artifacts/plans/example.md
  supervibe-loop --plan .supervibe/artifacts/plans/example.md
  supervibe-loop --from-prd .supervibe/artifacts/specs/example.md
  supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --plan-review-passed
  supervibe-loop --status --file .supervibe/memory/loops/<run-id>/state.json
  supervibe-loop --status --epic <epic-id>
  supervibe-loop --status --file .supervibe/memory/work-items/<epic-id>/graph.json --auto-ui
  supervibe-loop --status --file .supervibe/memory/work-items/<epic-id>/graph.json --auto-ui-dry-run --ui-port 3057
  supervibe-loop --stop <run-id>
  supervibe-loop --watch --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --claim <task-id> --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --claim-ready --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --close <task-id> --reason "verified" --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --validate-completion --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --validate-completion --file .supervibe/memory/work-items/<epic-id>/graph.json --require-trusted-evidence --trusted-receipts <id,id>
  supervibe-loop --edit <task-id> --title "Updated title" --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --split <task-id> --titles "Subtask A,Subtask B" --file .supervibe/memory/work-items/<epic-id>/graph.json --preview
  supervibe-loop --skip <task-id> --reason "out of scope" --file .supervibe/memory/work-items/<epic-id>/graph.json --preview
  supervibe-loop --block <task-id> --reason "needs clarification" --file .supervibe/memory/work-items/<epic-id>/graph.json --preview
  supervibe-loop --reparent <task-id> --parent <epic-or-task-id> --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --dep-add <from-task-id> --to <to-task-id> --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --delete <task-id> --file .supervibe/memory/work-items/<epic-id>/graph.json --preview
  supervibe-loop --create-work-item --interactive
  supervibe-loop --create-work-item --title "Fix checkout bug" --template bug --dry-run
  supervibe-loop --quickstart
  supervibe-loop --onboard
  supervibe-loop --tracker-prime
  supervibe-loop --completion bash|zsh|powershell
  supervibe-loop --worktree-status
  supervibe-loop --eval
  supervibe-loop --eval --case plan-review-loop
  supervibe-loop --eval --replay .supervibe/memory/loops/<run-id>
  supervibe-loop --eval-live --case worktree-run --max-runtime-minutes 30 --max-iterations 3 --provider-budget 1
  supervibe-loop --policy-profile guided --request "validate integrations"
  supervibe-loop --approval-receipts
  supervibe-loop --policy-doctor
  supervibe-loop --policy-doctor --fix-derived
  supervibe-loop --anchors --file src/example.ts
  supervibe-loop --anchor-doctor
  supervibe-loop --anchor-doctor --fix-derived
  supervibe-loop --summarize-changes --task task-123 --file src/example.ts --summary "Changed parser"
  supervibe-loop --plan-waves .supervibe/artifacts/plans/example.md
  supervibe-loop --assign-ready --explain --file .supervibe/memory/loops/<run-id>/state.json
  supervibe-loop --setup-worker-presets
  supervibe-loop --provider-matrix
  supervibe-loop --require-user-acceptance --request "validate integrations"
  supervibe-loop --accept-goals --file .supervibe/memory/loops/<run-id>/state.json --accepted-by <name>
  supervibe-loop --reject-goals --file .supervibe/memory/loops/<run-id>/state.json --feedback "what is missing"
  supervibe-loop --fork-checkpoint --file .supervibe/memory/loops/<run-id>/state.json

Advanced:
  supervibe-loop --readiness --plan .supervibe/artifacts/plans/example.md
  supervibe-loop graph --file .supervibe/memory/loops/<run-id>/state.json --format text|json|mermaid|dot
  supervibe-loop doctor --file .supervibe/memory/loops/<run-id>/state.json [--fix]
  supervibe-loop prime --file .supervibe/memory/loops/<run-id>/state.json
  supervibe-loop --import-tasks .supervibe/artifacts/plans/example.md --dry-run
  supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --preview
  supervibe-loop --priority --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --defer task-123 --until 2026-05-01T09:00:00Z --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --notify terminal,inbox --request "validate integrations"
  supervibe-loop --export-sync-bundle .supervibe/memory/loops/<run-id>
  supervibe-loop --import-sync-bundle path/to/sync-bundle --dry-run
  supervibe-loop --tracker-sync-push --tracker memory --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --tracker-prime --json
  supervibe-loop export --file .supervibe/memory/loops/<run-id>/state.json --out <bundle-dir>
  supervibe-loop import --file <bundle-dir> --out <target-root>

Execution modes:
  --dry-run
  --guided
  --manual
  --fresh-context --tool codex|claude|gemini|opencode
  --fresh-context --tool codex|claude|gemini|opencode --allow-spawn --permission-prompt-bridge
  --adapter-command <command> [--adapter-args arg1,arg2]
  --tracker memory|cli|mcp [--tracker-command <command>] [--tracker-base-args arg1,arg2]
  --tracker mcp --tracker-mcp-servers issue-tracker --tracker-mcp-tools create_issue,link_dependency --approve-mcp-tracker
  --provider-matrix
  --require-user-acceptance
  --auto-ui | --auto-ui-dry-run [--no-auto-ui] [--ui-port 3057]
  --require-trusted-evidence [--trusted-receipts <id,id>] [--disallow-legacy-evidence|--allow-legacy-evidence]
  --accept-goals | --reject-goals --file <state.json>
  --fork-checkpoint --file <state.json>
  --commit-per-task
  --worktree --epic <epic-id> [--max-duration 3h]
  --worktree --epic <epic-id> --assigned-task T1 --assigned-write-set src/file.ts
  --worktree-existing .worktrees/<session>
  --resume-session <session-id>
  --allow-flat-plan (legacy diagnostic only; reviewed plans should be atomized first)`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
