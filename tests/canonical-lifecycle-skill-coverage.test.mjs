import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import test from "node:test";
import matter from "gray-matter";

const ROOT = process.cwd();
const MANIFEST_DOC = join(ROOT, "references", "skill-baseline", "canonical-lifecycle-skill-map.md");
const BASELINE_FIXTURE = join(ROOT, "tests", "fixtures", "skill-anatomy-baseline.json");

const EXPECTED_SET_IDS = [
  "discover-define",
  "plan-breakdown",
  "build-implement",
  "interface-ui-contracts",
  "test-verify",
  "review-strengthen",
  "release-ship",
  "maintain-adapt",
  "operate-orchestrate",
];

const EXPECTED_OWNER_IDS = [
  "T002",
  "T004",
  "T005",
  "T006",
  "T007",
  "T008",
  "T009",
  "T010",
  "T011",
  "T012",
  "T016",
  "T021",
  "T022",
  "T030",
];

const REQUIRED_EXPECTATIONS_BY_BASELINE_SKILL = Object.freeze({
  "api-and-interface-design": [
    "contractFirstBoundaries",
    "hyrumRisk",
    "errorSemantics",
    "versioning",
    "publicInterfaceValidation",
  ],
  "code-simplification": [
    "behaviorPreservation",
    "protectedBlocks",
    "complexityReduction",
    "callerChecks",
    "verificationEvidence",
  ],
  "deprecation-and-migration": [
    "compatibilityPlan",
    "communicationPlan",
    "stagedRollout",
    "rollbackPlan",
    "removalEvidence",
  ],
  "documentation-and-adrs": [
    "decisionRecord",
    "publicApiDocs",
    "inlineCommentPolicy",
    "docsVerification",
  ],
  "ci-cd-and-automation": [
    "qualityGates",
    "failureFeedback",
    "secretSafety",
    "featureFlags",
    "pipelineEvidence",
  ],
  "shipping-and-launch": [
    "stagedRollout",
    "monitoringEvidence",
    "rollbackPlan",
    "supportOwner",
    "productionReadiness",
  ],
  "performance-optimization": [
    "measurementFirst",
    "performanceBudgets",
    "profilingEvidence",
    "regressionProof",
    "residualRisk",
  ],
  "git-workflow-and-versioning": [
    "atomicCommits",
    "branchHygiene",
    "releaseTags",
    "changelogDecision",
    "noUnrelatedReverts",
  ],
  "incremental-implementation": [
    "thinVerticalSlice",
    "acceptanceCriteria",
    "targetedVerification",
    "rollbackPlan",
  ],
  "context-engineering": [
    "contextPacking",
    "retrievalEvidence",
    "promptSlicing",
    "mcpUsage",
    "staleContextRecovery",
  ],
});

const LEGACY_MODEL_MARKERS = [
  ["canonical", "Lifecycle", "Domains"].join(""),
  ["lifecycle", "Command", "Model"].join(""),
  ["lifecycle", "Domain", "Mappings"].join(""),
  ["baseline", "Lifecycle", "Domains"].join(""),
  ["canonical", "Commands"].join(""),
  ["lifecycle", "Flows"].join(""),
  ["canonical", "Flow", "Ids"].join(""),
];

const LEGACY_SHORT_ALIAS_NAMES = [
  ["s", "pec"],
  ["p", "lan"],
  ["bui", "ld"],
  ["te", "st"],
  ["rev", "iew"],
  ["sh", "ip"],
  ["code", "-simplify"],
].map((parts) => parts.join(""));

const LEGACY_SLASH_ALIAS_VALUES = new Set(
  LEGACY_SHORT_ALIAS_NAMES.map((shortName) => `/${shortName}`),
);
const LEGACY_BARE_ALIAS_VALUES = new Set(LEGACY_SHORT_ALIAS_NAMES);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readManifestWithRaw() {
  const raw = await readFile(MANIFEST_DOC, "utf8");
  const match = raw.match(/```json canonical-lifecycle-skill-map\r?\n([\s\S]*?)\r?\n```/);
  assert.ok(match, "canonical lifecycle map must contain a JSON fixture block");
  return { raw, manifest: JSON.parse(match[1]) };
}

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

