import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  buildSemanticAnchorIndex,
  formatSemanticAnchorReport,
  parseSemanticAnchors,
  semanticAnchorToGraphNode,
  writeSemanticAnchorIndex,
} from "../scripts/lib/supervibe-semantic-anchor-index.mjs";

test("semantic anchors parse stable regions without storing secrets", () => {
  const content = [
    "// @supervibe-anchor id=auth.login symbol=loginUser visibility=public responsibility=\"Authenticate users\" invariant=\"Never log password=supersecret\" verify=\"npm test -- auth\"",
    "export function loginUser(input) {",
    "  return input.email;",
    "}",
  ].join("\n");

  const anchors = parseSemanticAnchors(content, { filePath: "src/auth.ts" });

  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].anchorId, "auth.login");
  assert.equal(anchors[0].symbolName, "loginUser");
  assert.equal(anchors[0].visibility, "public");
  assert.equal(anchors[0].startLine, 1);
  assert.equal(JSON.stringify(anchors).includes("supersecret"), false);
  assert.ok(anchors[0].verificationRefs.includes("npm test -- auth"));
});

test("semantic anchor index supports sidecar entries, stable fallback IDs, and graph nodes", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-anchors-"));
  const filePath = join(rootDir, "src", "billing.ts");
  await writeFile(filePath, [
    "export function price() {",
    "  return 42;",
    "}",
  ].join("\n"), { flag: "w" }).catch(async (error) => {
    if (error.code !== "ENOENT") throw error;
  });
  await writeFile(join(rootDir, "anchors.json"), JSON.stringify({
    anchors: [{
      filePath: "src/billing.ts",
      symbolName: "price",
      responsibility: "Calculate invoice price",
      invariants: ["currency rounding is deterministic"],
      verificationRefs: ["npm test -- billing"],
    }],
  }, null, 2));

  const index = await buildSemanticAnchorIndex({
    rootDir,
    files: [{ path: "src/billing.ts", content: "export function price() { return 42; }" }],
    sidecarPaths: ["anchors.json"],
  });
  const written = await writeSemanticAnchorIndex(join(rootDir, "anchor-index.json"), index);
  const node = semanticAnchorToGraphNode(index.anchors[0]);

  assert.equal(index.anchors.length, 1);
  assert.match(index.anchors[0].anchorId, /^anchor-/);
  assert.equal(index.anchors[0].source, "sidecar");
  assert.equal(node.type, "semantic-anchor");
  assert.match(formatSemanticAnchorReport(index), /ANCHORS: 1/);
  assert.equal(written.bytes > 20, true);
});

test("semantic anchors fall back cleanly when no markup exists", () => {
  const anchors = parseSemanticAnchors("export const x = 1;\n", { filePath: "src/x.ts" });

  assert.deepEqual(anchors, []);
});
