import assert from "node:assert/strict";
import test from "node:test";
import { detectPackageManager, renderCommand } from "../scripts/lib/autonomous-loop-platform-runner.mjs";

test("package manager detection supports common lockfiles", () => {
  assert.equal(detectPackageManager(["pnpm-lock.yaml"]), "pnpm");
  assert.equal(detectPackageManager(["package-lock.json"]), "npm");
});

test("platform adapter rejects POSIX env syntax on Windows", () => {
  const result = renderCommand("export A=1", { os: "win32", pathSeparator: "\\", envSyntax: "$env:NAME" });
  assert.equal(result.ok, false);
});
