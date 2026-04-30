import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TARGET_VERSION = "2.0.6";

test("release-facing version surfaces are synchronized to 2.0.6", async () => {
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
  assert.match(opencode, /version:\s*"2\.0\.6"/);
  assert.match(readme, /\*\*v2\.0\*\*/);
  assert.match(readme, /plugin v2\.0\.6 initialized/);
  assert.match(changelog, /## \[2\.0\.6\] - 2026-05-01/);
});

test("README keeps existing main install/update URLs and unpinned plugin examples", async () => {
  const readme = await readFile("README.md", "utf8");
  assert.match(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/main\/install\.sh/);
  assert.match(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/main\/install\.ps1/);
  assert.match(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/main\/update\.sh/);
  assert.match(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/main\/update\.ps1/);
  assert.doesNotMatch(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/v2\.0\.0/);
  assert.doesNotMatch(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/v2\.0\.1/);
  assert.doesNotMatch(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/v2\.0\.2/);
  assert.doesNotMatch(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/v2\.0\.3/);
  assert.doesNotMatch(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/v2\.0\.4/);
  assert.doesNotMatch(readme, /raw\.githubusercontent\.com\/vTRKA\/supervibe\/v2\.0\.5/);
  assert.doesNotMatch(readme, /supervibe\.git#v2\.0\.0/);
  assert.doesNotMatch(readme, /supervibe\.git#v2\.0\.1/);
  assert.doesNotMatch(readme, /supervibe\.git#v2\.0\.2/);
  assert.doesNotMatch(readme, /supervibe\.git#v2\.0\.3/);
  assert.doesNotMatch(readme, /supervibe\.git#v2\.0\.4/);
  assert.doesNotMatch(readme, /supervibe\.git#v2\.0\.5/);
  assert.doesNotMatch(readme, /github\.com\/vTRKA\/supervibe#v2\.0\.0/);
  assert.doesNotMatch(readme, /github\.com\/vTRKA\/supervibe#v2\.0\.1/);
  assert.doesNotMatch(readme, /github\.com\/vTRKA\/supervibe#v2\.0\.2/);
  assert.doesNotMatch(readme, /github\.com\/vTRKA\/supervibe#v2\.0\.3/);
  assert.doesNotMatch(readme, /github\.com\/vTRKA\/supervibe#v2\.0\.4/);
  assert.doesNotMatch(readme, /github\.com\/vTRKA\/supervibe#v2\.0\.5/);
});

test("tracked release docs and command examples do not advertise stale 1.9.0 targets", async () => {
  const files = [
    "commands/supervibe-adapt.md",
    "commands/supervibe-update.md",
    "commands/supervibe.md",
    "references/internal-commands/supervibe-changelog.md",
  ];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /(?:^|[^\d])v?1\.9\.0(?:[^\d]|$)/, `${file} still contains a stale 1.9.0 release target`);
  }
});

test("getting-started local install examples use the current 2.0.6 cache path", async () => {
  const text = await readFile("docs/getting-started.md", "utf8");
  assert.match(text, /plugins\/cache\/local\/supervibe\/2\.0\.6/);
  assert.doesNotMatch(text, /plugins[\\/]+cache[\\/]+local[\\/]+supervibe[\\/]+1\.2\.0/);
  assert.doesNotMatch(text, /v1\.2\.0 dir/);
});
