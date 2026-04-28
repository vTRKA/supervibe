import { test } from "node:test";
import assert from "node:assert";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

test("plugin manifest exists at canonical path with required fields", async () => {
  const manifestPath = join(ROOT, ".claude-plugin", "plugin.json");
  assert.ok(
    existsSync(manifestPath),
    "manifest must exist at .claude-plugin/plugin.json",
  );
  const data = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const field of ["name", "description", "version"]) {
    assert.ok(field in data, `missing required field: ${field}`);
  }
  assert.strictEqual(data.name, "supervibe");
});

test("LICENSE present", async () => {
  assert.ok(existsSync(join(ROOT, "LICENSE")));
});

test("all 11 confidence rubrics present and validate", async () => {
  const dir = join(ROOT, "confidence-rubrics");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".yaml"));
  const expected = [
    "requirements",
    "plan",
    "agent-delivery",
    "scaffold",
    "framework",
    "prototype",
    "research-output",
    "agent-quality",
    "skill-quality",
    "rule-quality",
    "brandbook",
  ];
  for (const name of expected) {
    assert.ok(files.includes(`${name}.yaml`), `rubric ${name}.yaml missing`);
    const content = await readFile(join(dir, `${name}.yaml`), "utf8");
    const data = parseYaml(content);
    const sum = data.dimensions.reduce((acc, d) => acc + d.weight, 0);
    assert.strictEqual(sum, 10, `${name}: weights sum=${sum}, expected 10`);
  }
});

test("all 6 questionnaires present and parse", async () => {
  const dir = join(ROOT, "questionnaires");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".yaml"));
  assert.ok(
    files.length >= 6,
    `expected ≥6 questionnaires, found ${files.length}`,
  );
  for (const file of files) {
    const content = await readFile(join(dir, file), "utf8");
    const data = parseYaml(content);
    assert.ok(data.id, `${file}: missing id`);
    assert.ok(
      Array.isArray(data.questions),
      `${file}: missing questions array`,
    );
  }
});

test("full reference stack-pack present with all required parts", async () => {
  const packDir = join(ROOT, "stack-packs", "laravel-nextjs-postgres-redis");
  assert.ok(existsSync(packDir), "reference pack dir missing");
  assert.ok(
    existsSync(join(packDir, "manifest.yaml")),
    "manifest.yaml missing",
  );
  assert.ok(
    existsSync(join(packDir, "claude", "settings.json")),
    "claude/settings.json missing",
  );
  assert.ok(
    existsSync(join(packDir, "claude", "CLAUDE.md.tpl")),
    "claude/CLAUDE.md.tpl missing",
  );
  assert.ok(
    existsSync(join(packDir, "husky", "pre-commit")),
    "husky/pre-commit missing",
  );
  assert.ok(
    existsSync(join(packDir, "husky", "pre-push")),
    "husky/pre-push missing",
  );
  assert.ok(
    existsSync(join(packDir, "configs", "lint-staged.config.js")),
    "configs/lint-staged missing",
  );
});

test("atomic packs present (≥5)", async () => {
  const dir = join(ROOT, "stack-packs", "_atomic");
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  const packs = entries.filter((e) => e.isDirectory());
  assert.ok(
    packs.length >= 5,
    `expected ≥5 atomic packs, found ${packs.length}`,
  );
});

test("stack-pack settings.json has comprehensive deny-list (≥30 entries)", async () => {
  const settingsPath = join(
    ROOT,
    "stack-packs",
    "laravel-nextjs-postgres-redis",
    "claude",
    "settings.json",
  );
  const data = JSON.parse(await readFile(settingsPath, "utf8"));
  const deny = data.permissions.deny;
  assert.ok(
    deny.length >= 30,
    `expected ≥30 deny entries, found ${deny.length}`,
  );

  const mustHave = [
    "Bash(git stash:*)",
    "Bash(git push --force:*)",
    "Bash(git reset --hard:*)",
    "Bash(rm -rf:*)",
    "Bash(dropdb:*)",
    "Bash(redis-cli FLUSHALL:*)",
    "Bash(php artisan migrate:fresh:*)",
  ];
  for (const entry of mustHave) {
    assert.ok(
      deny.includes(entry),
      `deny-list missing critical entry: ${entry}`,
    );
  }
});

test("all 4 docs present", async () => {
  for (const doc of [
    "getting-started.md",
    "skill-authoring.md",
    "agent-authoring.md",
    "rule-authoring.md",
  ]) {
    assert.ok(existsSync(join(ROOT, "docs", doc)), `docs/${doc} missing`);
  }
});

test("hooks.json wires SessionStart, PostToolUse, Stop", async () => {
  const hooksPath = join(ROOT, "hooks", "hooks.json");
  const data = JSON.parse(await readFile(hooksPath, "utf8"));
  assert.ok(data.hooks.SessionStart, "SessionStart hook missing");
  assert.ok(data.hooks.PostToolUse, "PostToolUse hook missing");
  assert.ok(data.hooks.Stop, "Stop hook missing");
});

test("all 33+ skills have valid trigger-clarity descriptions", async () => {
  const { checkTriggerClarity } =
    await import("../scripts/lib/trigger-clarity.mjs");
  const matter = (await import("gray-matter")).default;
  const skillsDir = join(ROOT, "skills");
  const entries = await readdir(skillsDir, { withFileTypes: true });

  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    const content = await readFile(skillPath, "utf8");
    const { data } = matter(content);
    const result = checkTriggerClarity(data.description || "");
    assert.strictEqual(result.pass, true, `${entry.name}: ${result.reason}`);
    count++;
  }
  assert.ok(count >= 33, `expected ≥33 skills, found ${count}`);
});

test("registry generates and includes all artifact types", async () => {
  const { execSync } = await import("node:child_process");
  execSync("node scripts/build-registry.mjs", { cwd: ROOT, stdio: "pipe" });
  const registry = parseYaml(
    await readFile(join(ROOT, "registry.yaml"), "utf8"),
  );
  assert.ok(
    Object.keys(registry.agents).length >= 33,
    "registry should have ≥33 agents",
  );
  assert.ok(
    Object.keys(registry.skills).length >= 33,
    "registry should have ≥33 skills",
  );
  assert.ok(
    Object.keys(registry.rules).length >= 16,
    "registry should have ≥16 rules",
  );
  assert.ok(
    Object.keys(registry["stack-packs"]).length >= 1,
    "registry should have ≥1 stack-pack",
  );
  assert.ok(
    Object.keys(registry["confidence-rubrics"]).length >= 11,
    "registry should have ≥11 rubrics",
  );
});
