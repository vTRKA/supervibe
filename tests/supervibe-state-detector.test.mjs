import { test, before, after } from "node:test";
import assert from "node:assert";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectNextPhase } from "../scripts/lib/supervibe-state-detector.mjs";

const sandboxRoot = join(tmpdir(), `evolve-detector-${Date.now()}`);

async function makeProject(name, opts = {}) {
  const root = join(sandboxRoot, name);
  await mkdir(join(root, ".claude", "memory"), { recursive: true });
  if (opts.scaffolded) {
    await mkdir(join(root, ".claude", "agents"), { recursive: true });
    await writeFile(join(root, "CLAUDE.md"), "# Project context\n");
  }
  if (opts.versionSeen) {
    await writeFile(
      join(root, ".claude", "memory", ".supervibe-version"),
      opts.versionSeen,
    );
  }
  if (opts.invocations) {
    const lines =
      opts.invocations.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await writeFile(
      join(root, ".claude", "memory", "agent-invocations.jsonl"),
      lines,
    );
  }
  if (opts.overrides) {
    const lines =
      opts.overrides.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await writeFile(join(root, ".claude", "confidence-log.jsonl"), lines);
  }
  return root;
}

async function makePlugin(name, opts = {}) {
  const root = join(sandboxRoot, name);
  await mkdir(join(root, ".claude-plugin"), { recursive: true });
  await writeFile(
    join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "evolve", version: opts.version || "1.7.0" }),
  );
  if (opts.upstreamCache) {
    await writeFile(
      join(root, ".claude-plugin", ".upgrade-check.json"),
      JSON.stringify(opts.upstreamCache),
    );
  }
  if (opts.staleAgents) {
    await mkdir(join(root, "agents"), { recursive: true });
    for (let i = 0; i < opts.staleAgents; i++) {
      await writeFile(
        join(root, "agents", `stale-${i}.md`),
        `---\nlast-verified: 2024-01-01\n---\n# stale agent ${i}\n`,
      );
    }
  }
  return root;
}

before(async () => {
  await mkdir(sandboxRoot, { recursive: true });
});

after(async () => {
  await rm(sandboxRoot, { recursive: true, force: true });
});

test("detector: project-not-scaffolded fires when .claude/agents/ + CLAUDE.md absent", async () => {
  const project = await makeProject("p-bare");
  const plugin = await makePlugin("plugin-bare");
  const r = await detectNextPhase(project, plugin);
  assert.strictEqual(r.proposed.command, "/supervibe-genesis");
  assert.strictEqual(r.proposed.signal, "project-not-scaffolded");
});

test("detector: upstream-behind takes priority over project-not-scaffolded", async () => {
  // bare project → would normally trigger genesis, but upstream-behind is higher priority
  const project = await makeProject("p-behind");
  const plugin = await makePlugin("plugin-behind", {
    upstreamCache: { checkedAt: Date.now(), behind: 5, latestTag: "v1.8.0" },
  });
  const r = await detectNextPhase(project, plugin);
  assert.strictEqual(r.proposed.command, "/supervibe-update");
  assert.strictEqual(r.proposed.signal, "upstream-behind");
});

test("detector: version-bump-unacked fires when project saw older plugin version", async () => {
  const project = await makeProject("p-old", {
    scaffolded: true,
    versionSeen: "1.6.0",
  });
  const plugin = await makePlugin("plugin-new", { version: "1.7.0" });
  const r = await detectNextPhase(project, plugin);
  assert.strictEqual(r.proposed.command, "/supervibe-adapt");
  assert.match(r.proposed.reason, /1\.6\.0.*1\.7\.0|1\.7\.0/);
});

test("detector: stale-artifacts fires only when ≥3 stale files exist", async () => {
  const project = await makeProject("p-stale", {
    scaffolded: true,
    versionSeen: "1.7.0",
  });
  const plugin = await makePlugin("plugin-stale", {
    version: "1.7.0",
    staleAgents: 5,
  });
  const r = await detectNextPhase(project, plugin);
  assert.strictEqual(r.proposed.command, "/supervibe-audit");
  assert.strictEqual(r.proposed.signal, "stale-artifacts");
});

test("detector: stale under threshold (<3) does not trigger", async () => {
  const project = await makeProject("p-stale-2", {
    scaffolded: true,
    versionSeen: "1.7.0",
  });
  const plugin = await makePlugin("plugin-stale-2", {
    version: "1.7.0",
    staleAgents: 2,
  });
  const r = await detectNextPhase(project, plugin);
  assert.notStrictEqual(r.proposed.signal, "stale-artifacts");
});

test("detector: override-rate fires when >5% over last ≥10 entries", async () => {
  const overrides = [];
  for (let i = 0; i < 12; i++)
    overrides.push({ override: i < 2, ts: new Date().toISOString() });
  const project = await makeProject("p-or", {
    scaffolded: true,
    versionSeen: "1.7.0",
    overrides,
  });
  const plugin = await makePlugin("plugin-or", { version: "1.7.0" });
  const r = await detectNextPhase(project, plugin);
  assert.strictEqual(r.proposed.command, "/supervibe-audit");
  assert.strictEqual(r.proposed.signal, "override-rate-high");
});

test("detector: pending-evaluation fires when latest invocation has no outcome", async () => {
  const project = await makeProject("p-pending", {
    scaffolded: true,
    versionSeen: "1.7.0",
    invocations: [
      {
        agent_id: "someone",
        task_summary: "t",
        confidence_score: 9,
        ts: new Date().toISOString(),
      },
    ],
  });
  const plugin = await makePlugin("plugin-pending", { version: "1.7.0" });
  const r = await detectNextPhase(project, plugin);
  assert.strictEqual(r.proposed.command, "/supervibe-evaluate");
  assert.strictEqual(r.proposed.signal, "pending-evaluation");
});

test("detector: pending-evaluation does NOT fire when latest has outcome", async () => {
  const project = await makeProject("p-acked", {
    scaffolded: true,
    versionSeen: "1.7.0",
    invocations: [
      {
        agent_id: "someone",
        task_summary: "t",
        confidence_score: 9,
        outcome: "accept",
        ts: new Date().toISOString(),
      },
    ],
  });
  const plugin = await makePlugin("plugin-acked", { version: "1.7.0" });
  const r = await detectNextPhase(project, plugin);
  assert.strictEqual(r.proposed.signal, "all-green");
  assert.strictEqual(r.proposed.command, null);
});

test("detector: all-green when nothing fires", async () => {
  const project = await makeProject("p-clean", {
    scaffolded: true,
    versionSeen: "1.7.0",
  });
  const plugin = await makePlugin("plugin-clean", { version: "1.7.0" });
  const r = await detectNextPhase(project, plugin);
  assert.strictEqual(r.proposed.signal, "all-green");
  assert.strictEqual(r.proposed.command, null);
});

test("detector: report contains all 7 checks even on first-trigger short-circuit", async () => {
  const project = await makeProject("p-report");
  const plugin = await makePlugin("plugin-report");
  const r = await detectNextPhase(project, plugin);
  const names = r.checks.map((c) => c.name);
  for (const expected of [
    "upstream-behind",
    "version-bump-unacked",
    "project-not-scaffolded",
    "underperformers",
    "stale-artifacts",
    "override-rate-high",
    "pending-evaluation",
  ]) {
    assert.ok(names.includes(expected), `missing check: ${expected}`);
  }
});
