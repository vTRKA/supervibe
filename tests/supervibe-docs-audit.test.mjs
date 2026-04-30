import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  auditDocsRelevance,
  formatDocsAuditReport,
} from "../scripts/lib/supervibe-docs-audit.mjs";

const execFileAsync = promisify(execFile);

test("docs audit separates real stale docs from intentional templates", async () => {
  const root = await makeTempRoot("supervibe-docs-audit-");
  try {
    await mkdir(join(root, "docs", "templates"), { recursive: true });
    await mkdir(join(root, "docs", "internal-commands"), { recursive: true });
    await writeFile(join(root, "docs", "fresh.md"), "# Fresh\n\nCurrent docs.\n", "utf8");
    await writeFile(join(root, "docs", "stale.md"), "# Stale\n\nURL TBD\n", "utf8");
    await writeFile(join(root, "docs", "templates", "plan-template.md"), "# Template\n\n- No TBD found\n", "utf8");
    await writeFile(join(root, "docs", "internal-commands", "debug.md"), "# Debug\n\nInternal command spec.\n", "utf8");

    const report = await auditDocsRelevance({ rootDir: root });
    assert.equal(report.pass, false);
    assert.deepEqual(report.deleteCandidates.map((entry) => entry.path).sort(), [
      "docs/internal-commands/debug.md",
      "docs/stale.md",
    ]);
    assert.equal(report.internalDev.length, 1);
    assert.equal(report.intentionalMarkers.length, 1);
    assert.match(formatDocsAuditReport(report), /DELETE_CANDIDATES: 2/);
    assert.match(formatDocsAuditReport(report), /INTERNAL_DEV_FILES: 1/);

    const { stdout } = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-docs-audit.mjs"),
      "--root",
      root,
    ], { cwd: process.cwd() }).catch((error) => error);
    assert.match(stdout, /SUPERVIBE_DOCS_AUDIT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function makeTempRoot(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), prefix));
}
