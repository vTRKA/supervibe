import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  extractOldPrototypeSemanticMap,
} from "../scripts/lib/old-prototype-extractor.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("old prototype extractor turns screens into a semantic state contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-old-prototype-"));
  try {
    await writeUtf8(root, "screen-chat.html", `
      <title>Screen Chat</title>
      <main>
        <section class="chat thread loading">Loading conversation</section>
        <section class="tasks queue">Task queue pending</section>
        <aside class="memory context">Memory recall</aside>
        <nav class="skills tools">Skills and agents</nav>
        <button class="approval gate">Approve run</button>
        <section class="automation trigger">Automation schedule</section>
        <footer class="bottom-composer"></footer>
      </main>
    `);

    const map = extractOldPrototypeSemanticMap(root, { rootDir: root });

    assert.equal(map.checkedFiles, 1);
    assert.deepEqual(map.missingSignals, []);
    assert.ok(map.entities.includes("screen-chat"));
    assert.ok(map.entities.includes("tasks"));
    assert.ok(map.stateMatrix.tasks["screen-chat"].includes("loading"));
    assert.ok(map.scenarios.includes("chat-drives-task-state"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
