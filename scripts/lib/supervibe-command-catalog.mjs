import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

export const RAG_CODEGRAPH_INDEX_COMMAND = "node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --no-embeddings --graph --max-files 200 --max-seconds 120 --health --json-progress";

const COMMAND_SHORTCUTS = Object.freeze([
  {
    id: "index-rag-codegraph",
    intent: "code_index_build",
    title: "Index RAG and CodeGraph",
    command: RAG_CODEGRAPH_INDEX_COMMAND,
    description: "Run bounded source RAG plus CodeGraph indexing without a repo-wide command search.",
    aliases: [
      "запусти индексирование rag/codegraph",
      "запусти индексацию rag codegraph",
      "индексируй rag codegraph",
      "построй rag codegraph индекс",
      "run rag codegraph indexing",
      "index rag codegraph",
      "build code graph index",
      "build code index",
    ],
    keywordGroups: [
      ["index", "indexing", "индекс", "индексац", "индексирование", "индексируй", "построй"],
      ["rag", "code rag", "код rag"],
      ["codegraph", "code graph", "кодграф", "graph"],
    ],
    mutationRisk: "writes-generated-index",
    directRoute: true,
    requiredGroupCount: 3,
    nextAction: "Run the exact command from the project root; it writes only generated index state under .supervibe/memory/.",
  },
  {
    id: "index-health",
    intent: "index_repair",
    title: "Show index health and repair command",
    command: "node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs --index-health --strict-index-health --no-gc-hints --no-color",
    description: "Inspect index readiness and print the next repair command without indexing.",
    aliases: [
      "проверь index health",
      "покажи health rag codegraph",
      "show index health",
      "check rag codegraph health",
    ],
    keywordGroups: [
      ["health", "ready", "readiness", "проверь", "покажи"],
      ["index", "rag", "codegraph", "code graph"],
    ],
    mutationRisk: "none",
    directRoute: false,
    nextAction: "Run status first when the user asked to inspect rather than start indexing.",
  },
]);

function getCommandShortcuts() {
  return COMMAND_SHORTCUTS.map(copyShortcut);
}

export function findCommandShortcut(request, { shortcuts = COMMAND_SHORTCUTS } = {}) {
  const text = normalizeText(request);
  if (!text) return null;
  const scored = shortcuts
    .map((shortcut) => scoreShortcut(shortcut, text))
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
  return scored[0] || null;
}

export function buildProjectCommandCatalog({
  pluginRoot = process.cwd(),
  projectRoot = process.cwd(),
} = {}) {
  return {
    schemaVersion: 1,
    generatedAt: "deterministic-local",
    pluginRoot,
    projectRoot,
    shortcuts: getCommandShortcuts(),
    slashCommands: readSlashCommands(pluginRoot),
    npmScripts: readNpmScripts(projectRoot, "project"),
    pluginNpmScripts: pluginRoot === projectRoot ? [] : readNpmScripts(pluginRoot, "plugin"),
  };
}

export function formatCommandCatalog(catalog = buildProjectCommandCatalog()) {
  const lines = [
    "SUPERVIBE_COMMAND_CATALOG",
    `SHORTCUTS: ${catalog.shortcuts?.length || 0}`,
    `SLASH_COMMANDS: ${catalog.slashCommands?.length || 0}`,
    `NPM_SCRIPTS: ${catalog.npmScripts?.length || 0}`,
    `PLUGIN_NPM_SCRIPTS: ${catalog.pluginNpmScripts?.length || 0}`,
  ];
  for (const shortcut of catalog.shortcuts || []) {
    lines.push(`- ${shortcut.id}: ${shortcut.intent} -> ${shortcut.command}`);
  }
  return lines.join("\n");
}

export function formatCommandMatch(match) {
  if (!match) {
    return [
      "SUPERVIBE_COMMAND_MATCH",
      "MATCH: none",
      "NEXT: run `node <resolved-supervibe-plugin-root>/scripts/supervibe-commands.mjs` to inspect the catalog",
    ].join("\n");
  }
  return [
    "SUPERVIBE_COMMAND_MATCH",
    `MATCH: ${match.id}`,
    `INTENT: ${match.intent}`,
    `CONFIDENCE: ${match.confidence}`,
    `COMMAND: ${match.command}`,
    `WHY: ${match.reason}`,
    `NEXT: ${match.nextAction}`,
  ].join("\n");
}

function scoreShortcut(shortcut, text) {
  const alias = (shortcut.aliases || []).find((entry) => normalizeText(entry) === text);
  if (alias) {
    return {
      ...copyShortcut(shortcut),
      confidence: 1,
      reason: `exact shortcut alias: ${alias}`,
      matchedAlias: alias,
    };
  }

  const groups = shortcut.keywordGroups || [];
  const matchedGroups = groups
    .map((group) => group.find((phrase) => includesPhrase(text, phrase)))
    .filter(Boolean);
  const requiredGroupCount = shortcut.requiredGroupCount ?? Math.min(2, groups.length);
  if (matchedGroups.length < requiredGroupCount) return null;
  const confidence = Math.min(0.97, 0.78 + matchedGroups.length * 0.06);
  return {
    ...copyShortcut(shortcut),
    confidence: Number(confidence.toFixed(2)),
    reason: `shortcut keyword groups: ${matchedGroups.join(", ")}`,
    matchedGroups,
  };
}

function readSlashCommands(pluginRoot) {
  const dir = join(pluginRoot, "commands");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const path = join(dir, file);
      const raw = readFileSync(path, "utf8");
      return {
        id: `/${basename(file, ".md")}`,
        path: relative(pluginRoot, path).replace(/\\/g, "/"),
        description: parseDescription(raw),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function readNpmScripts(rootDir, source) {
  const path = join(rootDir, "package.json");
  if (!existsSync(path)) return [];
  try {
    const pkg = JSON.parse(readFileSync(path, "utf8"));
    return Object.entries(pkg.scripts || {})
      .map(([name, command]) => ({ name, command, source }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function parseDescription(raw) {
  const match = String(raw).match(/description:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/);
  return (match?.[1] || match?.[2] || match?.[3] || "").trim();
}

function copyShortcut(shortcut) {
  return {
    ...shortcut,
    aliases: [...(shortcut.aliases || [])],
    keywordGroups: (shortcut.keywordGroups || []).map((group) => [...group]),
  };
}

function includesPhrase(text, phrase) {
  const normalized = normalizeText(phrase);
  if (!normalized) return false;
  if (normalized.length <= 3) return new RegExp(`(^| )${escapeRegExp(normalized)}( |$)`, "u").test(text);
  return text.includes(normalized);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}+#./:-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
