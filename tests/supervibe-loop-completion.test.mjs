import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { atomizePlanToWorkItems } from "../scripts/lib/supervibe-plan-to-work-items.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

const PLAN = `# Close Plan

## Task 1: Produce evidence
**Acceptance Criteria:**
- Evidence is present.
\`\`\`bash
node --test tests/close.test.mjs
\`\`\`
`;

test("close-eligible prints blockers and exits non-zero when evidence is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-close-eligible-"));
  try {
    const graphPath = join(root, "graph.json");
    await writeFile(graphPath, `${JSON.stringify(atomizePlanToWorkItems(PLAN, {
      epicId: "epic-close",
      planReviewPassed: true,
    }), null, 2)}\n`, "utf8");

    await assert.rejects(
      () => execFileAsync(process.execPath, [
        join(ROOT, "scripts", "supervibe-loop.mjs"),
        "--close-eligible",
        "--file",
        graphPath,
      ], { cwd: root }),
      (error) => {
        assert.match(`${error.stdout}\n${error.stderr}`, /SUPERVIBE_EPIC_COMPLETION/);
        assert.match(`${error.stdout}\n${error.stderr}`, /missing-evidence|item-open/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("closing an epic is gated by production completion evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-close-gate-"));
  try {
    const graphPath = join(root, "graph.json");
    const graph = atomizePlanToWorkItems(PLAN, {
      epicId: "epic-close",
      planReviewPassed: true,
    });
    await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");

    await assert.rejects(
      () => execFileAsync(process.execPath, [
        join(ROOT, "scripts", "supervibe-loop.mjs"),
        "--close",
        "epic-close",
        "--file",
        graphPath,
      ], { cwd: root }),
      (error) => {
        assert.match(`${error.stdout}\n${error.stderr}`, /SUPERVIBE_EPIC_COMPLETION/);
        assert.match(`${error.stdout}\n${error.stderr}`, /NEXT_ACTION:/);
        return true;
      },
    );

    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    assert.notEqual(saved.items.find((item) => item.itemId === "epic-close").status, "closed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
