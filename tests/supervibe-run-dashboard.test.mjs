import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildRunDashboardModel,
  redactDashboardModel,
  redactDashboardText,
  renderRunDashboardHtml,
  summarizeRunObservability,
} from "../scripts/lib/supervibe-run-dashboard.mjs";

const execFileAsync = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const state = {
  run_id: "run-dashboard",
  status: "IN_PROGRESS",
  startedAt: "2026-04-30T00:00:00.000Z",
  last_progress_at: "2026-04-30T00:10:00.000Z",
  tasks: [
    { id: "t1", goal: "Done", status: "complete", dependencies: [], policyRiskLevel: "low" },
    { id: "t2", goal: "Blocked token=secret-value-that-must-redact", status: "blocked", dependencies: ["t1"] },
  ],
  attempts: [{ taskId: "t1" }, { taskId: "t1" }, { taskId: "t2" }],
  claims: [{ taskId: "t2", status: "expired" }],
  gates: [{ taskId: "t2", gateId: "g1", status: "open" }],
  verification_matrix: [{ taskId: "t1", status: "pass" }, { taskId: "t2", status: "fail" }],
  failure_packets: [{ taskId: "t2" }],
};

test("dashboard model and HTML expose required views while redacting sensitive content", () => {
  const model = buildRunDashboardModel({
    state,
    progressLog: [
      { createdAt: "2026-04-30T00:01:00.000Z", section: "BLOCKED", summary: "waiting" },
      { createdAt: "2026-04-30T00:04:00.000Z", section: "RESOLVED", summary: "closed" },
    ],
    delegatedMessages: [{ workItemId: "t2", type: "blocker-request", target: "user", body: "Need token=abc123456789", status: "open" }],
    generatedAt: "2026-04-30T00:10:00.000Z",
  });
  const html = renderRunDashboardHtml(model);

  assert.match(html, /id="graph"/);
  assert.match(html, /id="timeline"/);
  assert.match(html, /id="delegated-inbox"/);
  assert.match(html, /id="release-gates"/);
  assert.doesNotMatch(html, /secret-value-that-must-redact/);
  assert.match(html, /\[REDACTED\]/);
  assert.equal(model.observability.verificationPassCount, 1);
  assert.equal(model.observability.verificationFailCount, 1);
});

test("observability summary captures duration, attempts, verification, requeue, and stale claims", () => {
  const summary = summarizeRunObservability({ state, now: "2026-04-30T00:10:00.000Z" });

  assert.equal(summary.durationSeconds, 600);
  assert.equal(summary.attemptsPerTask.t1, 2);
  assert.equal(summary.requeueCount, 1);
  assert.equal(summary.staleClaimCount, 1);
});

test("supervibe-status dashboard command writes an offline HTML file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-dashboard-"));
  const statePath = join(dir, "state.json");
  const outPath = join(dir, "dashboard.html");
  await writeFile(statePath, JSON.stringify(state), "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-status.mjs"),
    "--dashboard",
    "--file",
    statePath,
    "--out",
    outPath,
    "--no-color",
  ], { cwd: ROOT });

  assert.match(stdout, /SUPERVIBE_DASHBOARD/);
  assert.match(await readFile(outPath, "utf8"), /Supervibe Run Dashboard/);
  assert.match(redactDashboardText("C:\\Users\\alice\\repo token=secret-value"), /\[USER_PATH\]/);
  assert.equal(redactDashboardModel({ note: "raw prompt: secret-value" }).note, "raw prompt:[REDACTED]");
});
