import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  createIdeBridgeDescriptor,
  formatIdeBridgeReport,
  writeIdeBridgeDescriptor,
} from "../scripts/lib/supervibe-ide-bridge.mjs";

const execFileAsync = promisify(execFile);

test("IDE bridge descriptor exposes localhost webview contract", async () => {
  const descriptor = createIdeBridgeDescriptor({
    rootDir: process.cwd(),
    graphPath: ".claude/memory/work-items/epic/graph.json",
    statePath: ".claude/memory/loops/run/state.json",
    port: 3999,
    token: "token",
    generatedAt: "2026-04-30T00:00:00.000Z",
  });
  assert.equal(descriptor.kind, "supervibe-ide-bridge");
  assert.match(descriptor.entryUrl, /127\.0\.0\.1:3999/);
  assert.equal(descriptor.actions.previewFirst, true);
  assert.ok(descriptor.hostHints.some((hint) => /webview/i.test(hint)));
  assert.match(formatIdeBridgeReport(descriptor), /SUPERVIBE_IDE_BRIDGE/);
});

test("IDE bridge CLI writes JSON descriptor for IDE wrappers", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-ide-bridge-"));
  try {
    const outPath = join(root, "ide-bridge.json");
    const descriptor = createIdeBridgeDescriptor({ rootDir: root, token: "test" });
    const write = await writeIdeBridgeDescriptor(outPath, descriptor);
    assert.ok(write.bytes > 0);
    assert.equal(JSON.parse(await readFile(outPath, "utf8")).webview.bind, "127.0.0.1");

    const { stdout } = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-ide-bridge.mjs"),
      "--file",
      ".claude/memory/work-items/epic/graph.json",
      "--token",
      "test",
    ], { cwd: process.cwd() });
    assert.match(stdout, /SUPERVIBE_IDE_BRIDGE/);
    assert.match(stdout, /PREVIEW_FIRST: true/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
