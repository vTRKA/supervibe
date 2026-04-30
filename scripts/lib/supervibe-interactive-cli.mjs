import { buildCommandPalette, formatCommandPalette, selectPaletteAction } from "./supervibe-command-palette.mjs";
import { redactFormText } from "./supervibe-guided-work-item-forms.mjs";

export function isInteractiveTerminal({ stdin = process.stdin, stdout = process.stdout, env = process.env } = {}) {
  if (env.CI || env.SUPERVIBE_INTERACTIVE === "0") return false;
  return Boolean(stdin?.isTTY && stdout?.isTTY);
}

export function createNoTtyFallback({ command, reason = "interactive terminal unavailable", exitCode = 2 } = {}) {
  return {
    ok: false,
    interactive: false,
    exitCode,
    command,
    output: [
      "SUPERVIBE_INTERACTIVE_FALLBACK",
      `REASON: ${reason}`,
      `COMMAND: ${command}`,
      "MUTATION: false",
    ].join("\n"),
  };
}

export function createDryRunPreview({ action = "update", before = {}, after = {}, risk = "low", command = null } = {}) {
  return {
    action,
    risk,
    command,
    mutation: false,
    requiresTypedConfirmation: requiresTypedConfirmation({ risk, command }),
    output: redactFormText([
      "SUPERVIBE_DRY_RUN_PREVIEW",
      `ACTION: ${action}`,
      `RISK: ${risk}`,
      command ? `COMMAND: ${command}` : null,
      `BEFORE: ${JSON.stringify(before)}`,
      `AFTER: ${JSON.stringify(after)}`,
    ].filter(Boolean).join("\n")),
  };
}

export function requiresTypedConfirmation({ risk = "low", command = "" } = {}) {
  return ["high", "critical"].includes(String(risk).toLowerCase()) || /production|deploy|network|webhook|provider|stop/.test(String(command).toLowerCase());
}

export function validateInteractiveConfirmation({ expected = "CONFIRM", received = "", action = {} } = {}) {
  if (action.risky || requiresTypedConfirmation(action)) return received === expected;
  return ["y", "yes", "confirm", expected.toLowerCase()].includes(String(received).toLowerCase());
}

export function assertYesAllowed(action = {}, { yes = false } = {}) {
  if (!yes) return { allowed: true };
  const command = String(action.command || "");
  if (action.risky || /production|deploy|network|webhook|provider|approval/.test(command.toLowerCase())) {
    return { allowed: false, reason: "--yes is not allowed for provider/network/production approval or risky actions" };
  }
  return { allowed: true };
}

export function runInteractiveCli({ mode = "status", index = [], state = {}, planPath = null, graphPath, isTTY = isInteractiveTerminal(), selectedAction = null, confirmed = false, yes = false, policyProfile = null, governance = null } = {}) {
  const palette = buildCommandPalette({ index, state, planPath, graphPath });
  const defaultAction = selectedAction || (mode === "status" ? "view-ready-work" : "create-work-item");
  const selection = selectPaletteAction(palette, defaultAction, { confirmed, yes });
  const yesCheck = assertYesAllowed(selection.action, { yes });
  if (!yesCheck.allowed) return createNoTtyFallback({ command: selection.command, reason: yesCheck.reason });
  if (!isTTY) {
    const suffix = policyProfile?.name ? `; policy=${policyProfile.name}` : governance?.role ? `; role=${governance.role}` : "";
    return createNoTtyFallback({ command: selection.command, reason: `interactive terminal unavailable${suffix}` });
  }
  return {
    ok: selection.executable,
    interactive: true,
    exitCode: selection.executable ? 0 : 1,
    command: selection.command,
    output: `${formatCommandPalette(palette)}\nSELECTED: ${defaultAction}\nCOMMAND: ${selection.command}\nREADY: ${selection.executable}`,
  };
}
