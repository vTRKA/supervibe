import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MemoryStore,
  isSqliteBusyError,
  runSqliteReadWithRetry,
  searchMemory,
} from "../scripts/lib/memory-store.mjs";
import {
  isTerminalWorkItem,
  selectActiveItem,
} from "../scripts/lib/supervibe-context-pack.mjs";
import { evaluateContextQualityCases } from "../scripts/lib/supervibe-context-quality-eval.mjs";
import {
  evaluateCodeGraphTaskTypeGate,
  evaluateCodeGraphUsefulness,
} from "../scripts/lib/supervibe-codegraph-context.mjs";

test("memory read retry handles SQLITE_BUSY and preserves non-lock failures", () => {
  let attempts = 0;
  const value = runSqliteReadWithRetry(() => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("database is locked");
      error.code = "SQLITE_BUSY";
      throw error;
    }
    return "ok";
  }, { attempts: 3, delayMs: 0 });

  assert.equal(value, "ok");
  assert.equal(attempts, 2);
  assert.equal(isSqliteBusyError(Object.assign(new Error("database is busy"), { code: "SQLITE_BUSY" })), true);
  assert.throws(() => runSqliteReadWithRetry(() => {
    throw new Error("malformed SQL");
  }, { attempts: 3, delayMs: 0 }), /malformed SQL/);
});

test("memory store applies busy timeout and parallel read-only searches complete", async () => {
  const root = await makeTempRoot("supervibe-memory-concurrency-");
  try {
    await writeMemory(root, "learnings", "workflow-hardening.md", {
      id: "workflow-hardening-memory",
      type: "learning",
      confidence: 10,
      tags: "[workflow, hardening]",
    }, "Workflow hardening memory search should tolerate concurrent read-only access.");

    const store = new MemoryStore(root, { useEmbeddings: false, busyTimeoutMs: 1234 });
    await store.init();
    try {
      await store.rebuildIndex();
      const pragma = store.db.prepare("PRAGMA busy_timeout").get();
      assert.equal(Number(Object.values(pragma)[0]), 1234);
    } finally {
      store.close();
    }

    const results = await Promise.all(Array.from({ length: 8 }, () => searchMemory(root, {
      query: "workflow hardening",
      semantic: false,
      readRetryAttempts: 3,
      readRetryDelayMs: 0,
      busyTimeoutMs: 1234,
    })));
    assert.equal(results.length, 8);
    assert.ok(results.every((items) => items.some((item) => item.id === "workflow-hardening-memory")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("context pack active item selection rejects terminal work items", () => {
  const done = { itemId: "T-done", type: "task", effectiveStatus: "done", status: "done" };
  const ready = { itemId: "T-ready", type: "task", effectiveStatus: "ready", status: "open" };
  assert.equal(isTerminalWorkItem(done), true);
  assert.equal(selectActiveItem([done, ready]).itemId, "T-ready");
  assert.equal(selectActiveItem([done]), null);
  assert.throws(() => selectActiveItem([done, ready], "T-done"), /terminal work item/);
});

test("context quality eval covers stale active task avoidance", () => {
  const pass = evaluateContextQualityCases([{
    id: "fresh-active-work",
    quality: {
      gold: {
        memoryIds: ["M1"],
        sourceChunkIds: ["S1"],
        graphSymbols: ["G1"],
        forbiddenWorkItemIds: ["T-done"],
      },
      retrieved: {
        memoryIds: ["M1"],
        sourceChunkIds: ["S1"],
        graphSymbols: ["G1"],
        activeWorkItemId: "T-ready",
        activeWorkItemStatus: "ready",
        citations: [{ id: "c1", source: "rag", path: "scripts/lib/supervibe-context-pack.mjs", redacted: true }],
        evidence: [],
      },
    },
  }]);
  assert.equal(pass.pass, true);

  const fail = evaluateContextQualityCases([{
    id: "terminal-active-work",
    quality: {
      gold: {
        memoryIds: ["M1"],
        sourceChunkIds: ["S1"],
        graphSymbols: ["G1"],
        forbiddenWorkItemIds: ["T-done"],
      },
      retrieved: {
        memoryIds: ["M1"],
        sourceChunkIds: ["S1"],
        graphSymbols: ["G1"],
        activeWorkItemId: "T-done",
        activeWorkItemStatus: "done",
        citations: [{ id: "c1", source: "rag", path: "scripts/lib/supervibe-context-pack.mjs", redacted: true }],
        evidence: [],
      },
    },
  }]);
  assert.equal(fail.pass, false);
  assert.equal(fail.cases[0].checks.some((check) => check.name === "active-work-freshness" && !check.pass), true);
});

test("CodeGraph usefulness checks are explicit for agent handoffs", () => {
  const weakStructural = evaluateCodeGraphTaskTypeGate({
    taskType: "refactor",
    quality: { pass: true, warnings: [], symbolCoverage: 0.5, edgeResolutionRate: 0.1 },
    graphHealth: { sourceFileSymbolCoverage: { coverage: 0.5 }, crossResolvedEdges: { total: 100, rate: 0.1 } },
    stats: { ragChunks: 2, entrySymbols: 1, graphNodes: 0, impactNodes: 0 },
  });
  assert.equal(weakStructural.pass, false);
  assert.equal(weakStructural.usefulness.pass, false);
  assert.ok(weakStructural.warnings.some((warning) => /structural agent handoff/.test(warning)));

  const usefulFeature = evaluateCodeGraphUsefulness({
    taskType: "feature",
    quality: { symbolCoverage: 0.5, edgeResolutionRate: 0.1 },
    graphHealth: { crossResolvedEdges: { total: 100, rate: 0.1 } },
    stats: { ragChunks: 2, entrySymbols: 1, graphNodes: 2, impactNodes: 0 },
  });
  assert.equal(usefulFeature.pass, true);
  assert.equal(usefulFeature.nextAction, "use CodeGraph context in agent packet");
});

async function writeMemory(root, category, fileName, frontmatter, body) {
  const dir = join(root, ".supervibe", "memory", category);
  await mkdir(dir, { recursive: true });
  const yaml = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`).join("\n");
  await writeFile(join(dir, fileName), `---\n${yaml}\n---\n${body}\n`, "utf8");
}

async function makeTempRoot(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}
