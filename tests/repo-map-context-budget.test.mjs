import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildRepoMap,
  formatRepoMapContext,
  selectRepoMapContext,
} from "../scripts/lib/supervibe-repo-map.mjs";

test("repo map is deterministic and budgeted", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-repo-map-"));
  await mkdir(join(rootDir, "scripts", "lib"), { recursive: true });
  await mkdir(join(rootDir, "tests"), { recursive: true });
  await writeFile(join(rootDir, "scripts", "lib", "router.mjs"), [
    "export function routeTriggerRequest(input) { return input; }",
    "export class CapabilityRouter {}",
    "function helper() {}",
  ].join("\n"), "utf8");
  await writeFile(join(rootDir, "scripts", "supervibe-context-pack.mjs"), "export function main() {}\n", "utf8");
  await writeFile(join(rootDir, "tests", "router.test.mjs"), "import '../scripts/lib/router.mjs';\n", "utf8");

  const first = await buildRepoMap({ rootDir, tier: "tiny" });
  const second = await buildRepoMap({ rootDir, tier: "tiny" });
  const selection = selectRepoMapContext(first, { tier: "tiny", query: "router context budget" });

  assert.equal(first.deterministicHash, second.deterministicHash, "repo map missing deterministic symbol ranking or token budget");
  assert.ok(first.files[0].rank >= first.files.at(-1).rank, "repo map missing deterministic symbol ranking or token budget");
  assert.ok(selection.usedTokens <= selection.budget.repoMapTokens, "repo map missing deterministic symbol ranking or token budget");
  assert.ok(selection.selected.some((file) => file.path.includes("router.mjs")));
  assert.match(formatRepoMapContext(selection), /SUPERVIBE_REPO_MAP_CONTEXT/);
});
