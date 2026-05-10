import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ENTITY_PATTERNS = Object.freeze({
  "screen-chat": /\bscreen[-_ ]?chat|chat|conversation|thread|message\b/i,
  tasks: /\btask|todo|work[-_ ]?item|queue|kanban\b/i,
  memory: /\bmemory|context|knowledge|recall|note\b/i,
  approvals: /\bapproval|approve|permission|gate|review\b/i,
  skills: /\bskill|tool|capability|agent\b/i,
  automations: /\bautomation|schedule|trigger|workflow|run\b/i,
});

const STATE_PATTERNS = Object.freeze({
  empty: /\bempty|blank|no\s+items|zero\b/i,
  loading: /\bloading|pending|skeleton|spinner\b/i,
  success: /\bsuccess|done|complete|ready\b/i,
  error: /\berror|failed|blocked|invalid\b/i,
  approval: /\bapproval|approve|permission|gate\b/i,
});

export function extractOldPrototypeSemanticMap(inputPath, {
  rootDir = process.cwd(),
  outputPath = null,
} = {}) {
  const resolved = resolve(rootDir, inputPath || ".");
  const files = listPrototypeFiles(resolved);
  const screens = [];
  const entities = new Set();
  const states = new Set();
  const routes = new Set();
  const antiPatterns = new Set();

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const screen = {
      id: screenIdFor(file, text),
      file: normalizeRelPath(relative(rootDir, file)),
      title: extractTitle(text),
      entities: [],
      states: [],
      routes: extractRoutes(text),
    };

    for (const [entity, pattern] of Object.entries(ENTITY_PATTERNS)) {
      if (pattern.test(text) || pattern.test(file)) {
        screen.entities.push(entity);
        entities.add(entity);
      }
    }
    for (const [state, pattern] of Object.entries(STATE_PATTERNS)) {
      if (pattern.test(text)) {
        screen.states.push(state);
        states.add(state);
      }
    }
    for (const route of screen.routes) routes.add(route);
    if (/\btopbar\b[\s\S]{0,300}\bbottom[-_ ]?composer\b/i.test(text)) antiPatterns.add("topbar-plus-bottom-composer-shell");
    if (/\bvariant[-_ ]?switcher|comparison[-_ ]?shell|role=["']tab/i.test(text)) antiPatterns.add("single-switcher-for-multiple-variants");
    if (/\bchat[-_ ]?window|windowed[-_ ]?chat/i.test(text)) antiPatterns.add("chat-window-composition");
    screens.push(screen);
  }

  const semanticMap = {
    schemaVersion: 1,
    source: "old-prototype-extractor",
    inputPath: normalizeRelPath(relative(rootDir, resolved)) || ".",
    checkedFiles: files.length,
    requiredSignals: Object.keys(ENTITY_PATTERNS),
    coveredSignals: [...entities].sort(),
    missingSignals: Object.keys(ENTITY_PATTERNS).filter((item) => !entities.has(item)),
    screens,
    entities: [...entities].sort(),
    routes: [...routes].sort(),
    stateMatrix: buildStateMatrix(screens),
    antiPatterns: [...antiPatterns].sort(),
    scenarios: buildScenarios(screens),
  };

  if (outputPath) {
    const absOutput = resolve(rootDir, outputPath);
    writeFileSync(absOutput, `${JSON.stringify(semanticMap, null, 2)}\n`, "utf8");
  }
  return semanticMap;
}

function listPrototypeFiles(path) {
  if (!existsSync(path)) return [];
  const stats = statSync(path);
  if (stats.isFile()) return isPrototypeFile(path) ? [path] : [];
  const out = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) out.push(...listPrototypeFiles(child));
    else if (entry.isFile() && isPrototypeFile(child)) out.push(child);
  }
  return out.sort();
}

function isPrototypeFile(path) {
  return [".html", ".htm", ".md", ".json"].includes(extname(path).toLowerCase());
}

function screenIdFor(file, text) {
  const title = extractTitle(text);
  return slug(title || basename(file, extname(file)));
}

function extractTitle(text = "") {
  const patterns = [
    /<title[^>]*>([^<]+)<\/title>/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /^#\s+(.+)$/m,
    /"title"\s*:\s*"([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match) return cleanText(match[1]);
  }
  return "";
}

function extractRoutes(text = "") {
  const routes = new Set();
  for (const match of String(text || "").matchAll(/\b(?:href|to|route)\s*=\s*["']([^"']+)["']/gi)) {
    routes.add(match[1]);
  }
  for (const match of String(text || "").matchAll(/"route"\s*:\s*"([^"]+)"/gi)) {
    routes.add(match[1]);
  }
  return [...routes].filter((route) => route && !route.startsWith("http")).sort();
}

function buildStateMatrix(screens = []) {
  const out = {};
  for (const screen of screens) {
    for (const entity of screen.entities) {
      if (!out[entity]) out[entity] = {};
      out[entity][screen.id] = screen.states.length ? screen.states : ["default"];
    }
  }
  return out;
}

function buildScenarios(screens = []) {
  const scenarios = [];
  const allEntities = new Set(screens.flatMap((screen) => screen.entities));
  if (allEntities.has("screen-chat") && allEntities.has("tasks")) {
    scenarios.push("chat-drives-task-state");
  }
  if (allEntities.has("approvals")) {
    scenarios.push("approval-gate-before-action");
  }
  if (allEntities.has("memory") && allEntities.has("skills")) {
    scenarios.push("memory-and-skills-context-surface");
  }
  if (allEntities.has("automations")) {
    scenarios.push("automation-trigger-monitoring");
  }
  return scenarios;
}

function cleanText(value = "") {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function slug(value = "") {
  return String(value || "screen").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "screen";
}

function normalizeRelPath(path = "") {
  return String(path || "").split(sep).join("/");
}

function parseArgs(argv = []) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const input = options.input || options.path;
  if (!input || options.help || options.h) {
    console.log([
      "SUPERVIBE_OLD_PROTOTYPE_EXTRACTOR",
      "USAGE:",
      "  node scripts/lib/old-prototype-extractor.mjs --input <file-or-dir> [--output semantic-map.json]",
    ].join("\n"));
    process.exit(input ? 0 : 1);
  }
  const result = extractOldPrototypeSemanticMap(input, { outputPath: options.output });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.checkedFiles > 0 ? 0 : 2);
}
