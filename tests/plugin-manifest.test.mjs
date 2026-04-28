import { test } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";

const MANIFEST_PATH = new URL("../.claude-plugin/plugin.json", import.meta.url);

const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "version",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "agents",
  "skills",
  "commands",
  "hooks",
]);

const REQUIRED_FIELDS = ["name", "description", "version"];

test("plugin.json exists and is valid JSON", async () => {
  const content = await readFile(MANIFEST_PATH, "utf8");
  const data = JSON.parse(content);
  assert.ok(data, "plugin.json must parse as JSON object");
});

test("plugin.json has required fields", async () => {
  const data = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  for (const field of REQUIRED_FIELDS) {
    assert.ok(field in data, `plugin.json missing required field: ${field}`);
  }
});

test("plugin.json contains only allowed fields (no invented keys)", async () => {
  const data = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  for (const key of Object.keys(data)) {
    assert.ok(
      ALLOWED_FIELDS.has(key),
      `plugin.json contains unknown field "${key}". Allowed: ${[...ALLOWED_FIELDS].join(", ")}.`,
    );
  }
});

test("plugin.json version follows semver", async () => {
  const data = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  assert.match(
    data.version,
    /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/,
    "version must be semver",
  );
});

test("plugin.json name matches expected plugin name", async () => {
  const data = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  assert.strictEqual(data.name, "supervibe", 'plugin name must be "supervibe"');
});

test("plugin.json agents array references existing files", async () => {
  const data = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  assert.ok(
    Array.isArray(data.agents),
    "agents must be array (required for nested agent dirs)",
  );
  assert.ok(
    data.agents.length >= 30,
    "should reference >=30 agents (full roster)",
  );
  for (const agentRef of data.agents) {
    assert.match(
      agentRef,
      /^\.\/agents\/.+\.md$/,
      `agent ref ${agentRef} must start with ./agents/ and end .md`,
    );
  }
});
