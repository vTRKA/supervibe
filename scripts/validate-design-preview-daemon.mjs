#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PREVIEW_CONTRACT_FILES = Object.freeze([
  "commands/supervibe-design.md",
  "commands/supervibe-presentation.md",
  "skills/prototype/SKILL.md",
  "skills/landing-page/SKILL.md",
  "skills/presentation-deck/SKILL.md",
  "skills/preview-server/SKILL.md",
  "skills/browser-feedback/SKILL.md",
  "skills/interaction-design-patterns/SKILL.md",
  "agents/_design/prototype-builder.md",
  "agents/_design/presentation-deck-builder.md",
]);

const DESIGN_ROOT_PATTERN = /\.supervibe\/artifacts\/(?:prototypes|mockups|presentations)|<mockup-root>|<output-dir>/i;

function readProjectFile(rootDir, relPath) {
  const absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) return null;
  return readFileSync(absPath, "utf8");
}

export function validateDesignPreviewDaemon(rootDir = process.cwd()) {
  const issues = [];

  for (const file of PREVIEW_CONTRACT_FILES) {
    const text = readProjectFile(rootDir, file);
    if (text === null) {
      issues.push({
        file,
        code: "missing-file",
        message: `${file}: file not found`,
      });
      continue;
    }

    if (!/--daemon/i.test(text)) {
      issues.push({
        file,
        code: "missing-daemon-preview",
        message: `${file}: must document --daemon for design previews`,
      });
    }

    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/preview-server/i.test(line)) return;
      if (!/preview-server(?:\.mjs|\s+--|`)/i.test(line)) return;
      if (!DESIGN_ROOT_PATTERN.test(line)) return;
      if (/--list|--kill|feedback-status\.mjs/i.test(line)) return;
      if (!/--daemon/i.test(line)) {
        issues.push({
          file,
          line: index + 1,
          code: "foreground-design-preview-risk",
          message: `${file}:${index + 1}: design preview command must include --daemon`,
        });
      }
    });
  }

  const previewCli = readProjectFile(rootDir, "scripts/preview-server.mjs");
  if (previewCli === null) {
    issues.push({
      file: "scripts/preview-server.mjs",
      code: "missing-file",
      message: "scripts/preview-server.mjs: file not found",
    });
  } else {
    for (const pattern of [
      /isFeedbackRequiredPreviewRoot/i,
      /const designRoot = isFeedbackRequiredPreviewRoot\(absRoot\)/i,
      /const daemonMode = \(values\.daemon \|\| designRoot\) && !values\.foreground/i,
      /Design preview roots default to --daemon/i,
    ]) {
      if (!pattern.test(previewCli)) {
        issues.push({
          file: "scripts/preview-server.mjs",
          code: "missing-daemon-default",
          message: `scripts/preview-server.mjs: missing ${pattern}`,
        });
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: PREVIEW_CONTRACT_FILES.length + 1,
    issues,
  };
}

export function formatDesignPreviewDaemonReport(result) {
  const lines = [
    "SUPERVIBE_DESIGN_PREVIEW_DAEMON",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
    lines.push(`ISSUE: ${issue.code} ${location} - ${issue.message}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDesignPreviewDaemon(process.cwd());
  console.log(formatDesignPreviewDaemonReport(result));
  process.exit(result.pass ? 0 : 1);
}
