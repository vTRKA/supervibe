import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { LOOP_SCHEMA_VERSION } from "./autonomous-loop-constants.mjs";
import { summarizeClaims } from "./autonomous-loop-claims.mjs";
import { reconcileSideEffects, readSideEffects } from "./autonomous-loop-side-effect-ledger.mjs";
import { calculateReadyFront } from "./autonomous-loop-ready-front.mjs";
import { validateTaskGraph } from "./autonomous-loop-task-graph.mjs";
import { diagnoseCompactedMemory } from "./autonomous-loop-learning-extractor.mjs";

const REQUIRED_ARTIFACTS = [
  "state.json",
  "tasks.jsonl",
  "scores.jsonl",
  "side-effects.jsonl",
  "progress.md",
  "final-report.md",
];

export async function diagnoseLoopRun(path, options = {}) {
  const runDir = resolveRunDir(path);
  const issues = [];
  const artifactStatus = {};

  for (const artifact of REQUIRED_ARTIFACTS) {
    const filePath = join(runDir, artifact);
    const exists = await fileExists(filePath);
    artifactStatus[artifact] = exists ? "present" : "missing";
    if (!exists) issues.push(issue("missing-artifact", artifact, `${artifact} is missing`));
  }

  const state = await readJsonSafe(join(runDir, "state.json"), issues, "state.json");
  if (state) {
    if (state.schema_version !== LOOP_SCHEMA_VERSION) {
      issues.push(issue("schema-version-mismatch", "state.json", `state schema version is ${state.schema_version || "missing"}`));
    }

    const graphValidation = validateTaskGraph({ tasks: state.tasks || [] });
    for (const graphIssue of graphValidation.issues || []) {
      issues.push(issue(`graph-${graphIssue.code}`, graphIssue.taskId, graphIssue.message));
    }

    const taskIds = new Set((state.tasks || []).map((task) => task.id));
    for (const attempt of state.attempts || []) {
      if (!taskIds.has(attempt.taskId)) {
        issues.push(issue("orphan-attempt", attempt.attemptId, `Attempt ${attempt.attemptId} points to missing task ${attempt.taskId}`));
      }
      if (attempt.outputPath && !(await fileExists(resolve(runDir, attempt.outputPath)))) {
        issues.push(issue("missing-evidence", attempt.attemptId, `Attempt evidence path is missing: ${attempt.outputPath}`));
      }
    }

    const now = new Date(options.now || Date.now()).getTime();
    for (const claim of state.claims || []) {
      if (claim.status === "active" && claim.expiresAt && new Date(claim.expiresAt).getTime() < now) {
        issues.push(issue("stale-claim", claim.claimId, `Claim ${claim.claimId} expired at ${claim.expiresAt}`));
      }
    }
  }

  await readJsonlSafe(join(runDir, "tasks.jsonl"), issues, "tasks.jsonl");
  await readJsonlSafe(join(runDir, "scores.jsonl"), issues, "scores.jsonl");
  const sideEffects = await readSideEffects(join(runDir, "side-effects.jsonl"));
  const sideEffectStatus = reconcileSideEffects(sideEffects);
  if (!sideEffectStatus.ok) {
    issues.push(issue("unresolved-side-effect", "side-effects.jsonl", sideEffectStatus.status));
  }

  const compactedSummaryPath = join(runDir, "compacted-summary.json");
  if (await fileExists(compactedSummaryPath)) {
    const compactedSummary = await readJsonSafe(compactedSummaryPath, issues, "compacted-summary.json");
    if (compactedSummary) {
      const memoryDiagnosis = await diagnoseCompactedMemory(compactedSummary, { rootDir: runDir });
      for (const memoryIssue of memoryDiagnosis.issues) {
        issues.push(issue(memoryIssue.code, memoryIssue.target, memoryIssue.message));
      }
    }
  }

  return {
    ok: issues.length === 0,
    runDir,
    artifactStatus,
    issues,
    summary: summarizeDoctorIssues(issues),
  };
}

export async function repairLoopRun(path, { fix = false, now = new Date().toISOString() } = {}) {
  const runDir = resolveRunDir(path);
  const statePath = join(runDir, "state.json");
  const state = await readJsonSafe(statePath, [], "state.json");
  if (!state) throw new Error("Cannot repair without state.json");
  if (!fix) {
    return { changed: false, backupPath: null, preview: repairPreview(state, now) };
  }

  const backupPath = `${statePath}.pre-doctor-fix`;
  await copyFile(statePath, backupPath);
  const taskIds = new Set((state.tasks || []).map((task) => task.id));
  state.claims = (state.claims || []).map((claim) =>
    claim.status === "active" && claim.expiresAt && new Date(claim.expiresAt).getTime() < new Date(now).getTime()
      ? { ...claim, status: "expired" }
      : claim
  );
  state.attempts = (state.attempts || []).filter((attempt) => taskIds.has(attempt.taskId));
  state.claim_summary = summarizeClaims(state.claims || []);
  state.ready_summary = countTaskStatuses(state.tasks || []);
  if (!state.next_action) state.next_action = "inspect doctor output and resume after blockers are resolved";

  const reportPath = join(runDir, "final-report.md");
  if (!(await fileExists(reportPath))) {
    await writeFile(reportPath, renderRepairReport(state), "utf8");
  }
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return { changed: true, backupPath, state };
}

