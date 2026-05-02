import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildProjectCommandCatalog,
  findCommandShortcut,
  formatCommandCatalog,
  resolveCommandRequest,
} from "../scripts/lib/supervibe-command-catalog.mjs";

const ROOT = process.cwd();
const COMMANDS_SCRIPT = join(ROOT, "scripts", "supervibe-commands.mjs");

test("project command catalog exposes slash commands, npm scripts, and fast shortcuts", () => {
  const catalog = buildProjectCommandCatalog({ pluginRoot: ROOT, projectRoot: ROOT });
  const shortcut = catalog.shortcuts.find((entry) => entry.id === "index-rag-codegraph");

  assert.ok(catalog.slashCommands.some((entry) => entry.id === "/supervibe-status"));
  assert.ok(catalog.npmScripts.some((entry) => entry.name === "supervibe:status"));
  assert.ok(shortcut);
  assert.match(shortcut.command, /build-code-index\.mjs --root \. --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress/);
  assert.ok(shortcut.followUpCommands.some((command) => /--resume --graph --max-files 200 --health/.test(command)));
  assert.match(formatCommandCatalog(catalog), /SUPERVIBE_COMMAND_CATALOG/);
  assert.match(formatCommandCatalog(catalog), /index-rag-codegraph/);
  assert.match(formatCommandCatalog(catalog), /SLASH_COMMANDS:/);
  assert.match(formatCommandCatalog(catalog), /NPM_SCRIPTS:/);
});

