import { spawn } from "node:child_process";
import { scanProviderCommand } from "./autonomous-loop-provider-policy-guard.mjs";

export const EXECUTION_MODES = Object.freeze(["dry-run", "guided", "fresh-context", "manual"]);
export const TOOL_ADAPTER_IDS = Object.freeze(["codex", "claude", "gemini", "opencode", "generic-shell-stub"]);

const ADAPTER_DEFINITIONS = {
  codex: { label: "Codex CLI", command: "codex" },
  claude: { label: "Claude CLI", command: "claude" },
  gemini: { label: "Gemini CLI", command: "gemini" },
  opencode: { label: "OpenCode CLI", command: "opencode" },
  "generic-shell-stub": { label: "Generic shell stub", command: "stub" },
};

export function normalizeExecutionMode(mode = "dry-run") {
  const normalized = String(mode || "dry-run").trim().toLowerCase();
  return EXECUTION_MODES.includes(normalized) ? normalized : "dry-run";
}

export function detectToolAdapters({
  env = process.env,
  availableCommands = {},
  enabledAdapters = parseEnabledAdapters(env.SUPERVIBE_ENABLED_ADAPTERS),
} = {}) {
  const enabled = new Set(enabledAdapters);
  return TOOL_ADAPTER_IDS.map((id) => {
    const definition = ADAPTER_DEFINITIONS[id];
    if (id === "generic-shell-stub") {
      return {
        id,
        label: definition.label,
        command: definition.command,
        available: true,
        configured: true,
        safeDefault: true,
        executionModes: ["dry-run", "guided", "fresh-context", "manual"],
        reason: "local stub adapter is always available for tests and prompt generation",
      };
    }

    const envKey = `SUPERVIBE_${id.toUpperCase().replaceAll("-", "_")}_COMMAND`;
    const configuredCommand = env[envKey] || definition.command;
    const configured = enabled.has(id) || Boolean(env[envKey]);
    const commandKnown = Boolean(availableCommands[configuredCommand] || availableCommands[id]);
    const available = configured && (commandKnown || Boolean(env[envKey]));
    return {
      id,
      label: definition.label,
      command: configuredCommand,
      available,
      configured,
      safeDefault: false,
      executionModes: ["guided", "fresh-context", "manual"],
      reason: available
        ? "configured by environment or injected command inventory"
        : configured
          ? "configured but command availability was not confirmed"
          : "not configured; safe detection does not spawn external CLIs",
    };
  });
}

export function summarizeToolAdapterAvailability(adapters = []) {
  const available = adapters.filter((adapter) => adapter.available).map((adapter) => adapter.id);
  const configured = adapters.filter((adapter) => adapter.configured && !adapter.available).map((adapter) => adapter.id);
  return {
    available,
    configured_unavailable: configured,
    external_available: available.filter((id) => id !== "generic-shell-stub"),
    stub_available: available.includes("generic-shell-stub"),
  };
}

export function createToolAdapter(id, config = {}) {
  if (id === "generic-shell-stub") return createShellStubAdapter(config);
  const definition = ADAPTER_DEFINITIONS[id];
  if (!definition) throw new Error(`Unknown tool adapter: ${id}`);
  return createCliToolAdapter({
    id,
    label: definition.label,
    command: config.command || definition.command,
    args: config.args || [],
    env: config.env,
    cwd: config.cwd,
  });
}

export function createShellStubAdapter(config = {}) {
  const output = config.output || [
    "SUPERVIBE_TASK_COMPLETE: true",
    "SUPERVIBE_EVIDENCE_SUMMARY: stub adapter completed acceptance checklist",
    "SUPERVIBE_CHANGED_FILES: scripts/example.mjs",
  ].join("\n");

  return {
    id: "generic-shell-stub",
    label: "Generic shell stub",
    detect() {
      return { available: true, reason: "stub adapter" };
    },
    renderPrompt(packet) {
      return renderFreshContextPrompt(packet);
    },
    async run(packet, runOptions = {}) {
      return {
        adapterId: "generic-shell-stub",
        status: "completed",
        spawned: false,
        processId: null,
        prompt: runOptions.prompt || renderFreshContextPrompt(packet),
        output: typeof config.outputFactory === "function" ? config.outputFactory(packet, runOptions) : output,
        exitCode: 0,
      };
    },
    async collectOutput(runResult) {
      return runResult.output || "";
    },
    extractCompletionSignal,
    extractChangedFiles,
    stop() {
      return { stopped: true, alreadyFinished: true };
    },
  };
}