export async function primeLoopRun(path) {
  const runDir = resolveRunDir(path);
  const state = await readJsonSafe(join(runDir, "state.json"), [], "state.json");
  if (!state) throw new Error("Cannot prime without state.json");
  const readyFront = calculateReadyFront({ tasks: state.tasks || [] }, {
    maxConcurrentAgents: state.preflight?.max_concurrent_agents || 3,
    maxPolicyRiskLevel: "high",
  });
  return [
    "SUPERVIBE_LOOP_PRIME",
    `RUN_ID: ${state.run_id || "unknown"}`,
    `OBJECTIVE: ${state.preflight?.objective || state.preflight?.request || "unknown"}`,
    `STATUS: ${state.status || "unknown"}`,
    `READY: ${readyFront.ready.map((task) => task.id).join(", ") || "none"}`,
    `BLOCKED: ${readyFront.blocked.map((task) => `${task.id}(${(task.blockers || []).join("+")})`).join(", ") || "none"}`,
    `ACTIVE_CLAIMS: ${(state.claims || []).filter((claim) => claim.status === "active").map((claim) => claim.claimId).join(", ") || "none"}`,
    `OPEN_GATES: ${(state.gates || []).filter((gate) => ["open", "waiting", "blocked"].includes(gate.status)).map((gate) => gate.gateId).join(", ") || "none"}`,
    `NEXT_ACTION: ${state.next_action || "dispatch"}`,
  ].join("\n");
}

export async function formatDoctorReport(path, options = {}) {
  const result = await diagnoseLoopRun(path, options);
  return [
    "SUPERVIBE_LOOP_DOCTOR",
    `OK: ${result.ok}`,
    `RUN_DIR: ${result.runDir}`,
    `ISSUES: ${result.issues.length}`,
    ...result.issues.map((item) => `- ${item.code}: ${item.message}`),
  ].join("\n");
}

function resolveRunDir(path) {
  const resolved = resolve(path);
  return resolved.endsWith("state.json") ? dirname(resolved) : resolved;
}

async function readJsonSafe(filePath, issues, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") issues.push(issue("invalid-json", label, `${label} is invalid JSON: ${err.message}`));
    return null;
  }
}

async function readJsonlSafe(filePath, issues, label) {
  try {
    const content = await readFile(filePath, "utf8");
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try {
        JSON.parse(line);
      } catch (err) {
        issues.push(issue("invalid-jsonl", label, `${label}:${index + 1} is invalid JSONL: ${err.message}`));
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function repairPreview(state, now) {
  return {
    staleClaims: (state.claims || []).filter((claim) =>
      claim.status === "active" && claim.expiresAt && new Date(claim.expiresAt).getTime() < new Date(now).getTime()
    ).length,
    orphanAttempts: (state.attempts || []).filter((attempt) => !(state.tasks || []).some((task) => task.id === attempt.taskId)).length,
  };
}

function summarizeDoctorIssues(issues) {
  return issues.reduce((acc, item) => {
    acc[item.code] = (acc[item.code] || 0) + 1;
    return acc;
  }, {});
}

function countTaskStatuses(tasks) {
  const counts = { ready: 0, blocked: 0, claimed: 0, complete: 0, open: 0, failed: 0, cancelled: 0 };
  for (const task of tasks) {
    if (["open", "ready"].includes(task.status)) counts.open += 1;
    else if (task.status === "complete") counts.complete += 1;
    else if (["blocked", "policy_stopped", "budget_stopped", "command_adapter_required"].includes(task.status)) counts.blocked += 1;
    else if (task.status === "in_progress" || task.status === "claimed") counts.claimed += 1;
    else if (task.status === "failed") counts.failed += 1;
    else if (task.status === "cancelled") counts.cancelled += 1;
  }
  return counts;
}

function renderRepairReport(state) {
  return `# Autonomous Loop Repair Report

Run: ${state.run_id || "unknown"}
Status: ${state.status || "unknown"}
Next action: ${state.next_action || "inspect doctor output"}
`;
}

function issue(code, target, message) {
  return { code, target, message };
}
