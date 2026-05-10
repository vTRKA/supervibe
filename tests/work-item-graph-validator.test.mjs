import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { atomizePlanToWorkItems } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import { validateWorkItemGraphFiles } from "../scripts/validate-work-item-graphs.mjs";

const PLAN = `# Example Implementation Plan

Critical path: T1 -> T2

## Task 1: Build foundation
**Files:**
- Create: \`src/foundation.ts\`
**Acceptance Criteria:**
- Foundation works.
\`\`\`bash
npm test
\`\`\`

## Task 2: Verify behavior
**Files:**
- Test: \`tests/foundation.test.ts\`
**Acceptance Criteria:**
- Behavior is verified.
\`\`\`bash
npm test
\`\`\`
`;

test("validateWorkItemGraphFiles accepts persisted graph", async () => {
  const dir = await mkdtemp(join(tmpdir(), "work-item-graph-validator-"));
  const file = join(dir, "graph.json");
  const graph = atomizePlanToWorkItems(PLAN, { planPath: "plan.md", epicId: "epic-example", planReviewPassed: true });
  await writeFile(file, `${JSON.stringify(graph, null, 2)}\n`);

  const report = await validateWorkItemGraphFiles({ files: [file] });
  assert.equal(report.pass, true);
});

test("validate-work-item-graphs CLI fails invalid graph", async () => {
  const dir = await mkdtemp(join(tmpdir(), "work-item-graph-invalid-"));
  const file = join(dir, "graph.json");
  const graph = atomizePlanToWorkItems(PLAN, { planPath: "plan.md", epicId: "epic-example", planReviewPassed: true });
  graph.items.find((item) => item.itemId.endsWith("-t1")).verificationCommands = [];
  await writeFile(file, `${JSON.stringify(graph, null, 2)}\n`);

  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-work-item-graphs.mjs", "--file", file], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }));
});

test("validate-work-item-graphs CLI passes persisted graph", async () => {
  const dir = await mkdtemp(join(tmpdir(), "work-item-graph-cli-"));
  const file = join(dir, "graph.json");
  const graph = atomizePlanToWorkItems(PLAN, { planPath: "plan.md", epicId: "epic-example", planReviewPassed: true });
  await writeFile(file, `${JSON.stringify(graph, null, 2)}\n`);

  const stdout = execFileSync(process.execPath, ["scripts/validate-work-item-graphs.mjs", "--file", file], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(stdout, /All 1 work-item graph artifact\(s\) passed/);
});

test("validate-work-item-graphs CLI strict source snapshot flag fails legacy graph", async () => {
  const dir = await mkdtemp(join(tmpdir(), "work-item-graph-strict-source-"));
  const file = join(dir, "graph.json");
  const graph = atomizePlanToWorkItems(PLAN, { planPath: "plan.md", epicId: "epic-example", planReviewPassed: true });
  graph.metadata.sourcePlanSnapshot = null;
  graph.source.sha256 = null;
  graph.source.snapshotPath = null;
  await writeFile(file, `${JSON.stringify(graph, null, 2)}\n`);

  assert.throws(() => execFileSync(process.execPath, [
    "scripts/validate-work-item-graphs.mjs",
    "--file",
    file,
    "--require-source-plan-snapshot",
  ], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }), /missing-source-plan-snapshot/);
});

test("package scripts expose strict source snapshot graph validation", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(pkg.scripts["validate:work-item-graphs:strict-source"], /--require-source-plan-snapshot/);
});

test("reviewed plan without parseable tasks is invalid instead of one vague fallback task", () => {
  const graph = atomizePlanToWorkItems("# Weak Implementation Plan\n\nNo task headings.", {
    planPath: "weak.md",
    epicId: "epic-weak",
    planReviewPassed: true,
  });

  assert.equal(graph.validation.valid, false);
  assert.ok(graph.validation.issues.some((issue) => issue.code === "missing-child-task"));
});
