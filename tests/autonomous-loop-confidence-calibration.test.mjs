import assert from "node:assert/strict";
import test from "node:test";
import { recordCalibrationSignal, summarizeCalibration } from "../scripts/lib/autonomous-loop-confidence-calibration.mjs";

test("post-run false positives require confidence calibration", () => {
  const signals = recordCalibrationSignal([], { taskId: "t1", completedScore: 9.3, outcome: "escaped_defect" });
  assert.equal(summarizeCalibration(signals).status, "confidence_calibration_required");
});
