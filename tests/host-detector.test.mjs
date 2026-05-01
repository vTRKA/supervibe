import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  detectHostCandidates,
  formatHostDiagnostics,
  getHostAdapterMatrix,
  resolveHostAdapter,
  selectHostAdapter,
} from "../scripts/lib/supervibe-host-detector.mjs";

async function withTempProject(files, fn) {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-host-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const path = join(rootDir, relativePath);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, content);
    }
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("detects Codex adapter without falling back to Claude", async () => {
  await withTempProject({
    "AGENTS.md": "# Project instructions\n",
    ".codex/config.json": "{}\n",
  }, async (rootDir) => {
    const selection = selectHostAdapter({ rootDir, env: {} });

    assert.equal(selection.adapter.id, "codex", "expected Codex adapter but selected Claude adapter");
    assert.equal(selection.requiresSelection, false);
    assert.ok(selection.confidence >= 0.8);
    assert.ok(selection.adapter.instructionFiles.includes("AGENTS.md"));
  });
});

test("detects ambiguous multi-host projects and keeps evidence", async () => {
  await withTempProject({
    "CLAUDE.md": "# Claude\n",
    "AGENTS.md": "# Codex\n",
    ".cursor/rules/project.mdc": "Always cite files\n",
  }, async (rootDir) => {
    const result = detectHostCandidates({ rootDir, env: {} });

    assert.equal(result.requiresSelection, true);
    assert.ok(result.candidates.some((candidate) => candidate.id === "claude"));
    assert.ok(result.candidates.some((candidate) => candidate.id === "codex"));
    assert.ok(result.candidates.some((candidate) => candidate.id === "cursor"));
    assert.match(formatHostDiagnostics(result), /requiresSelection: true/);
  });
});

test("environment host hint resolves ambiguous projects", async () => {
  await withTempProject({
    "CLAUDE.md": "# Claude\n",
    "AGENTS.md": "# Codex\n",
  }, async (rootDir) => {
    const selection = selectHostAdapter({ rootDir, env: { SUPERVIBE_HOST: "codex" } });

    assert.equal(selection.adapter.id, "codex");
    assert.equal(selection.requiresSelection, false);
    assert.ok(selection.evidence.some((entry) => entry.source === "env"));
  });
});

test("adapter matrix declares host-specific folders and managed markers", () => {
  const matrix = getHostAdapterMatrix();
  const ids = matrix.map((adapter) => adapter.id);

  assert.deepEqual(ids.sort(), ["claude", "codex", "cursor", "gemini", "opencode"]);
  for (const id of ids) {
    const adapter = resolveHostAdapter(id);
    assert.ok(adapter.instructionFiles.length > 0, `${id} missing instruction files`);
    assert.ok(adapter.managedBlock.begin.includes("SUPERVIBE"), `${id} missing managed marker`);
    assert.ok(adapter.importStrategy, `${id} missing import strategy`);
  }
});
