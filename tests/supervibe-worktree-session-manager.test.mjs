import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  assertSessionClaimAllowed,
  createCleanupPlan,
  createSessionRegistry,
  createWorktreeCommandPlan,
  createWorktreeSessionRecord,
  defaultWorktreeRegistryPath,
  finishWorktreeSession,
  formatWorktreeSessionStatus,
  heartbeatWorktreeSession,
  markStaleWorktreeSessions,
  readWorktreeSessionRegistry,
  selectWorktreeDirectory,
  upsertWorktreeSession,
  upsertWorktreeSessionFile,
  validateExistingWorktree,
  validateWorktreeDirectoryPolicy,
  writeWorktreeSessionRegistry,
  WORKTREE_SESSION_STATUSES,
} from "../scripts/lib/supervibe-worktree-session-manager.mjs";

const execFileAsync = promisify(execFile);

test("directory policy requires project-local worktree roots to be ignored", () => {
  const rootDir = fixtureRepoPath("policy");
  const worktreeRoot = join(rootDir, ".worktrees");
  const blocked = validateWorktreeDirectoryPolicy({
    rootDir,
    worktreeRoot,
    gitignoreContent: "node_modules/\n",
    exists: true,
  });
  assert.equal(blocked.valid, false);
  assert.ok(blocked.issues.includes("project-local-worktree-root-must-be-gitignored"));

  const allowed = validateWorktreeDirectoryPolicy({
    rootDir,
    worktreeRoot,
    gitignoreContent: ".worktrees/\n",
    exists: true,
  });
  assert.equal(allowed.valid, true);
});

