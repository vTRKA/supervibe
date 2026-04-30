#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readSync, renameSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MODEL_RELATIVE_PATH = "models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx";
export const MODEL_DOWNLOAD_URL = "https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/onnx/model_quantized.onnx";
export const MIN_MODEL_BYTES = 100_000_000;

const DEFAULT_LFS_TIMEOUT_MS = 45_000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 900_000;
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

function lfsTimeoutMs() {
  const milliseconds = envPositiveInt("SUPERVIBE_LFS_TIMEOUT_MS", 0);
  if (milliseconds > 0) return milliseconds;
  const seconds = envPositiveInt("SUPERVIBE_LFS_TIMEOUT_SECONDS", 0);
  if (seconds > 0) return seconds * 1000;
  return DEFAULT_LFS_TIMEOUT_MS;
}

function downloadTimeoutMs() {
  const milliseconds = envPositiveInt("SUPERVIBE_MODEL_DOWNLOAD_TIMEOUT_MS", 0);
  if (milliseconds > 0) return milliseconds;
  const seconds = envPositiveInt("SUPERVIBE_MODEL_DOWNLOAD_TIMEOUT_SECONDS", 0);
  if (seconds > 0) return seconds * 1000;
  return DEFAULT_DOWNLOAD_TIMEOUT_MS;
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

function tryGitLfsPull(rootDir, modelPath, log) {
  const lfsCheck = spawnSync(commandForPlatform("git"), ["lfs", "version"], {
    cwd: rootDir,
    stdio: "ignore",
  });
  if (lfsCheck.status !== 0) {
    logTo(log, "warn", "git-lfs not available; falling back to direct HuggingFace download");
    return false;
  }

  const timeout = lfsTimeoutMs();
  logTo(log, "log", `git lfs pull for ONNX model (timeout: ${timeout}ms)`);
  const result = spawnSync(commandForPlatform("git"), [
    "lfs",
    "pull",
    "--include",
    MODEL_RELATIVE_PATH,
    "--exclude",
    "",
  ], {
    cwd: rootDir,
    stdio: "inherit",
    timeout,
  });

  if (result.status === 0 && isModelUsable(modelPath)) return true;
  if (result.error?.code === "ETIMEDOUT" || result.signal) {
    logTo(log, "warn", `git lfs pull timed out after ${timeout}ms`);
  } else if (result.status !== 0) {
    logTo(log, "warn", "git lfs pull did not complete successfully");
  } else {
    logTo(log, "warn", "git lfs pull finished but ONNX model is still missing or incomplete");
  }
  cleanupGitLfsIncomplete(rootDir, log);
  return false;
}

function downloadFile(urlString, destination, { timeoutMs, log, redirects = 0 } = {}) {
  if (redirects > 8) throw new Error(`too many redirects while downloading ${urlString}`);
  const url = new URL(urlString);
  const client = url.protocol === "http:" ? http : https;
  const tempPath = `${destination}.download`;

  return new Promise((resolve, reject) => {
    const request = client.get(url, {
      headers: {
        "User-Agent": "supervibe-installer",
        Accept: "application/octet-stream",
      },
    }, (response) => {
      const redirect = response.statusCode >= 300 && response.statusCode < 400 && response.headers.location;
      if (redirect) {
        response.resume();
        resolve(downloadFile(new URL(response.headers.location, url).toString(), destination, { timeoutMs, log, redirects: redirects + 1 }));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`download failed with HTTP ${response.statusCode}`));
        return;
      }

      mkdirSync(dirname(destination), { recursive: true });
      rmSync(tempPath, { force: true });
      const output = createWriteStream(tempPath);
      let downloaded = 0;
      let nextProgress = 25 * 1024 * 1024;

      response.on("data", (chunk) => {
        downloaded += chunk.length;
        if (downloaded >= nextProgress) {
          logTo(log, "log", `downloaded ${Math.round(downloaded / 1024 / 1024)} MB of ONNX model`);
          nextProgress += 25 * 1024 * 1024;
        }
      });
      response.on("error", reject);
      output.on("error", reject);
      output.on("finish", () => {
        output.close(() => {
          rmSync(destination, { force: true });
          renameSync(tempPath, destination);
          resolve(downloaded);
        });
      });
      response.pipe(output);
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`download timed out after ${timeoutMs}ms`));
    });
    request.on("error", (err) => {
      rmSync(tempPath, { force: true });
      reject(err);
    });
  });
}

async function downloadWithRetries(url, destination, log) {
  const retries = downloadRetries();
  const timeoutMs = downloadTimeoutMs();
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      logTo(log, "log", `downloading required ONNX model from HuggingFace (attempt ${attempt}/${retries}, timeout: ${timeoutMs}ms)`);
      await downloadFile(url, destination, { timeoutMs, log });
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
  if (tryGitLfsPull(rootDir, modelPath, log) && isModelUsable(modelPath)) {
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
