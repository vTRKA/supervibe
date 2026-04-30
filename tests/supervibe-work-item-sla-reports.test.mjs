import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createWorkItemIndex } from "../scripts/lib/supervibe-work-item-query.mjs";
import {
  createRecurringWorkReport,
  createSlaReport,
  redactWorkReport,
  renderWorkReportMarkdown,
  writeWorkReportMarkdown,
} from "../scripts/lib/supervibe-work-item-sla-reports.mjs";

const execFileAsync = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function graph() {
  return {
    items: [
      { itemId: "ready-old", title: "Old ready", status: "open", createdAt: "2026-04-28T00:00:00.000Z" },
      { itemId: "human-blocked", title: "Need approval token=secret-value-that-must-redact", status: "blocked", createdAt: "2026-04-29T00:00:00.000Z", dueAt: "2026-04-29T12:00:00.000Z" },
    ],
    tasks: [
      { id: "ready-old", status: "open", dependencies: [] },
      { id: "human-blocked", status: "blocked", dependencies: [] },
    ],
  };
}

test("SLA report separates human waiting from agent failures and redacts markdown", () => {
  const index = createWorkItemIndex({
    graph: graph(),
    delegatedMessages: [{ workItemId: "human-blocked", status: "open", type: "blocker-request", createdAt: "2026-04-29T00:30:00.000Z" }],
    now: "2026-04-30T12:00:00.000Z",
  });
  const report = createSlaReport(index, { now: "2026-04-30T12:00:00.000Z", slaHours: 12 });
  const markdown = renderWorkReportMarkdown(report);

  assert.equal(report.summary.overdue, 1);
  assert.equal(report.items.find((item) => item.itemId === "human-blocked").waitingOnHuman, true);
  assert.equal(report.items.find((item) => item.itemId === "human-blocked").agentFailure, false);
  assert.doesNotMatch(markdown, /secret-value-that-must-redact/);
  assert.match(redactWorkReport("C:\\Users\\alice\\repo raw prompt: secret-value"), /\[USER_PATH\]/);
});

test("daily report and status CLI report export produce local redacted markdown", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-report-"));
  const graphPath = join(dir, "graph.json");
  const outPath = join(dir, "sla.md");
  await writeFile(graphPath, JSON.stringify(graph()), "utf8");
  const index = createWorkItemIndex({ graph: graph(), now: "2026-04-30T12:00:00.000Z" });
  const daily = createRecurringWorkReport(index, { type: "daily", now: "2026-04-30T12:00:00.000Z" });
  const written = await writeWorkReportMarkdown(outPath, daily);

  assert.match(written.markdown, /Supervibe Daily Report/);
  assert.match(await readFile(outPath, "utf8"), /Next Ready/);

  const cli = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-status.mjs"),
    "--report",
    "sla",
    "--file",
    graphPath,
    "--now",
    "2026-04-30T12:00:00.000Z",
    "--no-color",
  ], { cwd: ROOT });
  assert.match(cli.stdout, /Supervibe Sla Report/);
  assert.doesNotMatch(cli.stdout, /secret-value-that-must-redact/);
});
