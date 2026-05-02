import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  evaluateDesignArtifactIntake,
  findExistingDesignArtifacts,
  formatDesignArtifactChoiceQuestion,
} from "../scripts/lib/design-artifact-intake.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-intake-"));
  await mkdir(join(root, ".supervibe", "artifacts", "prototypes", "checkout"), { recursive: true });
  await writeFile(join(root, ".supervibe", "artifacts", "prototypes", "checkout", "config.json"), JSON.stringify({
    target: "web",
    viewports: [375, 1440],
    approval: "draft",
  }));
  await writeFile(join(root, ".supervibe", "artifacts", "prototypes", "checkout", "index.html"), "<html><body>checkout</body></html>");
  await mkdir(join(root, ".supervibe", "artifacts", "mockups", "pricing"), { recursive: true });
  await writeFile(join(root, ".supervibe", "artifacts", "mockups", "pricing", "index.html"), "<html><body>pricing</body></html>");
  await mkdir(join(root, ".supervibe", "artifacts", "presentations", "investor"), { recursive: true });
  await writeFile(join(root, ".supervibe", "artifacts", "presentations", "investor", "deck.json"), JSON.stringify({ title: "Investor" }));
  return root;
}

test("findExistingDesignArtifacts returns prototype candidates with metadata", async () => {
  const root = await fixture();
  try {
    const artifacts = await findExistingDesignArtifacts({ projectRoot: root });
    assert.equal(artifacts.some((artifact) => artifact.path === ".supervibe/artifacts/prototypes/checkout"), true);
    assert.equal(artifacts.some((artifact) => artifact.path === ".supervibe/artifacts/mockups/pricing"), true);
    assert.equal(artifacts.some((artifact) => artifact.path === ".supervibe/artifacts/presentations/investor"), true);
    const checkout = artifacts.find((artifact) => artifact.path === ".supervibe/artifacts/prototypes/checkout");
    assert.equal(checkout.status, "draft");
    assert.equal(checkout.target, "web");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ambiguous design brief asks whether to reuse old artifact or create new", async () => {
  const root = await fixture();
  try {
    const intake = await evaluateDesignArtifactIntake({ projectRoot: root, brief: "make checkout design better" });
    assert.equal(intake.mode, "ask");
    assert.equal(intake.needsQuestion, true);
    const question = formatDesignArtifactChoiceQuestion(intake);
    assert.match(question, /Continue an existing artifact/);
    assert.match(question, /Create a new design from scratch/);
    assert.match(question, /\.supervibe\/artifacts\/prototypes\/checkout/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit fresh and explicit reuse briefs do not ask the artifact mode question", async () => {
  const root = await fixture();
  try {
    const fresh = await evaluateDesignArtifactIntake({ projectRoot: root, brief: "create a new design from scratch" });
    assert.equal(fresh.mode, "new");
    assert.equal(fresh.needsQuestion, false);

    const reuse = await evaluateDesignArtifactIntake({ projectRoot: root, brief: "continue existing checkout prototype" });
    assert.equal(reuse.mode, "reuse");
    assert.equal(reuse.needsQuestion, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("conflicting fresh and reuse brief asks before touching prior work", async () => {
  const root = await fixture();
  try {
    const intake = await evaluateDesignArtifactIntake({
      projectRoot: root,
      brief: "create a new version using the previous checkout prototype",
    });
    assert.equal(intake.mode, "ask");
    assert.equal(intake.needsQuestion, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("old prototype path references ask for borrow/avoid scope before artifact writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-intake-empty-"));
  try {
    const intake = await evaluateDesignArtifactIntake({
      projectRoot: root,
      brief: "create a new desktop app design; study C:\\legacy-ui\\docs\\old prototypes but keep only functionality, not the shell",
    });

    assert.equal(intake.mode, "ask");
    assert.equal(intake.needsQuestion, true);
    assert.equal(intake.needsOldArtifactScopeQuestion, true);
    assert.equal(intake.reason, "old-artifact-reference-scope-required");
    assert.ok(intake.oldArtifactReferences.some((ref) => /old prototypes/i.test(ref)));

    const question = formatDesignArtifactChoiceQuestion(intake);
    assert.match(question, /Old artifact reference scope/);
    assert.match(question, /Functional inventory only/);
    assert.match(question, /Stop here - make no hidden progress/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
