import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_METRICS_PATH = ".supervibe/memory/desktop-window-metrics.json";

export function readDesignWindowMetrics({
  rootDir = process.cwd(),
  target = "web",
  env = process.env,
} = {}) {
  const candidates = [];
  if (env.SUPERVIBE_DESIGN_WINDOW_METRICS) {
    candidates.push(parseMetricsSource(env.SUPERVIBE_DESIGN_WINDOW_METRICS, rootDir, "env:SUPERVIBE_DESIGN_WINDOW_METRICS"));
  }
  candidates.push(parseMetricsFile(join(rootDir, ...DEFAULT_METRICS_PATH.split("/")), DEFAULT_METRICS_PATH));

  const normalizedTarget = normalizeTarget(target);
  for (const candidate of candidates.filter(Boolean)) {
    const metricTarget = normalizeTarget(candidate.target || candidate.runtime || candidate.platform || target);
    if (metricTarget !== "unknown" && normalizedTarget !== "unknown" && metricTarget !== normalizedTarget) continue;
    const currentWindow = normalizeWindow(candidate.currentWindow || candidate.window || candidate.mainWindow);
    if (!currentWindow) continue;
    return {
      source: candidate.source,
      currentWindow,
      deviceScaleFactor: Number(candidate.deviceScaleFactor ?? currentWindow.deviceScaleFactor ?? 1),
      minWindow: normalizeWindow(candidate.minWindow) || null,
      secondaryWindow: normalizeWindow(candidate.secondaryWindow) || null,
      largeWindow: normalizeWindow(candidate.largeWindow) || null,
    };
  }
  return null;
}

function parseMetricsSource(value, rootDir, source) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try {
      return { ...JSON.parse(text), source };
    } catch {
      return null;
    }
  }
  return parseMetricsFile(join(rootDir, ...text.split(/[\\/]/)), source);
}

function parseMetricsFile(absPath, source) {
  if (!existsSync(absPath)) return null;
  try {
    return { ...JSON.parse(readFileSync(absPath, "utf8")), source };
  } catch {
    return null;
  }
}

function normalizeWindow(value) {
  if (!value || typeof value !== "object") return null;
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    width,
    height,
    exactWindow: value.exactWindow ?? true,
    deviceScaleFactor: value.deviceScaleFactor === undefined ? undefined : Number(value.deviceScaleFactor),
    label: value.label || "Actual window",
  };
}

function normalizeTarget(target) {
  const text = String(target || "").toLowerCase();
  if (/tauri/.test(text)) return "tauri";
  if (/electron/.test(text)) return "electron";
  if (/desktop|native-app|app-shell/.test(text)) return "desktop";
  if (/web|browser|landing/.test(text)) return "web";
  return text || "unknown";
}
