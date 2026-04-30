import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  detectPolicyConfigDrift,
  fixDerivedPolicyDefaults,
  formatPolicyDriftReport,
} from "../scripts/lib/supervibe-config-drift-detector.mjs";

test("policy drift detector classifies dangerous drift, stale docs, missing defaults, and harmless overrides", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-drift-"));
  await mkdir(join(rootDir, "commands"), { recursive: true });
  await mkdir(join(rootDir, ".supervibe"), { recursive: true });
  await writeFile(join(rootDir, "README.md"), "Use /supervibe-loop --status only.\n");
  await writeFile(join(rootDir, "commands", "supervibe-loop.md"), "/supervibe-loop --status\n");
  await writeFile(join(rootDir, "package.json"), JSON.stringify({ scripts: { "supervibe:loop": "node scripts/supervibe-loop.mjs" } }, null, 2));
  await writeFile(join(rootDir, ".supervibe", "policy-profile.json"), JSON.stringify({
    name: "guided",
    allowedTools: ["shell:unsafe"],
    deniedTools: [],
    localOverrides: { dashboardTheme: "plain" },
  }, null, 2));

  const drift = await detectPolicyConfigDrift({
    rootDir,
    managedPolicy: { deny: ["shell:unsafe"] },
    activeRuns: [{ runId: "run-1", policyProfile: "missing-profile" }],
    worktreeSessions: [{ sessionId: "session-1", policyProfile: "guided" }],
  });

  assert.equal(drift.ok, false);
  assert.ok(drift.issues.some((issue) => issue.category === "dangerous-drift"));
  assert.ok(drift.issues.some((issue) => issue.category === "stale-docs"));
  assert.ok(drift.issues.some((issue) => issue.category === "missing-defaults"));
  assert.ok(drift.issues.some((issue) => issue.category === "harmless-local-override"));
  assert.match(formatPolicyDriftReport(drift), /DANGEROUS/);
});

test("fix mode writes derived defaults with backup and never loosens deny rules", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-drift-fix-"));
  await mkdir(join(rootDir, ".supervibe"), { recursive: true });
  await writeFile(join(rootDir, ".supervibe", "policy-profile.json"), JSON.stringify({
    name: "guided",
    allowedTools: ["read"],
    deniedTools: ["remote-mutation"],
  }, null, 2));

  const result = await fixDerivedPolicyDefaults({
    rootDir,
    derivedDefaults: {
      profile: "guided",
      deniedTools: ["remote-mutation", "provider-permission-bypass"],
      allowedTools: ["read", "remote-mutation"],
    },
  });
  const written = JSON.parse(await readFile(result.outPath, "utf8"));

  assert.equal(result.changed, true);
  assert.equal(result.backupPath.endsWith(".bak"), true);
  assert.ok(written.deniedTools.includes("provider-permission-bypass"));
  assert.equal(written.allowedTools.includes("remote-mutation"), false);
});