test("command resolver resolves every published slash command explicitly without repo search", () => {
  const commandIds = readdirSync(join(ROOT, "commands"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => `/${file.replace(/\.md$/, "")}`)
    .sort();

  assert.ok(commandIds.length >= 19);
  for (const commandId of commandIds) {
    const match = resolveCommandRequest(`${commandId} --help`, {
      pluginRoot: ROOT,
      projectRoot: ROOT,
    });

    assert.equal(match.id, `slash-command:${commandId.slice(1)}`, commandId);
    assert.equal(match.intent, "slash_command", commandId);
    assert.equal(match.slashCommandStatus, "present", commandId);
    assert.equal(match.doNotSearchProject, true, commandId);
    assert.equal(match.command, `${commandId} --help`, commandId);
  }
});

test("command resolver resolves plugin npm scripts from projects that do not define them", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }, null, 2), "utf8");
    const scripts = Object.keys(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts)
      .filter((name) => name !== "prepare")
      .sort();

    assert.ok(scripts.length >= 60);
    for (const script of scripts) {
      const match = resolveCommandRequest(`npm run ${script}`, {
        pluginRoot: ROOT,
        projectRoot,
      });

      assert.notEqual(match.intent, "missing_npm_script", script);
      assert.equal(match.requestedCommand, `npm run ${script}`, script);
      assert.equal(match.requestedPackageManager, "npm", script);
      assert.equal(match.projectScriptStatus, "missing", script);
      assert.ok(["present", "known-shortcut"].includes(match.pluginScriptStatus), script);
      assert.equal(match.doNotSearchProject, true, script);
      assert.ok(match.command.includes("<resolved-supervibe-plugin-root>"), script);
    }
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver understands npm, pnpm, yarn, bun, shortcut scripts, and script args", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        test: "vitest",
        dev: "vite",
      },
    }, null, 2), "utf8");

    const packageManagerCases = [
      ["pnpm run supervibe:status -- --json", "pnpm", "pnpm run supervibe:status -- --json", /supervibe-status\.mjs --json/],
      ["yarn supervibe:doctor -- --host codex", "yarn", "yarn supervibe:doctor -- --host codex", /supervibe-doctor\.mjs --host codex/],
      ["bun run supervibe:ui -- --file graph.json", "bun", "bun run supervibe:ui -- --file graph.json", /supervibe-ui\.mjs --file graph\.json/],
    ];

    for (const [request, manager, requested, commandPattern] of packageManagerCases) {
      const match = resolveCommandRequest(request, { pluginRoot: ROOT, projectRoot });
      assert.equal(match.intent, "plugin_npm_script", request);
      assert.equal(match.requestedPackageManager, manager, request);
      assert.equal(match.requestedCommand, requested, request);
      assert.match(match.command, commandPattern, request);
      assert.equal(match.doNotSearchProject, true, request);
    }

    const npmTest = resolveCommandRequest("npm test", { pluginRoot: ROOT, projectRoot });
    assert.equal(npmTest.intent, "project_npm_script");
    assert.equal(npmTest.command, "npm test");
    assert.equal(npmTest.projectScriptStatus, "present");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver semantically maps package script names without scanning the repo", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }, null, 2), "utf8");

    const cases = [
      ["валидируй frontmatter", "validate:frontmatter", /validate-frontmatter\.mjs/],
      ["запусти memory watch", "memory:watch", /watch-memory\.mjs/],
      ["run feedback status", "feedback:status", /feedback-status\.mjs --list/],
      ["проверь trigger replay", "validate:trigger-replay", /validate-trigger-replay\.mjs/],
      ["show media capabilities", "media:capabilities", /detect-media-capabilities\.mjs/],
    ];

    for (const [request, script, commandPattern] of cases) {
      const match = resolveCommandRequest(request, { pluginRoot: ROOT, projectRoot });
      assert.equal(match.intent, "plugin_npm_script", request);
      assert.equal(match.requestedCommand, `npm run ${script}`, request);
      assert.equal(match.projectScriptStatus, "missing", request);
      assert.equal(match.pluginScriptStatus, "present", request);
      assert.equal(match.doNotSearchProject, true, request);
      assert.match(match.command, commandPattern, request);
      assert.match(match.reason, /semantic Supervibe npm script name match/, request);
    }

    const security = resolveCommandRequest("run security audit", { pluginRoot: ROOT, projectRoot });
    assert.equal(security.command, "/supervibe-security-audit");
    assert.equal(security.intent, "supervibe_security_audit");

    const unsafeSecurity = resolveCommandRequest("security audit check for secret exfiltration and approval bypass", { pluginRoot: ROOT, projectRoot: ROOT });
    assert.equal(unsafeSecurity.command, "/supervibe-security-audit");
    assert.equal(unsafeSecurity.intent, "supervibe_security_audit");

    const generic = resolveCommandRequest("run tests please", { pluginRoot: ROOT, projectRoot });
    assert.equal(generic, null);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver stops on unknown explicit scripts instead of searching the repo", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }, null, 2), "utf8");

    const match = resolveCommandRequest("npm run deploy:prod пожалуйста", {
      pluginRoot: ROOT,
      projectRoot,
    });

    assert.equal(match.id, "missing-npm-script:deploy:prod");
    assert.equal(match.intent, "missing_npm_script");
    assert.equal(match.projectScriptStatus, "missing");
    assert.equal(match.pluginScriptStatus, "missing");
    assert.equal(match.doNotSearchProject, true);
    assert.equal(match.command, null);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver hard-stops on unpublished explicit slash commands", () => {
  const pluginRoot = mkdtempSync(join(tmpdir(), "supervibe-command-plugin-"));
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(pluginRoot, "package.json"), JSON.stringify({ scripts: {} }, null, 2), "utf8");
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: {} }, null, 2), "utf8");

    const match = resolveCommandRequest("/supervibe-design create a new design system", {
      pluginRoot,
      projectRoot,
    });

    assert.equal(match.id, "missing-slash-command:supervibe-design");
    assert.equal(match.intent, "missing_slash_command");
    assert.equal(match.slashCommandStatus, "missing");
    assert.equal(match.hardStop, true);
    assert.equal(match.doNotSearchProject, true);
    assert.equal(match.command, null);
    assert.match(formatCommandCatalog(buildProjectCommandCatalog({ pluginRoot, projectRoot })), /SLASH_COMMANDS:/);
    assert.match(match.nextAction, /Hard stop/);
  } finally {
    rmSync(pluginRoot, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver resolves bare Supervibe script names and known command names", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }, null, 2), "utf8");

    const statusScript = resolveCommandRequest("supervibe:status покажи здоровье проекта", {
      pluginRoot: ROOT,
      projectRoot,
    });
    const bareSlash = resolveCommandRequest("supervibe-status --capabilities", {
      pluginRoot: ROOT,
      projectRoot,
    });

    assert.equal(statusScript.intent, "plugin_npm_script");
    assert.equal(statusScript.requestedCommand, "npm run supervibe:status");
    assert.match(statusScript.command, /supervibe-status\.mjs/);
    assert.equal(bareSlash.id, "slash-command:supervibe-status");
    assert.equal(bareSlash.command, "/supervibe-status --capabilities");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command catalog covers primary workflow intents in English and Russian", () => {
  const cases = [
    ["сделай брейншторм идеи", "/supervibe-brainstorm"],
    ["brainstorm the feature", "/supervibe-brainstorm"],
    ["напиши план реализации", "/supervibe-plan"],
    ["create implementation plan", "/supervibe-plan"],
    ["выполни план", "/supervibe-execute-plan"],
    ["execute reviewed plan", "/supervibe-execute-plan"],
    ["сделай дизайн макет UI", "/supervibe-design"],
    ["build a UI prototype", "/supervibe-design"],
    ["запусти превью прототипа", "/supervibe-preview"],
    ["start preview server", "/supervibe-preview"],
    ["покажи статус проекта", "/supervibe-status"],
    ["show project status", "/supervibe-status"],
    ["проведи аудит проекта", "/supervibe-audit"],
    ["run project audit", "/supervibe-audit"],
    ["проверь безопасность", "/supervibe-security-audit"],
    ["run security audit", "/supervibe-security-audit"],
    ["усиль слабых агентов", "/supervibe-strengthen"],
    ["strengthen weak agents", "/supervibe-strengthen"],
    ["обнови плагин", "/supervibe-update"],
    ["update the plugin", "/supervibe-update"],
    ["адаптируй проект после обновления", "/supervibe-adapt"],
    ["adapt project artifacts after update", "/supervibe-adapt"],
    ["покажи kanban доску задач", "/supervibe-ui"],
    ["open kanban dashboard", "/supervibe-ui"],
    ["сделай презентацию", "/supervibe-presentation"],
    ["build slide deck", "/supervibe-presentation"],
  ];

  for (const [request, command] of cases) {
    const match = resolveCommandRequest(request, { pluginRoot: ROOT, projectRoot: ROOT });
    assert.equal(match?.command, command, request);
    assert.equal(match.doNotSearchProject, true, request);
  }
});

