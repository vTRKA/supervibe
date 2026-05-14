import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateNextActionContract } from "../scripts/validate-next-action-contract.mjs";

const VALID_NEXT_ACTION = {
  primaryUx: "Step 1/1: Choose the release path.",
  resumeCursor: "cursor-release",
  choices: [
    { id: "ship", label: "Ship reviewed workflow", ordinal: 1 },
    { id: "revise", label: "Revise before ship", ordinal: 2 },
  ],
  nextCommand: "/supervibe-loop --ship",
};

test("next action contract accepts structured user choices", () => {
  const result = validateNextActionContract(VALID_NEXT_ACTION);

  assert.equal(result.pass, true);
  assert.deepEqual(result.issues, []);
});

test("next action contract rejects raw NEXT_STEP_HANDOFF as primary chat UX", () => {
  const result = validateNextActionContract("NEXT_STEP_HANDOFF: /supervibe-loop --ship");

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "next-action-raw-handoff-primary-ux"));
});

test("next action contract rejects missing choices", () => {
  const result = validateNextActionContract({ primaryUx: "Step 1/1: Proceed?", resumeCursor: "cursor" });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "next-action-choices-missing"));
});

test("validate-next-action-contract CLI validates text and JSON fixtures deterministically", async () => {
  const dir = await mkdtemp(join(tmpdir(), "next-action-validator-"));
  const validFile = join(dir, "valid.json");
  const badFile = join(dir, "raw.txt");
  await writeFile(validFile, JSON.stringify(VALID_NEXT_ACTION, null, 2), "utf8");
  await writeFile(badFile, "NEXT_STEP_HANDOFF: run release", "utf8");

  const ok = execFileSync(process.execPath, ["scripts/validate-next-action-contract.mjs", "--file", validFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(ok, /^OK   next-action .*valid\.json/m);

  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-next-action-contract.mjs", "--file", badFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }), /next action record\(s\) failed/);
});
