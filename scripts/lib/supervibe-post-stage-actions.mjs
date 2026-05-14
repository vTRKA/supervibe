const STAGE_DECISION_CARD_SCHEMA_VERSION = 1;

export function buildStageDecisionCard(input = {}) {
  const record = normalizeCardInput(input);
  const primaryUx = formatPrimaryDecisionCard(record);
  const machineHandoff = formatMachineHandoff(record);
  return {
    schemaVersion: STAGE_DECISION_CARD_SCHEMA_VERSION,
    ...record,
    primaryUx,
    machineHandoff,
  };
}

export function formatStageDecisionCard(input = {}) {
  const card = input.primaryUx && input.machineHandoff ? input : buildStageDecisionCard(input);
  return [
    card.primaryUx,
    "",
    "Machine Handoff",
    "```text",
    card.machineHandoff,
    "```",
  ].join("\n");
}

function normalizeCardInput(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const choices = normalizeChoices(source.choices || source.nextUserActions || source.options);
  return {
    workflow: text(source.workflow) || "workflow",
    currentStage: text(firstPresent(source.currentStage, source.stage)) || "stage",
    artifact: text(source.artifact) || "none",
    recommendation: text(source.recommendation) || "Choose the next workflow action.",
    why: text(firstPresent(source.why, source.rationale)),
    question: normalizeQuestion(source.question),
    resumeCursor: text(firstPresent(source.resumeCursor, source.resume_cursor, source.cursor)) || "workflow:resume",
    nextCommand: text(firstPresent(source.nextCommand, source.next_command)),
    nextSkill: text(firstPresent(source.nextSkill, source.next_skill)),
    stopCondition: text(firstPresent(source.stopCondition, source.stop_condition)) || "ask-before-next-stage",
    choices,
  };
}

function formatPrimaryDecisionCard(record) {
  const lines = [
    "Decision Card",
    `Stage: ${record.currentStage}`,
    `Artifact: ${record.artifact}`,
    `Recommendation: ${record.recommendation}`,
  ];
  if (record.why) lines.push(`Why: ${record.why}`);
  lines.push(`Question: ${record.question}`);
  lines.push("Choices:");
  for (const [index, choice] of record.choices.entries()) {
    const recommended = choice.recommended ? " (recommended)" : "";
    const detail = choice.description ? ` - ${choice.description}` : "";
    lines.push(`${index + 1}. ${choice.label}${recommended}${detail}`);
  }
  lines.push(`Resume: ${record.resumeCursor}`);
  if (record.nextCommand) lines.push(`Next command: ${record.nextCommand}`);
  return lines.join("\n");
}

function formatMachineHandoff(record) {
  const lines = [
    "NEXT_STEP_HANDOFF",
    `Current phase: ${record.currentStage}`,
    `Artifact: ${record.artifact}`,
  ];
  if (record.nextCommand) lines.push(`Next command: ${record.nextCommand}`);
  if (record.nextSkill) lines.push(`Next skill: ${record.nextSkill}`);
  lines.push(`Stop condition: ${record.stopCondition}`);
  lines.push(`Resume cursor: ${record.resumeCursor}`);
  lines.push(`Question: ${record.question}`);
  lines.push("Choices:");
  for (const choice of record.choices) {
    lines.push(`- ${choice.label}`);
  }
  lines.push("END_NEXT_STEP_HANDOFF");
  return lines.join("\n");
}

function normalizeChoices(value) {
  const source = Array.isArray(value) ? value : [];
  return source.map((choice, index) => {
    const item = isPlainObject(choice) ? choice : { label: choice };
    return {
      id: text(firstPresent(item.id, item.choiceId, item.choice_id)) || `choice_${index + 1}`,
      label: text(firstPresent(item.label, item.title, item.text)) || `Choice ${index + 1}`,
      description: text(firstPresent(item.description, item.consequences, item.detail)),
      recommended: Boolean(item.recommended),
      ordinal: Number.isInteger(Number(item.ordinal)) ? Number(item.ordinal) : index + 1,
    };
  });
}

function normalizeQuestion(value) {
  const question = text(value) || "Step 1/1: choose the next workflow action?";
  return /\bStep\s+\d+\/\d+\s*:/i.test(question) ? question : `Step 1/1: ${question}`;
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined);
}

function text(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
