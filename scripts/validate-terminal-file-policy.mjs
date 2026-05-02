#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const POLICY_SURFACES = Object.freeze([
  {
    file: "AGENTS.md",
    required: [/rules\/terminal-file-io\.md/i, /\.editorconfig/i, /fs\.writeFile\(\.\.\., "utf8"\)/i, /PowerShell redirection/i],
  },
  {
    file: "CLAUDE.md",
    required: [/rules\/terminal-file-io\.md/i, /\.editorconfig/i, /fs\.writeFile\(\.\.\., "utf8"\)/i, /PowerShell redirection/i],
  },
  {
    file: "GEMINI.md",
    required: [/rules\/terminal-file-io\.md/i, /\.editorconfig/i, /fs\.writeFile\(\.\.\., "utf8"\)/i, /PowerShell redirection/i],
  },
  {
    file: "rules/terminal-file-io.md",
    required: [/fs\.writeFile\(path, data, "utf8"\)/i, /Set-Content -Encoding utf8/i, /legacy PowerShell redirection/i, /TextDecoder\("utf-8"/i],
  },
  {
    file: "scripts/lib/supervibe-agent-recommendation.mjs",
    required: [/rules\/terminal-file-io\.md/i, /\.editorconfig/i, /fs\.writeFile\(\.\.\., \\"utf8\\"\)/i, /PowerShell redirection/i],
  },
]);

export function validateTerminalFilePolicy(rootDir = process.cwd()) {
  const issues = [];
  const editorconfigPath = join(rootDir, ".editorconfig");
  if (!existsSync(editorconfigPath)) {
    issues.push({
      file: ".editorconfig",
      code: "missing-editorconfig",
      message: ".editorconfig is required for global UTF-8/LF policy",
    });
  } else {
    const text = readFileSync(editorconfigPath, "utf8");
    for (const pattern of [/charset\s*=\s*utf-8/i, /end_of_line\s*=\s*lf/i, /insert_final_newline\s*=\s*true/i]) {
      if (!pattern.test(text)) {
        issues.push({
          file: ".editorconfig",
          code: "incomplete-editorconfig",
          message: `.editorconfig missing ${pattern}`,
        });
      }
    }
  }

  const attributesPath = join(rootDir, ".gitattributes");
  if (!existsSync(attributesPath)) {
    issues.push({
      file: ".gitattributes",
      code: "missing-gitattributes",
      message: ".gitattributes is required for LF normalization across hosts",
    });
  } else {
    const text = readFileSync(attributesPath, "utf8");
    for (const pattern of [/\*\.md text eol=lf/i, /\*\.json text eol=lf/i, /\*\.mjs text eol=lf/i, /\.editorconfig text eol=lf/i]) {
      if (!pattern.test(text)) {
        issues.push({
          file: ".gitattributes",
          code: "incomplete-gitattributes",
          message: `.gitattributes missing ${pattern}`,
        });
      }
    }
  }

  for (const surface of POLICY_SURFACES) {
    const absPath = join(rootDir, ...surface.file.split("/"));
    if (!existsSync(absPath)) {
      issues.push({
        file: surface.file,
        code: "missing-terminal-file-policy-surface",
        message: `${surface.file}: file not found`,
      });
      continue;
    }
    const text = readFileSync(absPath, "utf8");
    for (const pattern of surface.required) {
      if (!pattern.test(text)) {
        issues.push({
          file: surface.file,
          code: "missing-terminal-file-policy",
          message: `${surface.file}: missing terminal/file policy phrase ${pattern}`,
        });
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: POLICY_SURFACES.length + 2,
    issues,
  };
}

export function formatTerminalFilePolicyReport(result) {
  const lines = [
    "SUPERVIBE_TERMINAL_FILE_POLICY",
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
  const result = validateTerminalFilePolicy(process.cwd());
  console.log(formatTerminalFilePolicyReport(result));
  process.exit(result.pass ? 0 : 1);
}
