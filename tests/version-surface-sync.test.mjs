import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TARGET_VERSION = "2.0.0";

test("release-facing version surfaces are synchronized to 2.0.0", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const codex = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));
  const claude = JSON.parse(await readFile(".claude-plugin/plugin.json", "utf8"));
  const marketplace = JSON.parse(await readFile(".claude-plugin/marketplace.json", "utf8"));
  const cursor = JSON.parse(await readFile(".cursor-plugin/plugin.json", "utf8"));
  const gemini = JSON.parse(await readFile("gemini-extension.json", "utf8"));
  const opencode = await readFile(".opencode/plugins/supervibe.js", "utf8");
  const readme = await readFile("README.md", "utf8");
  const changelog = await readFile("CHANGELOG.md", "utf8");

  assert.equal(packageJson.version, TARGET_VERSION);
  assert.equal(packageLock.version, TARGET_VERSION);
  assert.equal(packageLock.packages[""].version, TARGET_VERSION);
  assert.equal(codex.version, TARGET_VERSION);
  assert.equal(claude.version, TARGET_VERSION);
  assert.equal(marketplace.metadata.version, TARGET_VERSION);
  assert.equal(marketplace.plugins.find((plugin) => plugin.name === "supervibe").version, TARGET_VERSION);
  assert.equal(cursor.version, TARGET_VERSION);
  assert.equal(gemini.version, TARGET_VERSION);
  assert.match(opencode, /version:\s*"2\.0\.0"/);
  assert.match(readme, /\*\*v2\.0\*\*/);
  assert.match(readme, /plugin v2\.0\.0 initialized/);
  assert.match(changelog, /## \[2\.0\.0\] - 2026-04-30/);
});

test("README keeps existing main install/update URLs and unpinned plugin examples", async () => {
  const readme = await readFile("README.md", "utf8");
  assert.match(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/main\/install\.sh/);
  assert.match(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/main\/install\.ps1/);
  assert.match(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/main\/update\.sh/);
  assert.match(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/main\/update\.ps1/);
  assert.doesNotMatch(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/v2\.0\.0/);
  assert.doesNotMatch(readme, /supervibe\.git#v2\.0\.0/);
  assert.doesNotMatch(readme, /github\.com\/vTRKA\/supervibe#v2\.0\.0/);
});
