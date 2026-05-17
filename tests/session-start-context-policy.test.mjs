import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  SESSION_START_CONTEXT_POLICY,
  createMissingCodeIndexDiagnostic,
  createSessionStartContextBootstrapPlan,
  ensureCodeIndexFresh,
  normalizeSessionStartReason,
  shouldRunSessionStartBootstrap,
} from "../scripts/session-start-check.mjs";
import {
  TASK_TRACKER_PRIME_COMPACT_LIMIT,
  compactTaskTrackerPrimeOutput,
  resolveTaskTrackerPrimeHookOptions,
} from "../scripts/hooks/task-tracker-prime.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

test("session-start policy docs define compact host-neutral bootstrap", async () => {
  const policy = await readFile(join(ROOT, "docs", "session-start-context-policy.md"), "utf8");
  const portability = await readFile(join(ROOT, "docs", "host-neutral-hook-portability.md"), "utf8");
  const skill = await readFile(join(ROOT, "skills", "using-supervibe-skills", "SKILL.md"), "utf8");

  for (const required of [
    "session-start",
    "context-bootstrap",
    "SUPERVIBE_PLUGIN_ROOT",
    "startup",
    "clear",
    "compact",
    "fresh-context handoff packet",
    "Session-start bootstrap never creates durable workflow proof",
    "runtime cleanup APIs",
  ]) {
    assert.match(policy, new RegExp(escapeRegExp(required), "i"), required);
  }

  assert.match(portability, /Session Start Context Bootstrap/);
  assert.match(portability, /session-start-context-policy\.md/);
  assert.match(skill, /docs\/session-start-context-policy\.md/);
  assert.match(skill, /receipt neutrality|workflow receipts/i);
});

test("portable hooks use the host-neutral plugin root and compact session-start prime", async () => {
  const hooks = JSON.parse(await readFile(join(ROOT, "hooks", "hooks.json"), "utf8"));
  const sessionStart = hooks.hooks.SessionStart?.[0];
  assert.equal(sessionStart.matcher, "startup|clear|compact");
  assert.equal(sessionStart.hooks[0].async, false);
  assert.match(sessionStart.hooks[0].command, /scripts\/session-start-check\.mjs/);
  assert.match(sessionStart.hooks[1].command, /scripts\/hooks\/task-tracker-prime\.mjs --text --compact-context/);

  const postEdit = hooks.hooks.PostToolUse?.find((entry) =>
    (entry.hooks || []).some((hook) => String(hook.command || "").includes("scripts/post-edit-stack-watch.mjs")),
  );
  assert.equal(postEdit.matcher, "Bash|Write|Edit");
  assert.equal(postEdit.hooks[0].async, false);

  const commands = Object.values(hooks.hooks)
    .flat()
    .flatMap((entry) => entry.hooks || [])
    .map((hook) => hook.command || "");
  assert.ok(commands.length > 0);
  for (const command of commands) {
    assert.match(command, /process\.env\.SUPERVIBE_PLUGIN_ROOT/);
    assert.doesNotMatch(command, /CLAUDE.*PLUGIN_ROOT|PLUGIN_ROOT'\]/);
  }
});

test("runtime policy is non-fatal, compact-aware, and receipt-neutral", () => {
  assert.equal(SESSION_START_CONTEXT_POLICY.lifecycle, "session-start");
  assert.equal(SESSION_START_CONTEXT_POLICY.intent, "context-bootstrap");
  assert.deepEqual([...SESSION_START_CONTEXT_POLICY.acceptedReasons], ["startup", "clear", "compact"]);
  assert.equal(SESSION_START_CONTEXT_POLICY.requiredPluginRootEnv, "SUPERVIBE_PLUGIN_ROOT");
  assert.equal(SESSION_START_CONTEXT_POLICY.receipts.issueAtSessionStart, false);
  assert.equal(SESSION_START_CONTEXT_POLICY.receipts.hookOutputIsWorkflowProof, false);
  assert.equal(SESSION_START_CONTEXT_POLICY.cleanup.requireRuntimeApi, true);
  assert.equal(SESSION_START_CONTEXT_POLICY.cleanup.sessionStartStalePrune, true);
  assert.equal(SESSION_START_CONTEXT_POLICY.cleanup.staleOnly, true);
  assert.equal(SESSION_START_CONTEXT_POLICY.cleanup.liveProcessStops, false);

  const compact = createSessionStartContextBootstrapPlan({
    env: {
      SUPERVIBE_PLUGIN_ROOT: "/plugin",
      SUPERVIBE_HOST: "codex",
      SUPERVIBE_SESSION_START_REASON: "compact",
    },
  });
  assert.equal(compact.reason, "compact");
  assert.equal(compact.compactContext, true);
  assert.equal(compact.pluginRootPresent, true);
  assert.equal(compact.hostId, "codex");
  assert.equal(compact.failureMode, "non-fatal-diagnostic-or-noop");

  const missingRoot = createSessionStartContextBootstrapPlan({ env: {} });
  assert.equal(missingRoot.reason, "startup");
  assert.equal(missingRoot.pluginRootPresent, false);
  assert.equal(normalizeSessionStartReason("unknown"), "startup");
  assert.equal(shouldRunSessionStartBootstrap({ env: { SUPERVIBE_SESSION_START_DISABLED: "1" } }), false);
});

test("session-start disabled auto-bootstrap reports repair commands", () => {
  const diagnostic = createMissingCodeIndexDiagnostic("project-root");
  assert.equal(diagnostic.action, "missing");
  assert.match(diagnostic.dbPath, /project-root/);
  assert.match(diagnostic.error, /automatic session-start bootstrap is disabled/);
  assert.match(diagnostic.error, /build-code-index\.mjs --root \. --force --health --no-embeddings/);
});

test("session-start bootstraps a missing code index by default", async () => {
  const root = join(tmpdir(), `supervibe-session-index-${Date.now()}`);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "first.ts"), "export const first = 1;\n");

  const result = await ensureCodeIndexFresh(root, { allowBuild: true, useEmbeddings: false });

  assert.equal(result.action, "bootstrap");
  assert.equal(result.useEmbeddings, false);
  assert.ok(existsSync(join(root, ".supervibe", "memory", "code.db")));
  assert.ok(result.stats.totalFiles >= 1);
  assert.ok(result.stats.totalChunks >= 1);
  await rm(root, { recursive: true, force: true });
});

test("task tracker prime has compact-context hook options and trim behavior", () => {
  const options = resolveTaskTrackerPrimeHookOptions({
    argv: ["--text", "--compact-context"],
    env: {},
  });
  assert.equal(options.text, true);
  assert.equal(options.compactContext, true);
  assert.equal(options.limit, TASK_TRACKER_PRIME_COMPACT_LIMIT);
  assert.equal(options.maxChars, 6000);

  const longReminder = `<system-reminder>\n${"active work\n".repeat(80)}</system-reminder>`;
  const compact = compactTaskTrackerPrimeOutput(longReminder, { maxChars: 300 });
  assert.ok(compact.length <= 300);
  assert.match(compact, /context bootstrap trimmed to 300 chars/);
  assert.match(compact, /<\/system-reminder>$/);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
