const IMPORTANT_TAGS = new Set([
  "main",
  "header",
  "nav",
  "aside",
  "section",
  "article",
  "footer",
  "form",
  "textarea",
  "canvas",
]);

const REGION_PATTERNS = Object.freeze([
  ["topbar", /\b(top[-_ ]?bar|app[-_ ]?bar|masthead|header)\b/i],
  ["navigation", /\b(nav|menu|rail|breadcrumb|tabbar|tab[-_ ]?list)\b/i],
  ["composer", /\b(composer|prompt|input[-_ ]?bar|message[-_ ]?input|command[-_ ]?bar|editor)\b/i],
  ["drawer", /\b(drawer|sidebar|side[-_ ]?panel|context[-_ ]?panel|inspector)\b/i],
  ["chat", /\b(chat|message|transcript|conversation|thread)\b/i],
  ["timeline", /\b(timeline|activity|history|feed)\b/i],
  ["canvas", /\b(canvas|workspace|board|map|graph|flow|viewport)\b/i],
  ["agent-state", /\b(agent|status|handoff|receipt|confidence)\b/i],
  ["task", /\b(task|todo|work[-_ ]?item|queue)\b/i],
  ["memory", /\b(memory|knowledge|context|recall)\b/i],
  ["approval", /\b(approval|approve|permission|gate)\b/i],
  ["skills", /\b(skill|tool|capability)\b/i],
  ["automation", /\b(automation|schedule|trigger|runbook)\b/i],
]);

const TAG_REGION = Object.freeze({
  aside: "drawer",
  canvas: "canvas",
  footer: "footer",
  form: "composer",
  header: "topbar",
  main: "main",
  nav: "navigation",
  textarea: "composer",
});

export function extractDesignLayoutFingerprint(html = "", { file = null } = {}) {
  const normalized = stripNonLayoutContent(String(html || ""));
  const tokens = [];
  const regionCounts = new Map();
  let depth = 0;

  for (const match of normalized.matchAll(/<\s*(\/)?\s*([a-z][a-z0-9-]*)([^>]*)>/gi)) {
    const closing = Boolean(match[1]);
    const tag = String(match[2] || "").toLowerCase();
    const attrs = String(match[3] || "");
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }

    const region = classifyRegion(tag, attrs);
    const isImportant = Boolean(region) || IMPORTANT_TAGS.has(tag);
    if (isImportant) {
      const kind = region || tag;
      const token = `d${Math.min(depth, 5)}:${kind}:${tag}`;
      tokens.push(token);
      regionCounts.set(kind, (regionCounts.get(kind) || 0) + 1);
    }

    if (!isVoidTag(tag)) depth += 1;
  }

  const regionVector = [...regionCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${kind}:${count}`);
  const compactTokens = tokens.slice(0, 80);
  const shellSignature = compactTokens.join(">");

  return {
    schemaVersion: 1,
    source: "computed-dom",
    file,
    shellSignature,
    regionSignature: regionVector.join("|"),
    tokenCount: tokens.length,
    regions: Object.fromEntries(regionCounts),
    tokens: compactTokens,
  };
}

export function compareLayoutFingerprints(fingerprints = []) {
  const usable = fingerprints.filter((item) => item && item.shellSignature);
  const groups = new Map();
  for (const item of usable) {
    const key = item.shellSignature;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const duplicateShellGroups = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      shellSignature: group[0].shellSignature,
      files: group.map((item) => item.file).filter(Boolean),
      count: group.length,
    }));

  return {
    schemaVersion: 1,
    source: "computed-dom",
    checked: usable.length,
    uniqueShellCount: groups.size,
    duplicateShellGroups,
    allSameShell: usable.length > 1 && groups.size === 1,
  };
}

function classifyRegion(tag, attrs = "") {
  if (TAG_REGION[tag]) return TAG_REGION[tag];
  const text = attrs
    .replace(/\s+/g, " ")
    .replace(/["']/g, " ")
    .toLowerCase();
  for (const [region, pattern] of REGION_PATTERNS) {
    if (pattern.test(text)) return region;
  }
  return null;
}

function stripNonLayoutContent(value = "") {
  return value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!doctype[^>]*>/gi, " ");
}

function isVoidTag(tag = "") {
  return /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag);
}
