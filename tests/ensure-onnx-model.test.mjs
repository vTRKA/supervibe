import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  MIN_MODEL_BYTES,
  MODEL_DOWNLOAD_URL,
  MODEL_RELATIVE_PATH,
  ensureOnnxModel,
  isModelUsable,
  onnxModelPath,
} from "../scripts/ensure-onnx-model.mjs";

test("ONNX model validator rejects missing and truncated files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-onnx-"));
  try {
    const modelPath = join(dir, "model_quantized.onnx");
    assert.equal(isModelUsable(modelPath, 10), false);

    await writeFile(modelPath, "tiny");
    assert.equal(isModelUsable(modelPath, 10), false);

    await writeFile(modelPath, Buffer.alloc(16, 1));
    assert.equal(isModelUsable(modelPath, 10), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ONNX model installer targets the bundled model and direct HuggingFace source", () => {
  assert.equal(MODEL_RELATIVE_PATH, "models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx");
  assert.match(MODEL_DOWNLOAD_URL, /^https:\/\/huggingface\.co\/Xenova\/multilingual-e5-small\/resolve\/main\/onnx\/model_quantized\.onnx$/);
  assert.equal(MIN_MODEL_BYTES, 100_000_000);
  assert.equal(onnxModelPath("/repo").replaceAll("\\", "/"), "/repo/models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx");
});

test("ONNX model setup reuses an already-downloaded model without preparing another fetch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-onnx-root-"));
  try {
    const modelPath = onnxModelPath(dir);
    const logs = [];
    await mkdir(dirname(modelPath), { recursive: true });
    await writeFile(modelPath, "");
    await truncate(modelPath, MIN_MODEL_BYTES);

    const result = await ensureOnnxModel({
      rootDir: dir,
      log: {
        log: (message) => logs.push(message),
        warn: (message) => logs.push(message),
      },
    });

    assert.equal(result.source, "existing");
    assert.equal(result.path, modelPath);
    assert.match(logs.join("\n"), /already ready/);
    assert.doesNotMatch(logs.join("\n"), /downloading required ONNX model|git lfs pull/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ONNX model setup checks existing model before any network fetch", async () => {
  const source = await readFile("scripts/ensure-onnx-model.mjs", "utf8");
  const ensureBody = source.slice(source.indexOf("export async function ensureOnnxModel"));

  const existingCheck = ensureBody.indexOf("if (isModelUsable(modelPath))");
  const download = ensureBody.indexOf("await downloadWithRetries");

  assert.notEqual(existingCheck, -1, "setup should check for an already-usable model");
  assert.notEqual(download, -1, "setup should have a direct download path");
  assert.ok(existingCheck < download, "ready local model must skip direct download");
});

test("ONNX model setup uses HuggingFace only and has no repository LFS fallback", async () => {
  const source = await readFile("scripts/ensure-onnx-model.mjs", "utf8");
  const ensureBody = source.slice(source.indexOf("export async function ensureOnnxModel"));

  const download = ensureBody.indexOf("await downloadWithRetries");

  assert.notEqual(download, -1, "setup should directly download from HuggingFace");
  assert.doesNotMatch(source, /tryGitLfsPull|git lfs|git-lfs|GIT_LFS|SUPERVIBE_LFS|filter\.lfs/i);
});

test("ONNX model downloader reports progress and does not interrupt direct downloads by default", async () => {
  const source = await readFile("scripts/ensure-onnx-model.mjs", "utf8");

  assert.match(source, /content-length/);
  assert.match(source, /downloaded \$\{percent\.toFixed\(1\)\}%/);
  assert.match(source, /no total timeout/);
  assert.match(source, /no stall timeout/);
  assert.doesNotMatch(source, /DEFAULT_DOWNLOAD_STALL_MS|SUPERVIBE_MODEL_STALL_TIMEOUT|SUPERVIBE_MODEL_DOWNLOAD_TIMEOUT|DEFAULT_DOWNLOAD_TIMEOUT|request\.setTimeout|setTimeout\(/);
});
