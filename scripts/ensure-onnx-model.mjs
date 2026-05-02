#!/usr/bin/env node
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MODEL_RELATIVE_PATH = "models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx";
export const MODEL_DOWNLOAD_URL = "https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/onnx/model_quantized.onnx";
export const MIN_MODEL_BYTES = 100_000_000;

const DEFAULT_DOWNLOAD_RETRIES = 4;
const LOG_PREFIX = "[supervibe:model]";

function envPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function downloadRetries() {
  return envPositiveInt("SUPERVIBE_MODEL_DOWNLOAD_RETRIES", DEFAULT_DOWNLOAD_RETRIES);
}

function logTo(log, method, message) {
  const fn = log?.[method] || log?.log || console.log;
  fn.call(log, `${LOG_PREFIX} ${message}`);
}

export function onnxModelPath(rootDir = process.cwd()) {
  return join(rootDir, ...MODEL_RELATIVE_PATH.split("/"));
}

export function isModelUsable(path, minBytes = MIN_MODEL_BYTES) {
  if (!existsSync(path)) return false;
  try {
    return statSync(path).size >= minBytes;
  } catch {
    return false;
  }
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

function downloadFile(urlString, destination, { log, redirects = 0 } = {}) {
  if (redirects > 8) throw new Error(`too many redirects while downloading ${urlString}`);
  const url = new URL(urlString);
  const client = url.protocol === "http:" ? http : https;
  const tempPath = `${destination}.download`;

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      rmSync(tempPath, { force: true });
      reject(err);
    };
    const succeed = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const request = client.get(url, {
      headers: {
        "User-Agent": "supervibe-installer",
        Accept: "application/octet-stream",
      },
    }, (response) => {
      const redirect = response.statusCode >= 300 && response.statusCode < 400 && response.headers.location;
      if (redirect) {
        response.resume();
        downloadFile(new URL(response.headers.location, url).toString(), destination, { log, redirects: redirects + 1 }).then(succeed, fail);
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

      response.on("data", (chunk) => {
        downloaded += chunk.length;
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
  });
}

async function downloadWithRetries(url, destination, log) {
  const retries = downloadRetries();
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      logTo(log, "log", `downloading required ONNX model from HuggingFace (attempt ${attempt}/${retries}; no total timeout and no stall timeout)`);
      await downloadFile(url, destination, { log });
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

  logTo(log, "warn", `required ONNX model is missing or incomplete: ${modelPath}`);
  const downloadUrl = process.env.SUPERVIBE_ONNX_MODEL_URL || MODEL_DOWNLOAD_URL;
  await downloadWithRetries(downloadUrl, modelPath, log);
  if (!isModelUsable(modelPath)) {
    throw new Error(`download completed but ONNX model is not usable: ${modelPath}`);
  }
  logTo(log, "log", "required ONNX model ready via HuggingFace download");
  return { source: "huggingface", path: modelPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureOnnxModel().catch((err) => {
    console.error(`${LOG_PREFIX} failed to prepare required ONNX model: ${err.message}`);
    process.exit(1);
  });
}
