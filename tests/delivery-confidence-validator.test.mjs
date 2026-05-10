import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { validateDeliveryConfidence } from "../scripts/validate-delivery-confidence.mjs";

test("validateDeliveryConfidence passes current repo contract", async () => {
  const result = await validateDeliveryConfidence({ rootDir: process.cwd() });
  assert.equal(result.pass, true, result.issues.join("\n"));
});

test("validate-delivery-confidence CLI passes current repo", () => {
  const output = execFileSync(process.execPath, ["scripts/validate-delivery-confidence.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  assert.match(output, /SUPERVIBE_DELIVERY_CONFIDENCE_VALIDATION/);
  assert.match(output, /PASS: true/);
});
