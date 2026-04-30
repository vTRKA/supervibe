export function renderCompactTable(rows = [], columns = [], { width = 100, color = false, json = false, detailCommand = "supervibe-status --json" } = {}) {
  if (json) return `${JSON.stringify(rows, null, 2)}\n`;
  const defs = normalizeColumns(columns, rows);
  const tableWidth = Math.max(40, Number(width) || 100);
  const gutters = Math.max(0, defs.length - 1) * 2;
  const available = Math.max(20, tableWidth - gutters);
  const base = Math.max(8, Math.floor(available / Math.max(1, defs.length)));
  const sized = defs.map((column) => ({ ...column, width: Math.max(column.min || 8, Math.min(column.max || base, base)) }));
  const header = sized.map((column) => pad(truncate(column.label, column.width), column.width)).join("  ");
  const separator = sized.map((column) => "-".repeat(column.width)).join("  ");
  let truncated = false;
  const body = rows.map((row) => sized.map((column) => {
    const raw = valueAt(row, column.key);
    const rendered = truncate(String(raw ?? ""), column.width, `${detailCommand} --details ${row.itemId || row.id || ""}`);
    if (rendered !== String(raw ?? "")) truncated = true;
    return pad(rendered, column.width);
  }).join("  "));
  const output = [header, separator, ...body, truncated ? `DETAILS: ${detailCommand} --details <id>` : null].filter(Boolean).join("\n");
  return color ? colorize(output, "36") : output;
}

export function renderExpandedDetails(record = {}, { width = 100, json = false } = {}) {
  if (json) return `${JSON.stringify(record, null, 2)}\n`;
  return Object.entries(record).map(([key, value]) => {
    const rendered = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
    return wrapLine(`${key}: ${rendered}`, width).join("\n");
  }).join("\n");
}

export function renderMarkdownSummary(markdown = "", { width = 100, json = false } = {}) {
  if (json) return JSON.stringify({ markdown }, null, 2);
  return String(markdown || "").split(/\r?\n/).flatMap((line) => wrapLine(line, width)).join("\n");
}

export function renderPagerSafeOutput(text = "", { maxLines = 40, overflowCommand = "supervibe-status --details" } = {}) {
  const lines = String(text || "").split(/\r?\n/);
  if (lines.length <= maxLines) return text;
  return [
    ...lines.slice(0, maxLines),
    `... truncated ${lines.length - maxLines} line(s); run: ${overflowCommand}`,
  ].join("\n");
}

export function renderTerminalOutput(payload = {}, options = {}) {
  if (options.json || payload.json) return `${JSON.stringify(payload.data ?? payload, null, 2)}\n`;
  if (payload.type === "table") return renderCompactTable(payload.rows, payload.columns, options);
  if (payload.type === "details") return renderExpandedDetails(payload.record, options);
  if (payload.type === "markdown") return renderMarkdownSummary(payload.markdown, options);
  return String(payload.text || "");
}

export function shouldUseColor({ stdout = process.stdout, noColor = false, env = process.env } = {}) {
  return Boolean(!noColor && stdout?.isTTY && !env.NO_COLOR);
}

function normalizeColumns(columns, rows) {
  if (columns.length) {
    return columns.map((column) => typeof column === "string" ? { key: column, label: column } : { label: column.label || column.key, ...column });
  }
  const keys = Object.keys(rows[0] || {});
  return keys.slice(0, 6).map((key) => ({ key, label: key }));
}

function valueAt(row, key) {
  return String(key || "").split(".").reduce((value, part) => value?.[part], row);
}

function truncate(value, width, detailHint = "") {
  if (value.length <= width) return value;
  if (width < 14) return `${value.slice(0, Math.max(1, width - 1))}…`;
  const suffix = detailHint && width >= 18 ? " …details" : "…";
  return `${value.slice(0, Math.max(1, width - suffix.length))}${suffix}`;
}

function pad(value, width) {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

function wrapLine(line, width) {
  const max = Math.max(20, Number(width) || 100);
  if (line.length <= max) return [line];
  const chunks = [];
  let rest = line;
  while (rest.length > max) {
    chunks.push(rest.slice(0, max));
    rest = rest.slice(max);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function colorize(text, code) {
  return `\x1b[${code}m${text}\x1b[0m`;
}
