const DESIGN_STAGE_IDS = Object.freeze([
  "stage-0-orchestrator",
  "stage-0-memory",
  "stage-0-design-intelligence",
  "stage-0-reference-website",
  "stage-0-reference-figma",
  "stage-0-reference-pdf",
  "stage-0-reference-image",
  "stage-0-reference-screenshot",
  "stage-0-reference-inventory",
  "stage-1-brand-direction",
  "stage-2-design-system",
  "stage-2-design-system-review",
  "stage-3-screen-spec",
  "stage-4-copy",
  "stage-5-prototype-build",
  "stage-5-prototype-skill",
  "stage-5-landing-skill",
  "stage-6-polish-review",
  "stage-6-a11y-review",
  "stage-6-seo-review",
  "stage-7-quality-gate",
]);

const COMMAND_STAGE_REGISTRY = Object.freeze({
  "/supervibe-design": {
    stageIds: DESIGN_STAGE_IDS,
    stagePatterns: Object.freeze([
      /^stage-0-reference-[a-z0-9-]+$/,
    ]),
  },
});

function knownWorkflowStages(command = "") {
  const registry = COMMAND_STAGE_REGISTRY[normalizeCommandId(command)];
  return registry ? [...registry.stageIds] : [];
}

export function validateWorkflowStageId({ command = "", stage = "" } = {}) {
  const normalizedCommand = normalizeCommandId(command);
  const registry = COMMAND_STAGE_REGISTRY[normalizedCommand];
  if (!registry) return { pass: true, command: normalizedCommand, stage };

  const normalizedStage = String(stage || "").trim();
  const valid = registry.stageIds.includes(normalizedStage)
    || registry.stagePatterns.some((pattern) => pattern.test(normalizedStage));
  if (valid) {
    return {
      pass: true,
      command: normalizedCommand,
      stage: normalizedStage,
      allowedStages: [...registry.stageIds],
    };
  }

  return {
    pass: false,
    command: normalizedCommand,
    stage: normalizedStage,
    allowedStages: [...registry.stageIds],
    message: `unknown stage "${normalizedStage || "(missing)"}" for ${normalizedCommand}; expected one of: ${registry.stageIds.join(", ")}`,
  };
}

export function assertWorkflowStageId(input = {}) {
  const result = validateWorkflowStageId(input);
  if (!result.pass) throw new Error(result.message);
  return true;
}

function isKnownWorkflowStage(input = {}) {
  return validateWorkflowStageId(input).pass;
}

function normalizeCommandId(command = "") {
  const normalized = String(command || "").trim();
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
