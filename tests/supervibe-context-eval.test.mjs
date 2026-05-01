import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  evaluateContextCase,
  formatContextEvalReport,
  runContextPackEval,
} from "../scripts/lib/supervibe-context-eval.mjs";

const execFileAsync = promisify(execFile);

test("context eval verifies memory, evidence, anchors, and token budget", async () => {
  const root = await makeTempRoot("supervibe-context-eval-");
  try {
    await writeFixture(root);
    const casesPath = join(root, "cases.json");
    await writeFile(casesPath, `${JSON.stringify({
      cases: [{
        id: "checkout-context",
        graphPath: ".supervibe/memory/work-items/epic/graph.json",
        itemId: "T1",
        expectMemoryIds: ["checkout-memory"],
        expectEvidence: ["npm test -- checkout"],
        expectSemanticAnchors: ["checkout-anchor"],
        maxEstimatedTokens: 2000,
      }],
    }, null, 2)}\n`, "utf8");

    const report = await runContextPackEval({
      rootDir: root,
      caseFile: "cases.json",
      now: "2026-04-30T00:00:00.000Z",
    });
    assert.equal(report.pass, true);
    assert.equal(report.summary.averageScore, 10);
    const single = await evaluateContextCase({
      rootDir: root,
      testCase: {
        id: "single",
        graphPath: ".supervibe/memory/work-items/epic/graph.json",
        itemId: "T1",
        expectMemoryIds: ["checkout-memory"],
      },
      now: "2026-04-30T00:00:00.000Z",
    });
    assert.equal(single.pass, true);
    assert.match(formatContextEvalReport(report), /SUPERVIBE_CONTEXT_EVAL/);

    const { stdout } = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-context-eval.mjs"),
      "--root",
      root,
      "--case-file",
      "cases.json",
    ], { cwd: process.cwd() });
    assert.match(stdout, /PASS: true/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeFixture(root) {
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "checkout.ts"), [
    "// @supervibe-anchor id=checkout-anchor symbol=checkout responsibility=\"Checkout behavior\" verify=\"npm test -- checkout\"",
    "export function checkout() { return true; }",
    "",
  ].join("\n"), "utf8");
  await mkdir(join(root, ".supervibe", "memory", "work-items", "epic"), { recursive: true });
  await writeFile(join(root, ".supervibe", "memory", "work-items", "epic", "graph.json"), `${JSON.stringify({
    kind: "supervibe-work-item-graph",
    graph_id: "epic",
    items: [
      { itemId: "epic", type: "epic", status: "open", title: "Epic" },
      {
        itemId: "T1",
        type: "task",
        status: "open",
        title: "Checkout context",
        writeScope: [{ path: "src/checkout.ts" }],
        acceptanceCriteria: ["checkout context"],
      },
    ],
    tasks: [{ id: "T1", status: "open" }],
    evidence: [{ workItemId: "T1", kind: "test", command: "npm test -- checkout" }],
  }, null, 2)}\n`, "utf8");
  await mkdir(join(root, ".supervibe", "memory", "decisions"), { recursive: true });
  await writeFile(join(root, ".supervibe", "memory", "decisions", "checkout.md"), [
    "---",
    "id: checkout-memory",
    "confidence: 9",
    "---",
    "Checkout context should keep test evidence near the active task.",
    "",
  ].join("\n"), "utf8");
}

async function makeTempRoot(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), prefix));
}
