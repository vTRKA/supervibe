import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { validateProviderConfigScope } from "../scripts/validate-provider-config-scope.mjs";

const ROOT = process.cwd();
const PROVIDER_CAPABILITIES_FIXTURE = join(ROOT, "tests", "fixtures", "provider-configs", "provider-capabilities.json");

function readProviderCapabilities() {
  return JSON.parse(readFileSync(PROVIDER_CAPABILITIES_FIXTURE, "utf8"));
}

test("provider config scope validator passes current production sources", () => {
  const result = validateProviderConfigScope({ rootDir: ROOT });

  assert.equal(result.pass, true, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
  assert.equal(result.issues.length, 0);
});

test("provider config scope validator rejects project-local writable Codex runtime config", () => {
  const manifest = readProviderCapabilities();
  const codex = manifest.providers.find((provider) => provider.id === "codex");
  codex.runtimeConfig = {
    scope: "project-root",
    providerHomeEnv: [],
    defaultProviderHomeSegments: [".codex"],
    configFile: ".codex/config.toml",
    format: "toml",
    mergeStrategy: "overwrite",
    writable: true,
  };

  const result = validateProviderConfigScope({ rootDir: ROOT, manifest });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "codex-runtime-config-scope"));
  assert.ok(result.issues.some((issue) => issue.code === "codex-runtime-config-file"));
  assert.ok(result.issues.some((issue) => issue.code === "codex-runtime-merge-strategy"));
});
