#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RULES = Object.freeze([
  {
    file: "commands/supervibe-design.md",
    label: "design orchestration gates",
    required: [
      /Preference Coverage Matrix Gate/i,
      /visual direction and tone/i,
      /audience and trust\/risk posture/i,
      /information density/i,
      /typography personality/i,
      /palette mood/i,
      /motion intensity/i,
      /component feel/i,
      /reference borrow\/avoid/i,
      /first_user_design_gate_ack=true/i,
      /source=`inferred` is forbidden/i,
      /source=`explicit-default`/i,
      /\.scratch\/<run-id>/i,
      /Old artifact reference scope/i,
      /Reference source scope/i,
      /design-agent-plan\.mjs/i,
      /workflow-receipt\.mjs/i,
      /Workflow Invocation Receipt/i,
      /_workflow-invocations/i,
      /runtime-issued/i,
      /HMAC/i,
      /artifact-links\.json/i,
      /artifact hashes/i,
      /\.supervibe\/artifacts\/brandbook\/direction\.md.*mandatory/i,
      /config\.json\.stageTriage/i,
      /bulk phrase such as "approve all 8 sections" is valid only after/i,
      /review packet\/styleboard/i,
      /--root \.supervibe\/artifacts\/prototypes --label <slug> --daemon/i,
      /http:\/\/localhost:NNNN\/<slug>\//i,
      /Never use `file:\/\/` verification/i,
    ],
  },
  {
    file: "skills/brandbook/SKILL.md",
    label: "brandbook preference and approval gates",
    required: [
      /Preference Coverage Matrix Gate/i,
      /visual direction and tone/i,
      /audience\/trust posture/i,
      /information density/i,
      /typography personality/i,
      /palette mood/i,
      /motion intensity/i,
      /component feel/i,
      /reference borrow\/avoid/i,
      /first_user_design_gate_ack=true/i,
      /source=`inferred` is forbidden/i,
      /\.scratch\/<run-id>/i,
      /Reference source scope/i,
      /\.supervibe\/artifacts\/brandbook\/direction\.md`? must exist/i,
      /3 candidate directions/i,
      /Do not accept blanket approval/i,
    ],
  },
  {
    file: "skills/prototype/SKILL.md",
    label: "prototype preview feedback gates",
    required: [
      /--root \.supervibe\/artifacts\/prototypes --label <slug> --daemon/i,
      /http:\/\/localhost:NNNN\/<slug>\//i,
      /shared design-system tokens return HTTP 200/i,
      /Never use `file:\/\/`/i,
    ],
  },
  {
    file: "skills/preview-server/SKILL.md",
    label: "preview shared design-system root",
    required: [
      /prefer root `?\.supervibe\/artifacts\/prototypes`? with `?--label <slug>`?/i,
      /maps `?\/_design-system\/\*`?/i,
      /token URL returns HTTP 200/i,
    ],
  },
  {
    file: "scripts/lib/preview-static-server.mjs",
    label: "preview static server alias",
    required: [
      /findSiblingDesignSystemRoot/i,
      /resolveDesignSystemAliasPath/i,
      /\/_design-system/i,
    ],
  },
]);

export function validateDesignFlowGates(rootDir = process.cwd(), { pluginRoot = null } = {}) {
  const issues = [];
  const resolvedPluginRoot = pluginRoot || rootDir;

  for (const rule of RULES) {
    const absPath = join(resolveRuleRoot(rule.file, rootDir, resolvedPluginRoot), ...rule.file.split("/"));
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
      if (!pattern.test(text)) {
        issues.push({
          file: rule.file,
          label: rule.label,
          code: "missing-design-flow-gate",
          message: `${rule.file}: missing required design flow gate ${pattern}`,
        });
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: RULES.length,
    issues,
  };
}

function resolveRuleRoot(file, rootDir, pluginRoot) {
  if (/^(commands|skills|scripts)\//.test(file)) return pluginRoot || rootDir;
  return rootDir;
}

export function formatDesignFlowGatesReport(result) {
  const lines = [
    "SUPERVIBE_DESIGN_FLOW_GATES",
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
  const scriptPluginRoot = fileURLToPath(new URL("../", import.meta.url));
  const rootDir = arg("--root", process.cwd());
  const pluginRoot = arg("--plugin-root", scriptPluginRoot);
  const result = validateDesignFlowGates(rootDir, { pluginRoot });
  console.log(formatDesignFlowGatesReport(result));
  process.exit(result.pass ? 0 : 1);
}

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
