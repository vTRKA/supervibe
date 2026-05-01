import { existsSync } from "node:fs";
import { join } from "node:path";

import { getHostAdapterMatrix, resolveHostAdapter } from "./supervibe-host-adapters.mjs";

const DETECTION_RULES = Object.freeze({
  claude: [
    marker("CLAUDE.md", 0.65),
    marker(".claude", 0.4),
    envHint(["CLAUDECODE", "CLAUDE_CODE", "ANTHROPIC_CLI"], 0.35),
  ],
  codex: [
    marker("AGENTS.md", 0.65),
    marker(".codex", 0.4),
    envHint(["CODEX", "CODEX_HOME", "OPENAI_CODEX"], 0.35),
  ],
  cursor: [
    marker(".cursor/rules", 0.7),
    marker(".cursor", 0.45),
    envHint(["CURSOR_TRACE_ID", "CURSOR_SESSION_ID"], 0.35),
  ],
  gemini: [
    marker("GEMINI.md", 0.65),
    marker(".gemini", 0.4),
    envHint(["GEMINI_CLI", "GEMINI_API_KEY"], 0.35),
  ],
  opencode: [
    marker("opencode.json", 0.7),
    marker(".opencode", 0.4),
    envHint(["OPENCODE", "OPENCODE_HOME"], 0.35),
  ],
});

const ACTIVE_RUNTIME_HINTS = Object.freeze({
  claude: ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "ANTHROPIC_CLI"],
  codex: ["CODEX_THREAD_ID", "CODEX_SESSION_ID", "CODEX_SANDBOX", "OPENAI_CODEX_ACTIVE"],
  cursor: ["CURSOR_TRACE_ID", "CURSOR_SESSION_ID"],
  gemini: ["GEMINI_CLI_SESSION", "GEMINI_CLI"],
  opencode: ["OPENCODE_SESSION_ID", "OPENCODE_ACTIVE"],
});

export { getHostAdapterMatrix, resolveHostAdapter };

export function detectHostCandidates({ rootDir = process.cwd(), env = process.env } = {}) {
  const forced = normalizeHostId(env.SUPERVIBE_HOST || env.SUPERVIBE_TARGET_HOST || "");
  const runtimeHint = forced ? null : detectActiveRuntimeHost(env);
  const adapters = getHostAdapterMatrix();
  const candidates = adapters
    .map((adapter) => scoreAdapter(adapter, { rootDir, env, forced, runtimeHint }))
    .filter((candidate) => candidate.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
  const top = candidates[0] || scoreAdapter(resolveHostAdapter("claude"), { rootDir, env, forced, runtimeHint });
  const runnerUps = candidates.filter((candidate) => candidate.id !== top.id && candidate.confidence >= 0.6);
  const selectedHost = forced || runtimeHint?.id || top.id;
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedHost) || top;
  const requiresSelection = !forced && !runtimeHint && (runnerUps.length > 0 || top.confidence < 0.75);

  return {
    rootDir,
    forcedHost: forced || null,
    activeRuntimeHost: runtimeHint?.id || null,
    selectedHost,
    requiresSelection,
    confidence: Number((forced ? 1 : selectedCandidate.confidence).toFixed(2)),
    candidates: forced ? candidatesWithForcedTop(candidates, forced, rootDir) : candidates,
    evidence: forced ? [{ source: "env", marker: "SUPERVIBE_HOST", detail: forced, weight: 1 }] : selectedCandidate.evidence,
  };
}

export function selectHostAdapter(options = {}) {
  const detected = detectHostCandidates(options);
  const adapter = resolveHostAdapter(detected.selectedHost);
  return {
    ...detected,
    adapter,
  };
}

export function formatHostDiagnostics(result = detectHostCandidates()) {
  const lines = [
    "SUPERVIBE_HOST_DIAGNOSTICS",
    `selectedHost: ${result.selectedHost}`,
    `activeRuntimeHost: ${result.activeRuntimeHost || "none"}`,
    `confidence: ${result.confidence}`,
    `requiresSelection: ${result.requiresSelection}`,
    `candidates: ${result.candidates.length}`,
  ];
  for (const candidate of result.candidates) {
    lines.push(`- ${candidate.id}: ${candidate.confidence}`);
    for (const evidence of candidate.evidence) {
      lines.push(`  ${evidence.source}:${evidence.marker} +${evidence.weight}`);
    }
  }
  return lines.join("\n");
}

export function normalizeHostPath(path = "") {
  return String(path).replace(/\\/g, "/").toLowerCase();
}

function scoreAdapter(adapter, { rootDir, env, forced, runtimeHint }) {
  const evidence = [];
  let score = 0;
  for (const rule of DETECTION_RULES[adapter.id] || []) {
    const hit = rule.evaluate({ rootDir, env, adapter });
    if (!hit) continue;
    score += hit.weight;
    evidence.push(hit);
  }
  if (forced === adapter.id) {
    score += 1;
    evidence.unshift({ source: "env", marker: "SUPERVIBE_HOST", detail: forced, weight: 1 });
  }
  if (runtimeHint?.id === adapter.id) {
    score += 1.1;
    evidence.unshift({ source: "runtime", marker: runtimeHint.marker, detail: runtimeHint.detail, weight: 1.1 });
  }
  return {
    id: adapter.id,
    displayName: adapter.displayName,
    confidence: Number(Math.min(1, score).toFixed(2)),
    adapter,
    evidence,
  };
}

function detectActiveRuntimeHost(env) {
  const explicit = normalizeOptionalHostId(env.SUPERVIBE_ACTIVE_HOST || env.SUPERVIBE_CURRENT_HOST || "");
  if (explicit) {
    return { id: explicit, marker: env.SUPERVIBE_ACTIVE_HOST ? "SUPERVIBE_ACTIVE_HOST" : "SUPERVIBE_CURRENT_HOST", detail: explicit };
  }
  for (const [id, names] of Object.entries(ACTIVE_RUNTIME_HINTS)) {
    const marker = names.find((name) => Boolean(env[name]));
    if (marker) return { id, marker, detail: String(env[marker]) };
  }
  return null;
}

function marker(path, weight) {
  return {
    evaluate: ({ rootDir }) => {
      if (!existsSync(join(rootDir, path))) return null;
      return { source: "filesystem", marker: path, weight };
    },
  };
}

function envHint(names, weight) {
  return {
    evaluate: ({ env }) => {
      const name = names.find((key) => Boolean(env[key]));
      if (!name) return null;
      return { source: "env", marker: name, detail: String(env[name]), weight };
    },
  };
}

function candidatesWithForcedTop(candidates, forced, rootDir) {
  const existing = candidates.find((candidate) => candidate.id === forced);
  const forcedCandidate = existing || scoreAdapter(resolveHostAdapter(forced), { rootDir, env: {}, forced, runtimeHint: null });
  return [
    { ...forcedCandidate, confidence: 1 },
    ...candidates.filter((candidate) => candidate.id !== forced),
  ];
}

function normalizeHostId(value) {
  const normalized = String(value).toLowerCase().trim();
  if (!normalized) return "";
  if (normalized === "claude-code") return "claude";
  if (normalized === "openai-codex") return "codex";
  if (normalized === "gemini-cli") return "gemini";
  resolveHostAdapter(normalized);
  return normalized;
}

function normalizeOptionalHostId(value) {
  try {
    return normalizeHostId(value);
  } catch {
    return "";
  }
}
