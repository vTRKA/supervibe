import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse as parseYaml } from "yaml";

test("build-registry includes pack.yaml stack packs with normalized profiles", async () => {
  execFileSync(process.execPath, ["scripts/build-registry.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  const registry = parseYaml(await readFile("registry.yaml", "utf8"));
  const pack = registry["stack-packs"]["tauri-react-rust-postgres"];
  assert.ok(pack, "tauri pack should be present");
  assert.equal(pack.manifest, "stack-packs/tauri-react-rust-postgres/pack.yaml");
  assert.ok(pack.profiles.includes("minimal"));
  assert.ok(pack["agent-profiles"].includes("full-stack"));
});

test("design-capable stack packs attach the design-system architect", async () => {
  const designArchitect = "supervibe:_design:design-system-architect";
  const packPaths = [
    "stack-packs/chrome-extension-mv3/manifest.yaml",
    "stack-packs/laravel-nextjs-postgres/manifest.yaml",
    "stack-packs/laravel-nextjs-postgres-redis/manifest.yaml",
  ];

  for (const packPath of packPaths) {
    const manifest = parseYaml(await readFile(packPath, "utf8"));
    assert.ok((manifest["agents-attach"] || []).includes(designArchitect), `${packPath}: agents-attach`);

    const productDesignAgents = manifest["agent-profiles"]?.["product-design"]?.agents;
    if (productDesignAgents) {
      assert.ok(productDesignAgents.includes(designArchitect), `${packPath}: product-design profile`);
    }
  }
});
