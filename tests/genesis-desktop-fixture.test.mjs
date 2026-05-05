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
    assert.match(formatGenesisDryRunReport(report), /build-code-index\.mjs --root \. --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress/);
  });
});

test("genesis dry run includes related-rule closure for selected profile rules", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-closure-target-"));
  const pluginRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-closure-plugin-"));
  try {
    await writeFile(join(targetRoot, "AGENTS.md"), "# Existing Codex Instructions\n", "utf8");
    await mkdir(join(pluginRoot, "rules"), { recursive: true });
    await writeFile(join(pluginRoot, "rules", "base-rule.md"), [
      "---",
      "name: base-rule",
      "mandatory: true",
      "related-rules: [optional-rule]",
      "---",
      "# Base Rule",
    ].join("\n"), "utf8");
    await writeFile(join(pluginRoot, "rules", "optional-rule.md"), [
      "---",
      "name: optional-rule",
      "mandatory: false",
      "related-rules: []",
      "---",
      "# Optional Rule",
    ].join("\n"), "utf8");

    const report = buildGenesisDryRunReport({
      targetRoot,
      pluginRoot,
      env: { SUPERVIBE_HOST: "codex" },
      selectedProfile: "minimal",
      addOns: [],
    });

    assert.ok(report.selectedRules.includes("base-rule"));
    assert.ok(report.selectedRules.includes("optional-rule"));
    assert.ok(report.filesToCreate.some((entry) => entry.path === ".codex/rules/optional-rule.md"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
    await rm(pluginRoot, { recursive: true, force: true });
  }
});

test("empty-project genesis dry run uses explicit user stack tags", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-empty-stack-"));
  try {
    await writeFile(join(targetRoot, "AGENTS.md"), "# Project instructions\n", "utf8");

    const report = buildGenesisDryRunReport({
      targetRoot,
      pluginRoot: process.cwd(),
      env: { SUPERVIBE_HOST: "codex" },
      selectedProfile: "minimal",
      addOns: [],
      stackText: "React Next.js Vite TypeScript Tailwind Laravel PostgreSQL",
    });

    for (const tag of ["react", "nextjs", "typescript", "tailwind", "laravel", "postgres"]) {
      assert.ok(report.fingerprint.tags.includes(tag), `missing explicit stack tag: ${tag}`);
    }
    assert.equal(report.fingerprint.tags.includes("vite"), false, "Vite must not remain an active app tag for a single Next app");
    assert.equal(report.fingerprint.appChoice.id, "next-app");
    assert.equal(report.fingerprint.appChoice.bundler, "turbopack");
    assert.deepEqual(report.fingerprint.appChoice.ignoredStackTags, ["vite"]);
    assert.equal(report.stackPack.id, "laravel-nextjs-postgres");
    assert.equal(report.stackPack.exact, true);
    assert.ok(!report.agentProfile.selectedAgents.includes("redis-architect"), "Redis must not be selected without Redis evidence or add-on");
    assert.ok(report.agentProfile.selectedAgents.includes("rules-curator"), "minimal profile must include rules curator required by command flow");
    assert.ok(report.agentProfile.selectedAgents.includes("memory-curator"), "minimal profile must include memory curator required by command flow");
    assert.equal(report.stateWriteAllowed, true);
    assert.equal(report.scaffoldWriteRequiresApproval, true);
    assert.ok(report.scaffoldArtifacts.some((entry) => entry.path === "backend/" && /backend placeholder/i.test(entry.reason)));
    assert.ok(report.scaffoldArtifacts.some((entry) => entry.path === "frontend/" && /frontend placeholder/i.test(entry.reason)));
    assert.ok(!report.scaffoldArtifacts.some((entry) => entry.path === ".github/workflows/"), "base scaffold must not create empty CI directories");
    assert.equal(report.generateAppsStep.id, "generate-apps");
    assert.equal(report.generateAppsStep.approvalRequired, true);
    assert.match(formatGenesisDryRunReport(report), /STACK: .*nextjs.*postgres/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("Redis remains explicit for Laravel Next Postgres unless evidence names it", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-redis-addon-"));
  try {
    await writeFile(join(targetRoot, "AGENTS.md"), "# Project instructions\n", "utf8");

    const noRedis = buildGenesisDryRunReport({
      targetRoot,
      pluginRoot: process.cwd(),
      env: { SUPERVIBE_HOST: "codex" },
      stackText: "Laravel Next Postgres",
    });
    assert.equal(noRedis.stackPack.id, "laravel-nextjs-postgres");
    assert.ok(!noRedis.agentProfile.selectedAgents.includes("redis-architect"));

    const withRedis = buildGenesisDryRunReport({
      targetRoot,
      pluginRoot: process.cwd(),
      env: { SUPERVIBE_HOST: "codex" },
      stackText: "Laravel Next Postgres Redis",
    });
    assert.equal(withRedis.stackPack.id, "laravel-nextjs-postgres-redis");
    assert.ok(withRedis.agentProfile.selectedAgents.includes("redis-architect"));

    const redisAddOn = buildGenesisDryRunReport({
      targetRoot,
      pluginRoot: process.cwd(),
      env: { SUPERVIBE_HOST: "codex" },
      stackText: "Laravel Next Postgres",
      addOns: ["redis"],
    });
    assert.equal(redisAddOn.stackPack.id, "laravel-nextjs-postgres");
    assert.ok(redisAddOn.optionalAgents.includes("redis-architect"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
