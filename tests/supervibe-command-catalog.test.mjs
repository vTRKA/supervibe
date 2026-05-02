import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildProjectCommandCatalog,
  findCommandShortcut,
  formatCommandCatalog,
} from "../scripts/lib/supervibe-command-catalog.mjs";

const ROOT = process.cwd();
const COMMANDS_SCRIPT = join(ROOT, "scripts", "supervibe-commands.mjs");

test("project command catalog exposes slash commands, npm scripts, and fast shortcuts", () => {
  const catalog = buildProjectCommandCatalog({ pluginRoot: ROOT, projectRoot: ROOT });
  const shortcut = catalog.shortcuts.find((entry) => entry.id === "index-rag-codegraph");

  assert.ok(catalog.slashCommands.some((entry) => entry.id === "/supervibe-status"));
  assert.ok(catalog.npmScripts.some((entry) => entry.name === "supervibe:status"));
  assert.ok(shortcut);
  assert.match(shortcut.command, /build-code-index\.mjs --root \. --resume --no-embeddings --graph/);
  assert.match(formatCommandCatalog(catalog), /SUPERVIBE_COMMAND_CATALOG/);
  assert.match(formatCommandCatalog(catalog), /index-rag-codegraph/);
});

test("command catalog matches natural-language RAG/CodeGraph indexing without repo-wide search", () => {
  const match = findCommandShortcut("запусти индексирование rag/codegraph");

  assert.equal(match.id, "index-rag-codegraph");
  assert.equal(match.intent, "code_index_build");
  assert.match(match.command, /--max-files 200 --max-seconds 120 --health --json-progress/);
});

test("supervibe-commands CLI prints the exact matched command", () => {
  const out = execFileSync(process.execPath, [
    COMMANDS_SCRIPT,
    "--match",
    "запусти индексирование rag/codegraph",
    "--no-color",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  assert.match(out, /SUPERVIBE_COMMAND_MATCH/);
  assert.match(out, /MATCH: index-rag-codegraph/);
  assert.match(out, /COMMAND: node <resolved-supervibe-plugin-root>\/scripts\/build-code-index\.mjs --root \. --resume --no-embeddings --graph/);
});

test("supervibe-commands CLI exposes no-tty help", () => {
  const out = execFileSync(process.execPath, [COMMANDS_SCRIPT, "--help"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  assert.match(out, /SUPERVIBE_COMMANDS_HELP/);
  assert.match(out, /--match/);
  assert.match(out, /rag\/codegraph/);
});

test("genesis managed context tells agents to use command lookup before broad search", () => {
  const source = readFileSync(join(ROOT, "scripts", "lib", "supervibe-agent-recommendation.mjs"), "utf8");

  assert.match(source, /Fast Command Lookup/);
  assert.match(source, /supervibe-commands\.mjs --match/);
  assert.match(source, /запусти индексирование rag\/codegraph/);
});
