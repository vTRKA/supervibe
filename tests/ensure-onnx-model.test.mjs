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

test("ONNX model validator rejects missing, tiny, and Git LFS pointer files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-onnx-"));
  try {
    const modelPath = join(dir, "model_quantized.onnx");
    assert.equal(isModelUsable(modelPath, 10), false);

    await writeFile(modelPath, "tiny");
    assert.equal(isModelUsable(modelPath, 10), false);

    await writeFile(modelPath, "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 118308185\n");
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
  const lfs = ensureBody.indexOf("tryGitLfsPull");

  assert.notEqual(existingCheck, -1, "setup should check for an already-usable model");
  assert.notEqual(download, -1, "setup should have a direct download path");
  assert.notEqual(lfs, -1, "setup should retain Git LFS as fallback");
  assert.ok(existingCheck < download, "ready local model must skip direct download");
  assert.ok(existingCheck < lfs, "ready local model must skip Git LFS");
});

test("ONNX model setup uses HuggingFace before Git LFS to conserve repository LFS bandwidth", async () => {
  const source = await readFile("scripts/ensure-onnx-model.mjs", "utf8");
  const ensureBody = source.slice(source.indexOf("export async function ensureOnnxModel"));

  const download = ensureBody.indexOf("await downloadWithRetries");
  const lfs = ensureBody.indexOf("tryGitLfsPull");

  assert.notEqual(download, -1, "setup should directly download from HuggingFace");
  assert.notEqual(lfs, -1, "setup should retain Git LFS fallback");
  assert.ok(download < lfs, "direct HuggingFace download must run before Git LFS fallback");
});

test("ONNX model downloader reports progress and does not interrupt direct downloads by default", async () => {
  const source = await readFile("scripts/ensure-onnx-model.mjs", "utf8");

  assert.match(source, /content-length/);
  assert.match(source, /downloaded \$\{percent\.toFixed\(1\)\}%/);
  assert.match(source, /SUPERVIBE_MODEL_STALL_TIMEOUT_MS/, "direct download stall timeout may be enabled explicitly for diagnostics");
  assert.match(source, /stall timeout disabled by default/);
  assert.match(source, /no total timeout/);
  assert.doesNotMatch(source, /DEFAULT_DOWNLOAD_STALL_MS|SUPERVIBE_MODEL_DOWNLOAD_TIMEOUT_MS|DEFAULT_DOWNLOAD_TIMEOUT_MS|request\.setTimeout/);
});