function assertKnownExpectations(values, known, label) {
  assertUnique(values, label);
  for (const value of values) {
    assert.ok(known.has(value), `${label} uses unknown coverage expectation ${value}`);
  }
}

function skillPath(skillId) {
  assert.match(skillId, /^supervibe:[a-z0-9-]+$/);
  return join(ROOT, "skills", skillId.slice("supervibe:".length), "SKILL.md");
}

function toExpectedSkillIds(localEquivalent) {
  return localEquivalent
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `supervibe:${item}`);
}

function assertSafeRelativePath(path) {
  assert.equal(path, path.replaceAll("\\", "/"));
  assert.doesNotMatch(path, /^[A-Za-z]:[\\/]/);
  assert.doesNotMatch(path, /^([\\/]{1,2}|~)/);
  assert.doesNotMatch(path, /\.\./);
}

function collectObjectKeys(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      out.push(key);
      collectObjectKeys(child, out);
    }
  }
  return out;
}

function collectStringEntries(value, path = [], out = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStringEntries(item, [...path, String(index)], out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectStringEntries(child, [...path, key], out);
    }
    return out;
  }
  if (typeof value === "string") {
    out.push({ path, value });
  }
  return out;
}

function assertLegacyModelIsAbsent(raw, manifest) {
  for (const marker of LEGACY_MODEL_MARKERS) {
    assert.equal(raw.includes(marker), false, `manifest must not contain legacy model marker ${marker}`);
  }
  for (const shortName of LEGACY_SHORT_ALIAS_NAMES) {
    const marker = `/${shortName}`;
    assert.equal(raw.includes(marker), false, `manifest must not contain legacy short alias ${marker}`);
  }
  for (const key of collectObjectKeys(manifest)) {
    assert.doesNotMatch(key, /command/i, `manifest key ${key} reintroduces a legacy command model`);
    assert.doesNotMatch(key, /domain/i, `manifest key ${key} reintroduces a legacy taxonomy model`);
  }
}

function assertNoLegacyShortcutImports(raw, manifest) {
  assert.equal(manifest.legacyShortcutPolicy.mode, "not-represented");
  assert.equal(manifest.legacyShortcutPolicy.lifecycleSurface, "supervibe-skills-only");
  assert.ok(manifest.legacyShortcutPolicy.rationale);

  for (const alias of LEGACY_SLASH_ALIAS_VALUES) {
    assert.equal(raw.includes(alias), false, `manifest must not import legacy shortcut alias ${alias}`);
  }

  for (const { path, value } of collectStringEntries(manifest)) {
    assert.equal(
      LEGACY_SLASH_ALIAS_VALUES.has(value),
      false,
      `${path.join(".")} imports legacy slash-prefixed shortcut ${value}`,
    );
    assert.equal(
      LEGACY_BARE_ALIAS_VALUES.has(value),
      false,
      `${path.join(".")} imports legacy bare shortcut ${value}`,
    );
  }
}

function assertRoutingValidationPolicy(manifest) {
  assert.equal(manifest.routingValidationPolicy.mode, "match-none-for-legacy-shortcuts");
  assert.equal(manifest.routingValidationPolicy.matcher, "scripts/supervibe-commands.mjs");
  assertSafeRelativePath(manifest.routingValidationPolicy.matcher);
  assert.equal(manifest.routingValidationPolicy.inputSetSource, "legacy-shortcut-names-derived-in-test");
  assert.equal(manifest.routingValidationPolicy.expectedDisposition, "match-none");
  assert.ok(manifest.routingValidationPolicy.rationale);
}

