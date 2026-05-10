import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  cleanupRuntimeTargets,
  readRuntimeCleanupRegistry,
  registerRuntimeCleanupTarget,
} from "../scripts/lib/runtime-cleanup-registry.mjs";

test("runtime cleanup registry removes stale pids and preserves host-managed subagents", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-runtime-cleanup-"));
  const registryPath = join(root, "runtime-cleanup-registry.json");
  try {
    await registerRuntimeCleanupTarget({
      id: "dead-preview",
      kind: "preview-server",
      pid: 99999999,
      port: 3099,
    }, { path: registryPath });
    await registerRuntimeCleanupTarget({
      id: "agent-1",
      kind: "subagent",
      stopMode: "host-managed",
    }, { path: registryPath });

    const result = await cleanupRuntimeTargets({ path: registryPath });
    const registry = await readRuntimeCleanupRegistry(registryPath);

    assert.equal(result.checked, 2);
    assert.equal(result.stale, 1);
    assert.equal(result.hostManaged, 1);
    assert.equal(registry.targets.length, 1);
    assert.equal(registry.targets[0].id, "agent-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
