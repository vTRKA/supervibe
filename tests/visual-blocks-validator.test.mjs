import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateVisualBlocks } from "../scripts/validate-visual-blocks.mjs";

const VALID_VISUAL_BLOCKS = {
  visualBlocks: [
    {
      id: "release-path-flow",
      type: "flow",
      title: "Release Path Flow",
      altText: "Verify, review, and ship stages with evidence gates.",
      content: "verify -> review -> ship",
      textFallback: "Verification succeeds before review and ship.",
      evidenceIds: ["evidence-visual"],
    },
  ],
};

test("visual blocks validator accepts structured visual blocks", () => {
  const result = validateVisualBlocks(VALID_VISUAL_BLOCKS);

  assert.equal(result.pass, true);
  assert.deepEqual(result.issues, []);
});

test("visual blocks validator rejects corrupted repeated question marks", () => {
  const result = validateVisualBlocks({
    visualBlocks: [
      {
        id: "corrupt",
        type: "flow",
        title: "???????",
        altText: "???????",
        content: "???????",
        textFallback: "???????",
        evidenceIds: ["evidence-visual"],
      },
    ],
  });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "visual-block-corrupted-question-marks"));
});

test("visual blocks validator rejects weak visual blocks", () => {
  const result = validateVisualBlocks({ visualBlocks: [{ id: "weak", content: "diagram" }] });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "visual-block-title-missing"));
  assert.ok(result.issues.some((issue) => issue.code === "visual-block-alt-text-missing"));
});

test("validate-visual-blocks CLI validates fixtures deterministically", async () => {
  const dir = await mkdtemp(join(tmpdir(), "visual-blocks-validator-"));
  const validFile = join(dir, "valid.json");
  const badFile = join(dir, "bad.json");
  await writeFile(validFile, JSON.stringify(VALID_VISUAL_BLOCKS, null, 2), "utf8");
  await writeFile(badFile, JSON.stringify({ visualBlocks: [{ id: "bad", title: "??????", altText: "??????", content: "??????" }] }, null, 2), "utf8");

  const ok = execFileSync(process.execPath, ["scripts/validate-visual-blocks.mjs", "--file", validFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(ok, /^OK   visual-blocks .*valid\.json/m);

  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-visual-blocks.mjs", "--file", badFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }), /visual blocks record\(s\) failed/);
});
