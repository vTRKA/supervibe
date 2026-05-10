import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { atomizePlanToWorkItems } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import {
  formatEpicCompletionReport,
  validateEpicCompletion,
} from "../scripts/lib/supervibe-epic-completion-validator.mjs";

const PLAN = `# Completion Plan

Critical path: T1 -> T2

## Task 1: Build completion validator
**Files:**
- Create: \`scripts/lib/completion.js\`
**Acceptance Criteria:**
- Validator identifies closed work.
\`\`\`bash
node --test tests/completion.test.mjs
\`\`\`

## Task 2: Wire completion CLI
**Files:**
- Create: \`scripts/validate-completion.mjs\`
**Acceptance Criteria:**
- CLI fails open work.
\`\`\`bash
node scripts/validate-completion.mjs --file graph.json
\`\`\`
`;

const ROOT = fileURLToPath(new URL("../", import.meta.url));

test("validateEpicCompletion passes closed graph with production evidence", () => {
  const graph = completedGraph();
  const report = validateEpicCompletion(graph);

  assert.equal(report.pass, true);
  assert.equal(report.score, 10);
  assert.equal(report.counts.open, 0);
  assert.match(formatEpicCompletionReport(report), /PASS: true/);
});

test("validateEpicCompletion fails open tasks and open epic", () => {
  const graph = completedGraph();
  graph.items.find((item) => item.itemId === "epic-completion-t2").status = "ready";
  graph.tasks.find((task) => task.id === "epic-completion-t2").status = "ready";
  graph.items.find((item) => item.type === "epic").status = "ready";

  const report = validateEpicCompletion(graph);

  assert.equal(report.pass, false);
  assert.ok(report.issues.some((issue) => issue.code === "epic-not-closed"));
  assert.ok(report.issues.some((issue) => issue.code === "item-open" && issue.itemId === "epic-completion-t2"));
});

test("validateEpicCompletion rejects dry-run evidence for production completion", () => {
  const graph = completedGraph();
  const task = graph.items.find((item) => item.itemId === "epic-completion-t1");
  task.verificationEvidence = ["dry-run verification evidence"];

  const production = validateEpicCompletion(graph);
  const diagnostic = validateEpicCompletion(graph, { allowDryRunEvidence: true });

  assert.equal(production.pass, false);
  assert.ok(production.issues.some((issue) => issue.code === "dry-run-evidence" && issue.nextAction));
  assert.equal(diagnostic.pass, true);
});

test("validate-epic-completion CLI reports failed and passed completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-epic-completion-"));
  const passingFile = join(root, "passing.graph.json");
  const failingFile = join(root, "failing.graph.json");
  await writeFile(passingFile, `${JSON.stringify(completedGraph(), null, 2)}\n`, "utf8");

  const failing = completedGraph();
  failing.items.find((item) => item.itemId === "epic-completion-t1").status = "open";
  await writeFile(failingFile, `${JSON.stringify(failing, null, 2)}\n`, "utf8");

  const passStdout = execFileSync(process.execPath, ["scripts/validate-epic-completion.mjs", "--file", passingFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(passStdout, /SUPERVIBE_EPIC_COMPLETION/);
  assert.match(passStdout, /PASS: true/);

  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-epic-completion.mjs", "--file", failingFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }), /epic completion artifact\(s\) failed/);
});

test("validate-epic-completion --all reports no graph coverage explicitly", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-no-completion-graphs-"));
  const stdout = execFileSync(process.execPath, [
    join(ROOT, "scripts/validate-epic-completion.mjs"),
    "--all",
  ], {
    cwd: root,
    encoding: "utf8",
  });

  assert.match(stdout, /SUPERVIBE_EPIC_COMPLETION_COVERAGE/);
  assert.match(stdout, /NO_COVERAGE: true/);
  assert.match(stdout, /PASS: neutral/);
});

test("supervibe-loop exposes completion validation for current commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-loop-completion-"));
  const graphFile = join(root, "graph.json");
  await writeFile(graphFile, `${JSON.stringify(completedGraph(), null, 2)}\n`, "utf8");

  const stdout = execFileSync(process.execPath, [
    "scripts/supervibe-loop.mjs",
    "--validate-completion",
    "--file",
    graphFile,
  ], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });

  assert.match(stdout, /SUPERVIBE_EPIC_COMPLETION/);
  assert.match(stdout, /PASS: true/);
  assert.match(stdout, /GRAPH:/);
});

function completedGraph() {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/completion.md",
    epicId: "epic-completion",
    planReviewPassed: true,
  });
  const now = "2026-05-10T00:00:00.000Z";
  const evidence = [];

  graph.items = graph.items.map((item) => {
    if (item.type === "followup") return item;
    const next = {
      ...item,
      status: "complete",
      closedAt: now,
      closeReason: "validated by completion gate",
    };
    if (item.type !== "epic") {
      const itemEvidence = {
        taskId: item.itemId,
        command: item.verificationCommands?.[0] || "manual-review",
        status: "pass",
        output: "verified",
      };
      next.verificationEvidence = [itemEvidence];
      evidence.push(itemEvidence);
    }
    return next;
  });
  graph.tasks = graph.tasks.map((task) => ({
    ...task,
    status: "complete",
    verificationEvidence: evidence.filter((item) => item.taskId === task.id),
  }));
  graph.evidence = evidence;
  return graph;
}
