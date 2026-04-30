import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  auditInstallLifecycleData,
  classifyStaleFiles,
} from "../scripts/lib/supervibe-install-lifecycle-audit.mjs";

test("install lifecycle audit passes clean generated install state", () => {
  const audit = auditInstallLifecycleData({
    version: "2.0.8",
    packageAudit: { pass: true, score: 10, issues: [], warnings: [] },
    registryPresent: true,
    gitStatusLines: [],
    expectedHosts: ["claude", "codex"],
    hostRegistrations: {
      claude: { required: true, ok: true },
      codex: { required: true, ok: true },
      gemini: { required: false, ok: false },
    },
  });

  assert.equal(audit.pass, true);
  assert.equal(audit.score, 10);
  assert.equal(audit.staleFiles.length, 0);
});

test("install lifecycle audit fails stale files, missing registry, and required host gaps", () => {
  const audit = auditInstallLifecycleData({
    packageAudit: { pass: true, score: 10, issues: [], warnings: [] },
    registryPresent: false,
    gitStatusLines: ["?? commands/old-route.md", " M package.json"],
    expectedHosts: ["claude"],
    hostRegistrations: {
      claude: {
        required: true,
        ok: false,
        message: "Claude Code registration is incomplete after install",
        nextAction: "Re-run installer.",
      },
    },
  });

  assert.equal(audit.pass, false);
  assert.ok(audit.issues.some((issue) => issue.code === "registry-missing-after-install"));
  assert.ok(audit.issues.some((issue) => issue.code === "stale-files-left-in-checkout"));
  assert.ok(audit.issues.some((issue) => issue.code === "claude-registration-missing"));
});

test("stale classifier only treats untracked files as install leftovers", () => {
  assert.deepEqual(classifyStaleFiles([
    "?? commands/legacy.md",
    " M README.md",
    "A  scripts/new-tracked.mjs",
  ]), ["commands/legacy.md"]);
});

test("install lifecycle audit does not use shell true for git status", async () => {
  const source = await readFile("scripts/lib/supervibe-install-lifecycle-audit.mjs", "utf8");

  assert.doesNotMatch(source, /shell:\s*process\.platform === ['"]win32['"]/);
});
