import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFrontendTargetResolution,
  resolveFrontendTarget,
} from "../scripts/lib/frontend-target-resolver.mjs";

test("frontend target resolver defaults Next plus Vite to Next app on Turbopack", () => {
  const resolution = resolveFrontendTarget({
    tags: ["react", "nextjs", "vite", "typescript", "tailwind"],
    requestText: "React Next.js Vite TypeScript Tailwind",
    source: "test",
  });

  assert.equal(resolution.id, "next-app");
  assert.equal(resolution.bundler, "turbopack");
  assert.deepEqual(resolution.ignoredStackTags, ["vite"]);
  assert.equal(resolution.activeStackTags.includes("vite"), false);
  assert.ok(resolution.driftWarnings.some((entry) => entry.code === "nextjs-vite-defaulted-next-app"));

  const fingerprint = applyFrontendTargetResolution({
    tags: ["react", "nextjs", "vite", "typescript", "tailwind"],
    facts: [],
  }, resolution);
  assert.equal(fingerprint.appChoice.id, "next-app");
  assert.equal(fingerprint.appChoice.bundler, "turbopack");
  assert.equal(fingerprint.tags.includes("vite"), false);
});

test("frontend target resolver preserves Genesis state when Adapt sees Vite later", () => {
  const resolution = resolveFrontendTarget({
    tags: ["nextjs", "react", "vite"],
    previousChoice: "next-app",
    source: "adapt",
  });

  assert.equal(resolution.id, "next-app");
  assert.equal(resolution.bundler, "turbopack");
  assert.deepEqual(resolution.ignoredStackTags, ["vite"]);
  assert.ok(resolution.driftWarnings.some((entry) => entry.code === "vite-detected-in-next-app"));
});