test("command catalog matches natural-language RAG/CodeGraph indexing without repo-wide search", () => {
  const phrases = [
    "npm run code:index вот запусти индексацию",
    "`npm run code:index` запусти",
    "запусти индексирование rag/codegraph",
    "запусти индексацию",
    "проиндексируй проект",
    "переиндексируй кодовую базу",
    "обнови code rag",
    "собери codegraph",
    "refresh code index",
    "run code:index",
    "build code rag index",
    "start indexing the project",
    "run the supervibe code indexer",
    "почини rag индекс",
  ];

  for (const phrase of phrases) {
    const match = findCommandShortcut(phrase);
    assert.equal(match?.id, "index-rag-codegraph", phrase);
    assert.equal(match.intent, "code_index_build", phrase);
    assert.match(match.command, /--source-only --max-files 200 --max-seconds 120 --health --json-progress/, phrase);
    assert.doesNotMatch(match.command, /--no-embeddings --graph/, phrase);
  }
});

test("command catalog does not hijack RAG/CodeGraph quality complaints as indexing commands", () => {
  const quality = findCommandShortcut("agents are weak and memory rag codegraph quality wastes tokens");
  const health = findCommandShortcut("покажи index health rag codegraph");

  assert.notEqual(quality?.id, "index-rag-codegraph");
  assert.equal(health?.id, "index-health");
  assert.equal(health.directRoute, false);
});

