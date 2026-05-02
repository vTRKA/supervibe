import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  evaluateRetrievalGoldenCase,
  formatRetrievalGoldenEvalReport,
  runRetrievalGoldenEval,
} from "../scripts/lib/supervibe-retrieval-golden-eval.mjs";

const execFileAsync = promisify(execFile);

test("retrieval golden eval scores memory, RAG, CodeGraph, stages, and token budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-retrieval-golden-"));
  try {
    const casesPath = join(root, "cases.json");
    await writeFile(casesPath, `${JSON.stringify({
      cases: [{
        id: "checkout-retrieval",
        expected: {
          memoryIds: ["checkout-memory"],
          ragPaths: ["src/checkout.ts"],
          graphSymbols: ["checkoutService"],
          requiredStages: ["fts", "rerank"],
          maxEstimatedTokens: 1200,
        },
        actual: {
          memoryIds: ["checkout-memory"],
          ragPaths: ["src/checkout.ts"],
          graphSymbols: ["checkoutService"],
          retrievalStages: ["rewrite", "fts", "rerank"],
          estimatedTokens: 800,
        },
      }],
    }, null, 2)}\n`, "utf8");

    const report = await runRetrievalGoldenEval({ rootDir: root, caseFile: "cases.json" });
    assert.equal(report.pass, true, formatRetrievalGoldenEvalReport(report));
    assert.equal(report.summary.averageScore, 10);

    const cli = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-retrieval-eval.mjs"),
      "--root",
      root,
      "--case-file",
      "cases.json",
    ], { cwd: process.cwd() });
    assert.match(cli.stdout, /PASS: true/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retrieval golden eval fails missing required evidence", () => {
  const result = evaluateRetrievalGoldenCase({
    id: "missing-graph",
    expected: { graphSymbols: ["checkoutService"] },
    actual: { graphSymbols: [] },
  });

  assert.equal(result.pass, false);
  assert.ok(result.checks.some((item) => item.name === "codegraph" && !item.pass));
});