function runMatcher(input) {
  const result = spawnSync(
    process.execPath,
    ["scripts/supervibe-commands.mjs", "--match", input],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
  return {
    status: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`,
  };
}

function assertOwnerCapabilityMap(manifest, knownExpectations) {
  assert.equal(manifest.ownerCapabilityTaskRef, "T029.sub3");
  assert.ok(Array.isArray(manifest.ownerCapabilityMap), "manifest must include owner capability map");
  assert.deepEqual(
    manifest.ownerCapabilityMap.map((row) => row.owner).sort(),
    EXPECTED_OWNER_IDS,
  );
  assertUnique(manifest.ownerCapabilityMap.map((row) => row.owner), "owner capability owners");

  const coverageByBaselineSkill = new Map(
    manifest.baselineSkillCoverage.map((row) => [row.baselineSkill, row]),
  );
  const baselineSkillOwners = new Map();

  for (const ownerRow of manifest.ownerCapabilityMap) {
    assert.match(ownerRow.owner, /^T\d{3}$/);
    assert.ok(ownerRow.capabilityArea, `${ownerRow.owner} needs a capability area`);
    assert.ok(ownerRow.ownerRationale, `${ownerRow.owner} needs owner rationale`);
    assert.ok(ownerRow.verificationFocus, `${ownerRow.owner} needs verification focus`);
    assertUnique(ownerRow.baselineSkills, `${ownerRow.owner} baseline skills`);
    assertUnique(ownerRow.localEquivalentSkills, `${ownerRow.owner} local equivalent skills`);
    assertKnownExpectations(ownerRow.coverageExpectations, knownExpectations, `${ownerRow.owner} coverage expectations`);
    assert.ok(ownerRow.coverageExpectations.length >= 3, `${ownerRow.owner} needs machine-checkable coverage`);

    for (const skill of ownerRow.localEquivalentSkills) {
      assert.ok(existsSync(skillPath(skill)), `${ownerRow.owner} references missing skill ${skill}`);
    }

    for (const baselineSkill of ownerRow.baselineSkills) {
      assert.equal(
        baselineSkillOwners.has(baselineSkill),
        false,
        `${baselineSkill} must have exactly one owner capability row`,
      );
      baselineSkillOwners.set(baselineSkill, ownerRow.owner);

      const coverageRow = coverageByBaselineSkill.get(baselineSkill);
      assert.ok(coverageRow, `${ownerRow.owner} references unknown baseline skill ${baselineSkill}`);
      assert.equal(coverageRow.owner, ownerRow.owner, `${baselineSkill} owner capability row must match coverage owner`);

      for (const skill of coverageRow.localEquivalent) {
        assert.ok(
          ownerRow.localEquivalentSkills.includes(skill),
          `${ownerRow.owner} owner row must include ${skill} for ${baselineSkill}`,
        );
      }

      for (const expectation of coverageRow.coverageExpectations) {
        assert.ok(
          ownerRow.coverageExpectations.includes(expectation),
          `${ownerRow.owner} owner row must cover ${expectation} for ${baselineSkill}`,
        );
      }
    }
  }

  assert.deepEqual(
    [...baselineSkillOwners.keys()].sort(),
    manifest.baselineSkillCoverage.map((row) => row.baselineSkill).sort(),
  );
}

async function readAgentOwnerMap() {
  const ownerMap = new Map();
  for (const file of await walkMarkdown(join(ROOT, "agents"))) {
    const raw = await readFile(file, "utf8");
    const parsed = matter(raw);
    const skills = Array.isArray(parsed.data.skills)
      ? parsed.data.skills.map(String)
      : [];
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    for (const skill of skills) {
      const owners = ownerMap.get(skill) || [];
      owners.push(rel);
      ownerMap.set(skill, owners);
    }
  }
  return ownerMap;
}

async function walkMarkdown(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out.sort();
}

test("canonical skill manifest has stable coverage-set structure", async () => {
  const { raw, manifest } = await readManifestWithRaw();
  const baseline = await readJson(BASELINE_FIXTURE);

  assertLegacyModelIsAbsent(raw, manifest);
  assertNoLegacyShortcutImports(raw, manifest);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.kind, "canonical-lifecycle-skill-map");
  assert.equal(manifest.sourceTaskRef, "T029.sub2");
  assert.equal(manifest.ownerCapabilityTaskRef, "T029.sub3");
  assert.equal(manifest.validationTaskRef, "T029.sub4");
  assert.equal(manifest.baselineEvidence.capturedRevision, baseline.capturedRevision);
  assert.equal(manifest.baselineEvidence.refreshedAt, baseline.refreshedAt);
  assertSafeRelativePath(manifest.baselineEvidence.fixture);
  assertSafeRelativePath(manifest.baselineEvidence.equivalenceDoc);

  assert.equal(manifest.skillCreationPolicy.mode, "map-existing-first");
  assert.deepEqual(manifest.skillCreationPolicy.createdSkills, []);
  assertRoutingValidationPolicy(manifest);
  assert.equal(manifest.coveragePolicy.requiredSkillPrefix, "supervibe:");
  assert.ok(manifest.coveragePolicy.minimumRequiredSkillsPerSet >= 4);
  assert.ok(manifest.coveragePolicy.minimumCoverageExpectationsPerBaselineSkill >= 3);

  const knownExpectations = new Set(manifest.coveragePolicy.coverageExpectations);
  assertUnique(manifest.coveragePolicy.coverageExpectations, "coverage policy expectations");
  assert.ok(knownExpectations.size >= 30);

  assert.deepEqual(manifest.skillCoverageSets.map((set) => set.coverageSetId), EXPECTED_SET_IDS);

  for (const set of manifest.skillCoverageSets) {
    assert.ok(set.label);
    assert.ok(set.rationale);
    assert.ok(set.ownerExpectation);
    assertUnique(set.baselineSkills, `${set.coverageSetId} baseline skills`);
    assertUnique(set.requiredSkills, `${set.coverageSetId} required skills`);
    assert.ok(set.requiredSkills.length >= manifest.coveragePolicy.minimumRequiredSkillsPerSet);
    assertKnownExpectations(set.coverageExpectations, knownExpectations, `${set.coverageSetId} coverage expectations`);
    assert.ok(set.coverageExpectations.length >= 4);

    for (const skill of set.requiredSkills) {
      assert.ok(existsSync(skillPath(skill)), `missing required skill ${skill}`);
    }
  }

  assertOwnerCapabilityMap(manifest, knownExpectations);
});

test("manifest references existing owned skills only", async () => {
  const { manifest } = await readManifestWithRaw();
  const ownerMap = await readAgentOwnerMap();
  const referencedSkills = new Set();

  for (const set of manifest.skillCoverageSets) {
    for (const skill of set.requiredSkills) referencedSkills.add(skill);
  }
  for (const row of manifest.baselineSkillCoverage) {
    for (const skill of row.localEquivalent) referencedSkills.add(skill);
  }
  for (const row of manifest.ownerCapabilityMap) {
    for (const skill of row.localEquivalentSkills) referencedSkills.add(skill);
  }

  for (const skill of [...referencedSkills].sort()) {
    assert.ok(existsSync(skillPath(skill)), `missing referenced skill file ${skill}`);
    assert.ok(ownerMap.get(skill)?.length > 0, `referenced skill has no agent owner: ${skill}`);
  }
});

test("owner capability map covers baseline skills without shortcut aliases", async () => {
  const { raw, manifest } = await readManifestWithRaw();
  const knownExpectations = new Set(manifest.coveragePolicy.coverageExpectations);

  assertNoLegacyShortcutImports(raw, manifest);
  assertRoutingValidationPolicy(manifest);
  assertOwnerCapabilityMap(manifest, knownExpectations);
});

test("legacy lifecycle shortcut inputs do not route as product commands", async () => {
  const { manifest } = await readManifestWithRaw();

  assertRoutingValidationPolicy(manifest);

  for (const shortName of LEGACY_SHORT_ALIAS_NAMES) {
    for (const input of [shortName, `/${shortName}`]) {
      const result = runMatcher(input);
      assert.notEqual(result.status, 0, `${input} must not route successfully`);
      assert.match(result.output, /^MATCH: none$/m, `${input} must be reported as no match`);
      assert.doesNotMatch(result.output, /^COMMAND:/m, `${input} must not resolve to a product command`);
      assert.doesNotMatch(result.output, /^INTENT:/m, `${input} must not resolve to a routed intent`);
    }
  }
});

test("baseline skill coverage is complete against the baseline fixture", async () => {
  const { manifest } = await readManifestWithRaw();
  const baseline = await readJson(BASELINE_FIXTURE);
  const setById = new Map(manifest.skillCoverageSets.map((set) => [set.coverageSetId, set]));
  const knownExpectations = new Set(manifest.coveragePolicy.coverageExpectations);
  const coverageByBaselineSkill = new Map(
    manifest.baselineSkillCoverage.map((row) => [row.baselineSkill, row]),
  );

  assert.equal(manifest.baselineSkillCoverage.length, baseline.baselineSkillCount);
  assert.equal(coverageByBaselineSkill.size, manifest.baselineSkillCoverage.length);
  assert.deepEqual(
    [...coverageByBaselineSkill.keys()].sort(),
    baseline.equivalenceRows.map((row) => row.baselineSkill).sort(),
  );

  const baselineSkillsFromSets = new Set();
  for (const set of manifest.skillCoverageSets) {
    for (const baselineSkill of set.baselineSkills) baselineSkillsFromSets.add(baselineSkill);
  }
  assert.deepEqual(
    [...baselineSkillsFromSets].sort(),
    baseline.equivalenceRows.map((row) => row.baselineSkill).sort(),
  );

  for (const baselineRow of baseline.equivalenceRows) {
    const row = coverageByBaselineSkill.get(baselineRow.baselineSkill);
    assert.ok(row, `missing manifest row for ${baselineRow.baselineSkill}`);
    assert.equal(row.action, baselineRow.action);
    assert.notEqual(row.action, "create", `${row.baselineSkill} should map before creating a duplicate skill`);
    assert.equal(row.owner, baselineRow.owner);
    assert.match(row.owner, /^T\d{3}$/);
    assert.ok(row.gap, `${row.baselineSkill} needs an explicit gap or no-gap statement`);
    assert.ok(row.rationale);
    assert.ok(row.localEquivalent.length > 0, `${row.baselineSkill} should prefer existing local equivalents`);
    const existingBaselineEquivalentSkills = toExpectedSkillIds(baselineRow.localEquivalent)
      .filter((skill) => existsSync(skillPath(skill)));
    assert.deepEqual(
      [...row.localEquivalent].sort(),
      existingBaselineEquivalentSkills.sort(),
      `${row.baselineSkill} must map every existing local baseline equivalent and avoid stale local skill claims`,
    );
    assertKnownExpectations(row.coverageExpectations, knownExpectations, `${row.baselineSkill} coverage expectations`);
    assert.ok(
      row.coverageExpectations.length >= manifest.coveragePolicy.minimumCoverageExpectationsPerBaselineSkill,
      `${row.baselineSkill} has weak coverage expectation detail`,
    );
    if (row.action === "support-skill-exception") {
      assert.ok(row.exceptionRationale, `${row.baselineSkill} support exception needs rationale`);
    }

    for (const setId of row.coverageSetIds) {
      const set = setById.get(setId);
      assert.ok(set, `${row.baselineSkill} references unknown coverage set ${setId}`);
      assert.ok(
        set.baselineSkills.includes(row.baselineSkill),
        `${setId} must list baseline skill ${row.baselineSkill}`,
      );
    }
  }
});

test("high-risk lifecycle expectations from T029 are machine-checkable", async () => {
  const { manifest } = await readManifestWithRaw();
  const coverageByBaselineSkill = new Map(
    manifest.baselineSkillCoverage.map((row) => [row.baselineSkill, row]),
  );

  for (const [baselineSkill, expectedCoverage] of Object.entries(REQUIRED_EXPECTATIONS_BY_BASELINE_SKILL)) {
    const row = coverageByBaselineSkill.get(baselineSkill);
    assert.ok(row, `missing high-risk baseline skill ${baselineSkill}`);
    for (const expectation of expectedCoverage) {
      assert.ok(
        row.coverageExpectations.includes(expectation),
        `${baselineSkill} must cover ${expectation}`,
      );
    }
  }

  const discover = manifest.skillCoverageSets.find((set) => set.coverageSetId === "discover-define");
  assert.ok(discover.coverageExpectations.includes("userOutcome"));
  assert.ok(discover.coverageExpectations.includes("scopeBoundary"));
  assert.ok(discover.coverageExpectations.includes("nonGoals"));

  const release = manifest.skillCoverageSets.find((set) => set.coverageSetId === "release-ship");
  assert.ok(release.coverageExpectations.includes("supportOwner"));
  assert.ok(release.coverageExpectations.includes("rollbackPlan"));
  assert.ok(release.coverageExpectations.includes("noUnrelatedReverts"));
});
