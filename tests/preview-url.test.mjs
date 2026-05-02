import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  formatPreviewUrl,
  resolvePreviewUrlPath,
} from "../scripts/lib/preview-url.mjs";

test("preview URLs include child slug when serving the shared prototypes root", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-preview-url-"));
  const prototypesRoot = join(root, ".supervibe", "artifacts", "prototypes");
  await mkdir(join(prototypesRoot, "chat-workbench"), { recursive: true });
  await writeFile(join(prototypesRoot, "chat-workbench", "index.html"), "<html></html>", "utf8");

  assert.equal(resolvePreviewUrlPath({ root: prototypesRoot, label: "chat-workbench" }), "/chat-workbench/");
  assert.equal(formatPreviewUrl({ port: 3047, root: prototypesRoot, label: "chat-workbench" }), "http://localhost:3047/chat-workbench/");
  assert.equal(formatPreviewUrl({ port: 3047, root: prototypesRoot, label: "new-prototype" }), "http://localhost:3047/new-prototype/");
});

test("preview URLs stay at root for direct slug roots or unsafe labels", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-preview-url-root-"));
  const slugRoot = join(root, ".supervibe", "artifacts", "prototypes", "chat-workbench");
  await mkdir(slugRoot, { recursive: true });
  await writeFile(join(slugRoot, "index.html"), "<html></html>", "utf8");

  assert.equal(resolvePreviewUrlPath({ root: slugRoot, label: "chat-workbench" }), "/");
  assert.equal(resolvePreviewUrlPath({ root: join(root, ".supervibe", "artifacts", "prototypes"), label: "../bad" }), "/");
});
