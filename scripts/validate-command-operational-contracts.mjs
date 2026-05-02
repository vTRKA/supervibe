#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_SECTIONS = Object.freeze([
  {
    code: "description-frontmatter",
    pattern: /^---\s*[\s\S]*?\ndescription\s*:/im,
  },
  {
    code: "invocation",
    pattern: /^##\s+(Invocation|Invocation forms|Usage|Local CLI)\b/im,
  },
  {
    code: "output-contract",
    pattern: /^##\s+(Output contract|Output Contract|Contract)\b/im,
  },
  {
    code: "safety",
    pattern: /^##\s+(Guard rails|Guard Rails|Safety Boundaries|Policy|Hard rules|When NOT to invoke)\b/im,
  },
]);

const CONTINUATION_COMMAND_RULES = Object.freeze([
  {
    file: "supervibe-brainstorm.md",
    label: "brainstorm command",
    required: [/Do not stop after individual brainstorm sections/i],
  },
  {
    file: "supervibe-design.md",
    label: "design command",
    required: [/## Continuation Contract/i, /Continue through all applicable stages/i],
  },
  {
    file: "supervibe-execute-plan.md",
    label: "execute-plan command",
    required: [
      /## Continuation Contract/i,
      /Do not stop after the first phase, task, or green check/i,
      /Resume mode must continue/i,
    ],
  },
  {
    file: "supervibe-loop.md",
    label: "autonomous loop command",
    required: [/Do not stop after the first task or wave/i, /continue ready work until/i],
  },
  {
    file: "supervibe-plan.md",
    label: "plan command",
    required: [/Do not stop after individual plan phases/i],
  },
  {
    file: "supervibe-presentation.md",
    label: "presentation command",
    required: [/Do not stop after storyboard or first slide/i],
  },
]);

export function validateCommandOperationalContracts(rootDir = process.cwd()) {
  const commandsDir = join(rootDir, "commands");
  const issues = [];
  if (!existsSync(commandsDir)) {
    return {
      pass: false,
      checked: 0,
      issues: [{
        file: "commands/",
        code: "missing-commands-dir",
        message: "commands/: directory not found",
      }],
    };
  }

  const files = readdirSync(commandsDir)
    .filter((file) => file.endsWith(".md"))
    .sort();

  for (const file of files) {
    const relPath = `commands/${file}`;
    const text = readFileSync(join(commandsDir, file), "utf8");
    for (const section of REQUIRED_SECTIONS) {
      if (!section.pattern.test(text)) {
        issues.push({
          file: relPath,
          code: `missing-${section.code}`,
          message: `${relPath}: missing required command section ${section.pattern}`,
        });
      }
    }
  }

  for (const rule of CONTINUATION_COMMAND_RULES) {
    const absPath = join(commandsDir, rule.file);
    const relPath = `commands/${rule.file}`;
    if (!existsSync(absPath)) {
      issues.push({
        file: relPath,
        code: "missing-continuation-command",
        message: `${relPath}: required continuation command file is missing`,
      });
      continue;
    }
    const text = readFileSync(absPath, "utf8");
    for (const pattern of rule.required) {
      if (!pattern.test(text)) {
        issues.push({
          file: relPath,
          code: "missing-continuation-contract",
          message: `${relPath}: ${rule.label} missing continuation contract ${pattern}`,
        });
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: files.length,
    issues,
  };
}

export function formatCommandOperationalContractsReport(result) {
  const lines = [
    "SUPERVIBE_COMMAND_OPERATIONAL_CONTRACTS",
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
  const result = validateCommandOperationalContracts(process.cwd());
  console.log(formatCommandOperationalContractsReport(result));
  process.exit(result.pass ? 0 : 1);
}
