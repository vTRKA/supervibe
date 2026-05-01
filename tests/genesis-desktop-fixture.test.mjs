import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildGenesisAgentRecommendation,
  buildGenesisDryRunReport,
  discoverGenesisStackFingerprint,
  formatGenesisAgentRecommendation,
  formatGenesisDryRunReport,
} from "../scripts/lib/supervibe-agent-recommendation.mjs";

async function withDesktopLikeFixture(fn) {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-desktop-"));
  try {
    await writeFile(join(rootDir, "package.json"), JSON.stringify({
      dependencies: {
        "@tauri-apps/api": "^2.0.0",
        "@tanstack/react-router": "^1.0.0",
        react: "^19.0.0",
        vite: "^7.0.0",
        tailwindcss: "^4.0.0",
      },
      devDependencies: {
        "@playwright/test": "^1.0.0",
      },
    }, null, 2));
    await writeFile(join(rootDir, "AGENTS.md"), "# Existing Codex Instructions\n\n## Custom Project Rules\nPreserve this.\n", "utf8");
    await mkdir(join(rootDir, "src-tauri"), { recursive: true });
    await writeFile(join(rootDir, "src-tauri", "Cargo.toml"), [
      "[package]",
      "name = \"sanitized-desktop\"",
      "version = \"0.1.0\"",
      "",
      "[dependencies]",
      "tauri = \"2\"",
      "tokio = \"1\"",
      "sqlx = { version = \"0.8\", features = [\"postgres\"] }",
    ].join("\n"));
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("sanitized desktop stack exposes selectable Tauri and Rust specialists", async () => {
  await withDesktopLikeFixture(async (rootDir) => {
    const fingerprint = discoverGenesisStackFingerprint({ rootDir });
    const recommendation = buildGenesisAgentRecommendation({
      rootDir: process.cwd(),
      fingerprint,
      selectedProfile: "minimal",
      addOns: [],
    });

    const groupIds = recommendation.agentGroups.map((group) => group.id);
    assert.ok(groupIds.includes("tauri-desktop"), "expected selectable Tauri and Rust specialists");
    assert.ok(groupIds.includes("rust-backend"), "expected selectable Tauri and Rust specialists");
    assert.ok(groupIds.includes("react-frontend"));
    assert.ok(recommendation.selectedAgents.includes("tauri-rust-engineer"), "missing tauri-rust-engineer");
    assert.ok(recommendation.selectedAgents.includes("ipc-contract-reviewer"), "missing ipc-contract-reviewer");
    assert.deepEqual(recommendation.missingSpecialists, []);
    assert.ok(recommendation.profileChoices.some((choice) => choice.id === "research-heavy"));
    assert.ok(recommendation.customizationQuestion.choices.some((choice) => choice.id === "custom"));
    assert.ok(recommendation.selectedAgents.includes("react-implementer"));
    assert.ok(!recommendation.selectedAgents.includes("security-auditor"), "minimal profile should not silently install security add-on");
    assert.match(formatGenesisAgentRecommendation(recommendation), /tauri-desktop/);
  });
});

test("add-ons are explicit and explain why they are recommended", async () => {
  await withDesktopLikeFixture(async (rootDir) => {
    const recommendation = buildGenesisAgentRecommendation({
      rootDir: process.cwd(),
      fingerprint: discoverGenesisStackFingerprint({ rootDir }),
      selectedProfile: "minimal",
      addOns: ["security-audit", "ai-prompting", "project-adaptation"],
    });

    assert.ok(recommendation.selectedAgents.includes("security-auditor"));
    assert.ok(recommendation.selectedAgents.includes("prompt-ai-engineer"));
    assert.ok(recommendation.selectedAgents.includes("rules-curator"));
    assert.ok(recommendation.addOnChoices.find((choice) => choice.id === "project-adaptation"));
    assert.ok(recommendation.addOnChoices.find((choice) => choice.id === "network-ops").defaultSelected === false);
    assert.ok(recommendation.explanations.some((entry) => /explicit add-on/.test(entry.reason)));
  });
});

test("genesis fingerprint detects polyglot web and API stacks", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-polyglot-"));
  try {
    await writeFile(join(rootDir, "package.json"), JSON.stringify({
      dependencies: {
        next: "^15.0.0",
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        "@apollo/client": "^3.0.0",
        pg: "^8.0.0",
        redis: "^4.0.0",
      },
      devDependencies: {
        tailwindcss: "^4.0.0",
      },
    }, null, 2));
    await writeFile(join(rootDir, "pyproject.toml"), [
      "[project]",
      "dependencies = [",
      "  \"django>=5\",",
      "  \"fastapi>=0.115\",",
      "  \"sqlalchemy\",",
      "  \"psycopg\",",
      "  \"celery\",",
      "  \"redis\",",
      "]",
    ].join("\n"));
    await writeFile(join(rootDir, "docker-compose.yml"), [
      "services:",
      "  postgres:",
      "    image: postgres:16",
      "  redis:",
      "    image: redis:7",
    ].join("\n"));

    const fingerprint = discoverGenesisStackFingerprint({ rootDir });
    for (const tag of ["nextjs", "react", "python", "django", "fastapi", "postgres", "redis", "graphql"]) {
      assert.ok(fingerprint.tags.includes(tag), `missing stack tag: ${tag}`);
    }

    const recommendation = buildGenesisAgentRecommendation({
      rootDir: process.cwd(),
      fingerprint,
      selectedProfile: "minimal",
      addOns: [],
    });
    for (const agent of ["nextjs-developer", "django-developer", "fastapi-developer", "postgres-architect", "redis-architect", "graphql-schema-designer"]) {
      assert.ok(recommendation.selectedAgents.includes(agent), `missing selected agent: ${agent}`);
    }
    assert.deepEqual(recommendation.missingSpecialists, []);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("full genesis dry run includes host adapter, context migration and agent profile", async () => {
  await withDesktopLikeFixture(async (rootDir) => {
    const report = buildGenesisDryRunReport({
      targetRoot: rootDir,
      pluginRoot: process.cwd(),
      env: { SUPERVIBE_HOST: "codex" },
      selectedProfile: "minimal",
      addOns: ["ai-prompting"],
    });

    assert.equal(report.host.adapterId, "codex", "dry run did not include host adapter, context migration and agent profile");
    assert.equal(report.stackPack.id, "tauri-react-rust-postgres", "dry run did not resolve the matching stack pack");
    assert.equal(report.agentProfile.selectedProfile, "minimal", "dry run did not include host adapter, context migration and agent profile");
    assert.ok(report.contextMigration.afterContent.includes("## Custom Project Rules"), "custom project instruction section was not preserved");
    assert.ok(report.contextMigration.afterContent.includes("SUPERVIBE:BEGIN managed-context codex"));
    assert.ok(report.filesToModify.some((entry) => entry.path === "AGENTS.md"));
    assert.ok(report.filesToCreate.some((entry) => entry.path.includes(".codex/agents")));
    assert.ok(report.selectedRules.includes("operational-safety"));
    assert.ok(report.selectedRules.includes("use-codegraph-before-refactor"));
    assert.ok(report.filesToCreate.some((entry) => entry.path === ".codex/rules/operational-safety.md"));
    assert.ok(report.filesToCreate.some((entry) => entry.path === ".supervibe/memory/"));
    assert.ok(report.filesToCreate.some((entry) => entry.path === ".supervibe/memory/genesis/state.json"));
    assert.equal(
      [...report.filesToCreate, ...report.filesToModify, ...report.scaffoldArtifacts]
        .some((entry) => String(entry.path).startsWith(".claude/")),
      false,
      "codex genesis must not plan .claude artifacts",
    );
    assert.ok(report.selectedSkills.includes("genesis"));
    assert.ok(report.selectedSkills.includes("ui-review-and-polish"));
    assert.ok(report.filesToCreate.some((entry) => entry.path === ".codex/skills/genesis/SKILL.md"));
    assert.deepEqual(report.missingArtifacts, []);
    assert.ok(report.skippedGeneratedFolders.some((entry) => /dist|target/.test(entry.path)));
    assert.ok(report.recommendedAgents.includes("tauri-rust-engineer"));
    assert.ok(report.optionalAgents.includes("prompt-ai-engineer"));
    assert.match(formatGenesisDryRunReport(report), /SUPERVIBE_GENESIS_DRY_RUN/);
    assert.match(formatGenesisDryRunReport(report), /SELECTED_RULES:/);
    assert.match(formatGenesisDryRunReport(report), /SELECTED_SKILLS:/);
    assert.match(formatGenesisDryRunReport(report), /build-code-index\.mjs --root \. --force --health/);
  });
});
