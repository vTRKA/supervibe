const START_MARKER = "supervibe-simplify-ignore-start";
const END_MARKER = "supervibe-simplify-ignore-end";
const START_RE = new RegExp(`\\b${START_MARKER}\\b(?:\\s*:\\s*(.*))?`);
const END_RE = new RegExp(`\\b${END_MARKER}\\b`);

export function inspectProtectedSimplificationBlocks(text = "") {
  const lines = String(text).split(/\r?\n/);
  const stack = [];
  const blocks = [];
  const warnings = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const start = START_RE.exec(line);
    const end = END_RE.exec(line);

    if (start) {
      const reason = String(start[1] || "").trim();
      const block = { startLine: lineNumber, reason, depth: stack.length + 1 };
      if (!reason) warnings.push({ code: "missing-reason", line: lineNumber, message: "Protected simplification block start requires a reason." });
      stack.push(block);
    }

    if (end) {
      const block = stack.pop();
      if (!block) {
        warnings.push({ code: "unmatched-end", line: lineNumber, message: "Protected simplification block end has no matching start." });
        return;
      }
      blocks.push({ ...block, endLine: lineNumber });
    }
  });

  for (const block of stack) {
    warnings.push({ code: "unclosed-start", line: block.startLine, message: "Protected simplification block start is not closed." });
  }

  blocks.sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);

  return {
    blocks,
    warnings,
    lineCount: lines.length,
    pass: warnings.length === 0,
  };
}

export function isLineProtected(lineNumber, blocks = []) {
  return blocks.some((block) => Number(lineNumber) >= block.startLine && Number(lineNumber) <= block.endLine);
}

export function isRangeProtected(range = {}, blocks = []) {
  const normalized = normalizeSimplificationRanges([range])[0];
  if (!normalized) return false;
  return blocks.some((block) => rangesOverlap(normalized, block));
}

export function normalizeSimplificationRanges(ranges = []) {
  return (Array.isArray(ranges) ? ranges : [ranges])
    .map((range) => normalizeRange(range))
    .filter(Boolean)
    .sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
}

export function evaluateProtectedSimplification(text = "", touchedRanges = [], options = {}) {
  const report = options.report || inspectProtectedSimplificationBlocks(text);
  const normalizedRanges = normalizeSimplificationRanges(touchedRanges);
  const violations = [];

  for (const touchedRange of normalizedRanges) {
    for (const block of report.blocks || []) {
      if (!rangesOverlap(touchedRange, block)) continue;
      violations.push({
        code: "protected-range-overlap",
        message: "Simplification or refactor touches a protected block.",
        startLine: touchedRange.startLine,
        endLine: touchedRange.endLine,
        protectedStartLine: block.startLine,
        protectedEndLine: block.endLine,
        reason: block.reason,
      });
    }
  }

  const blockers = [
    ...(report.warnings || []).map((warning) => ({
      ...warning,
      code: `malformed-${warning.code}`,
      message: warning.message,
    })),
    ...violations,
  ];

  return {
    pass: blockers.length === 0,
    blocked: blockers.length > 0,
    blocks: report.blocks || [],
    warnings: report.warnings || [],
    touchedRanges: normalizedRanges,
    violations,
    blockers,
  };
}

export function assertProtectedSimplificationSafe(text = "", touchedRanges = [], options = {}) {
  const gate = evaluateProtectedSimplification(text, touchedRanges, options);
  if (!gate.pass) {
    const details = gate.blockers.map((blocker) => blocker.message || blocker.code).join("; ");
    const error = new Error(`Protected simplification blocked: ${details}`);
    error.gate = gate;
    throw error;
  }
  return gate;
}

function normalizeRange(range) {
  if (Number.isInteger(range)) return buildRange(range, range);
  if (Array.isArray(range)) return buildRange(range[0], range[1] ?? range[0]);
  if (!range || typeof range !== "object") return null;

  const startLine = range.startLine ?? range.lineStart ?? range.start ?? range.line ?? range.lineNumber;
  const endLine = range.endLine ?? range.lineEnd ?? range.end ?? range.line ?? range.lineNumber ?? startLine;
  return buildRange(startLine, endLine);
}

function buildRange(startLine, endLine) {
  const start = Number(startLine);
  const end = Number(endLine);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) return null;
  return {
    startLine: Math.min(start, end),
    endLine: Math.max(start, end),
  };
}

function rangesOverlap(left, right) {
  return left.startLine <= right.endLine && right.startLine <= left.endLine;
}