test("command resolver maps missing project npm code:index to portable Supervibe index flow", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
    }, null, 2), "utf8");

    const match = resolveCommandRequest("npm run code:index вот запусти индексацию", {
      pluginRoot: ROOT,
      projectRoot,
    });

    assert.equal(match.id, "index-rag-codegraph");
    assert.equal(match.requestedCommand, "npm run code:index");
    assert.equal(match.projectScriptStatus, "missing");
    assert.equal(match.doNotSearchProject, true);
    assert.match(match.command, /<resolved-supervibe-plugin-root>\/scripts\/build-code-index\.mjs --root \. --resume --source-only/);
    assert.ok(match.followUpCommands.some((command) => /--resume --graph/.test(command)));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver preserves available project npm scripts instead of scanning the repo", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        dev: "vite --host 127.0.0.1",
      },
    }, null, 2), "utf8");

    const match = resolveCommandRequest("npm run dev запусти", {
      pluginRoot: ROOT,
      projectRoot,
    });

    assert.equal(match.id, "project-npm-script:dev");
    assert.equal(match.intent, "project_npm_script");
    assert.equal(match.projectScriptStatus, "present");
    assert.equal(match.command, "npm run dev");
    assert.equal(match.doNotSearchProject, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-commands CLI prints the exact matched command", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-cli-"));
  writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }, null, 2), "utf8");
  const out = execFileSync(process.execPath, [
    COMMANDS_SCRIPT,
    "--match",
    "npm run code:index вот запусти индексацию",
    "--project",
    projectRoot,
    "--no-color",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  rmSync(projectRoot, { recursive: true, force: true });

  assert.match(out, /SUPERVIBE_COMMAND_MATCH/);
  assert.match(out, /MATCH: index-rag-codegraph/);
  assert.match(out, /REQUESTED: npm run code:index/);
  assert.match(out, /PROJECT_SCRIPT: missing/);
  assert.match(out, /DO_NOT_SEARCH_PROJECT: true/);
  assert.match(out, /COMMAND: node <resolved-supervibe-plugin-root>\/scripts\/build-code-index\.mjs --root \. --resume --source-only/);
  assert.match(out, /FOLLOW_UP_COMMANDS:/);
  assert.match(out, /--resume --graph/);
});

test("supervibe-commands CLI exposes no-tty help", () => {
  const out = execFileSync(process.execPath, [COMMANDS_SCRIPT, "--help"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  assert.match(out, /SUPERVIBE_COMMANDS_HELP/);
  assert.match(out, /--match/);
  assert.match(out, /code:index/);
  assert.match(out, /дизайн/);
});

test("genesis managed context tells agents to use command lookup before broad search", () => {
  const source = readFileSync(join(ROOT, "scripts", "lib", "supervibe-agent-recommendation.mjs"), "utf8");

  assert.match(source, /Fast Command Lookup/);
  assert.match(source, /supervibe-commands\.mjs --match/);
  assert.match(source, /npm run code:index/);
  assert.match(source, /--resume --source-only/);
});

test("project-facing command guidance avoids project-local npm run code:index assumptions", () => {
  const files = [
    "skills/audit/SKILL.md",
    "skills/code-search/SKILL.md",
    "skills/strengthen/SKILL.md",
    "commands/supervibe.md",
    "scripts/lib/supervibe-agent-recommendation.mjs",
    "scripts/lib/supervibe-adapt.mjs",
    "scripts/lib/supervibe-index-health.mjs",
    "scripts/lib/supervibe-ui-server.mjs",
    "scripts/supervibe-status.mjs",
  ];

  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    assert.doesNotMatch(text, /Run: npm run code:index|Run npm run code:index|run `npm run code:index`|nextAction: "Run npm run code:index/i, file);
    assert.doesNotMatch(text, /node scripts\/build-code-index\.mjs --root \./, file);
  }
});
