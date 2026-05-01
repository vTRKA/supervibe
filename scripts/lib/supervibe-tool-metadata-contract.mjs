export function buildLocalToolMetadataContract({ registry = {}, packageJson = {} } = {}) {
  const commands = (registry.commands || []).map((command) => ({
    stableName: command.id,
    aliases: unique([command.id, command.id.replace(/^\/supervibe-?/, "supervibe:")]).filter(Boolean),
    type: "command",
    shortDescription: command.description || `${command.id} command`,
    inputShape: inferCommandInputShape(command.id),
    sideEffectLevel: inferSideEffectLevel(command.id),
    approvalPolicy: inferApprovalPolicy(command.id),
    requiredContextSources: inferRequiredContext(command.id),
    tokenCostHint: inferTokenCost(command.id),
    owner: "supervibe-plugin",
    path: command.path,
  }));
  const skills = (registry.skills || []).map((skill) => ({
    stableName: skill.id,
    aliases: unique([skill.id, skill.id.replace(/^supervibe:/, "")]).filter(Boolean),
    type: "skill",
    shortDescription: skill.description || `${skill.id} skill`,
    inputShape: "natural-language task plus optional artifact paths",
    sideEffectLevel: inferSkillSideEffect(skill),
    approvalPolicy: inferSkillApproval(skill),
    requiredContextSources: inferSkillContext(skill),
    tokenCostHint: "medium",
    owner: skill.namespace || "supervibe-plugin",
    path: skill.path,
  }));
  const scripts = Object.entries(packageJson.scripts || {})
    .filter(([name]) => /^(supervibe|audit|regression|validate|code|memory|test:cross-platform)/.test(name))
    .map(([name, command]) => ({
      stableName: `npm:${name}`,
      aliases: [name],
      type: "local-script",
      shortDescription: command,
      inputShape: "CLI flags documented by script --help where available",
      sideEffectLevel: inferScriptSideEffect(name, command),
      approvalPolicy: inferScriptApproval(name, command),
      requiredContextSources: name.includes("context") ? ["memory", "rag", "codegraph"] : ["repo-files"],
      tokenCostHint: name.includes("test") || name.includes("check") ? "high" : "low",
      owner: "supervibe-plugin",
      path: "package.json",
    }));
  const items = [...commands, ...skills, ...scripts].sort((a, b) => stableOrderKey(a).localeCompare(stableOrderKey(b)));
  return {
    schemaVersion: 1,
    generatedAt: "deterministic-local",
    deterministicOrder: items.map((item) => item.stableName),
    items,
    safetyRules: {
      confirmationRequiredFor: ["writes", "migrations", "network", "external-apis", "private-screenshots"],
      intentScopedExposure: true,
      deterministicOrdering: true,
    },
  };
}

export function validateLocalToolMetadataContract(contract = {}) {
  const issues = [];
  const seen = new Set();
  for (const item of contract.items || []) {
    if (seen.has(item.stableName)) issues.push(issue(item.stableName, "duplicate-name", "tool metadata stable name is duplicated"));
    seen.add(item.stableName);
    for (const field of ["stableName", "aliases", "shortDescription", "inputShape", "sideEffectLevel", "approvalPolicy", "requiredContextSources", "tokenCostHint", "owner"]) {
      const value = item[field];
      if (Array.isArray(value) ? value.length === 0 : !value) {
        issues.push(issue(item.stableName || "unknown", "missing-field", `tool metadata missing input shape, context requirement, approval policy or deterministic order: ${field}`));
      }
    }
  }
  const sorted = [...(contract.items || [])].sort((a, b) => stableOrderKey(a).localeCompare(stableOrderKey(b))).map((item) => item.stableName);
  const declared = contract.deterministicOrder || [];
  if (JSON.stringify(sorted) !== JSON.stringify(declared)) {
    issues.push(issue("contract", "unstable-order", "tool metadata missing input shape, context requirement, approval policy or deterministic order"));
  }
  return {
    pass: issues.length === 0,
    issues,
    total: contract.items?.length || 0,
  };
}

export function formatLocalToolMetadataReport(contract = {}, validation = validateLocalToolMetadataContract(contract)) {
  return [
    "SUPERVIBE_LOCAL_TOOL_METADATA",
    `PASS: ${validation.pass}`,
    `TOOLS: ${validation.total}`,
    `ISSUES: ${validation.issues.length}`,
    `SAFETY_CONFIRMATION: ${(contract.safetyRules?.confirmationRequiredFor || []).join(", ")}`,
    ...validation.issues.map((item) => `- ${item.id} ${item.code}: ${item.message}`),
  ].join("\n");
}

function inferCommandInputShape(command) {
  if (command === "/supervibe-status") return "read-only diagnostic flags such as --index-health, --capabilities and --json";
  if (command === "/supervibe-genesis") return "target project root, host adapter, dry-run flag and selected profile";
  return "natural-language request plus command-specific CLI flags";
}

function inferSideEffectLevel(name) {
  if (/status|search|audit|detect/.test(name)) return "read-only";
  if (/preview|ui/.test(name)) return "background-process";
  if (/genesis|adapt|strengthen|loop/.test(name)) return "writes-with-approval";
  return "mixed";
}

function inferApprovalPolicy(name) {
  const sideEffect = inferSideEffectLevel(name);
  if (sideEffect === "read-only") return "no approval for local reads; approval required before private screenshots or external network";
  if (sideEffect === "background-process") return "user-visible daemon start/stop with registry status";
  return "dry-run first; explicit user approval before writes, migrations or external APIs";
}

function inferRequiredContext(name) {
  if (/genesis/.test(name)) return ["host-instructions", "repo-files", "capability-registry"];
  if (/status|search/.test(name)) return ["repo-files"];
  if (/loop|adapt|strengthen/.test(name)) return ["memory", "rag", "codegraph"];
  return ["repo-files"];
}

function inferTokenCost(name) {
  if (/loop|genesis|context/.test(name)) return "high";
  if (/status|search/.test(name)) return "low";
  return "medium";
}

function inferSkillSideEffect(skill = {}) {
  if (/project-memory|code-search|audit|verification/.test(skill.id || "")) return "read-only";
  if (/genesis|adapt|strengthen|add-memory|executing-plans/.test(skill.id || "")) return "writes-with-approval";
  return "mixed";
}

function inferSkillApproval(skill = {}) {
  return inferSkillSideEffect(skill) === "read-only"
    ? "no approval for local reads; cite evidence"
    : "dry-run or user confirmation before writes and side effects";
}

function inferSkillContext(skill = {}) {
  const id = skill.id || "";
  if (/project-memory/.test(id)) return ["memory"];
  if (/code-search/.test(id)) return ["rag", "codegraph"];
  if (/genesis/.test(id)) return ["host-instructions", "capability-registry"];
  return ["memory", "repo-files"];
}

function inferScriptSideEffect(name, command) {
  if (/check|test|validate|audit|status|search|detect/.test(name)) return "read-only";
  if (/build|index|memory|upgrade|gc/.test(name) || /build|write|update/.test(command)) return "local-write";
  return "mixed";
}

function inferScriptApproval(name, command) {
  const sideEffect = inferScriptSideEffect(name, command);
  return sideEffect === "read-only"
    ? "no approval for local reads"
    : "dry-run preferred; approval required for destructive changes, migrations or external APIs";
}

function stableOrderKey(item) {
  return `${item.type}:${item.stableName}`;
}

function issue(id, code, message) {
  return { id, code, message };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
