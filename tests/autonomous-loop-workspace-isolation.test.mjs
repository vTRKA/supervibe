import assert from "node:assert/strict";
import test from "node:test";
import { planWorkspaceIsolation } from "../scripts/lib/autonomous-loop-workspace-isolation.mjs";

test("overlapping write sets stop parallel dispatch", () => {
  const result = planWorkspaceIsolation([{ id: "a", filesToModify: ["x.js"] }, { id: "b", filesToModify: ["x.js"] }]);
  assert.equal(result.status, "workspace_conflict");
});
