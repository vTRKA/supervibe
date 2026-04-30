import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MIN_MODEL_BYTES,
  MODEL_DOWNLOAD_URL,
  MODEL_RELATIVE_PATH,
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

test("ONNX model installer targets the bundled model and direct HuggingFace fallback", () => {
  assert.equal(MODEL_RELATIVE_PATH, "models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx");
  assert.match(MODEL_DOWNLOAD_URL, /^https:\/\/huggingface\.co\/Xenova\/multilingual-e5-small\/resolve\/main\/onnx\/model_quantized\.onnx$/);
  assert.equal(MIN_MODEL_BYTES, 100_000_000);
  assert.equal(onnxModelPath("/repo").replaceAll("\\", "/"), "/repo/models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx");
});

test("ONNX model downloader uses progress and stall detection, not a total timeout", async () => {
  const source = await readFile("scripts/ensure-onnx-model.mjs", "utf8");

  assert.match(source, /content-length/);
  assert.match(source, /downloaded \$\{percent\.toFixed\(1\)\}%/);
  assert.match(source, /SUPERVIBE_MODEL_STALL_TIMEOUT_MS/);
  assert.match(source, /download stalled with no progress/);
  assert.match(source, /no total timeout/);
  assert.doesNotMatch(source, /SUPERVIBE_MODEL_DOWNLOAD_TIMEOUT_MS|DEFAULT_DOWNLOAD_TIMEOUT_MS|request\.setTimeout/);
});
