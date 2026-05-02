// Code-aware chunker. Uses lightweight block detection for common languages.
// Large files and source-only indexing use approximate line/block chunking so
// repair commands do not pay the full HuggingFace tokenizer cost up front.

import { isMainThread } from 'node:worker_threads';

import { chunkText, countTokens } from './chunker.mjs';

const DEFAULT_LARGE_FILE_CHAR_THRESHOLD = 150_000;

const EXTENSION_MAP = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python',
  '.php': 'php',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.vue': 'vue',
  '.svelte': 'svelte'
};

export function detectLanguage(filePath) {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx < 0) return null;
  const ext = filePath.slice(dotIdx).toLowerCase();
  return EXTENSION_MAP[ext] || null;
}

const BLOCK_PATTERNS = {
  javascript: /^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|class\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(?[^=]*\)?\s*=>)/gm,
  typescript: /^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|class\s+(\w+)|interface\s+(\w+)|type\s+(\w+)|const\s+(\w+)\s*[:=]|enum\s+(\w+))/gm,
  python: /^(?:async\s+)?def\s+(\w+)|^class\s+(\w+)/gm,
  php: /^(?:abstract\s+|final\s+)?(?:class\s+(\w+)|trait\s+(\w+)|interface\s+(\w+))|^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?function\s+(\w+)/gm,
  rust: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)|^(?:pub\s+)?struct\s+(\w+)|^(?:pub\s+)?enum\s+(\w+)|^(?:pub\s+)?trait\s+(\w+)|^(?:pub\s+)?impl\b/gm,
  go: /^func\s+(?:\([^)]+\)\s+)?(\w+)|^type\s+(\w+)\s+(?:struct|interface)/gm,
  java: /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(?:class\s+(\w+)|interface\s+(\w+))/gm,
  ruby: /^class\s+(\w+)|^module\s+(\w+)|^def\s+(\w+)/gm,
  vue: /^<script[^>]*>|^<template>|^<style[^>]*>/gm,
  svelte: /^<script[^>]*>|^<style[^>]*>/gm
};

function findBlockEnd(lines, startIdx, lang) {
  if (lang === 'python' || lang === 'ruby') {
    const startLine = lines[startIdx];
    const startIndent = startLine.match(/^(\s*)/)[1].length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;
      const indent = line.match(/^(\s*)/)[1].length;
      if (indent <= startIndent) return i - 1;
    }
    return lines.length - 1;
  }

  let depth = 0;
  let started = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$/, '');
    for (const ch of stripped) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') {
        depth--;
        if (started && depth === 0) return i;
      }
    }
  }
  return lines.length - 1;
}

function chunkingAbortedError() {
  const error = new Error('chunking aborted');
  error.code = 'SUPERVIBE_CHUNKING_ABORTED';
  return error;
}

function throwIfChunkingAborted(shouldStop = null) {
  if (shouldStop?.()) throw chunkingAbortedError();
}

function normalizeRel(value = '') {
  return String(value || '').replace(/\\/g, '/');
}

function maybeHangForWorkerTest(filePath) {
  if (isMainThread || process.env.SUPERVIBE_CHUNKER_TEST_HANG !== '1') return;
  const onlyFile = normalizeRel(process.env.SUPERVIBE_CHUNKER_TEST_HANG_FILE || '');
  const normalizedFile = normalizeRel(filePath);
  if (onlyFile && !normalizedFile.endsWith(onlyFile)) return;
  const blocker = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(blocker, 0, 0, 60_000);
}

function estimateCodeTokens(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return 0;
  const pieces = normalized.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g);
  if (!pieces) return Math.max(1, Math.ceil(normalized.length / 4));
  return Math.max(1, Math.ceil(pieces.length * 1.05));
}

