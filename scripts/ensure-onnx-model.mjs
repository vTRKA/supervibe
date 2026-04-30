#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readSync, renameSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MODEL_RELATIVE_PATH = "models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx";
export const MODEL_DOWNLOAD_URL = "https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/onnx/model_quantized.onnx";
export const MIN_MODEL_BYTES = 100_000_000;

const DEFAULT_LFS_STALL_MS = 120_000;
const DEFAULT_DOWNLOAD_STALL_MS = 180_000;
const DEFAULT_DOWNLOAD_RETRIES = 4;
const LOG_PREFIX = "[supervibe:model]";

function commandForPlatform(cmd) {
  if (process.platform !== "win32") return cmd;
  if (cmd === "npm" || cmd === "npx") return `${cmd}.cmd`;
  return cmd;
}

function envPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function lfsStallMs() {
  const milliseconds = envPositiveInt("SUPERVIBE_LFS_STALL_TIMEOUT_MS", 0);
  if (milliseconds > 0) return milliseconds;
  const seconds = envPositiveInt("SUPERVIBE_LFS_STALL_TIMEOUT_SECONDS", 0);
  if (seconds > 0) return seconds * 1000;
  return DEFAULT_LFS_STALL_MS;
}

function downloadStallMs() {
  const milliseconds = envPositiveInt("SUPERVIBE_MODEL_STALL_TIMEOUT_MS", 0);
  if (milliseconds > 0) return milliseconds;
  const seconds = envPositiveInt("SUPERVIBE_MODEL_STALL_TIMEOUT_SECONDS", 0);
  if (seconds > 0) return seconds * 1000;
  return DEFAULT_DOWNLOAD_STALL_MS;
}

function downloadRetries() {
  return envPositiveInt("SUPERVIBE_MODEL_DOWNLOAD_RETRIES", DEFAULT_DOWNLOAD_RETRIES);
}

function logTo(log, method, message) {
  const fn = log?.[method] || log?.log || console.log;
  fn.call(log, `${LOG_PREFIX} ${message}`);
}

function startsWithGitLfsPointer(path) {
  let fd = null;
  try {
    fd = openSync(path, "r");
    const buffer = Buffer.alloc(128);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8").startsWith("version https://git-lfs.github.com/spec/");
  } catch {
    return false;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

export function onnxModelPath(rootDir = process.cwd()) {
  return join(rootDir, ...MODEL_RELATIVE_PATH.split("/"));
}

export function isModelUsable(path, minBytes = MIN_MODEL_BYTES) {
  if (!existsSync(path)) return false;
  try {
    return statSync(path).size >= minBytes && !startsWithGitLfsPointer(path);
  } catch {
    return false;
  }
}

function cleanupGitLfsIncomplete(rootDir, log) {
  const incomplete = join(rootDir, ".git", "lfs", "incomplete");
  if (!existsSync(incomplete)) return;
  logTo(log, "warn", `removing incomplete Git LFS downloads at ${incomplete}`);
  rmSync(incomplete, { recursive: true, force: true });
}

function formatBytes(bytes) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function logDownloadProgress(log, downloaded, totalBytes) {
  if (totalBytes > 0) {
    const percent = Math.min(100, (downloaded / totalBytes) * 100);
    logTo(log, "log", `downloaded ${percent.toFixed(1)}% (${formatBytes(downloaded)} / ${formatBytes(totalBytes)}) of ONNX model`);
  } else {
    logTo(log, "log", `downloaded ${formatBytes(downloaded)} of ONNX model`);
  }
}

function tryGitLfsPull(rootDir, modelPath, log) {
  const lfsCheck = spawnSync(commandForPlatform("git"), ["lfs", "version"], {
    cwd: rootDir,
    stdio: "ignore",
  });
  if (lfsCheck.status !== 0) {
    logTo(log, "warn", "git-lfs not available; falling back to direct HuggingFace download");
    return false;
  }

  const stallMs = lfsStallMs();
  logTo(log, "log", `git lfs pull for ONNX model (no total timeout; stalls after ${stallMs}ms without output)`);
  return new Promise((resolve) => {
    const child = spawn(commandForPlatform("git"), [
      "lfs",
      "pull",
      "--include",
      MODEL_RELATIVE_PATH,
      "--exclude",
      "",
    ], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let stallTimer = null;

    const cleanup = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok);
    };
    const resetStallTimer = () => {
      cleanup();
      stallTimer = setTimeout(() => {
        logTo(log, "warn", `git lfs pull stalled with no output for ${stallMs}ms`);
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }, stallMs);
      stallTimer.unref();
    };

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      resetStallTimer();
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      resetStallTimer();
    });
    child.on("error", (err) => {
      logTo(log, "warn", `git lfs pull could not start: ${err.message}`);
      cleanupGitLfsIncomplete(rootDir, log);
      finish(false);
    });
    child.on("close", (code, signal) => {
      if (code === 0 && isModelUsable(modelPath)) {
        finish(true);
        return;
      }
      if (signal) {
        logTo(log, "warn", `git lfs pull stopped by ${signal}`);
      } else if (code !== 0) {
        logTo(log, "warn", `git lfs pull exited with code ${code}`);
      } else {
        logTo(log, "warn", "git lfs pull finished but ONNX model is still missing or incomplete");
      }
      cleanupGitLfsIncomplete(rootDir, log);
      finish(false);
    });
    resetStallTimer();
  });
}

