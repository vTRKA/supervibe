import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  auditInstallLifecycleData,
  classifyStaleFiles,
  runInstallLifecycleAudit,
} from "../scripts/lib/supervibe-install-lifecycle-audit.mjs";

test("install lifecycle audit passes clean generated install state", () => {
  const audit = auditInstallLifecycleData({
    version: "2.0.17",
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

test("install lifecycle audit accepts Codex official cache/config/native skills", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "supervibe-install-home-"));
  const codexPlugin = join(homeDir, ".codex", "plugins", "cache", "supervibe-marketplace", "supervibe", "local");
  const codexSkills = join(homeDir, ".agents", "skills", "supervibe");
  await mkdir(join(codexPlugin, ".codex-plugin"), { recursive: true });
  await writeFile(join(codexPlugin, ".codex-plugin", "plugin.json"), "{}", "utf8");
  await mkdir(join(codexSkills, "genesis"), { recursive: true });
  await writeFile(join(codexSkills, "genesis", "SKILL.md"), "# Genesis\n", "utf8");
    await writeFile(join(homeDir, ".codex", "config.toml"), [
      "[features]",
      "apps = true",
      "hooks = true",
      "plugin_hooks = true",
      "",
      "[apps._default]",
      "enabled = true",
      "",
      "[[tool_suggest.discoverables]]",
      "type = \"plugin\"",
      "id = \"supervibe@supervibe-marketplace\"",
      "",
    ].join("\n"), "utf8");

  const audit = await runInstallLifecycleAudit({
    rootDir: process.cwd(),
    homeDir,
    expectedHosts: ["codex"],
    writeReport: false,
  });

  assert.equal(audit.hostRegistrations.codex.ok, true);
  assert.equal(audit.hostRegistrations.codex.pluginOk, true);
  assert.equal(audit.hostRegistrations.codex.configOk, true);
  assert.equal(audit.hostRegistrations.codex.pluginHooksOk, true);
  assert.equal(audit.hostRegistrations.codex.skillsOk, true);
});

test("install lifecycle audit fails Codex registration when plugin hooks are disabled", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "supervibe-install-home-"));
  const codexPlugin = join(homeDir, ".codex", "plugins", "cache", "supervibe-marketplace", "supervibe", "local");
  const codexSkills = join(homeDir, ".agents", "skills", "supervibe");
  await mkdir(join(codexPlugin, ".codex-plugin"), { recursive: true });
  await writeFile(join(codexPlugin, ".codex-plugin", "plugin.json"), "{}", "utf8");
  await mkdir(join(codexSkills, "genesis"), { recursive: true });
  await writeFile(join(codexSkills, "genesis", "SKILL.md"), "# Genesis\n", "utf8");
  await writeFile(join(homeDir, ".codex", "config.toml"), [
    "[features]",
    "apps = true",
    "",
    "[apps._default]",
    "enabled = true",
    "",
    "[[tool_suggest.discoverables]]",
    "type = \"plugin\"",
    "id = \"supervibe@supervibe-marketplace\"",
    "",
  ].join("\n"), "utf8");

  const audit = await runInstallLifecycleAudit({
    rootDir: process.cwd(),
    homeDir,
    expectedHosts: ["codex"],
    writeReport: false,
  });

  assert.equal(audit.pass, false);
  assert.equal(audit.hostRegistrations.codex.configOk, true);
  assert.equal(audit.hostRegistrations.codex.pluginHooksOk, false);
  assert.ok(audit.issues.some((issue) => issue.code === "codex-registration-missing"));
});


test("install lifecycle audit requires Gemini session hooks when Gemini is registered", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "supervibe-gemini-home-"));
  const geminiHome = join(homeDir, ".gemini");
  await mkdir(geminiHome, { recursive: true });
  await writeFile(join(geminiHome, "GEMINI.md"), [
    "<!-- supervibe-plugin-include: do-not-edit -->",
    `@${process.cwd().replace(/\\/g, "/")}/GEMINI.md`,
    "<!-- supervibe-plugin-include: do-not-edit -->",
    "",
  ].join("\n"), "utf8");

  let audit = await runInstallLifecycleAudit({
    rootDir: process.cwd(),
    homeDir,
    expectedHosts: ["gemini"],
    writeReport: false,
  });
  assert.equal(audit.pass, false);
  assert.equal(audit.hostRegistrations.gemini.includeOk, true);
  assert.equal(audit.hostRegistrations.gemini.hooksOk, false);

  await writeFile(join(geminiHome, "settings.json"), JSON.stringify({
    hooksConfig: { enabled: false },
    hooks: {
      SessionStart: [{ matcher: "startup|resume|clear", hooks: [{ type: "command", command: "node scripts/hooks/gemini-session-start.mjs" }] }],
      PreCompress: [{ hooks: [{ type: "command", command: "node scripts/hooks/gemini-session-start.mjs --reason compact" }] }],
    },
  }, null, 2), "utf8");
  audit = await runInstallLifecycleAudit({
    rootDir: process.cwd(),
    homeDir,
    expectedHosts: ["gemini"],
    writeReport: false,
  });
  assert.equal(audit.hostRegistrations.gemini.hooksOk, false);

  await writeFile(join(geminiHome, "settings.json"), JSON.stringify({
    hooksConfig: { enabled: true },
    hooks: {
      SessionStart: [
        { matcher: "startup", hooks: [{ type: "command", command: "node scripts/hooks/gemini-session-start.mjs --reason startup" }] },
        { matcher: "resume", hooks: [{ type: "command", command: "node scripts/hooks/gemini-session-start.mjs --reason resume" }] },
        { matcher: "clear", hooks: [{ type: "command", command: "node scripts/hooks/gemini-session-start.mjs --reason clear" }] },
      ],
      PreCompress: [{ hooks: [{ type: "command", command: "node scripts/hooks/gemini-session-start.mjs --reason compact" }] }],
    },
  }, null, 2), "utf8");
  audit = await runInstallLifecycleAudit({
    rootDir: process.cwd(),
    homeDir,
    expectedHosts: ["gemini"],
    writeReport: false,
  });
  assert.equal(audit.hostRegistrations.gemini.ok, true);
});
test("install lifecycle audit requires OpenCode plugin registration when OpenCode is registered", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "supervibe-opencode-home-"));
  let audit = await runInstallLifecycleAudit({
    rootDir: process.cwd(),
    homeDir,
    expectedHosts: ["opencode"],
    writeReport: false,
  });
  assert.equal(audit.pass, false);
  assert.equal(audit.hostRegistrations.opencode.pluginOk, false);
  assert.equal(audit.hostRegistrations.opencode.entrypointOk, true);

  const configPath = join(homeDir, ".config", "opencode", "opencode.json");
  await mkdir(join(homeDir, ".config", "opencode"), { recursive: true });
  await writeFile(configPath, JSON.stringify({
    plugin: ["supervibe@git+https://github.com/vTRKA/supervibe.git#main"],
  }, null, 2), "utf8");
  audit = await runInstallLifecycleAudit({
    rootDir: process.cwd(),
    homeDir,
    expectedHosts: ["opencode"],
    writeReport: false,
  });
  assert.equal(audit.hostRegistrations.opencode.ok, true);
  assert.equal(audit.hostRegistrations.opencode.entrypointOk, true);
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
