import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFinalAcceptance } from "../scripts/lib/autonomous-loop-final-acceptance.mjs";
import {
  auditPluginPackage,
  auditPluginPackageData,
  createPluginPackageReleaseGate,
} from "../scripts/lib/supervibe-plugin-package-audit.mjs";

test("plugin package audit passes synchronized repo metadata", async () => {
  let audit = await auditPluginPackage({ rootDir: process.cwd() });
  for (let attempt = 0; attempt < 10 && registryRace(audit); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    audit = await auditPluginPackage({ rootDir: process.cwd() });
  }
  assert.equal(audit.pass, true);
  assert.equal(audit.score, 10);
  assert.equal(audit.issues.length, 0);
  assert.equal(audit.versions.package, audit.versions.claude);
  assert.equal(audit.versions.package, audit.versions.marketplacePlugin);
});

function registryRace(audit) {
  return audit.issues.length > 0 && audit.issues.every((issue) => issue.code.startsWith("registry") || issue.code === "missing-registry");
}

test("plugin package audit reports version, path, command, and smoke-check drift with next actions", () => {
  const audit = auditPluginPackageData({
    packageJson: { version: "1.8.1" },
    manifests: {
      claude: { name: "supervibe", version: "1.7.0", description: "old", commands: "../commands", skills: "./missing-skills" },
      codex: { name: "wrong", version: "1.8.1", description: "worktree loop", commands: "./commands", skills: "./skills", hooks: "./hooks/hooks.json" },
    },
    marketplace: { name: "bad", metadata: { version: "1.7.0" }, plugins: [{ name: "supervibe", version: "1.7.0", source: "../outside" }] },
    geminiExtension: { version: "1.7.0" },
    opencodeSource: "version: \"1.7.0\"",
    readme: "Supervibe v1.7.0",
    changelog: "# Changelog",
    registryYaml: "agents:\n",
    commandFiles: ["supervibe.md"],
    trackedFiles: [
      ".supervibe/memory/code.db",
      ".claude/settings.json",
      ".supervibe/audits/latest.json",
      "registry.yaml",
      ".claude-plugin/.upgrade-check.json",
      ".worktrees/task-a/README.md",
      ".env.local",
    ],
    pathExists: {
      "claude:commands:../commands": false,
      "claude:skills:missing-skills": false,
      "codex:commands:commands": true,
      "codex:skills:skills": true,
    },
    scripts: {
      installSh: "",
      installPs1: "",
      updateSh: "",
      updatePs1: "",
      upgradeMjs: "",
    },
  });

  assert.equal(audit.pass, false);
  assert.ok(audit.issues.some((issue) => issue.code === "version-mismatch"));
  assert.ok(audit.issues.some((issue) => issue.code === "manifest-path-escapes-package"));
  assert.ok(audit.issues.some((issue) => issue.code === "missing-command-doc"));
  assert.ok(audit.issues.some((issue) => issue.code === "terminal-bin-root-missing"));
  assert.ok(audit.issues.some((issue) => issue.code === "unix-bin-link-not-wired"));
  assert.ok(audit.issues.some((issue) => issue.code === "codex-unsupported-manifest-field"));
  assert.ok(audit.issues.some((issue) => issue.code === "install-mirror-clean-missing"));
  assert.ok(audit.issues.some((issue) => issue.code === "upgrade-mirror-clean-missing"));
  assert.ok(audit.issues.some((issue) => issue.code === "upgrade-registry-build-missing"));
  assert.ok(audit.issues.some((issue) => issue.code === "upgrade-doctor-missing"));
  assert.ok(audit.issues.some((issue) => issue.code === "tracked-local-claude-state"));
  assert.ok(audit.issues.some((issue) => issue.code === "tracked-local-supervibe-state"));
  assert.ok(audit.issues.some((issue) => issue.code === "tracked-generated-registry"));
  assert.ok(audit.issues.some((issue) => issue.code === "tracked-upgrade-check-cache"));
  assert.ok(audit.issues.some((issue) => issue.code === "tracked-worktree-state"));
  assert.ok(audit.issues.some((issue) => issue.code === "tracked-runtime-artifact"));
  assert.ok(audit.nextActions.every(Boolean));
});

test("plugin package audit blocks dev test suite in user install and update paths", () => {
  const audit = auditPluginPackageData({
    packageJson: { version: "2.0.17" },
    manifests: {},
    marketplace: { name: "supervibe-marketplace", plugins: [] },
    geminiExtension: { version: "2.0.17" },
    opencodeSource: 'version: "2.0.17"',
    readme: "Supervibe v2.0.17",
    changelog: "Autonomous loop 10/10 upgrade",
    registryYaml: "agents:\nskills:\ngenerated-at:",
    commandFiles: [],
    trackedFiles: [],
    pathExists: {},
    scripts: {
      installSh: "npm run check\nregistry:build\nsupervibe:install-doctor\ngit clean -ffdx\nassert_checkout_mirror_clean\nSUPERVIBE_INSTALL_NODE",
      installPs1: "npm run check\nregistry:build\nsupervibe:install-doctor\nclean', '-ffdx\nAssert-CheckoutMirrorClean\nSUPERVIBE_INSTALL_NODE",
      updateSh: "status --porcelain\ntracked_dirty\nuntracked\nnpm run supervibe:upgrade",
      updatePs1: "status --porcelain\n$trackedDirty\nuntrackedDirty\nnpm run supervibe:upgrade",
      upgradeMjs: "['run', 'check']\nregistry:build\nsupervibe:install-doctor\ngit clean -ffdx\nassertMirrorCheckoutClean",
    },
  });

  assert.ok(audit.issues.some((issue) => issue.code === "user-update-runs-dev-check"));
});

test("plugin package audit integrates with final acceptance release gate", () => {
  const gate = createPluginPackageReleaseGate({
    pass: false,
    score: 8,
    issues: [{ code: "version-mismatch", message: "manifest drift" }],
  });
  const result = evaluateFinalAcceptance({
    state: {
      schema_version: 1,
      command_version: 1,
      rubric_version: 1,
      plugin_version: "1.8.1",
      release_gate: { plugin_package_audit_required: true },
    },
    pluginPackageAudit: gate,
  });

  assert.equal(result.pass, false);
  assert.ok(result.missing.some((item) => item.includes("plugin package audit")));
});
