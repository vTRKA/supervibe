export function inspectProtectedSimplificationBlocks(text = "") {
  const lines = String(text).split(/\r?\n/);
  const stack = [];
  const blocks = [];
  const warnings = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const start = /supervibe-simplify-ignore-start(?::\s*(.*))?/.exec(line);
    const end = /supervibe-simplify-ignore-end/.exec(line);

    if (start) {
      const reason = String(start[1] || "").trim();
      const block = { startLine: lineNumber, reason };
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

  return {
    blocks,
    warnings,
    pass: warnings.length === 0,
  };
}

export function isLineProtected(lineNumber, blocks = []) {
  return blocks.some((block) => Number(lineNumber) >= block.startLine && Number(lineNumber) <= block.endLine);
}