test("selection prefers existing safe .worktrees before configured roots", async () => {
  const rootDir = fixtureRepoPath("selection");
  const result = await selectWorktreeDirectory({
    rootDir,
    gitignoreContent: ".worktrees/\nworktrees/\n",
    exists: async (target) => target.replace(/\\/g, "/").endsWith("/.worktrees"),
    configWorktreeRoot: "custom-worktrees",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.source, "project-existing");
  assert.match(result.selected.replace(/\\/g, "/"), /\.worktrees$/);
});

test("session records include branch, heartbeat, command plan, and stop controls", () => {
  const rootDir = fixtureRepoPath("session");
  const session = createWorktreeSessionRecord({
    rootDir,
    epicId: "epic-1",
    branchName: "supervibe/epic-1",
    worktreePath: join(rootDir, ".worktrees", "epic-1"),
    baselineCommit: "abc123",
  });
  assert.ok(WORKTREE_SESSION_STATUSES.includes(session.status));
  assert.equal(session.epicId, "epic-1");
  assert.equal(session.baselineCommit, "abc123");
  assert.match(session.commandPlan.create, /git worktree add/);
  assert.match(createWorktreeCommandPlan(session).status, /git -C/);
});

test("registry allows scoped concurrent sessions on one epic and blocks overlapping work", () => {
  const first = createWorktreeSessionRecord({ epicId: "epic-1", workItemIds: ["T1"], status: "active" });
  const registry = createSessionRegistry([first]);
  const second = createWorktreeSessionRecord({ epicId: "epic-1", workItemIds: ["T2"], sessionId: "session-other" });
  const result = upsertWorktreeSession(registry, second);
  assert.equal(result.ok, true);

  const overlapping = upsertWorktreeSession(result.registry, createWorktreeSessionRecord({
    epicId: "epic-1",
    workItemIds: ["T1"],
    sessionId: "session-overlap",
  }));
  assert.equal(overlapping.ok, false);
  assert.equal(overlapping.reason, "session-conflict");
  assert.ok(overlapping.conflicts[0].reasons.includes("overlapping-work-items"));

  const claim = assertSessionClaimAllowed(registry, { epicId: "epic-2", workItemIds: ["T1"], sessionId: "new" });
  assert.equal(claim.allowed, false);
});

test("registry blocks overlapping write sets across parallel worktree sessions", () => {
  const first = createWorktreeSessionRecord({
    epicId: "epic-1",
    workItemIds: ["T1"],
    assignedWriteSet: ["src\\parser.ts", "src/parser.ts"],
    status: "active",
  });
  const registry = createSessionRegistry([first]);
  const second = createWorktreeSessionRecord({
    epicId: "epic-1",
    workItemIds: ["T2"],
    assignedWriteSet: ["src/parser.ts"],
    sessionId: "session-write-overlap",
  });

  const result = upsertWorktreeSession(registry, second);
  assert.equal(result.ok, false);
  assert.ok(result.conflicts[0].reasons.includes("overlapping-write-set"));
  assert.deepEqual(result.conflicts[0].overlappingWriteSet, ["src/parser.ts"]);
  assert.deepEqual(result.conflicts[0].assignedWriteSet, ["src/parser.ts"]);
});

test("registry supports ten scoped sessions on one epic and reports ownership", () => {
  let registry = createSessionRegistry();

  for (let index = 1; index <= 10; index += 1) {
    const result = upsertWorktreeSession(registry, createWorktreeSessionRecord({
      sessionId: `session-${index}`,
      epicId: "epic-10x",
      workItemIds: [`T${index}`],
      assignedTaskIds: [`T${index}`],
      assignedWaveId: "wave-1",
      assignedWriteSet: [`src/module-${index}.ts`],
      activeAgentIds: [`agent-${index}`],
      status: "active",
    }));
    assert.equal(result.ok, true, `session-${index} should not conflict with disjoint ownership`);
    registry = result.registry;
  }

  assert.equal(registry.sessions.length, 10);
  const status = formatWorktreeSessionStatus(registry);
  assert.match(status, /ACTIVE: 10/);
  assert.match(status, /session-10 epic=epic-10x status=active wave=wave-1 tasks=T10 writes=src\/module-10\.ts agents=agent-10/);

  const taskOverlap = upsertWorktreeSession(registry, createWorktreeSessionRecord({
    sessionId: "session-task-overlap",
    epicId: "epic-10x",
    assignedTaskIds: ["T7"],
    assignedWriteSet: ["src/module-11.ts"],
    status: "active",
  }));
  assert.equal(taskOverlap.ok, false);
  assert.ok(taskOverlap.conflicts[0].reasons.includes("overlapping-work-items"));

  const writeOverlap = upsertWorktreeSession(registry, createWorktreeSessionRecord({
    sessionId: "session-write-overlap-2",
    epicId: "epic-10x",
    assignedTaskIds: ["T11"],
    assignedWriteSet: ["src\\module-8.ts"],
    status: "active",
  }));
  assert.equal(writeOverlap.ok, false);
  assert.ok(writeOverlap.conflicts[0].reasons.includes("overlapping-write-set"));
});

test("registry file upserts serialize concurrent scoped session claims", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-worktree-concurrent-"));
  try {
    const registryPath = defaultWorktreeRegistryPath(temp);
    const results = await Promise.all(Array.from({ length: 10 }, async (_, offset) => {
      const index = offset + 1;
      return upsertWorktreeSessionFile(registryPath, createWorktreeSessionRecord({
        sessionId: `session-file-${index}`,
        epicId: "epic-file-10x",
        assignedTaskIds: [`T${index}`],
        assignedWriteSet: [`src/file-${index}.ts`],
        status: "active",
      }), { lockRetryMs: 1, lockAttempts: 1000 });
    }));

    assert.equal(results.every((result) => result.ok), true);
    const loaded = await readWorktreeSessionRegistry(registryPath);
    assert.equal(loaded.sessions.length, 10);
    assert.deepEqual(
      loaded.sessions.map((session) => session.sessionId).sort(),
      Array.from({ length: 10 }, (_, offset) => `session-file-${offset + 1}`).sort(),
    );

    const conflict = await upsertWorktreeSessionFile(registryPath, createWorktreeSessionRecord({
      sessionId: "session-file-conflict",
      epicId: "epic-file-10x",
      assignedTaskIds: ["T4"],
      assignedWriteSet: ["src/file-11.ts"],
      status: "active",
    }), { lockRetryMs: 1, lockAttempts: 1000 });
    assert.equal(conflict.ok, false);
    assert.ok(conflict.conflicts[0].reasons.includes("overlapping-work-items"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI writes scoped sessions and honors allow-conflict flag", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-worktree-cli-"));
  const cliPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
  try {
    await writeFile(join(temp, ".gitignore"), ".worktrees/\n", "utf8");
    await execFileAsync(process.execPath, [
      cliPath,
      "--worktree",
      "--epic",
      "EPIC-CLI",
      "--assigned-task",
      "T1",
      "--assigned-write-set",
      "src/a.ts",
      "--max-loops",
      "1",
    ], { cwd: temp });

    await assert.rejects(
      execFileAsync(process.execPath, [
        cliPath,
        "--worktree",
        "--epic",
        "EPIC-CLI",
        "--session-id",
        "session-cli-conflict",
        "--assigned-task",
        "T1",
        "--assigned-write-set",
        "src/b.ts",
        "--max-loops",
        "1",
      ], { cwd: temp }),
      /Worktree session conflict/,
    );

    await execFileAsync(process.execPath, [
      cliPath,
      "--worktree",
      "--epic",
      "EPIC-CLI",
      "--session-id",
      "session-cli-conflict",
      "--assigned-task",
      "T1",
      "--assigned-write-set",
      "src/b.ts",
      "--allow-session-conflict",
      "--max-loops",
      "1",
    ], { cwd: temp });

    const registry = await readWorktreeSessionRegistry(defaultWorktreeRegistryPath(temp));
    assert.equal(registry.sessions.length, 2);
    assert.ok(registry.sessions.some((session) => session.sessionId === "session-cli-conflict"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("heartbeat, stale marking, finish, and cleanup keep dirty worktrees", () => {
  const session = createWorktreeSessionRecord({
    sessionId: "session-1",
    epicId: "epic-1",
    status: "active",
    heartbeatAt: "2026-04-29T00:00:00.000Z",
  });
  const registry = createSessionRegistry([session]);
  const heartbeat = heartbeatWorktreeSession(registry, "session-1", {
    now: "2026-04-29T00:05:00.000Z",
    activeAgentIds: ["agent-1"],
  });
  assert.equal(heartbeat.sessions[0].status, "active");
  assert.deepEqual(heartbeat.sessions[0].activeAgentIds, ["agent-1"]);

  const stale = markStaleWorktreeSessions(heartbeat, {
    now: "2026-04-29T01:00:00.000Z",
    ttlMinutes: 30,
  });
  assert.equal(stale.sessions[0].status, "stale");

  const cleanup = createCleanupPlan(stale.sessions[0], { hasUncommittedChanges: true });
  assert.equal(cleanup.status, "cleanup_blocked");
  assert.equal(cleanup.command, null);

  const finished = finishWorktreeSession(stale, "session-1", { hasUncommittedChanges: true });
  assert.equal(finished.sessions[0].status, "cleanup_blocked");
  assert.match(formatWorktreeSessionStatus(finished), /CLEANUP_BLOCKED: 1/);
});

test("existing worktree validation rejects main root and failed baseline", () => {
  const rootDir = fixtureRepoPath("existing");
  const result = validateExistingWorktree({
    rootDir,
    worktreePath: rootDir,
    gitignoreContent: ".worktrees/\n",
    baselineChecks: [{ status: "failed" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("existing-worktree-cannot-be-main-root"));
  assert.ok(result.issues.includes("baseline-check-failed"));
});

test("registry can be written and read, and CLI reports session status", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-worktree-registry-"));
  try {
    const registryPath = defaultWorktreeRegistryPath(temp);
    const registry = createSessionRegistry([
      createWorktreeSessionRecord({ sessionId: "session-1", epicId: "epic-1", status: "active" }),
    ]);
    await writeWorktreeSessionRegistry(registryPath, registry);
    const loaded = await readWorktreeSessionRegistry(registryPath);
    assert.equal(loaded.sessions.length, 1);

    const { stdout } = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-loop.mjs"),
      "--worktree-status",
      "--file",
      registryPath,
    ], { cwd: process.cwd() });
    assert.match(stdout, /SUPERVIBE_WORKTREE_SESSIONS/);
    assert.match(stdout, /session-1/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function fixtureRepoPath(name) {
  return join(tmpdir(), `supervibe-worktree-${name}`, "repo");
}
