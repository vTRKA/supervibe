const HEAVY_NPM_SCRIPTS = new Set([
  "check",
  "check:release-strict",
  "validate:epic-completion",
  "validate:epic-completion:trusted",
  "validate:agent-empirical-hardening",
  "validate:agent-content-quality",
  "validate:agent-skill-coverage",
  "validate:design-variant-set",
  "validate:design-active-completion",
]);

export function isHeavyVerificationCommand(command = "") {
  const text = normalizeCommand(command);
  if (!text) return false;
  if (/^npm\s+test(?:\s|$)/i.test(text)) return true;
  if (/^(pnpm|yarn|bun)\s+test(?:\s|$)/i.test(text)) return true;
  const script = npmRunScriptName(text);
  if (script && HEAVY_NPM_SCRIPTS.has(script)) return true;
  if (/^npm\s+run\s+validate:.*all/i.test(text)) return true;
  if (/^node\s+--test(?:\s|$)/i.test(text)) return isHeavyNodeTestCommand(text);
  return false;
}

export function isReleaseOnlyVerificationCommand(command = "") {
  const text = normalizeCommand(command);
  if (!text) return false;
  if (isHeavyVerificationCommand(text)) return true;
  return [
    /^node\s+--test(?:\s|$)/i,
    /^npx\s+vitest(?:\s|$)/i,
    /^vitest(?:\s|$)/i,
    /^pytest(?:\s|$)/i,
    /^npm\s+run\s+validate:/i,
    /^node\s+scripts[\\/]validate-/i,
  ].some((pattern) => pattern.test(text));
}

export function filterVerificationCommandsForEpicPhase(commands = [], {
  epicComplete = false,
  allowHeavy = false,
  releaseOnly = true,
  reason = releaseOnly ? "deferred-until-release-gate" : "deferred-until-epic-complete",
} = {}) {
  const runnableCommands = [];
  const deferredCommands = [];
  for (const command of commands || []) {
    const value = String(command || "").trim();
    if (!value) continue;
    const shouldDefer = releaseOnly
      ? isReleaseOnlyVerificationCommand(value)
      : isHeavyVerificationCommand(value);
    if (!epicComplete && !allowHeavy && shouldDefer) {
      deferredCommands.push({
        command: value,
        reason,
      });
    } else {
      runnableCommands.push(value);
    }
  }
  return {
    epicComplete: Boolean(epicComplete),
    allowHeavy: Boolean(allowHeavy),
    releaseOnly: Boolean(releaseOnly),
    runnableCommands,
    deferredCommands,
    hasDeferred: deferredCommands.length > 0,
  };
}

export function applyVerificationPolicyToMatrix(entries = [], policy = {}) {
  const deferred = new Map((policy.deferredCommands || []).map((item) => [normalizeCommand(item.command), item]));
  if (deferred.size === 0) return entries.map((entry) => ({ ...entry }));
  return entries.map((entry) => {
    const command = normalizeCommand(entry.command);
    const deferredCommand = deferred.get(command);
    if (!deferredCommand) return { ...entry };
    return {
      ...entry,
      command: null,
      deferredCommand: deferredCommand.command,
      deferredReason: deferredCommand.reason,
      expectedOutcome: `${entry.expectedOutcome}; release-only verification deferred until final release gate`,
    };
  });
}

function normalizeCommand(command = "") {
  return String(command || "").trim().replace(/\s+/g, " ");
}

function npmRunScriptName(command = "") {
  const match = command.match(/^npm\s+run\s+([^\s]+)/i);
  return match?.[1] || null;
}

function isHeavyNodeTestCommand(command = "") {
  const testFiles = command.match(/\btests[\\/][^\s"']+\.test\.mjs\b/g) || [];
  if (testFiles.length === 0) return true;
  if (testFiles.length > 3) return true;
  return /[*?]/.test(command);
}
