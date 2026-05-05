#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeDependencyHealthData,
  collectDependencyHealth,
  formatDependencyHealthReport,
} from "./lib/dependency-health.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.h) {
    console.log(formatHelp());
    process.exit(0);
  }

  try {
    const rootDir = resolve(options.root || process.cwd());
    const report = fixtureMode(options)
      ? analyzeDependencyHealthData({
          packageJson: readJsonOption(options["package-json"]) || readJsonOptional(`${rootDir}/package.json`),
          packageLock: readJsonOption(options["package-lock"]) || readJsonOptional(`${rootDir}/package-lock.json`),
          npmAudit: readJsonOption(options["audit-json"]),
          npmOutdated: readJsonOption(options["outdated-json"]),
          registryLatest: parseKeyValueMap(options["registry-latest"]),
          composerJson: readJsonOption(options["composer-json"]),
          composerLock: readJsonOption(options["composer-lock"]),
          composerAudit: readJsonOption(options["composer-audit-json"]),
          pyprojectToml: readTextOption(options["pyproject"]),
          requirementsTxt: readTextOption(options["requirements"]),
          poetryLock: readTextOption(options["poetry-lock"]),
          pipAudit: readJsonOption(options["pip-audit-json"]),
          cargoToml: readTextOption(options["cargo-toml"]),
          cargoLock: readTextOption(options["cargo-lock"]),
          cargoAudit: readJsonOption(options["cargo-audit-json"]),
          goMod: readTextOption(options["go-mod"]),
          goSum: readTextOption(options["go-sum"]),
          govulncheck: readJsonOption(options["govulncheck-json"]),
          pomXml: readTextOption(options["pom"]),
          gradleBuild: readTextOption(options["gradle-build"]),
          gradleLockfile: readTextOption(options["gradle-lock"]),
          javaDependencyAudit: readJsonOption(options["java-audit-json"]),
        })
      : await collectDependencyHealth({ rootDir, env: process.env });

    if (options.json) console.log(JSON.stringify(report, null, 2));
    else console.log(formatDependencyHealthReport(report));
    process.exit(report.pass ? 0 : 2);
  } catch (error) {
    console.error("SUPERVIBE_DEPENDENCY_HEALTH_ERROR");
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

function parseArgs(argv = []) {
  const parsed = {};
  const booleans = new Set(["json", "help", "h"]);
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "-h") {
      parsed.h = true;
      continue;
    }
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    if (booleans.has(key)) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

function readJsonOption(path) {
  return path ? readJsonOptional(path) : null;
}

function readTextOption(path) {
  return path && existsSync(path) ? readFileSync(path, "utf8") : null;
}

function readJsonOptional(path) {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function fixtureMode(options = {}) {
  return [
    "audit-json",
    "outdated-json",
    "package-lock",
    "package-json",
    "composer-json",
    "composer-lock",
    "composer-audit-json",
    "pyproject",
    "requirements",
    "poetry-lock",
    "pip-audit-json",
    "cargo-toml",
    "cargo-lock",
    "cargo-audit-json",
    "go-mod",
    "go-sum",
    "govulncheck-json",
    "pom",
    "gradle-build",
    "gradle-lock",
    "java-audit-json",
  ].some((key) => options[key]);
}

function parseKeyValueMap(value = "") {
  const out = {};
  for (const item of String(value || "").split(",")) {
    const [key, ...rest] = item.split("=");
    const name = String(key || "").trim();
    if (!name) continue;
    out[name] = rest.join("=").trim();
  }
  return out;
}

function formatHelp() {
  return [
    "SUPERVIBE_DEPENDENCY_HEALTH_HELP",
    "USAGE:",
    "  node scripts/dependency-health.mjs --root <project> [--json]",
    "  node scripts/dependency-health.mjs --package-json package.json --package-lock package-lock.json --audit-json audit.json --outdated-json outdated.json --registry-latest postcss=8.5.14,next=16.2.4",
    "  node scripts/dependency-health.mjs --composer-json composer.json --composer-lock composer.lock --composer-audit-json composer-audit.json",
    "  node scripts/dependency-health.mjs --pyproject pyproject.toml --poetry-lock poetry.lock --pip-audit-json pip-audit.json",
    "  node scripts/dependency-health.mjs --cargo-toml Cargo.toml --cargo-lock Cargo.lock --cargo-audit-json cargo-audit.json",
    "  node scripts/dependency-health.mjs --go-mod go.mod --go-sum go.sum --govulncheck-json govulncheck.json",
    "  node scripts/dependency-health.mjs --pom pom.xml --java-audit-json dependency-check.json",
    "",
    "Detects npm, Composer, Python, Cargo, Go, Maven, and Gradle dependency health. Requires lockfile plus audit/SCA evidence for detected ecosystems and classifies direct, transitive, nested, freshness, and unsafe force-fix risk.",
  ].join("\n");
}
