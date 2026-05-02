import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildMemoryHealthReport, formatMemoryHealthReport } from "../scripts/lib/supervibe-memory-health.mjs";

test("memory health report exposes retrieval policy, token SLO, and review queues", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-health-"));
  try {
    const decisionsDir = join(rootDir, ".supervibe", "memory", "decisions");
    await mkdir(decisionsDir, { recursive: true });
    await mkdir(join(rootDir, "scripts"), { recursive: true });
    await writeFile(join(rootDir, "scripts", "health.mjs"), "export const healthy = true;\n", "utf8");
    await writeFile(join(decisionsDir, "current.md"), [
      "---",
      "id: current-memory-health",
      "type: decision",
      "date: 2026-05-01",
      "tags: [commands, validation]",
      "agent: test-agent",
      "confidence: 10",
      "---",
      "Memory health cites `scripts/health.mjs` and keeps active context current.",
    ].join("\n"), "utf8");

    const report = await buildMemoryHealthReport({
      rootDir,
      now: "2026-05-02T00:00:00.000Z",
      contextPackMaxTokens: 2500,
      changedFiles: [],
    });

    assert.equal(report.pass, true, formatMemoryHealthReport(report));
    assert.equal(report.maturityScore, 10);
    assert.equal(report.retrievalPolicy.currentOnlyDefault, true);
    assert.equal(report.tokenSlo.contextPackMaxTokens, 2500);
    assert.match(formatMemoryHealthReport(report), /CURRENT_ONLY_RETRIEVAL: true/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("memory health queues missing memory references for review", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-health-missing-ref-"));
  try {
    const decisionsDir = join(rootDir, ".supervibe", "memory", "decisions");
    await mkdir(decisionsDir, { recursive: true });
    await writeFile(join(decisionsDir, "broken.md"), [
      "---",
      "id: broken-memory-reference",
      "type: decision",
      "date: 2026-05-01",
      "tags: [commands, validation]",
      "agent: test-agent",
      "confidence: 10",
      "---",
      "Broken memory cites `scripts/not-found.mjs`.",
    ].join("\n"), "utf8");

    const report = await buildMemoryHealthReport({
      rootDir,
      now: "2026-05-02T00:00:00.000Z",
      changedFiles: [],
    });

    assert.equal(report.pass, true);
    assert.ok(report.warnings.some((warning) => warning.code === "memory-reference-review"));
    assert.match(formatMemoryHealthReport(report), /REFERENCE_ISSUES: 1/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("memory health includes git-diff invalidation and hierarchy metrics", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-health-invalidation-"));
  try {
    const decisionsDir = join(rootDir, ".supervibe", "memory", "decisions");
    await mkdir(decisionsDir, { recursive: true });
    await mkdir(join(rootDir, "src"), { recursive: true });
    await writeFile(join(rootDir, "src", "checkout.ts"), "export const checkout = true;\n", "utf8");
    await writeFile(join(decisionsDir, "checkout.md"), [
      "---",
      "id: checkout-memory",
      "type: decision",
      "date: 2026-05-01",
      "tags: [commands, validation]",
      "agent: test-agent",
      "confidence: 10",
      "---",
      "Checkout memory cites `src/checkout.ts`.",
    ].join("\n"), "utf8");

    const report = await buildMemoryHealthReport({
      rootDir,
      now: "2026-05-02T00:00:00.000Z",
      changedFiles: ["src/checkout.ts"],
    });

    assert.equal(report.pass, true);
    assert.equal(report.curation.invalidationCandidates, 1);
    assert.equal(report.curation.hierarchy.current.count, 1);
    assert.match(formatMemoryHealthReport(report), /INVALIDATION_CANDIDATES: 1/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
