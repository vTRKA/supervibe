import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignStyleboardQa,
} from "../scripts/validate-design-styleboard-qa.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("styleboard QA passes when no styleboard exists yet", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-styleboard-qa-empty-"));
  try {
    const result = validateDesignStyleboardQa(root);
    assert.equal(result.pass, true);
    assert.equal(result.status, "not-started-no-styleboard");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("styleboard QA blocks section approval without evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-styleboard-qa-blocked-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/styleboard.html", [
      "<!doctype html><html><body>",
      "palette swatch typography font density spacing button input table dialog motion duration component state",
      "</body></html>",
    ].join("\n"));

    const result = validateDesignStyleboardQa(root);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => /styleboard-qa\.json missing/.test(issue)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("styleboard QA accepts complete evidence check list", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-styleboard-qa-ready-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/styleboard.html", [
      "<!doctype html><html><body>",
      "palette swatch typography font density spacing button input table dialog motion duration component state",
      "</body></html>",
    ].join("\n"));
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/_reviews/styleboard-qa.json", JSON.stringify({
      checks: [
        "screenshot-render",
        "canvas-nonblank",
        "dom-overflow",
        "text-overlap",
        "contrast-audit",
        "focus-visible",
        "reduced-motion",
      ],
    }, null, 2));

    const result = validateDesignStyleboardQa(root);
    assert.equal(result.pass, true);
    assert.equal(result.status, "styleboard-qa-ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
