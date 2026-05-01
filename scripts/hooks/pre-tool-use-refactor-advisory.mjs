#!/usr/bin/env node
/**
 * PreToolUse hook (advisory, not blocking) — detects refactor patterns in
 * Edit/Write tool calls and reminds the agent to run code-graph queries first.
 *
 * Refactor pattern detection (heuristics):
 * 1. Edit with old_string containing function/class/method definition that
 *    appears to be RENAMED or REMOVED (signature changed in new_string).
 * 2. Write to a NEW file path with name like the previously-existing public
 *    symbol (move/rename intent).
 * 3. Edit with old_string containing `export ... <name>` and new_string
 *    omitting that export (deletion).
 *
 * On detection: emit advisory system-reminder (not blocking exit code).
 * The agent sees the reminder and can either run --callers OR justify why
 * it's not needed.
 *
 * This is OPT-IN advisory: never blocks the edit. Hard enforcement is left
 * to the agent-delivery rubric (graph-evidence-when-applicable dimension).
 *
 * Disable: set SUPERVIBE_REFACTOR_ADVISORY_DISABLED=1
 */

const RENAME_PATTERNS = [
  // function signature change
  /\b(function|fn|def|func)\s+([a-zA-Z_$][\w$]*)/,
  // class declaration
  /\bclass\s+([A-Z][\w$]*)/,
  // method declaration
  /\b(public|private|protected|static)?\s*\b([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*[:{]/,
  // exported binding
  /\bexport\s+(?:default\s+)?(?:function|class|const|let|var)\s+([a-zA-Z_$][\w$]*)/,
];

function extractSymbols(text) {
  if (!text) return new Set();
  const symbols = new Set();
  for (const pattern of RENAME_PATTERNS) {
    const re = new RegExp(pattern.source, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      // last capture group is symbol name
      const name = m[m.length - 1];
      if (name && /^[a-zA-Z_$][\w$]*$/.test(name)) symbols.add(name);
    }
  }
  return symbols;
}

function detectRefactor(toolName, toolInput) {
  if (toolName !== 'Edit' && toolName !== 'Write') return null;

  const filePath = toolInput?.file_path || '';
  // Only watch source code files
  if (!/\.(js|ts|jsx|tsx|py|go|rs|rb|php|java|kt|swift|cs|cpp|c|h)$/.test(filePath)) return null;

  if (toolName === 'Edit') {
    const oldStr = toolInput?.old_string || '';
    const newStr = toolInput?.new_string || '';
    const oldSymbols = extractSymbols(oldStr);
    const newSymbols = extractSymbols(newStr);

    // Removed symbols (in old but not new)
    const removed = [...oldSymbols].filter(s => !newSymbols.has(s));
    if (removed.length > 0) {
      return { kind: 'symbol-removed-or-renamed', symbols: removed, file: filePath };
    }
  }
  return null;
}

function readEvent() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { raw += chunk; });
    process.stdin.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
    setTimeout(() => resolve({}), 500);
  });
}

async function main() {
  if (process.env.SUPERVIBE_REFACTOR_ADVISORY_DISABLED === '1') {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const event = await readEvent();
  const refactor = detectRefactor(event.tool_name, event.tool_input);

  if (!refactor) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  // Emit advisory — does NOT block. Agent sees the reminder and decides.
  const reason = `[supervibe] refactor advisory: this Edit removes/renames symbols [${refactor.symbols.join(', ')}] in ${refactor.file}. Per rule use-codegraph-before-refactor: BEFORE applying, run \`node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --callers <symbol>\` and cite Case A/B/C in your output. Skipping this on a structural change FAILS the agent-delivery rubric (graph-evidence-when-applicable dimension).`;

  // Use systemMessage to surface to user without blocking; agent reads next turn
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `<system-reminder>${reason}</system-reminder>`,
    },
    decision: 'allow',
  }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
});
