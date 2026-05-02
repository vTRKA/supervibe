import assert from "node:assert/strict";
import test from "node:test";

import {
  INSTALLER_MANAGED_TRACKED_PATHS,
  pathFromPorcelainLine,
  partitionTrackedPorcelainLines,
} from "../scripts/lib/installer-managed-checkout.mjs";

test("installer-managed checkout paths include package-lock drift only", () => {
  assert.deepEqual(
    INSTALLER_MANAGED_TRACKED_PATHS.map((entry) => entry.path),
    ["package-lock.json"],
  );
});

test("installer-managed tracked artifacts are separated from user-owned tracked edits", () => {
  const lines = [
    " M package-lock.json",
    " M models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx",
    " M scripts/custom-user-change.mjs",
    "?? registry.yaml",
  ];

  const partitioned = partitionTrackedPorcelainLines(lines);

  assert.deepEqual(
    partitioned.installerManaged.map((entry) => entry.path),
    ["package-lock.json"],
  );
  assert.deepEqual(partitioned.userOwned, [
    " M models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx",
    " M scripts/custom-user-change.mjs",
  ]);
  assert.deepEqual(partitioned.untracked, ["?? registry.yaml"]);
});

test("porcelain path parsing handles tracked renames by using the destination path", () => {
  assert.equal(
    pathFromPorcelainLine("R  old-lock.json -> package-lock.json"),
    "package-lock.json",
  );
});
