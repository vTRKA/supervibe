import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildContextPack,
  estimateTokens,
  formatContextPackMarkdown,
  selectActiveItem,
} from "../scripts/lib/supervibe-context-pack.mjs";

test("context pack selects active work, evidence, dependencies, and relevant memory", async () => {
  const root = await makeTempRoot("supervibe-context-pack-");
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "checkout.ts"), [
      "// @supervibe-anchor id=checkout-context symbol=buildCheckout responsibility=\"Build checkout payment context\" verify=\"npm test -- checkout\"",
      "export function buildCheckout() { return true; }",
      "",
    ].join("\n"), "utf8");
    const graphPath = await writeGraph(root, {
      graph_id: "epic-context",
      title: "Checkout Context Epic",
      items: [
        { itemId: "epic-context", type: "epic", status: "open", title: "Checkout Context Epic" },
        { itemId: "T0", type: "task", status: "complete", title: "Schema done" },
        {
          itemId: "T1",
          type: "task",
          status: "open",
          title: "Checkout payment context pack",
          labels: ["checkout", "payment"],
          acceptanceCriteria: ["Checkout payment works"],
          verificationCommands: ["npm test -- checkout"],
          writeScope: [{ path: "src/checkout.ts" }],
        },
      ],
      tasks: [
        { id: "T0", status: "complete" },
        { id: "T1", status: "open", dependencies: ["T0"] },
      ],
      evidence: [{ workItemId: "T1", kind: "test", command: "npm test -- checkout" }],
    });
    await writeMemory(root, "decisions", "checkout-payment.md", {
      id: "checkout-payment-decision",
      confidence: 9,
    }, "Checkout payment context must keep evidence close to the active task.");

    const pack = await buildContextPack({
      rootDir: root,
      graphPath,
      itemId: "T1",
      now: "2026-04-30T00:00:00.000Z",
    });

    assert.equal(pack.activeItem.itemId, "T1");
    assert.equal(pack.dependencies[0].itemId, "T0");
    assert.equal(pack.evidence.length, 1);
    assert.equal(pack.memory[0].id, "checkout-payment-decision");
    assert.equal(pack.memory[0].freshness, "fresh");
    assert.equal(pack.semanticAnchors[0].anchorId, "checkout-context");
    assert.equal(pack.workflowSignal.phase, "execute");
    assert.equal(pack.workflowSignal.epicId, "epic-context");
    assert.match(pack.markdown, /Workflow Signal/);
    assert.match(pack.markdown, /Omitted Context/);
    assert.match(pack.markdown, /Semantic Anchors/);
    assert.ok(pack.summary.estimatedTokens > 0);
    assert.equal(selectActiveItem([pack.activeItem], "T1").itemId, "T1");
    assert.ok(estimateTokens(formatContextPackMarkdown(pack)) >= pack.summary.estimatedTokens);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeGraph(root, graph) {
  const dir = join(root, ".supervibe", "memory", "work-items", "epic-context");
  await mkdir(dir, { recursive: true });
  const graphPath = join(dir, "graph.json");
  await writeFile(graphPath, `${JSON.stringify({ kind: "supervibe-work-item-graph", ...graph }, null, 2)}\n`, "utf8");
  return graphPath;
}

async function writeMemory(root, category, fileName, frontmatter, body) {
  const dir = join(root, ".supervibe", "memory", category);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, fileName);
  const yaml = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`).join("\n");
  await writeFile(filePath, `---\n${yaml}\n---\n${body}\n`, "utf8");
}

async function makeTempRoot(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), prefix));
}