export function createCliToolAdapter({
  id,
  label,
  command,
  args = [],
  env,
  cwd,
} = {}) {
  assertSafeAdapterCommand(command, args);
  let child = null;

  return {
    id,
    label,
    detect({ availableCommands = {} } = {}) {
      return {
        available: Boolean(command && availableCommands[command]),
        reason: command ? "command configured; availability depends on injected inventory" : "missing command",
      };
    },
    renderPrompt(packet) {
      return renderFreshContextPrompt(packet);
    },
    async run(packet, runOptions = {}) {
      if (runOptions.allowSpawn !== true) {
        return {
          adapterId: id,
          status: "blocked",
          spawned: false,
          processId: null,
          output: "Adapter spawn blocked: allowSpawn=true is required for external AI CLIs.",
          exitCode: null,
        };
      }
      const prompt = runOptions.prompt || renderFreshContextPrompt(packet);
      const runArgs = [...args, ...(runOptions.args || [])];
      assertSafeAdapterCommand(command, runArgs);
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        child = spawn(command, runArgs, {
          cwd: runOptions.cwd || cwd || process.cwd(),
          env: { ...process.env, ...(env || {}), ...(runOptions.env || {}) },
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
        });
        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.on("error", (err) => {
          resolve({
            adapterId: id,
            status: "tool_failed",
            spawned: true,
            processId: child?.pid || null,
            output: `${stdout}${stderr}\n${err.message}`.trim(),
            exitCode: null,
          });
        });
        child.on("close", (code) => {
          resolve({
            adapterId: id,
            status: code === 0 ? "completed" : "tool_failed",
            spawned: true,
            processId: child?.pid || null,
            output: `${stdout}${stderr ? `\n${stderr}` : ""}`.trim(),
            exitCode: code,
          });
        });
        child.stdin.end(prompt);
      });
    },
    async collectOutput(runResult) {
      return runResult.output || "";
    },
    extractCompletionSignal,
    extractChangedFiles,
    stop() {
      if (!child || child.killed) return { stopped: true, alreadyFinished: true };
      child.kill("SIGTERM");
      return { stopped: true, alreadyFinished: false, processId: child.pid };
    },
  };
}

export function renderFreshContextPrompt(packet) {
  const scopedPacket = {
    packetType: packet.packetType,
    schemaVersion: packet.schemaVersion,
    task: packet.task,
    contract: packet.contract,
    acceptanceCriteria: packet.acceptanceCriteria,
    verificationMatrix: packet.verificationMatrix,
    contextPack: packet.contextPack,
    progressNotes: packet.progressNotes,
    policyBoundaries: packet.policyBoundaries,
    sideEffectRules: packet.sideEffectRules,
    outputContract: packet.outputContract,
  };
  return [
    "SUPERVIBE_FRESH_CONTEXT_TASK",
    "Execute only the task described in this packet. Do not rely on prior conversation history.",
    "Respect policy boundaries and side-effect rules. Stop if approval is required.",
    "Return the required completion signal only after verification evidence exists.",
    "",
    JSON.stringify(scopedPacket, null, 2),
    "",
    "Required final output:",
    "SUPERVIBE_TASK_COMPLETE: true|false",
    "SUPERVIBE_EVIDENCE_SUMMARY: <short evidence summary>",
    "SUPERVIBE_CHANGED_FILES: <comma-separated paths or none>",
  ].join("\n");
}

export function extractCompletionSignal(output = "") {
  const match = String(output).match(/^SUPERVIBE_TASK_COMPLETE:\s*(true|false|yes|no|completed|failed)\s*$/im);
  const raw = match?.[1]?.toLowerCase() || null;
  return {
    present: Boolean(match),
    completed: ["true", "yes", "completed"].includes(raw),
    raw,
  };
}

export function extractEvidenceSummary(output = "") {
  const match = String(output).match(/^SUPERVIBE_EVIDENCE_SUMMARY:\s*(.+)$/im);
  return match?.[1]?.trim() || null;
}

export function extractChangedFiles(output = "") {
  const text = String(output);
  const files = new Set();
  const inline = text.match(/^SUPERVIBE_CHANGED_FILES:\s*(.+)$/im);
  if (inline) {
    inline[1].split(",").map((item) => item.trim()).filter(Boolean).forEach((file) => {
      if (file.toLowerCase() !== "none") files.add(file);
    });
  }

  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^changed files:\s*$/i.test(line.trim()));
  if (headingIndex >= 0) {
    for (const line of lines.slice(headingIndex + 1)) {
      if (!line.trim()) break;
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (!bullet) break;
      files.add(bullet[1].trim());
    }
  }
  return [...files];
}

export function assertSafeAdapterCommand(command, args = []) {
  if (!command) throw new Error("Adapter command is required");
  const scan = scanProviderCommand({ command, args });
  if (!scan.allowed) {
    throw new Error(`Unsafe adapter flag blocked: ${scan.blockedFlags.join(", ")}`);
  }
  return true;
}

function parseEnabledAdapters(value = "") {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
