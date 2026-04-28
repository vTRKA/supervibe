// Real semantic embeddings via @huggingface/transformers (pure JS, no Python).
// Uses Xenova/multilingual-e5-small (384-dim, quantized ~118MB).
// MULTILINGUAL: handles English, Russian, 100+ languages well.
// Bundled in repo at models/Xenova/multilingual-e5-small/ — no network download needed.
//
// IMPORTANT: e5 family requires PREFIXES for best quality:
//   - "query: <text>" for search queries
//   - "passage: <text>" for indexed documents
// We add these automatically — caller passes mode='query' or mode='passage'.

import { pipeline, env } from '@huggingface/transformers';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync, statSync } from 'node:fs';

const PLUGIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LOCAL_MODEL_DIR = join(PLUGIN_ROOT, 'models');

// Detect whether the bundled model is actually present and usable.
// Three failure modes we must handle:
//   1. models/ dir missing entirely (dev clone with --depth 0 / shallow)
//   2. config.json missing (incomplete checkout)
//   3. model_quantized.onnx is a Git LFS pointer file (~134 bytes) because
//      the user's machine has no git-lfs installed → ONNX runtime would
//      throw "Protobuf parsing failed" at first use.
// In any of those cases, transparently fall back to HuggingFace remote download
// (~118MB one-time, cached in node_modules/@huggingface/.cache/).
const MODEL_DIR = join(LOCAL_MODEL_DIR, 'Xenova', 'multilingual-e5-small');
const CONFIG_FILE = join(MODEL_DIR, 'config.json');
const MODEL_FILE = join(MODEL_DIR, 'onnx', 'model_quantized.onnx');
const MIN_MODEL_BYTES = 1_000_000; // real quantized ONNX ≈ 113MB; LFS pointer ≈ 134B

function isLocalModelUsable() {
  if (!existsSync(CONFIG_FILE)) return false;
  if (!existsSync(MODEL_FILE)) return false;
  try {
    return statSync(MODEL_FILE).size >= MIN_MODEL_BYTES;
  } catch {
    return false;
  }
}

const localOK = isLocalModelUsable();

env.localModelPath = LOCAL_MODEL_DIR;
env.allowLocalModels = localOK;
env.allowRemoteModels = !localOK;
env.cacheDir = join(PLUGIN_ROOT, 'node_modules', '@huggingface', '.cache');

if (!localOK && process.env.SUPERVIBE_VERBOSE === '1') {
  // eslint-disable-next-line no-console
  console.warn('[supervibe/embeddings] bundled model not usable (missing or LFS pointer); falling back to remote HuggingFace download (~118MB, one-time).');
}

const MODEL_ID = 'Xenova/multilingual-e5-small';
const DIM = 384;

let _extractor = null;
async function getExtractor() {
  if (!_extractor) {
    _extractor = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8'  // quantized int8 (~118MB, fast, multilingual)
    });
  }
  return _extractor;
}

/**
 * Embed a text string into a 384-dim Float32 vector.
 * Mean-pooled + L2-normalized (so cosine similarity == dot product).
 *
 * @param {string} text - Raw text to embed
 * @param {'query'|'passage'} mode - e5 prefix mode (REQUIRED for quality)
 *   - 'query' for search queries (what user is looking for)
 *   - 'passage' for indexed documents (what's stored in memory)
 *   Asymmetric model: query↔passage similarity > query↔query or passage↔passage.
 */
export async function embed(text, mode = 'passage') {
  if (!text || typeof text !== 'string') throw new Error('embed() requires non-empty string');
  if (mode !== 'query' && mode !== 'passage') {
    throw new Error(`embed() mode must be 'query' or 'passage', got: ${mode}`);
  }
  const extractor = await getExtractor();
  const prefixedText = `${mode}: ${text}`;
  const output = await extractor(prefixedText, { pooling: 'mean', normalize: true });
  return new Float32Array(output.data);
}

/**
 * Cosine similarity (== dot product when both normalized).
 * @returns number in [-1, 1], higher = more similar
 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error(`vector dim mismatch: ${a.length} vs ${b.length}`);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Convert Float32Array to/from Buffer for SQLite BLOB storage. */
export function vectorToBuffer(vec) {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function bufferToVector(buf) {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export const EMBEDDING_DIM = DIM;
