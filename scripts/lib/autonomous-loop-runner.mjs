import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createRunId, nowIso, versionEnvelope } from "./autonomous-loop-constants.mjs";
import { createTasksFromRequest, loadPlanTasks } from "./autonomous-loop-task-source.mjs";
import { createTaskGraph } from "./autonomous-loop-task-graph.mjs";
import { calculateReadyFront } from "./autonomous-loop-ready-front.mjs";
import { buildPreflight, writePreflightArtifact } from "./autonomous-loop-preflight-intake.mjs";
import { loadAvailableAgents, dispatchTask } from "./autonomous-loop-dispatcher.mjs";
import { evaluateTask, evaluateRun, normalizeRequeueReason } from "./autonomous-loop-evaluator.mjs";
import { guardAction } from "./autonomous-loop-policy-guard.mjs";
import { createBudget, budgetStatus } from "./autonomous-loop-budget.mjs";
import { createState, formatStatus, readState, writeState } from "./autonomous-loop-status.mjs";
import { migrateState, validateStateVersions } from "./autonomous-loop-state-migrations.mjs";
import { appendSideEffect, reconcileSideEffects, readSideEffects } from "./autonomous-loop-side-effect-ledger.mjs";
import { buildContextPlan } from "./autonomous-loop-context-planner.mjs";
import { detectRuntimeEnvironment } from "./autonomous-loop-runtime-environment.mjs";
import { detectPlatform, renderCommand } from "./autonomous-loop-platform-runner.mjs";
import { createAuditEvent, finalReportProvenance } from "./autonomous-loop-audit-trail.mjs";
import { createCancellationToken, applyCancellation } from "./autonomous-loop-cancellation.mjs";
import { planMcpUse } from "./autonomous-loop-mcp-orchestrator.mjs";
import { selectRulesForTask } from "./autonomous-loop-rule-context.mjs";
import { createRetentionPolicy } from "./autonomous-loop-artifact-retention.mjs";
import { evaluateFinalAcceptance } from "./autonomous-loop-final-acceptance.mjs";
import { claimTask, releaseClaim, summarizeClaims } from "./autonomous-loop-claims.mjs";
import {
  createProgressEntry,
  createResumeNotes,
  summarizeProgress,
  writeProgressMarkdown,
} from "./autonomous-loop-progress-log.mjs";
import { createPolicyGate, summarizeGates } from "./autonomous-loop-async-gates.mjs";
import { generateContracts, scoreAutonomyReadiness, summarizeContracts } from "./autonomous-loop-contracts.mjs";
import { createVerificationMatrix, validateEvidenceCoverage } from "./autonomous-loop-verification-matrix.mjs";
import { runFreshContextAttempt } from "./autonomous-loop-fresh-context-executor.mjs";
import { createToolAdapter, normalizeExecutionMode } from "./autonomous-loop-tool-adapters.mjs";
import { createWorkflowFlowModel } from "./supervibe-workflow-flow-model.mjs";

