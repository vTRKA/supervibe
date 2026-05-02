#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCAN_PREFIXES = Object.freeze([
  "agents/",
  "skills/",
  "commands/",
  "rules/",
  "docs/",
  "templates/",
  "confidence-rubrics/",
  "references/",
  "stack-packs/",
  "scripts/",
  "bin/",
]);

const SCAN_FILES = new Set(["README.md", "AGENTS.md", "GEMINI.md", "CHANGELOG.md", "package.json"]);

const TEXT_EXTENSIONS = new Set(["", ".md", ".mjs", ".js", ".json", ".yaml", ".yml", ".tpl", ".txt"]);

const FORBIDDEN = Object.freeze([
  { label: "prototypes/", pattern: /(^|[^A-Za-z0-9_.\\/-])prototypes\//, canonical: ".supervibe/artifacts/prototypes/" },
  { label: "mockups/", pattern: /(^|[^A-Za-z0-9_.\\/-])mockups\//, canonical: ".supervibe/artifacts/mockups/" },
  { label: "presentations/", pattern: /(^|[^A-Za-z0-9_.\\/-])presentations\//, canonical: ".supervibe/artifacts/presentations/" },
  { label: "docs/specs/", pattern: /docs\/specs\//, canonical: ".supervibe/artifacts/specs/" },
  { label: "docs/plans/", pattern: /docs\/plans\//, canonical: ".supervibe/artifacts/plans/" },
  { label: "docs/adr/", pattern: /docs\/adr\//, canonical: ".supervibe/artifacts/adr/" },
  { label: "docs/prd/", pattern: /docs\/prd\//, canonical: ".supervibe/artifacts/prd/" },
  { label: "docs/requirements/", pattern: /docs\/requirements\//, canonical: ".supervibe/artifacts/requirements/" },
  { label: "docs/runbooks/", pattern: /docs\/runbooks\//, canonical: ".supervibe/artifacts/runbooks/" },
  { label: "docs/slo/", pattern: /docs\/slo\//, canonical: ".supervibe/artifacts/slo/" },
  { label: "docs/brand/", pattern: /docs\/brand\//, canonical: ".supervibe/artifacts/brand/" },
  { label: "docs/voice/", pattern: /docs\/voice\//, canonical: ".supervibe/artifacts/voice/" },
  { label: "docs/experiments/", pattern: /docs\/experiments\//, canonical: ".supervibe/artifacts/experiments/" },
  { label: "docs/postmortems/", pattern: /docs\/postmortems\//, canonical: ".supervibe/artifacts/postmortems/" },
  { label: "docs/audits/", pattern: /docs\/audits\//, canonical: ".supervibe/audits/" },
  { label: "docs/follow-ups.md", pattern: /docs\/follow-ups\.md/, canonical: ".supervibe/artifacts/follow-ups.md" },
  { label: "docs/deprecations.md", pattern: /docs\/deprecations\.md/, canonical: ".supervibe/artifacts/deprecations.md" },
  { label: "docs/permissions.md", pattern: /docs\/permissions\.md/, canonical: ".supervibe/artifacts/permissions.md" },
  { label: "screen-specs/", pattern: /(^|[^A-Za-z0-9_.\\/-])screen-specs\//, canonical: ".supervibe/artifacts/screen-specs/" },
  { label: "brandbook/", pattern: /(^|[^A-Za-z0-9_.\\/-])brandbook\//, canonical: ".supervibe/artifacts/brandbook/" },
]);

const NESTED_SUPERVIBE_ARTIFACT_ROOT = /(^|[^A-Za-z0-9_.\\/-])\.supervibe[\\/]artifacts[\\/][^`"')\s]+[\\/]_?\.supervibe[\\/]artifacts[\\/][^`"')\s]+/i;

function trackedTextFiles(rootDir = process.cwd()) {
  const output = execFileSync("git", ["ls-files"], { cwd: rootDir, encoding: "utf8" });
  return output
    .split("\n")
    .filter(Boolean)
    .filter((file) => existsSync(join(rootDir, file)))
    .filter((file) => TEXT_EXTENSIONS.has(extname(file)))
    .filter((file) => SCAN_FILES.has(file) || SCAN_PREFIXES.some((prefix) => file.startsWith(prefix)));
}

export function validateProjectArtifactRoot(rootDir = process.cwd(), files = trackedTextFiles(rootDir)) {
  const issues = [];

  for (const file of files) {
    const text = readFileSync(join(rootDir, file), "utf8").replace(/\r\n/g, "\n");
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (NESTED_SUPERVIBE_ARTIFACT_ROOT.test(line)) {
        issues.push({
          file,
          line: index + 1,
          code: "nested-supervibe-artifact-root",
          legacy: "nested .supervibe/artifacts",
          canonical: ".supervibe/artifacts/<kind>/",
          message: `${file}:${index + 1} nests .supervibe/artifacts inside another artifact path; use one canonical artifact root`,
        });
      }
      for (const rule of FORBIDDEN) {
        if (!rule.pattern.test(line)) continue;
        if (line.includes(rule.canonical)) continue;
        issues.push({
          file,
          line: index + 1,
          code: "project-root-artifact-path",
          legacy: rule.label,
          canonical: rule.canonical,
          message: `${file}:${index + 1} uses ${rule.label}; use ${rule.canonical}`,
        });
      }
    });
  }

  return {
    pass: issues.length === 0,
    checked: files.length,
    issues,
  };
}

export function formatProjectArtifactRootReport(result) {
  const lines = [
    "SUPERVIBE_PROJECT_ARTIFACT_ROOT",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file}:${issue.line} ${issue.legacy} -> ${issue.canonical}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateProjectArtifactRoot(process.cwd());
  console.log(formatProjectArtifactRootReport(result));
  process.exit(result.pass ? 0 : 1);
}
