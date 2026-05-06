import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  formatScipImportReadiness,
  inspectScipImportReadiness,
} from "../scripts/lib/supervibe-scip-import.mjs";

test("SCIP readiness is optional, explicit, and does not overclaim binary parsing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-scip-"));
  try {
    const empty = await inspectScipImportReadiness({ rootDir });
    assert.equal(empty.pass, true);
    assert.equal(empty.status, "not-found");
    assert.equal(empty.binaryParser, "deferred");
    assert.equal(empty.nextAction, "continue with tree-sitter CodeGraph");

    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    const jsonPath = join(rootDir, ".supervibe", "memory", "scip.json");
    await writeFile(jsonPath, JSON.stringify({
      metadata: { toolInfo: { name: "scip-typescript" } },
      documents: [
        { relative_path: "scripts/example.mjs", symbols: ["example#run()."] },
      ],
    }), "utf8");

    const found = await inspectScipImportReadiness({ rootDir });
    assert.equal(found.pass, true);
    assert.equal(found.status, "json-summary");
    assert.equal(found.summary.documents, 1);
    assert.equal(found.summary.symbols, 1);
    assert.match(formatScipImportReadiness(found), /SUPERVIBE_SCIP_IMPORT/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