function pushApproxLineChunks(out, text, {
  startLine,
  endLine,
  kind,
  name = null,
  targetTokens,
  overlapTokens,
  shouldStop = null,
}) {
  const sourceLines = String(text || '').split('\n');
  const maxChars = Math.max(200, targetTokens * 5);
  let current = [];
  let currentStart = startLine;
  let currentTokens = 0;

  const flush = () => {
    const chunkTextValue = current.join('\n').trim();
    if (!chunkTextValue) {
      current = [];
      currentTokens = 0;
      return;
    }
    const chunkEnd = currentStart + current.length - 1;
    out.push({
      text: chunkTextValue,
      startLine: currentStart,
      endLine: Math.min(endLine, chunkEnd),
      kind,
      name,
      tokens: estimateCodeTokens(chunkTextValue),
    });

    if (overlapTokens <= 0 || current.length <= 1) {
      current = [];
      currentTokens = 0;
      currentStart = chunkEnd + 1;
      return;
    }

    const overlap = [];
    let overlapEstimate = 0;
    for (let i = current.length - 1; i >= 0; i -= 1) {
      const lineTokens = Math.max(1, estimateCodeTokens(current[i]));
      if (overlap.length > 0 && overlapEstimate + lineTokens > overlapTokens) break;
      overlap.unshift(current[i]);
      overlapEstimate += lineTokens;
    }
    currentStart = Math.max(startLine, chunkEnd - overlap.length + 1);
    current = overlap;
    currentTokens = overlapEstimate;
  };

  for (let i = 0; i < sourceLines.length; i += 1) {
    throwIfChunkingAborted(shouldStop);
    const line = sourceLines[i];
    const lineTokens = Math.max(1, estimateCodeTokens(line));
    if (lineTokens > targetTokens * 1.5) {
      flush();
      const step = Math.max(100, maxChars - overlapTokens * 5);
      for (let offset = 0; offset < line.length; offset += step) {
        throwIfChunkingAborted(shouldStop);
        const slice = line.slice(offset, offset + maxChars).trim();
        if (!slice) continue;
        out.push({
          text: slice,
          startLine: startLine + i,
          endLine: startLine + i,
          kind,
          name,
          tokens: estimateCodeTokens(slice),
        });
      }
      currentStart = startLine + i + 1;
      continue;
    }
    if (current.length > 0 && currentTokens + lineTokens > targetTokens) flush();
    if (current.length === 0) currentStart = startLine + i;
    current.push(line);
    currentTokens += lineTokens;
  }
  flush();
}

async function chunkCodeApproximate(code, filePath, {
  targetTokens,
  overlapTokens,
  shouldStop = null,
}) {
  throwIfChunkingAborted(shouldStop);
  const lang = detectLanguage(filePath);
  const lines = code.split('\n');
  const totalTokens = estimateCodeTokens(code);
  if (totalTokens <= targetTokens) {
    return [{
      text: code,
      startLine: 1,
      endLine: lines.length,
      kind: 'whole-file',
      tokens: totalTokens
    }];
  }

  if (!lang || !BLOCK_PATTERNS[lang]) {
    const out = [];
    pushApproxLineChunks(out, code, {
      startLine: 1,
      endLine: lines.length,
      kind: 'block',
      targetTokens,
      overlapTokens,
      shouldStop,
    });
    return out;
  }

  const pattern = BLOCK_PATTERNS[lang];
  pattern.lastIndex = 0;
  const matches = [...code.matchAll(pattern)];
  const blocks = [];
  let lastEndLine = 0;

  for (const m of matches) {
    throwIfChunkingAborted(shouldStop);
    const charIdx = m.index;
    const before = code.slice(0, charIdx);
    const startLine = before.split('\n').length - 1;
    const endLine = findBlockEnd(lines, startLine, lang);

    if (startLine > lastEndLine) {
      const leftoverText = lines.slice(lastEndLine, startLine).join('\n').trim();
      const tokens = estimateCodeTokens(leftoverText);
      if (tokens >= 8) {
        pushApproxLineChunks(blocks, leftoverText, {
          startLine: lastEndLine + 1,
          endLine: startLine,
          kind: 'leftover',
          targetTokens,
          overlapTokens,
          shouldStop,
        });
      }
    }

    const blockText = lines.slice(startLine, endLine + 1).join('\n');
    const blockName = m.slice(1).find(g => g) || null;
    const blockTokens = estimateCodeTokens(blockText);
    const kind = lang === 'python' || lang === 'java' || lang === 'php' || lang === 'ruby' ? 'class-or-method' : 'function-or-class';

    if (blockTokens > targetTokens * 1.5) {
      pushApproxLineChunks(blocks, blockText, {
        startLine: startLine + 1,
        endLine: endLine + 1,
        kind: 'block',
        name: blockName,
        targetTokens,
        overlapTokens,
        shouldStop,
      });
    } else {
      blocks.push({
        text: blockText,
        startLine: startLine + 1,
        endLine: endLine + 1,
        kind,
        name: blockName,
        tokens: blockTokens,
      });
    }

    lastEndLine = endLine + 1;
  }

  if (lastEndLine < lines.length) {
    const trailingText = lines.slice(lastEndLine).join('\n').trim();
    const tokens = estimateCodeTokens(trailingText);
    if (tokens >= 8) {
      pushApproxLineChunks(blocks, trailingText, {
        startLine: lastEndLine + 1,
        endLine: lines.length,
        kind: 'leftover',
        targetTokens,
        overlapTokens,
        shouldStop,
      });
    }
  }

  if (blocks.length === 0) {
    pushApproxLineChunks(blocks, code, {
      startLine: 1,
      endLine: lines.length,
      kind: 'block',
      targetTokens,
      overlapTokens,
      shouldStop,
    });
  }

  return blocks;
}

