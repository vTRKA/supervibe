import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildSkillSourceReport,
  formatSkillSourceReport,
} from "../scripts/lib/skill-source-resolver.mjs";

const WINDOWS_1251_DECODER = new TextDecoder("windows-1251");
const UTF8_ENCODER = new TextEncoder();

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

function corruptAsWindows1251(text) {
  return WINDOWS_1251_DECODER.decode(UTF8_ENCODER.encode(text));
}

test("skill source report exposes active source, conflicts, and mojibake issues", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-skill-source-"));
  try {
    await writeUtf8(root, "project/skills/brandbook/SKILL.md", "---\nname: brandbook\n---\n# Project\n");
    await writeUtf8(root, "codex/skills/brandbook/SKILL.md", "---\nname: brandbook\n---\n# Codex\n");
    await writeUtf8(root, "marketplace/skills/design/SKILL.md", `---\nname: design\n---\nTriggers: '${corruptAsWindows1251("нужен")}'\n`);

    const report = buildSkillSourceReport({
      projectRoot: root,
      roots: [
        { source: "project", root: join(root, "project", "skills"), priority: 0 },
        { source: "codex-home", root: join(root, "codex", "skills"), priority: 1 },
        { source: "marketplace", root: join(root, "marketplace", "skills"), priority: 2 },
      ],
    });
    const text = formatSkillSourceReport(report);

    assert.equal(report.conflicts.length, 1);
    assert.equal(report.conflicts[0].id, "brandbook");
    assert.equal(report.conflicts[0].activeSource, "project");
    assert.equal(report.pass, false);
    assert.ok(report.encodingIssues.some((issue) => issue.skillId === "design"));
    assert.match(text, /SUPERVIBE_SKILL_SOURCE_REPORT/);
    assert.match(text, /CONFLICT: brandbook active=project/);
    assert.match(text, /ENCODING_ISSUES: 1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
