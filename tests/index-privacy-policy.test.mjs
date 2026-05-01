import assert from "node:assert/strict";
import test from "node:test";

import { classifyIndexPath } from "../scripts/lib/supervibe-index-policy.mjs";
import {
  classifyPrivacyPath,
  formatPrivacyPolicyDiagnostics,
  summarizePrivacyPolicy,
} from "../scripts/lib/supervibe-privacy-policy.mjs";

test("privacy policy blocks archives, binaries, secrets and local config", () => {
  const cases = [
    ["backup.rar", "archive"],
    ["assets/logo.png", "binary"],
    [".env", "secret-like"],
    [".env.local", "secret-like"],
    ["config/local.json", "local-config"],
    ["dist/app.js", "generated"],
  ];

  for (const [path, expectedClass] of cases) {
    const classified = classifyPrivacyPath(path);
    assert.equal(classified.classification, expectedClass, path);
    assert.equal(classified.indexAllowed, false, `private or binary file accepted for indexing: ${path}`);
  }
});

test("source files remain indexable and graphable", () => {
  const classified = classifyPrivacyPath("src/main.ts");
  const policy = classifyIndexPath("src/main.ts", { rootDir: process.cwd() });

  assert.equal(classified.classification, "source-code");
  assert.equal(classified.indexAllowed, true);
  assert.equal(classified.graphAllowed, true);
  assert.equal(policy.included, true);
});

test("index policy skips framework dependency and cache directories", () => {
  const cases = [
    "frontend/bower_components/pkg/index.js",
    "frontend/jspm_packages/pkg/index.js",
    "backend/site-packages/pkg/module.py",
    "backend/__generated__/client.ts",
    "ios/Pods/Generated/index.js",
    "app/obj/Debug/generated.cs",
    "app/bin/Debug/app.js",
  ];

  for (const path of cases) {
    const policy = classifyIndexPath(path, { rootDir: process.cwd() });
    assert.equal(policy.included, false, `cache/dependency path should not be indexed: ${path}`);
    assert.match(policy.reason, /skip-dir|generated-dir|privacy:generated/);
  }
});

test("privacy diagnostics summarize skipped classes without values", () => {
  const summary = summarizePrivacyPolicy([".env", "backup.zip", "src/main.ts"]);
  const output = formatPrivacyPolicyDiagnostics(summary);

  assert.equal(summary.skipped, 2);
  assert.match(output, /SUPERVIBE_PRIVACY_POLICY/);
  assert.doesNotMatch(output, /SECRET=/);
});