/**
 * Chunk source code into semantically meaningful blocks.
 * @returns {Promise<Array<{text, startLine, endLine, kind, name?, tokens}>>}
 */
export async function chunkCode(code, filePath, opts = {}) {
  const {
    targetTokens = 250,
    overlapTokens = 16,
    shouldStop = null,
    tokenMode = 'exact',
    largeFileCharThreshold = DEFAULT_LARGE_FILE_CHAR_THRESHOLD,
  } = opts;
  throwIfChunkingAborted(shouldStop);
  maybeHangForWorkerTest(filePath);

  const lang = detectLanguage(filePath);
  const lines = code.split('\n');
  const useApproximateTokens = tokenMode === 'approximate' || String(code || '').length > largeFileCharThreshold;

  if (useApproximateTokens) {
    return chunkCodeApproximate(code, filePath, { targetTokens, overlapTokens, shouldStop });
  }

  const totalTokens = await countTokens(code, { shouldStop });
  if (totalTokens <= targetTokens) {
    return [{
      text: code,
      startLine: 1,
      endLine: lines.length,
      kind: 'whole-file',
      tokens: totalTokens
    }];
  }

  if (!lang || !BLOCK_PATTERNS[lang]) {
    const textChunks = await chunkText(code, { targetTokens, overlapTokens, shouldStop });
    return textChunks.map(text => ({
      text,
      startLine: 1,
      endLine: lines.length,
      kind: 'block',
      tokens: 0
    }));
  }

  const pattern = BLOCK_PATTERNS[lang];
  pattern.lastIndex = 0;
  const blocks = [];
  const matches = [...code.matchAll(pattern)];

  let lastEndLine = 0;
  for (const m of matches) {
    throwIfChunkingAborted(shouldStop);
    const charIdx = m.index;
    const before = code.slice(0, charIdx);
    const startLine = before.split('\n').length - 1;
    const endLine = findBlockEnd(lines, startLine, lang);

    if (startLine > lastEndLine) {
      const leftoverText = lines.slice(lastEndLine, startLine).join('\n').trim();
      if (leftoverText.length > 0) {
        const tokens = await countTokens(leftoverText, { shouldStop });
        if (tokens >= 8) {
          blocks.push({
            text: leftoverText,
            startLine: lastEndLine + 1,
            endLine: startLine,
            kind: 'leftover',
            tokens
          });
        }
      }
    }

    const blockText = lines.slice(startLine, endLine + 1).join('\n');
    const blockName = m.slice(1).find(g => g) || null;
    const blockTokens = await countTokens(blockText, { shouldStop });

    if (blockTokens > targetTokens * 1.5) {
      const subChunks = await chunkText(blockText, { targetTokens, overlapTokens, shouldStop });
      for (const text of subChunks) {
        blocks.push({
          text,
          startLine: startLine + 1,
          endLine: endLine + 1,
          kind: 'block',
          name: blockName,
          tokens: await countTokens(text, { shouldStop })
        });
      }
    } else {
      blocks.push({
        text: blockText,
        startLine: startLine + 1,
        endLine: endLine + 1,
        kind: lang === 'python' || lang === 'java' || lang === 'php' || lang === 'ruby' ? 'class-or-method' : 'function-or-class',
        name: blockName,
        tokens: blockTokens
      });
    }

    lastEndLine = endLine + 1;
  }

  if (lastEndLine < lines.length) {
    const trailingText = lines.slice(lastEndLine).join('\n').trim();
    if (trailingText.length > 0) {
      const tokens = await countTokens(trailingText, { shouldStop });
      if (tokens >= 8) {
        blocks.push({
          text: trailingText,
          startLine: lastEndLine + 1,
          endLine: lines.length,
          kind: 'leftover',
          tokens
        });
      }
    }
  }

  if (blocks.length === 0) {
    const textChunks = await chunkText(code, { targetTokens, overlapTokens, shouldStop });
    return textChunks.map(text => ({
      text,
      startLine: 1,
      endLine: lines.length,
      kind: 'block',
      tokens: 0
    }));
  }

  return blocks;
}
