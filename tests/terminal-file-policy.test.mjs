import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateTerminalFilePolicy,
} from "../scripts/validate-terminal-file-policy.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("terminal file policy validator rejects missing UTF-8 policy surfaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-terminal-policy-"));
  await writeUtf8(root, ".editorconfig", "[*]\ncharset = utf-8\n");
  await writeUtf8(root, "AGENTS.md", "no policy");

  const result = validateTerminalFilePolicy(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "incomplete-editorconfig"));
  assert.ok(result.issues.some((issue) => issue.code === "missing-terminal-file-policy"));
  assert.ok(result.issues.some((issue) => issue.code === "missing-terminal-file-policy-surface"));
});

test("current repository exposes terminal and file I/O policy everywhere agents read it", () => {
  const result = validateTerminalFilePolicy(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