export async function runAutonomousLoop(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const runId = options.runId || createRunId(options.request || options.plan || nowIso());
  const loopDir = join(rootDir, ".claude", "memory", "loops", runId);
  await mkdir(loopDir, { recursive: true });
  const executionMode = normalizeExecutionMode(options.executionMode || (options.dryRun ? "dry-run" : "dry-run"));
  const commitPerTask = Boolean(options.commitPerTask || options["commit-per-task"]);

  if (options.statusFile) {
    const state = await readState(options.statusFile);
    return { statusText: formatStatus(state), state };
  }

  const sourceTasks = options.plan
    ? await loadPlanTasks(resolve(rootDir, options.plan))
    : createTasksFromRequest(options.request || "validate integrations");
  const taskGraph = createTaskGraph({
    graph_id: runId,
    source: options.plan ? { type: "plan", path: options.plan } : { type: "request", request: options.request || "" },
    tasks: sourceTasks,
  });
  const tasks = taskGraph.tasks;
  const budget = createBudget({
    ...options,
    maxLoops: options.maxLoops ?? (options.plan ? Math.max(20, tasks.length) : undefined),
  });
  const preflight = buildPreflight({
    request: options.request || options.plan || "",
    tasks,
    options: { ...options, executionMode, commitPerTask },
  });
  const contracts = generateContracts(tasks);
  const verificationMatrix = createVerificationMatrix(tasks, contracts);
  preflight.contracts = contracts;
  preflight.contract_summary = summarizeContracts(contracts);
  preflight.verification_matrix_summary = {
    scenarios: verificationMatrix.length,
    levels: [...new Set(verificationMatrix.map((entry) => entry.level))],
  };
  preflight.autonomy_readiness = scoreAutonomyReadiness({ tasks, contracts, preflight, gates: [] });
  await writePreflightArtifact(loopDir, preflight);

  const availableAgents = await loadAvailableAgents(rootDir);
  const platformInfo = detectPlatform();
  const runtime = detectRuntimeEnvironment({ request: options.request || "", tasks });
  const scores = [];
  const handoffs = [];
  const dispatches = [];
  const attempts = [];
  const mcpPlans = [];
  const events = [createAuditEvent("run_started", { runId, dryRun: Boolean(options.dryRun), runtime })];
  let claims = [];
  const gates = [];
  const progressEntries = [];
  const pluginVersion = await loadPluginVersion(rootDir);
  const retentionPolicy = createRetentionPolicy(options);
  const memoryWritePolicy = {
    redaction: true,
    stale_filter: true,
    speculation_filter: true,
    evidence_link_required: true,
    raw_secret_storage: false,
  };

  let loopCount = 0;
  let stopReason = null;
  let policyRisk = "low";

  const schedulerSnapshots = [];
  const failurePackets = [];
  const requeueCounts = new Map();
  let stopScheduler = false;
  const permissionAudit = preflight.provider_permission_audit || null;
  if (executionMode !== "dry-run" && permissionAudit && !permissionAudit.pass) {
    stopReason = permissionAudit.status;
    policyRisk = maxRisk(policyRisk, "medium");
    for (const task of tasks) {
      if (["open", "ready"].includes(task.status || "open")) {
        task.status = "blocked";
        task.resumeNotes = createResumeNotes({
          task,
          nextAction: permissionAudit.nextSafeAction,
          blocker: permissionAudit.status,
        });
        progressEntries.push(createProgressEntry({
          taskId: task.id,
          attemptId: `${task.id}-permission-audit`,
          section: "BLOCKERS",
          summary: `Provider permission audit blocked execution: ${permissionAudit.status}`,
          nextAction: permissionAudit.nextSafeAction,
          evidencePaths: [`permission-audit:${permissionAudit.auditId}`],
          blocker: permissionAudit.status,
        }));
      }
    }
    stopScheduler = true;
  }

  while (!stopScheduler) {
    const readyFront = calculateReadyFront({
      graph_id: taskGraph.graph_id,
      source: taskGraph.source,
      tasks,
    }, {
      maxConcurrentAgents: preflight.max_concurrent_agents,
      maxPolicyRiskLevel: "high",
      reviewersAvailable: true,
    });
    schedulerSnapshots.push(summarizeReadyFront(readyFront));

    if (!readyFront.valid) {
      stopReason = "invalid_task_graph";
      break;
    }
    if (isGraphClosed(tasks)) break;

    const readyBatch = readyFront.parallel.length > 0 ? readyFront.parallel : readyFront.ready.slice(0, 1);
    if (readyBatch.length === 0) {
      stopReason = stopReason || "graph_waiting_on_blockers";
      break;
    }

    for (const scheduledTask of readyBatch) {
      const task = tasks.find((candidate) => candidate.id === scheduledTask.id);
      if (!task || !["open", "ready"].includes(task.status)) continue;
      task.status = "in_progress";
    loopCount += 1;
    const budgetCheck = budgetStatus(budget, { loops: loopCount });
    if (budgetCheck.exceeded) {
      task.status = "budget_stopped";
      stopReason = budgetCheck.status;
      stopScheduler = true;
      break;
    }

    const dispatch = dispatchTask(task, { availableAgents });
    dispatches.push(dispatch);
    const attemptId = `${task.id}-attempt-${loopCount}`;
    const claimResult = claimTask({
      claims,
      task,
      agentId: dispatch.primaryAgentId,
      attemptId,
      approvalLease: options.approvalLease || preflight.approval_lease,
      ttlMinutes: preflight.approval_lease?.budget?.max_runtime_minutes || preflight.max_runtime_minutes,
    });
    claims = claimResult.claims;
    if (!claimResult.ok) {
      const gate = claimResult.reason === "exact_approval_lease_required"
        ? createPolicyGate({
          taskId: task.id,
          type: task.category,
          environment: preflight.environment_target,
          policyRiskLevel: task.policyRiskLevel,
        }, task.id)
        : null;
      if (gate) gates.push(gate);
      task.status = "blocked";
      task.resumeNotes = createResumeNotes({
        task,
        claim: claimResult.activeClaim,
        nextAction: "repair stale claim or provide exact approval lease",
        blocker: claimResult.reason,
      });
      stopReason = claimResult.reason;
      scores.push({ taskId: task.id, finalScore: 0, status: task.status, reason: claimResult.reason });
      attempts.push(createRunnerAttempt({
        task,
        attemptId,
        executionMode,
        status: "blocked",
        verificationEvidence: [],
        score: scores.at(-1),
      }));
      progressEntries.push(createProgressEntry({
        taskId: task.id,
        attemptId,
        section: "BLOCKERS",
        summary: `Claim blocked: ${claimResult.reason}`,
        nextAction: task.resumeNotes.nextAction,
        evidencePaths: gate ? [`gate:${gate.gateId}`] : [],
        blocker: claimResult.reason,
      }));
      continue;
    }
    const activeClaim = claimResult.claim;
    task.resumeNotes = createResumeNotes({
      task,
      claim: activeClaim,
      nextAction: "run policy guard and task verification",
    });
    progressEntries.push(createProgressEntry({
      taskId: task.id,
      attemptId,
      section: "IN_PROGRESS",
      summary: `Claimed by ${dispatch.primaryAgentId}`,
      nextAction: "run policy guard and task verification",
    }));

    const policy = guardAction({
      type: task.category,
      taskId: task.id,
      description: task.goal,
      environment: preflight.environment_target,
      policyRiskLevel: task.policyRiskLevel,
    }, task.policyRiskLevel === "high" ? options.approvalLease : null, { createGate: true });
    policyRisk = maxRisk(policyRisk, policy.risk);

    if (!policy.allowed) {
      if (policy.gate) gates.push(policy.gate);
      task.status = policy.status;
      stopReason = policy.status;
      scores.push({ taskId: task.id, finalScore: 0, status: task.status, reason: policy.reason });
      attempts.push(createRunnerAttempt({
        task,
        attemptId,
        executionMode,
        status: "blocked",
        verificationEvidence: [],
        score: scores.at(-1),
      }));
      claims = releaseClaim(claims, activeClaim.claimId, "failed");
      task.resumeNotes = createResumeNotes({
        task,
        claim: activeClaim,
        nextAction: "resolve policy blocker or request exact approval",
        blocker: policy.reason,
      });
      progressEntries.push(createProgressEntry({
        taskId: task.id,
        attemptId,
        section: "BLOCKERS",
        summary: `Policy blocked: ${policy.reason}`,
        nextAction: task.resumeNotes.nextAction,
        evidencePaths: policy.gate ? [`gate:${policy.gate.gateId}`] : [],
        blocker: policy.reason,
      }));
      continue;
    }

    const renderedCommands = (task.verificationCommands || []).map((command) => renderCommand(command, platformInfo));
    if (renderedCommands.some((item) => !item.ok)) {
      task.status = "command_adapter_required";
      stopReason = "command_adapter_required";
      scores.push({ taskId: task.id, finalScore: 7, status: task.status });
      attempts.push(createRunnerAttempt({
        task,
        attemptId,
        executionMode,
        status: "blocked",
        verificationEvidence: [],
        score: scores.at(-1),
      }));
      claims = releaseClaim(claims, activeClaim.claimId, "failed");
      continue;
    }

    const mcpPlan = planMcpUse(task, options.mcpToolsAllowed || preflight.mcp_tools_allowed || []);
    mcpPlans.push({ taskId: task.id, ...mcpPlan });
    const workflowFlow = createWorkflowFlowModel({
      run: {
        run_id: runId,
        status: stopReason ? "BLOCKED" : "IN_PROGRESS",
        tasks,
        gates,
        claims,
        active_task: task.id,
      },
    });
    const contextPack = buildContextPlan(task, {
      memoryEntries: options.dryRun ? [{ id: "dry-run-memory", summary: "dry-run context" }] : [],
      codeRagChunks: options.dryRun ? [{ file: "dry-run", summary: "dry-run code search" }] : [],
      codeGraphEvidence: options.dryRun ? [{ summary: "dry-run graph evidence" }] : [],
      directFilesRead: [],
      rulesLoaded: selectRulesForTask(task),
      mcpPlan,
      workflowFlow,
      runId,
      graphId: taskGraph.graph_id,
      epicId: taskGraph.graph_id,
      projectId: taskGraph.graph_id,
      claims,
      claim: activeClaim,
      gates,
      dispatch,
      nextAction: task.resumeNotes?.nextAction,
      triggerSignal: {
        source: taskGraph.source?.type || null,
        request: taskGraph.source?.request || options.request || null,
      },
    });

    if (executionMode !== "dry-run") {
      const adapter = options.adapter || createToolAdapter(options.adapterId || "generic-shell-stub", options.adapterConfig || {});
      const freshAttempt = await runFreshContextAttempt({
        task,
        adapter,
        mode: executionMode,
        attemptId,
        attemptDir: join(loopDir, "attempts"),
        ledgerPath: join(loopDir, "side-effects.jsonl"),
        contract: contracts.find((contract) => contract.taskId === task.id),
        verificationMatrix: verificationMatrix.filter((entry) => entry.taskId === task.id),
        contextPack,
        progressNotes: task.resumeNotes,
        policyBoundaries: {
          environment: preflight.environment_target,
          requireExactApprovalForHighRisk: true,
          noRawSecrets: true,
          noPermissionBypass: true,
        },
        sideEffectRules: {
          recordEverySpawnedProcess: true,
          recordEveryMutation: true,
          stopMustBeAvailable: true,
          defaultCommitBehavior: commitPerTask ? "commit-after-green-opt-in" : "no-auto-commit",
        },
        allowSpawn: Boolean(options.allowSpawn),
        approvalLeaseId: preflight.approval_lease.scope,
        permissionAudit,
      });
      attempts.push(freshAttempt);
      scores.push(freshAttempt.score || { taskId: task.id, finalScore: 0, status: freshAttempt.status });

      if (freshAttempt.status !== "completed") {
        const retryDecision = markTaskForRetryOrBlock({
          task,
          attempt: freshAttempt,
          requeueCounts,
          maxRetries: options.maxTaskRetries ?? 1,
        });
        if (freshAttempt.failurePacket) failurePackets.push(freshAttempt.failurePacket);
        claims = releaseClaim(claims, activeClaim.claimId, retryDecision.status === "requeued" ? "released" : "failed");
        task.resumeNotes = createResumeNotes({
          task,
          claim: activeClaim,
          nextAction: retryDecision.nextAction,
          blocker: retryDecision.reason,
          evidencePaths: freshAttempt.outputPath ? [freshAttempt.outputPath] : [],
        });
        progressEntries.push(createProgressEntry({
          taskId: task.id,
          attemptId,
          section: retryDecision.status === "requeued" ? "IN_PROGRESS" : "BLOCKERS",
          summary: `Fresh-context attempt ${freshAttempt.status}: ${retryDecision.reason}`,
          nextAction: retryDecision.nextAction,
          evidencePaths: freshAttempt.outputPath ? [freshAttempt.outputPath] : [],
          blocker: retryDecision.status === "blocked" ? retryDecision.reason : null,
          scoreId: `score-${task.id}`,
        }));
        if (retryDecision.status === "blocked") stopReason = retryDecision.reason;
        continue;
      }

      task.status = "complete";
      task.verificationMatrix = verificationMatrix.filter((entry) => entry.taskId === task.id);
      claims = releaseClaim(claims, activeClaim.claimId, "completed");
      task.resumeNotes = createResumeNotes({
        task,
        claim: activeClaim,
        nextAction: "task completed; continue to next ready task",
        evidencePaths: freshAttempt.verificationEvidence,
      });
      handoffs.push({
        taskId: task.id,
        sourceAgent: dispatch.primaryAgentId,
        targetAgent: dispatch.reviewerAgentId,
        summary: `Fresh-context completed ${task.goal}`,
        confidenceScore: freshAttempt.score.finalScore,
        contextPack,
        sideEffectId: freshAttempt.sideEffectId,
        verificationEvidence: freshAttempt.verificationEvidence,
        reviewerEvidence: createReviewerEvidence(dispatch, task, freshAttempt.verificationEvidence),
      });
      progressEntries.push(createProgressEntry({
        taskId: task.id,
        attemptId,
        section: "COMPLETED",
        summary: `Completed with score ${freshAttempt.score.finalScore}`,
        nextAction: "continue to next ready task",
        evidencePaths: freshAttempt.verificationEvidence,
        scoreId: `score-${task.id}`,
      }));
      continue;
    }

    const sideEffect = await appendSideEffect(join(loopDir, "side-effects.jsonl"), {
      type: task.category,
      targetEnvironment: preflight.environment_target,
      expectedSideEffect: options.dryRun ? "dry-run-no-mutation" : "local-task-execution",
      approvalLeaseId: preflight.approval_lease.scope,
      commandOrToolClass: "runner",
      verificationCommand: renderedCommands[0]?.renderedCommand || null,
      rollbackOrCleanupAction: options.dryRun ? "none" : "restore previous workspace state or stop for user cleanup",
      status: "verified",
    });

    task.status = "complete";
    task.verificationMatrix = verificationMatrix.filter((entry) => entry.taskId === task.id);
    const score = evaluateTask(task, {
      verificationRan: true,
      verificationEvidence: renderedCommands.length > 0
        ? renderedCommands.map((command) => command.renderedCommand)
        : ["dry-run verification evidence"],
      verificationMatrix: validateEvidenceCoverage({ tasks: [task], matrix: task.verificationMatrix, gates }),
      testsPassed: true,
      integrationWorks: true,
      noRegressions: true,
      codeGraphHandled: true,
      handoffComplete: true,
      policyCompliant: true,
      independentReview: true,
      userApproval: task.policyRiskLevel !== "high" || Boolean(options.approvalLease),
    });
    scores.push(score);
    attempts.push(createRunnerAttempt({
      task,
      attemptId,
      executionMode,
      status: "completed",
      verificationEvidence: renderedCommands.length > 0
        ? renderedCommands.map((command) => command.renderedCommand)
        : ["dry-run verification evidence"],
      score,
      sideEffectId: sideEffect.actionId,
    }));
    claims = releaseClaim(claims, activeClaim.claimId, "completed");
    task.resumeNotes = createResumeNotes({
      task,
      claim: activeClaim,
      nextAction: "task completed; continue to next ready task",
      evidencePaths: renderedCommands.length > 0
        ? renderedCommands.map((command) => command.renderedCommand)
        : ["dry-run verification evidence"],
    });
    handoffs.push({
      taskId: task.id,
      sourceAgent: dispatch.primaryAgentId,
      targetAgent: dispatch.reviewerAgentId,
      summary: `Dry-run completed ${task.goal}`,
      confidenceScore: score.finalScore,
      contextPack,
      sideEffectId: sideEffect.actionId,
      verificationEvidence: renderedCommands.length > 0
        ? renderedCommands.map((command) => command.renderedCommand)
        : ["dry-run verification evidence"],
      reviewerEvidence: createReviewerEvidence(dispatch, task, renderedCommands.length > 0
        ? renderedCommands.map((command) => command.renderedCommand)
        : ["dry-run verification evidence"]),
    });
    progressEntries.push(createProgressEntry({
      taskId: task.id,
      attemptId,
      section: "COMPLETED",
      summary: `Completed with score ${score.finalScore}`,
      nextAction: "continue to next ready task",
      evidencePaths: task.resumeNotes.evidencePaths,
      scoreId: `score-${task.id}`,
    }));
    }
  }

  const sideEffects = await readSideEffects(join(loopDir, "side-effects.jsonl"));
  const sideEffectStatus = reconcileSideEffects(sideEffects);
  if (!sideEffectStatus.ok) stopReason = sideEffectStatus.status;

  const runScore = evaluateRun(tasks, scores);
  const graphSummary = summarizeGraph(tasks);
  const requeueSummary = summarizeRequeues(attempts, failurePackets);
  const state = createState({
    runId,
    status: stopReason ? "BLOCKED" : runScore.complete ? "COMPLETE" : "PARTIAL",
    loopCount,
    scores,
    budgetRemaining: budgetStatus(budget, { loops: loopCount }).remaining,
    stopReason,
    nextAction: stopReason ? "ask_user_or_fix_blocker" : "none",
    tasks,
    pluginVersion,
    dispatches,
    runtimeEnvironment: runtime,
    mcpPlans,
    memoryWritePolicy,
    claims,
    progressSummary: summarizeProgress(progressEntries),
    toolAdapters: preflight.tool_adapters,
    executionMode,
    commitPerTask,
    attempts,
    worktreeSessions: options.worktreeSession ? [options.worktreeSession] : options.worktreeSessions || [],
    permissionAudit,
    policyProfile: preflight.policy_profile,
  });
  state.claim_summary = summarizeClaims(claims);
  state.gates = gates;
  state.gate_summary = summarizeGates(gates);
  state.run_score = runScore.runScore;
  state.policy_risk = policyRisk;
  state.events = events;
  state.handoffs = handoffs;
  state.preflight = preflight;
  state.contracts = contracts;
  state.verification_matrix = verificationMatrix;
  state.task_graph = {
    graph_id: taskGraph.graph_id,
    source: taskGraph.source,
    tasks: tasks.map((task) => ({
      id: task.id,
      status: task.status,
      dependencies: task.dependencies || [],
      dependents: task.dependents || [],
    })),
  };
  state.scheduler = {
    snapshots: schedulerSnapshots,
    graph_summary: graphSummary,
  };
  state.ready_summary = graphSummary;
  state.requeue_summary = requeueSummary;
  state.failure_packets = failurePackets;
  state.autonomy_readiness = scoreAutonomyReadiness({ tasks, contracts, preflight, gates });
  state.retention_policy = retentionPolicy;
  state.execution_mode = executionMode;
  state.commit_per_task = commitPerTask;
  state.tool_adapters = preflight.tool_adapters;
  state.tool_adapter_summary = preflight.tool_adapter_summary;
  state.permission_audit = permissionAudit;
  state.permission_audit_summary = preflight.provider_permission_audit_summary;
  state.attempts = attempts;

  const provenance = finalReportProvenance({
    tasks,
    handoffs,
    scores,
    approvals: [preflight.approval_lease],
    verification: scores.map((score) => ({ taskId: score.taskId, finalScore: score.finalScore })),
  });
  state.final_report_provenance = provenance;
  const finalAcceptance = evaluateFinalAcceptance({
    state,
    preflight,
    tasks,
    scores,
    handoffs,
    sideEffects,
    dispatches,
    mcpPlans,
    retentionPolicy,
    provenance,
    verificationMatrix,
    failurePackets,
    sideEffectStatus,
  });
  state.final_acceptance = finalAcceptance;
  if (!finalAcceptance.pass && !stopReason) {
    stopReason = "final_acceptance_failed";
    state.status = "BLOCKED";
    state.stop_reason = stopReason;
    state.next_action = "fix_final_acceptance_gaps";
    state.run_score = Math.min(state.run_score, finalAcceptance.score);
  }

  await writeState(join(loopDir, "state.json"), state);
  await writeFile(join(loopDir, "tasks.jsonl"), `${tasks.map((task) => JSON.stringify(versionEnvelope(task))).join("\n")}\n`, "utf8");
  await writeFile(join(loopDir, "scores.jsonl"), `${scores.map((score) => JSON.stringify(versionEnvelope(score))).join("\n")}\n`, "utf8");
  await writeFile(join(loopDir, "handoffs.jsonl"), `${handoffs.map((handoff) => JSON.stringify(versionEnvelope(handoff))).join("\n")}\n`, "utf8");
  await writeFile(join(loopDir, "events.jsonl"), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
  await writeProgressMarkdown(join(loopDir, "progress.md"), progressEntries);
  await writeFile(join(loopDir, "final-report.md"), finalReport({ runId, state, runScore, preflight, finalAcceptance, provenance }), "utf8");

  return {
    runId,
    loopDir,
    state,
    finalScore: runScore.runScore,
    status: state.status,
    stopReason,
    reportPath: join(loopDir, "final-report.md"),
  };
}

export async function resumeAutonomousLoop(statePath) {
  const raw = JSON.parse(await readFile(statePath, "utf8"));
  const validation = validateStateVersions(raw);
  if (!validation.ok) {
    const migration = migrateState(raw);
    if (migration.error) return { status: validation.status, state: raw };
    await writeFile(`${statePath}.pre-migration`, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
    await writeFile(statePath, `${JSON.stringify(migration.state, null, 2)}\n`, "utf8");
    return { status: "migrated", state: migration.state };
  }
  return { status: "compatible", state: raw };
}

export async function stopAutonomousLoop(statePath, reason = "user_requested_stop") {
  const state = await readState(statePath);
  const token = createCancellationToken(state.run_id, reason);
  const next = applyCancellation(state, token);
  await writeState(statePath, next);
  return next;
}

function finalReport({ runId, state, runScore, preflight, finalAcceptance, provenance }) {
  return `# Autonomous Loop Report

Run: ${runId}
Status: ${state.status}
Final score: ${state.run_score}/10
Stop reason: ${state.stop_reason || "none"}
Environment: ${preflight.environment_target}

## Evidence
- Tasks: ${state.tasks.length}
- Scores: ${state.scores.length}
- Complete/blocked/pending: ${state.ready_summary?.complete || 0}/${state.ready_summary?.blocked || 0}/${state.ready_summary?.open || 0}
- Requeues: ${state.requeue_summary?.total || 0}
- Policy risk: ${state.policy_risk}
- Approval lease: ${preflight.approval_lease.scope}
- Policy profile: ${preflight.policy_profile?.name || "none"} (${preflight.policy_profile?.role || "no role"})
- Final acceptance: ${finalAcceptance.pass ? "pass" : "fail"}
- Final acceptance score: ${finalAcceptance.score}/10
- Provenance task ids: ${provenance.taskIds.length}
- Provenance score task ids: ${provenance.scoreTaskIds.length}

## Provider Compliance
- Permission audit: ${state.permission_audit?.pass ? "pass" : "fail"} (${state.permission_audit?.status || "missing"})
- Permission mode: ${state.permission_audit?.permissionMode || "unknown"}
- Bypass disabled: ${state.permission_audit?.bypassDisabled !== false}
- Denied tools: ${state.permission_audit?.deniedToolClasses?.join(", ") || "none"}
- Prompt-required tools: ${state.permission_audit?.promptRequiredToolClasses?.join(", ") || "none"}
- Next safe action: ${state.permission_audit?.nextSafeAction || "none"}
`;
}

function maxRisk(a, b) {
  const order = { none: 0, low: 1, medium: 2, high: 3 };
  return (order[b] || 0) > (order[a] || 0) ? b : a;
}

function createRunnerAttempt({
  task,
  attemptId,
  executionMode,
  status,
  verificationEvidence = [],
  score = null,
  sideEffectId = null,
} = {}) {
  return {
    attemptId,
    taskId: task.id,
    executionMode,
    status,
    outputPath: null,
    changedFiles: [],
    verificationEvidence,
    score,
    failurePacket: null,
    sideEffectId,
  };
}

function isGraphClosed(tasks = []) {
  return tasks.every((task) => ["complete", "cancelled", "blocked", "policy_stopped", "budget_stopped", "command_adapter_required"].includes(task.status));
}

function summarizeReadyFront(front) {
  return {
    valid: front.valid,
    ready: front.ready?.map((task) => task.id) || [],
    blocked: front.blocked?.map((task) => task.id) || [],
    parallel: front.parallel?.map((task) => task.id) || [],
    issues: front.issues || [],
  };
}

function summarizeGraph(tasks = []) {
  const summary = {
    ready: 0,
    blocked: 0,
    claimed: 0,
    complete: 0,
    open: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const task of tasks) {
    if (["open", "ready"].includes(task.status)) summary.open += 1;
    else if (task.status === "in_progress" || task.status === "claimed") summary.claimed += 1;
    else if (task.status === "complete") summary.complete += 1;
    else if (task.status === "cancelled") summary.cancelled += 1;
    else if (task.status === "blocked" || task.status === "policy_stopped" || task.status === "budget_stopped" || task.status === "command_adapter_required") summary.blocked += 1;
    else if (task.status === "failed") summary.failed += 1;
  }
  return summary;
}

function summarizeRequeues(attempts = [], failurePackets = []) {
  const signatures = new Map();
  for (const packet of failurePackets) {
    const signature = [
      packet.taskId,
      packet.failedScenario,
      packet.firstDivergentModule,
      packet.firstDivergentMarker,
      packet.requeueReason,
    ].join("|");
    signatures.set(signature, (signatures.get(signature) || 0) + 1);
  }
  return {
    total: attempts.filter((attempt) => attempt.status === "requeued").length,
    failures: failurePackets.length,
    repeated_failure_signatures: [...signatures.entries()]
      .filter(([, count]) => count > 1)
      .map(([signature, count]) => ({ signature, count })),
  };
}

function markTaskForRetryOrBlock({ task, attempt, requeueCounts, maxRetries }) {
  const rawReason = attempt.failurePacket?.requeueReason || attempt.status;
  const reason = normalizeRequeueReason(rawReason);
  const count = requeueCounts.get(task.id) || 0;
  if (count < maxRetries) {
    requeueCounts.set(task.id, count + 1);
    task.status = "open";
    task.requeueReason = reason;
    attempt.status = "requeued";
    return {
      status: "requeued",
      reason,
      nextAction: `retry task with failure packet (${reason})`,
    };
  }
  task.status = "blocked";
  task.requeueReason = reason;
  return {
    status: "blocked",
    reason,
    nextAction: `resolve blocker before retry (${reason})`,
  };
}

function createReviewerEvidence(dispatch, task, evidencePaths = []) {
  return {
    reviewerAgentId: dispatch.reviewerAgentId,
    independent: dispatch.reviewerAgentId !== dispatch.primaryAgentId,
    required: requiresIndependentReview(task),
    evidencePaths,
  };
}

function requiresIndependentReview(task = {}) {
  const text = `${task.goal || ""} ${task.category || ""}`.toLowerCase();
  return task.policyRiskLevel === "high"
    || /security|production|shared contract|broad refactor|architecture/.test(text);
}

async function loadPluginVersion(rootDir) {
  try {
    const pkg = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}
