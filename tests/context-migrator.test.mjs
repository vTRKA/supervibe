import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyManagedContextBlock,
  parseInstructionDocument,
  planContextMigration,
  writeContextMigrationPlan,
} from "../scripts/lib/supervibe-context-migrator.mjs";

test("context migration preserves custom sections while replacing managed block", () => {
  const existing = [
    "# Project Instructions",
    "",
    "## Custom Project Instruction Section",
    "Keep the billing safeguards exactly as written.",
    "",
    "<!-- SUPERVIBE:BEGIN managed-context claude -->",
    "old generated routing",
    "<!-- SUPERVIBE:END managed-context claude -->",
    "",
    "## Team Notes",
    "Do not move this section.",
    "",
  ].join("\n");

  const plan = planContextMigration({
    adapterId: "claude",
    instructionPath: "CLAUDE.md",
    currentContent: existing,
    generatedContent: "new generated routing",
  });

  assert.ok(plan.afterContent.includes("## Custom Project Instruction Section"), "custom project instruction section was not preserved");
  assert.ok(plan.afterContent.includes("Keep the billing safeguards exactly as written."));
  assert.ok(plan.afterContent.includes("## Team Notes"));
  assert.ok(plan.afterContent.includes("new generated routing"));
  assert.ok(!plan.afterContent.includes("old generated routing"));
  assert.equal(plan.dryRun, true);
  assert.ok(plan.operations.some((operation) => operation.type === "replace-managed-block"));
  assert.ok(plan.diff.includes("-old generated routing"));
  assert.ok(plan.diff.includes("+new generated routing"));
});

test("context migration appends managed block when file has no existing block", () => {
  const after = applyManagedContextBlock({
    adapterId: "codex",
    currentContent: "# AGENTS\n\n## Local Rules\nKeep user-owned rules.\n",
    generatedContent: "Codex routing table",
  });

  assert.ok(after.includes("# AGENTS"));
  assert.ok(after.includes("## Local Rules"));
  assert.ok(after.includes("<!-- SUPERVIBE:BEGIN managed-context codex -->"));
  assert.ok(after.includes("Codex routing table"));
});

test("safe writer requires approval and creates backup", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-migrate-"));
  const filePath = join(rootDir, "AGENTS.md");
  await writeFile(filePath, "# AGENTS\n\n## Custom\nDo not overwrite.\n", "utf8");

  try {
    const plan = planContextMigration({
      rootDir,
      adapterId: "codex",
      generatedContent: "Codex managed instructions",
    });

    await assert.rejects(
      () => writeContextMigrationPlan(plan, { approved: false }),
      /requires explicit approval/,
    );

    const result = await writeContextMigrationPlan(plan, { approved: true });
    const next = await readFile(filePath, "utf8");

    assert.equal(result.written, true);
    assert.equal(existsSync(result.backupPath), true);
    assert.ok(next.includes("## Custom"));
    assert.ok(next.includes("Codex managed instructions"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("parser reports headings, imports and managed blocks", () => {
  const parsed = parseInstructionDocument([
    "# Root",
    "@./docs/context.md",
    "## Section",
    "<!-- SUPERVIBE:BEGIN managed-context claude -->",
    "managed",
    "<!-- SUPERVIBE:END managed-context claude -->",
  ].join("\n"));

  assert.deepEqual(parsed.headings.map((heading) => heading.text), ["Root", "Section"]);
  assert.deepEqual(parsed.imports.map((entry) => entry.target), ["./docs/context.md"]);
  assert.equal(parsed.managedBlocks.length, 1);
});