function downloadFile(urlString, destination, { stallMs, log, redirects = 0 } = {}) {
  if (redirects > 8) throw new Error(`too many redirects while downloading ${urlString}`);
  const url = new URL(urlString);
  const client = url.protocol === "http:" ? http : https;
  const tempPath = `${destination}.download`;

  return new Promise((resolve, reject) => {
    let settled = false;
    let stallTimer = null;
    let request = null;
    const cleanup = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      rmSync(tempPath, { force: true });
      reject(err);
    };
    const succeed = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const resetStallTimer = () => {
      cleanup();
      stallTimer = setTimeout(() => {
        if (request) request.destroy(new Error(`download stalled with no progress for ${stallMs}ms`));
      }, stallMs);
      stallTimer.unref();
    };

    request = client.get(url, {
      headers: {
        "User-Agent": "supervibe-installer",
        Accept: "application/octet-stream",
      },
    }, (response) => {
      const redirect = response.statusCode >= 300 && response.statusCode < 400 && response.headers.location;
      if (redirect) {
        response.resume();
        cleanup();
        downloadFile(new URL(response.headers.location, url).toString(), destination, { stallMs, log, redirects: redirects + 1 }).then(succeed, fail);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        fail(new Error(`download failed with HTTP ${response.statusCode}`));
        return;
      }

      mkdirSync(dirname(destination), { recursive: true });
      rmSync(tempPath, { force: true });
      const output = createWriteStream(tempPath);
      const totalBytes = Number(response.headers["content-length"]) || 0;
      let downloaded = 0;
      let nextProgressBytes = 25 * 1024 * 1024;
      let nextProgressPercent = 5;

      resetStallTimer();

      response.on("data", (chunk) => {
        downloaded += chunk.length;
        resetStallTimer();
        if (totalBytes > 0) {
          const percent = (downloaded / totalBytes) * 100;
          if (percent >= nextProgressPercent) {
            logDownloadProgress(log, downloaded, totalBytes);
            nextProgressPercent += 5;
          }
        } else if (downloaded >= nextProgressBytes) {
          logDownloadProgress(log, downloaded, totalBytes);
          nextProgressBytes += 25 * 1024 * 1024;
        }
      });
      response.on("error", fail);
      output.on("error", fail);
      output.on("finish", () => {
        output.close(() => {
          rmSync(destination, { force: true });
          renameSync(tempPath, destination);
          logDownloadProgress(log, downloaded, totalBytes);
          succeed(downloaded);
        });
      });
      response.pipe(output);
    });

    request.on("error", fail);
    resetStallTimer();
  });
}

async function downloadWithRetries(url, destination, log) {
  const retries = downloadRetries();
  const stallMs = downloadStallMs();
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      logTo(log, "log", `downloading required ONNX model from HuggingFace (attempt ${attempt}/${retries}; no total timeout; stalls after ${stallMs}ms without progress)`);
      await downloadFile(url, destination, { stallMs, log });
      return;
    } catch (err) {
      lastError = err;
      logTo(log, "warn", `ONNX model download attempt ${attempt} failed: ${err.message}`);
    }
  }
  throw lastError || new Error("ONNX model download failed");
}

export async function ensureOnnxModel({ rootDir = process.cwd(), log = console } = {}) {
  const modelPath = onnxModelPath(rootDir);
  if (isModelUsable(modelPath)) {
    logTo(log, "log", `required ONNX model already ready: ${modelPath}`);
    return { source: "existing", path: modelPath };
  }

  logTo(log, "warn", `required ONNX model is missing, incomplete, or still a Git LFS pointer: ${modelPath}`);
  if ((await tryGitLfsPull(rootDir, modelPath, log)) && isModelUsable(modelPath)) {
    logTo(log, "log", "required ONNX model ready via Git LFS");
    return { source: "git-lfs", path: modelPath };
  }

  const downloadUrl = process.env.SUPERVIBE_ONNX_MODEL_URL || MODEL_DOWNLOAD_URL;
  await downloadWithRetries(downloadUrl, modelPath, log);
  if (!isModelUsable(modelPath)) {
    throw new Error(`download completed but ONNX model is not usable: ${modelPath}`);
  }
  logTo(log, "log", "required ONNX model ready via direct HuggingFace download");
  return { source: "huggingface", path: modelPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureOnnxModel().catch((err) => {
    console.error(`${LOG_PREFIX} failed to prepare required ONNX model: ${err.message}`);
    process.exit(1);
  });
}
