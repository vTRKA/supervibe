// Code-aware chunker. NOT a real AST parser (would require tree-sitter).
// Uses regex-based block detection (top-level functions, classes, methods)
// with brace/indentation matching for the supported language family.
//
// Strategy:
//   1. Try language-specific block split (function/class boundaries).
//   2. Fall back to text chunker if no blocks recognized OR file too short.
//   3. Each chunk gets {text, startLine, endLine, kind, name?}.
//
// kind values: 'whole-file' | 'function-or-class' | 'class-or-method' | 'block' | 'leftover'

import { chunkText, countTokens } from './chunker.mjs';

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

/**
 * Chunk source code into semantically-meaningful blocks.
 * @returns {Promise<Array<{text, startLine, endLine, kind, name?, tokens}>>}
 */
export async function chunkCode(code, filePath, opts = {}) {
  const { targetTokens = 250, overlapTokens = 16 } = opts;
  const lang = detectLanguage(filePath);
  const lines = code.split('\n');

  const totalTokens = await countTokens(code);
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
    const textChunks = await chunkText(code, { targetTokens, overlapTokens });
    return textChunks.map(text => ({
      text,
      startLine: 1,
      endLine: lines.length,
      kind: 'block',
      tokens: 0
    }));
  }

  const pattern = BLOCK_PATTERNS[lang];
  const blocks = [];
  const matches = [...code.matchAll(pattern)];

  let lastEndLine = 0;
  for (const m of matches) {
    const charIdx = m.index;
    const before = code.slice(0, charIdx);
    const startLine = before.split('\n').length - 1;
    const endLine = findBlockEnd(lines, startLine, lang);

    if (startLine > lastEndLine) {
      const leftoverText = lines.slice(lastEndLine, startLine).join('\n').trim();
      if (leftoverText.length > 0) {
        const tokens = await countTokens(leftoverText);
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
    const blockTokens = await countTokens(blockText);

    if (blockTokens > targetTokens * 1.5) {
      const subChunks = await chunkText(blockText, { targetTokens, overlapTokens });
      for (const text of subChunks) {
        blocks.push({
          text,
          startLine: startLine + 1,
          endLine: endLine + 1,
          kind: 'block',
          name: blockName,
          tokens: await countTokens(text)
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
      const tokens = await countTokens(trailingText);
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
    const textChunks = await chunkText(code, { targetTokens, overlapTokens });
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
