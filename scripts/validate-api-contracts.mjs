#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

const REQUIRED_SECTIONS = Object.freeze([
  "Contract Overview",
  "Protocol And Versioning",
  "Auth And Authorization",
  "Request And Response Contract",
  "Error Envelope",
  "Idempotency And Retry Semantics",
  "Pagination Filtering And Limits",
  "Frontend Integration",
  "Mock Data And Scenarios",
  "Compatibility And Deprecation",
  "Security Privacy And Observability",
  "Verification",
]);

const PLACEHOLDER_PATTERNS = Object.freeze([
  /\bTBD\b/i,
  /<[^>\n]+>/,
  /\.\.\./,
  /\bto be decided\b/i,
]);

function hasSection(markdown, section) {
  return new RegExp(`^##\\s+${escapeRegex(section)}\\s*$`, "im").test(markdown);
}

function sectionBody(markdown, section) {
  const re = new RegExp(`^##\\s+${escapeRegex(section)}\\s*$`, "im");
  const match = re.exec(markdown);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = /^##\s+/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export function validateApiContract(markdown) {
  const issues = [];
  if (!/^#\s+API Contract:/im.test(markdown)) {
    issues.push('format: missing "# API Contract:" heading');
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!hasSection(markdown, section)) issues.push(`missing section: ${section}`);
  }

  const overview = sectionBody(markdown, "Contract Overview");
  for (const term of ["Consumer", "Provider", "Business capability", "Contract type"]) {
    if (!new RegExp(escapeRegex(term), "i").test(overview)) issues.push(`contract overview: missing ${term}`);
  }
  if (!/\b(OpenAPI|GraphQL|RPC|webhook|event)\b/i.test(overview)) {
    issues.push("contract overview: expected contract type such as OpenAPI, GraphQL, RPC, webhook, or event");
  }

  const versioning = sectionBody(markdown, "Protocol And Versioning");
  for (const term of ["Protocol", "Version", "Compatibility policy", "Breaking change policy", "Changelog"]) {
    if (!new RegExp(escapeRegex(term), "i").test(versioning)) issues.push(`protocol and versioning: missing ${term}`);
  }

  const auth = sectionBody(markdown, "Auth And Authorization");
  for (const term of ["Authentication", "Authorization", "Permission", "Token"]) {
    if (!new RegExp(term, "i").test(auth)) issues.push(`auth and authorization: missing ${term}`);
  }

  const contract = sectionBody(markdown, "Request And Response Contract");
  for (const term of ["Request schema", "Response schema", "Required fields", "Optional fields", "Validation rules"]) {
    if (!new RegExp(escapeRegex(term), "i").test(contract)) issues.push(`request and response contract: missing ${term}`);
  }

  const errors = sectionBody(markdown, "Error Envelope");
  for (const term of ["Error format", "Machine-readable code", "Human-readable message", "Retryable", "Correlation id", "Partial failure"]) {
    if (!new RegExp(escapeRegex(term), "i").test(errors)) issues.push(`error envelope: missing ${term}`);
  }

  const retry = sectionBody(markdown, "Idempotency And Retry Semantics");
  for (const term of ["Idempotency key", "Retry policy", "Timeout policy", "Duplicate request", "Rate limit"]) {
    if (!new RegExp(escapeRegex(term), "i").test(retry)) issues.push(`idempotency and retry semantics: missing ${term}`);
  }

  const paging = sectionBody(markdown, "Pagination Filtering And Limits");
  for (const term of ["Pagination", "Filtering", "Sorting", "Maximum page size", "Backpressure"]) {
    if (!new RegExp(escapeRegex(term), "i").test(paging)) issues.push(`pagination filtering and limits: missing ${term}`);
  }

  const frontend = sectionBody(markdown, "Frontend Integration");
  for (const term of ["Typed client", "Loading state", "Empty state", "Error state", "Partial success state", "Offline or degraded state"]) {
    if (!new RegExp(escapeRegex(term), "i").test(frontend)) issues.push(`frontend integration: missing ${term}`);
  }

  const mocks = sectionBody(markdown, "Mock Data And Scenarios");
  for (const term of ["Mock contract file", "Scenario fixtures", "Success scenario", "Validation failure", "Authorization failure", "Retry or timeout"]) {
    if (!new RegExp(escapeRegex(term), "i").test(mocks)) issues.push(`mock data and scenarios: missing ${term}`);
  }

  const compatibility = sectionBody(markdown, "Compatibility And Deprecation");
  for (const term of ["Backward compatibility", "Deprecation window", "Migration notes", "Consumer notification"]) {
    if (!new RegExp(escapeRegex(term), "i").test(compatibility)) issues.push(`compatibility and deprecation: missing ${term}`);
  }

  const security = sectionBody(markdown, "Security Privacy And Observability");
  for (const term of ["PII", "Secrets", "Audit logging", "Metrics", "Alerts"]) {
    if (!new RegExp(escapeRegex(term), "i").test(security)) issues.push(`security privacy and observability: missing ${term}`);
  }

  const verification = sectionBody(markdown, "Verification");
  for (const term of ["Contract lint command", "Breaking-change check", "Backend tests", "Frontend integration tests", "Mock scenario tests"]) {
    if (!new RegExp(escapeRegex(term), "i").test(verification)) issues.push(`verification: missing ${term}`);
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(markdown))) {
    issues.push("placeholders: unresolved placeholder text found");
  }
  return issues;
}

async function walkMarkdown(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkMarkdown(path));
    else if (entry.name.endsWith(".md")) out.push(path);
  }
  return out;
}

export async function validateApiContractFiles({ rootDir = process.cwd(), files = [] } = {}) {
  const results = [];
  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    results.push({ file, issues: validateApiContract(markdown) });
  }
  return {
    pass: results.every((result) => result.issues.length === 0),
    results,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", short: "f" },
      all: { type: "boolean", default: false },
      "fixture-dir": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-api-contracts.mjs --file .supervibe/artifacts/api-contracts/<contract>.md
  node scripts/validate-api-contracts.mjs --all
  node scripts/validate-api-contracts.mjs --fixture-dir tests/fixtures/artifacts/api-contracts`);
    return;
  }

  const root = process.cwd();
  const files = values.file
    ? [values.file]
    : values["fixture-dir"]
      ? await walkMarkdown(join(root, values["fixture-dir"]))
      : await walkMarkdown(join(root, ".supervibe", "artifacts", "api-contracts"));

  if (files.length === 0) {
    console.log("[validate-api-contracts] no API contract markdown files found; skipping");
    return;
  }

  const report = await validateApiContractFiles({ rootDir: root, files });
  for (const result of report.results) {
    const rel = relative(root, result.file).split(sep).join("/");
    if (result.issues.length === 0) {
      console.log(`OK   api-contract ${rel}`);
    } else {
      console.error(`FAIL api-contract ${rel}`);
      for (const issue of result.issues) console.error(`  - ${issue}`);
    }
  }
  if (!report.pass) {
    console.error(`\n${report.results.filter((item) => item.issues.length > 0).length}/${report.results.length} API contract artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${report.results.length} API contract artifact(s) passed`);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-api-contracts.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}

