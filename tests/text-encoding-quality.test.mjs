import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  decodeWindows1251MojibakeRun,
  repairMojibakeText,
  validateTextEncoding,
} from "../scripts/lib/text-encoding-quality.mjs";

const WINDOWS_1251_DECODER = new TextDecoder("windows-1251");
const UTF8_ENCODER = new TextEncoder();

function corruptAsWindows1251(text) {
  return WINDOWS_1251_DECODER.decode(UTF8_ENCODER.encode(text));
}

test("mojibake repair decodes corrupted Russian and symbols", () => {
  assert.equal(decodeWindows1251MojibakeRun(corruptAsWindows1251("нужен")), "нужен");
  assert.equal(decodeWindows1251MojibakeRun(corruptAsWindows1251("—")), "—");
  assert.equal(decodeWindows1251MojibakeRun(corruptAsWindows1251("→")), "→");
  assert.equal(decodeWindows1251MojibakeRun(corruptAsWindows1251("🔀")), "🔀");
});

test("mojibake repair leaves valid Russian text unchanged", () => {
  const original = "Шаг 1/1: продолжить текущий план?";
  const repaired = repairMojibakeText(original);

  assert.equal(repaired.text, original);
  assert.deepEqual(repaired.repairs, []);
});

test("text encoding validator rejects mojibake and redundant bilingual descriptions", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-text-encoding-"));
  const files = {
    "agents/example.md": [
      "---",
      "description: \"Use WHEN testing. RU: Используется когда тестируем. Trigger phrases: 'тест'\"",
      "---",
    ].join("\n"),
    "docs/broken.md": [
      "# Broken",
      "",
      `Triggers: '${corruptAsWindows1251("нужен")}'`,
    ].join("\n"),
    "commands/lost.md": [
      "---",
      "description: \"Use WHEN testing. Triggers: '?????', 'score'.\"",
      "---",
    ].join("\n"),
    ".supervibe/artifacts/prototypes/demo/.approval.json": JSON.stringify({
      status: "approved",
      evidence: "????",
    }, null, 2),
    "skills/mixed.md": [
      "---",
      "description: \"Use WHEN testing. Русская переводная фраза вне triggers. Triggers: 'тест'\"",
      "---",
    ].join("\n"),
  };

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }

  const result = validateTextEncoding(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "repairable-mojibake"));
  assert.ok(result.issues.some((issue) => issue.code === "redundant-bilingual-description"));
  assert.ok(result.issues.some((issue) => issue.code === "cyrillic-outside-trigger"));
  assert.ok(result.issues.some((issue) => issue.code === "question-mark-text-loss" && issue.file === "commands/lost.md"));
  assert.ok(result.issues.some((issue) => issue.code === "question-mark-text-loss" && issue.file === ".supervibe/artifacts/prototypes/demo/.approval.json"));
});
