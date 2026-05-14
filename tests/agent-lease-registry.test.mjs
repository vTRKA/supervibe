import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createAgentLeaseFromInvocation,
  summarizeAgentLeaseCoverageSync,
  summarizeAgentLeaseDebtSync,
  upsertAgentLeaseSync,
} from "../scripts/lib/supervibe-agent-lease-registry.mjs";

test("agent lease debt is scoped so other command debt is diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-lease-"));
  try {
    const path = join(root, ".supervibe", "memory", "agent-lease-registry.json");
    upsertAgentLeaseSync(createAgentLeaseFromInvocation({
      record: {
        agent_id: "planner",
        host_invocation_source: "codex-spawn-agent",
        host_invocation_id: "agent-current",
        status: "completed",
        command: "/supervibe-plan",
        handoffId: "current",
      },
      now: new Date("2026-05-14T00:00:00.000Z"),
    }), { path });
    upsertAgentLeaseSync(createAgentLeaseFromInvocation({
      record: {
        agent_id: "auditor",
        host_invocation_source: "codex-spawn-agent",
        host_invocation_id: "agent-other",
        status: "completed",
        command: "/supervibe-audit",
        handoffId: "other",
      },
      now: new Date("2026-05-14T00:01:00.000Z"),
    }), { path });

    const scoped = summarizeAgentLeaseDebtSync({
      rootDir: root,
      path,
      includeInvocationLog: false,
      scope: { command: "/supervibe-plan", handoffId: "current" },
    });

    assert.equal(scoped.blockingCount, 1);
    assert.equal(scoped.closeRequired[0].hostInvocationId, "agent-current");
    assert.equal(scoped.diagnosticCount, 1);
    assert.equal(scoped.diagnostics[0].classification, "other-scope-cleanup-debt");

    const release = summarizeAgentLeaseDebtSync({
      rootDir: root,
      path,
      includeInvocationLog: false,
      strictRelease: true,
    });
    assert.equal(release.blockingCount, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent lease coverage rejects generic inline proof for named specialists", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-lease-coverage-"));
  try {
    const invocationLogPath = join(root, ".supervibe", "memory", "agent-invocations.jsonl");
    await mkdir(join(root, ".supervibe", "memory"), { recursive: true });
    await writeFile(invocationLogPath, [
      JSON.stringify({
        agent_id: "reviewer",
        host_invocation_source: "inline-controller",
        host_invocation_id: "inline-1",
        status: "completed",
        command: "/supervibe-review",
        handoffId: "review-handoff",
      }),
      JSON.stringify({
        agent_id: "planner",
        host_invocation_source: "codex-spawn-agent",
        host_invocation_id: "spawned-1",
        status: "completed",
        command: "/supervibe-review",
        handoffId: "review-handoff",
      }),
    ].join("\n") + "\n", "utf8");

    const coverage = summarizeAgentLeaseCoverageSync({
      rootDir: root,
      invocationLogPath,
      requiredAgentIds: ["reviewer", "planner"],
      scope: { command: "/supervibe-review", handoffId: "review-handoff" },
      includeInvocationLog: true,
    });

    assert.equal(coverage.pass, false);
    assert.deepEqual(coverage.trustedAgentIds, ["planner"]);
    assert.deepEqual(coverage.missingAgentIds, ["reviewer"]);
    assert.equal(coverage.rejectedGenericProof.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
