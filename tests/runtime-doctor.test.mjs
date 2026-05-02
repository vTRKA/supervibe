import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("runtime doctor dry-run reports prerequisites, scaffold readiness and repair actions", () => {
  const out = execFileSync(process.execPath, ["scripts/supervibe-runtime-doctor.mjs", "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.match(out, /SUPERVIBE_RUNTIME_DOCTOR/);
  assert.match(out, /MODE: dry-run/);
  assert.match(out, /NODE_SQLITE:/);
  assert.match(out, /STACK_PACKS:/);
  assert.match(out, /DEV_SERVER:/);
  assert.match(out, /NEXT_REPAIR:/);
});
