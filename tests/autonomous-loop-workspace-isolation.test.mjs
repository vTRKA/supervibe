import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  collectTaskWriteSet,
  planWorkspaceIsolation,
  validateWorktreeExecutionWorkspace,
} from "../scripts/lib/autonomous-loop-workspace-isolation.mjs";

test("overlapping write sets stop parallel dispatch", () => {
  const result = planWorkspaceIsolation([{ id: "a", filesToModify: ["x.js"] }, { id: "b", filesToModify: ["x.js"] }]);
  assert.equal(result.status, "workspace_conflict");
  assert.equal(result.worktreeRecommendation, "use-isolated-worktree-or-serialize");
});

test("writeScope participates in workspace conflict checks", () => {
  assert.deepEqual(collectTaskWriteSet({ writeScope: [{ path: "src/a.ts" }] }), ["src/a.ts"]);
  const result = planWorkspaceIsolation([
    { id: "a", writeScope: [{ path: "src/a.ts" }] },
    { id: "b", probableFiles: ["src/a.ts"] },
  ]);
  assert.equal(result.status, "workspace_conflict");
});

test("worktree execution workspace blocks dirty main workspace without approval", () => {
  const rootDir = join(tmpdir(), "supervibe-workspace-isolation", "repo");
  const result = validateWorktreeExecutionWorkspace({
    rootDir,
    worktreePath: join(rootDir, ".worktrees", "session"),
    dirtyMainWorkspace: true,
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("dirty-main-workspace-needs-explicit-approval"));
});
