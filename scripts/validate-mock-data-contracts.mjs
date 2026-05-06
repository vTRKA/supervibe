#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RULES = Object.freeze([
  {
    file: "commands/supervibe-design.md",
    label: "design command mock data gate",
    required: [
      /Mock Data Contract/i,
      /supervibe:mock-data-contract/i,
      /mock-data-designer/i,
      /mock-contract\.json/i,
      /mock-scenarios\.json/i,
      /api-fixtures\//i,
      /backend-integration\.md/i,
      /backend schema/i,
    ],
  },
  {
    file: "skills/prototype/SKILL.md",
    label: "prototype data-fed contract",
    required: [
      /Data-fed mock/i,
      /supervibe:mock-data-contract/i,
      /mock-contract\.json/i,
      /mock-scenarios\.json/i,
      /api-fixtures\//i,
      /frontend-before-backend/i,
    ],
  },
  {
    file: "agents/_design/prototype-builder.md",
    label: "prototype builder mock contract",
    required: [
      /mock-data-designer/i,
      /supervibe:mock-data-contract/i,
      /mock-contract\.json/i,
      /mock-scenarios\.json/i,
      /api-fixtures\//i,
      /schema owner/i,
    ],
  },
  {
    file: "skills/prototype-handoff/SKILL.md",
    label: "handoff mock contract packaging",
    required: [
      /mock-contract\.json/i,
      /mock-scenarios\.json/i,
      /api-fixtures\//i,
      /backend-integration\.md/i,
      /handoff\/mocks\//i,
      /contract drift/i,
    ],
  },
  {
    file: "rules/prototype-to-production.md",
    label: "production transfer mock data rule",
    required: [
      /Mock Data Contract/i,
      /mock-contract\.json/i,
      /mock-scenarios\.json/i,
      /api-fixtures\//i,
      /backend schema drift/i,
    ],
  },
  {
    file: "agents/_ops/mock-data-designer.md",
    label: "mock data designer agent",
    required: [
      /A mock is a contract/i,
      /supervibe:mock-data-contract/i,
      /mock-contract\.json/i,
      /mock-scenarios\.json/i,
      /api-fixtures\//i,
      /PII/i,
      /backend drift/i,
      /Confidence: <N>\.<dd>\/10/i,
    ],
  },
  {
    file: "skills/mock-data-contract/SKILL.md",
    label: "mock data contract skill",
    required: [
      /## When to invoke/i,
      /## Step 0/i,
      /## Decision tree/i,
      /mock-contract\.json/i,
      /mock-scenarios\.json/i,
      /api-fixtures\//i,
      /backend-integration\.md/i,
      /synthetic/i,
    ],
  },
  {
    file: "rules/mock-data-contract.md",
    label: "mock data contract rule",
    required: [
      /## Why this rule exists/i,
      /## When this rule applies/i,
      /mock-contract\.json/i,
      /mock-scenarios\.json/i,
      /api-fixtures\//i,
      /backend-integration\.md/i,
    ],
  },
  {
    file: "templates/mock-data/mock-contract.json.tpl",
    label: "mock contract template",
    required: [
      /contractStatus/i,
      /schemaRefs/i,
      /endpoints/i,
      /piiPolicy/i,
      /driftRule/i,
      /switchToLiveRule/i,
    ],
  },
  {
    file: "templates/mock-data/mock-scenarios.json.tpl",
    label: "mock scenarios template",
    required: [
      /success/i,
      /loading/i,
      /empty/i,
      /error/i,
      /permission/i,
      /validation/i,
      /partial/i,
      /large-list/i,
    ],
  },
  {
    file: "templates/mock-data/backend-integration.md.tpl",
    label: "backend integration template",
    required: [
      /Contract Status/i,
      /Endpoint Mapping/i,
      /Backend Questions/i,
      /Switch-To-Live Rule/i,
      /Contract drift check/i,
    ],
  },
]);

export function validateMockDataContracts(rootDir = process.cwd()) {
  const issues = [];

  for (const rule of RULES) {
    const absPath = join(rootDir, ...rule.file.split("/"));
    if (!existsSync(absPath)) {
      issues.push({
        file: rule.file,
        label: rule.label,
        code: "missing-file",
        message: `${rule.file}: file not found`,
      });
      continue;
    }

    const text = readFileSync(absPath, "utf8");
    for (const pattern of rule.required) {
      if (pattern.test(text)) continue;
      issues.push({
        file: rule.file,
        label: rule.label,
        code: "missing-mock-data-contract",
        message: `${rule.file}: missing required mock-data contract phrase ${pattern}`,
      });
    }
  }

  return {
    pass: issues.length === 0,
    checked: RULES.length,
    issues,
  };
}

export function formatMockDataContractsReport(result) {
  const lines = [
    "SUPERVIBE_MOCK_DATA_CONTRACTS",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateMockDataContracts(process.cwd());
  console.log(formatMockDataContractsReport(result));
  process.exit(result.pass ? 0 : 1);
}
