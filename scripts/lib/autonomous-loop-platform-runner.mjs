import { platform } from "node:os";

export function detectPlatform(env = process.env) {
  const os = platform();
  const shell = env.ComSpec && os === "win32" ? "cmd"
    : env.PSModulePath && os === "win32" ? "powershell"
    : env.SHELL ? "posix" : "unknown";
  return {
    os,
    shell,
    pathSeparator: os === "win32" ? "\\" : "/",
    envSyntax: os === "win32" ? "$env:NAME" : "$NAME",
  };
}

export function renderCommand(command, platformInfo = detectPlatform()) {
  const value = String(command || "").trim();
  if (!value) return { ok: false, status: "command_adapter_required", command: value };
  if (platformInfo.os === "win32" && /\bexport\s+\w+=/.test(value)) {
    return { ok: false, status: "command_adapter_required", reason: "POSIX env syntax on Windows", command: value };
  }
  if (platformInfo.os !== "win32" && /\$env:\w+/.test(value)) {
    return { ok: false, status: "command_adapter_required", reason: "PowerShell env syntax on POSIX", command: value };
  }
  return {
    ok: true,
    originalCommand: value,
    renderedCommand: value.replaceAll("\\", platformInfo.pathSeparator),
    platform: platformInfo,
  };
}

export function detectPackageManager(files = []) {
  const set = new Set(files);
  if (set.has("pnpm-lock.yaml")) return "pnpm";
  if (set.has("yarn.lock")) return "yarn";
  if (set.has("bun.lockb") || set.has("bun.lock")) return "bun";
  if (set.has("package-lock.json")) return "npm";
  if (set.has("uv.lock")) return "uv";
  if (set.has("poetry.lock")) return "poetry";
  if (set.has("Cargo.lock")) return "cargo";
  if (set.has("go.mod")) return "go";
  return "project-specific";
}
