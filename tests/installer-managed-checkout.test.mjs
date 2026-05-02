import assert from "node:assert/strict";
import test from "node:test";

import {
  INSTALLER_MANAGED_TRACKED_PATHS,
  pathFromPorcelainLine,
  partitionTrackedPorcelainLines,
} from "../scripts/lib/installer-managed-checkout.mjs";
import { MODEL_RELATIVE_PATH } from "../scripts/ensure-onnx-model.mjs";

test("installer-managed checkout paths include package-lock drift and the required ONNX model", () => {
  assert.deepEqual(
    INSTALLER_MANAGED_TRACKED_PATHS.map((entry) => entry.path),
    ["package-lock.json", MODEL_RELATIVE_PATH],
  );
});

test("installer-managed tracked artifacts are separated from user-owned tracked edits", () => {
  const lines = [
    " M package-lock.json",
    ` M ${MODEL_RELATIVE_PATH}`,
    " M scripts/custom-user-change.mjs",
    "?? registry.yaml",
  ];

  const partitioned = partitionTrackedPorcelainLines(lines);

  assert.deepEqual(
    partitioned.installerManaged.map((entry) => entry.path),
    ["package-lock.json", MODEL_RELATIVE_PATH],
  );
  assert.deepEqual(partitioned.userOwned, [" M scripts/custom-user-change.mjs"]);
  assert.deepEqual(partitioned.untracked, ["?? registry.yaml"]);
});

test("porcelain path parsing handles tracked renames by using the destination path", () => {
  assert.equal(
    pathFromPorcelainLine(`R  old-model.onnx -> ${MODEL_RELATIVE_PATH}`),
    MODEL_RELATIVE_PATH,
  );
});
