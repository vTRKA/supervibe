import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const REQUIRED_FILES = [
  "scripts/lib/supervibe-context-quality-eval.mjs",
  "scripts/lib/supervibe-memory-curator.mjs",
  "scripts/lib/supervibe-evidence-ledger.mjs",
  "scripts/lib/supervibe-tool-metadata-contract.mjs",
  "scripts/lib/supervibe-repo-map.mjs",
  "scripts/lib/supervibe-agent-checkpoints.mjs",
  "scripts/lib/supervibe-agent-regression-checks.mjs",
  "scripts/lib/supervibe-context-threat-model.mjs",
  "scripts/lib/supervibe-user-outcome-metrics.mjs",
  "scripts/lib/supervibe-retrieval-pipeline.mjs",
  "scripts/lib/supervibe-project-knowledge-graph.mjs",
  "scripts/lib/supervibe-performance-slo.mjs",
  "scripts/lib/supervibe-workspace-isolation.mjs",
  "scripts/lib/supervibe-feedback-learning-loop.mjs",
  "docs/references/rag-memory-codegraph-evals.md",
  "docs/references/local-tool-metadata-contract.md",
  "docs/references/repo-map-context-budget.md",
  "docs/references/agent-state-checkpoints.md",
  "docs/references/agent-regression-checks.md",
  "docs/references/context-threat-model.md",
  "docs/references/user-outcome-metrics.md",
  "docs/references/retrieval-pipeline-calibration.md",
  "docs/references/project-knowledge-graph.md",
  "docs/references/performance-slo.md",
  "docs/references/workspace-isolation.md",
  "docs/references/feedback-learning-loop.md",
];

const REQUIRED_SCRIPTS = [
  "supervibe:context-quality",
  "supervibe:retrieval-pipeline",
  "supervibe:knowledge-graph",
  "supervibe:performance-slo",
  "supervibe:workspace-isolation",
  "supervibe:feedback-learning",
  "regression:run",
  "audit:release-security",
];

test("release candidate links remediation evidence and release notes", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const version = packageJson.version;
  const readme = readFileSync("README.md", "utf8");
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const upgrade = readFileSync("docs/references/upgrade-and-rollback.md", "utf8");

  for (const file of REQUIRED_FILES) assert.equal(existsSync(file), true, `missing release evidence file: ${file}`);
  for (const script of REQUIRED_SCRIPTS) assert.ok(packageJson.scripts?.[script], `missing release script: ${script}`);

  assert.match(readme, new RegExp(`v${version.replaceAll(".", "\\.")}`), "README must mention package version");
  assert.match(changelog, new RegExp(`\\[${version.replaceAll(".", "\\.")}\\]`), "CHANGELOG must mention package version");
  assert.match(upgrade, /rollback/i, "rollback documentation missing");
  assert.match(readme, /Visible context intelligence/i, "README missing context intelligence release evidence");
  assert.match(readme, /Performance SLOs/i, "README missing performance SLO release evidence");
});

test("release candidate does not leak private project references", () => {
  const privateProjectName = ["bro", "mind"].join("");
  const forbidden = new RegExp(`D:[\\\\/]+${privateProjectName}|${privateProjectName}`, "i");
  const textExtensions = new Set([".md", ".mjs", ".js", ".json", ".yaml", ".yml", ".tpl", ".txt"]);
  const offenders = [];

  for (const file of walkTextFiles(process.cwd(), textExtensions)) {
    const text = readTextIfPresent(file);
    if (text === null) continue;
    if (forbidden.test(text)) offenders.push(relative(process.cwd(), file).split("\\").join("/"));
  }

  assert.deepEqual(offenders, []);
});

test("release candidate text surfaces do not contain mojibake markers", () => {
  const markers = [
    "\u0420\u00b1",
    "\u0421\u0402",
    "\u0420\u00bb",
    "\u0420\u00b0",
    "\u0420\u00be",
    "\u0421\u201a",
    "\u0421\u2039",
    "\u0421\u201c",
    "\u0420\u040e",
    "\u0420\u040f",
    "\u0420\u00a0",
    "\u0420\u0456\u0420",
    "\u0420\u00b5\u0420",
    "\u0420\u0491",
    "\u0421\u0403\u0420",
    "\u0421\u040a",
    "\u0432\u0402",
    "\u0432\u2020",
    "\u0432\u2030",
  ];
  const textExtensions = new Set([".md", ".mjs", ".js", ".json", ".yaml", ".yml", ".tpl", ".txt"]);
  const offenders = [];

  for (const file of walkTextFiles(process.cwd(), textExtensions)) {
    const text = readTextIfPresent(file);
    if (text === null) continue;
    if (markers.some((marker) => text.includes(marker))) offenders.push(relative(process.cwd(), file).split("\\").join("/"));
  }

  assert.deepEqual(offenders, []);
});

function walkTextFiles(dir, textExtensions, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "models"].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full.includes(`${join(".claude", "memory")}`)) continue;
      walkTextFiles(full, textExtensions, out);
      continue;
    }
    const ext = entry.name.includes(".") ? entry.name.slice(entry.name.lastIndexOf(".")) : "";
    if (textExtensions.has(ext)) out.push(full);
  }
  return out;
}

function readTextIfPresent(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
