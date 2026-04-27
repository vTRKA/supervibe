#!/usr/bin/env bash
# Evolve universal installer — macOS + Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/vTRKA/evolve-agent/main/install.sh | bash
#
# Override defaults:
#   EVOLVE_REF=v1.7.0           # tag, branch, or commit
#   EVOLVE_REPO=git@github.com:my-fork/evolve.git
#
# What it does (idempotent — safe to re-run):
#   1. Detects which AI CLIs are installed (Claude Code, Codex, Gemini)
#   2. Clones the Evolve repo (LFS optional — model lazy-fetches from HuggingFace)
#   3. Runs npm install + npm run check
#   4. Registers the plugin in every detected CLI:
#        - Claude:  ~/.claude/plugins/installed_plugins.json (idempotent JSON upsert)
#        - Codex:   ~/.codex/plugins/evolve  (symlink to shared checkout)
#        - Gemini:  ~/.gemini/GEMINI.md      (idempotent include via marker)
#   5. Prints next steps

set -euo pipefail

REPO_URL="${EVOLVE_REPO:-https://github.com/vTRKA/evolve-agent.git}"
REF="${EVOLVE_REF:-main}"
PLUGIN_NAME="evolve"
MARKETPLACE_NAME="evolve-marketplace"
LOG_DIR="${TMPDIR:-/tmp}/evolve-install.$$"
mkdir -p "$LOG_DIR"
trap 'rm -rf "$LOG_DIR"' EXIT

# ---- output formatting (TTY-aware so logs stay clean) ----

if [ -t 1 ]; then
  C_BLUE='\033[0;34m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[0;33m'; C_RED='\033[0;31m'; C_RESET='\033[0m'
else
  C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_RESET=''
fi

say() { printf '%b[evolve-install]%b %s\n' "$C_BLUE"   "$C_RESET" "$*"; }
ok()  { printf '%b[evolve-install]%b %s\n' "$C_GREEN"  "$C_RESET" "$*"; }
warn(){ printf '%b[evolve-install]%b %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
die() { printf '%b[evolve-install]%b %s\n' "$C_RED"    "$C_RESET" "$*" >&2; exit 1; }

# ---- preflight ----

command -v git  >/dev/null || die "git not found. Install git first."
command -v node >/dev/null || die "node not found. Install Node.js 22+ first (https://nodejs.org)."
command -v npm  >/dev/null || die "npm not found. Comes with Node.js — reinstall."

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ]; then
  die "Node.js 22+ required (you have $(node --version)). Upgrade: https://nodejs.org"
fi
ok "node $(node --version) ok"

# ---- detect AI CLIs ----

CLAUDE_DIR="$HOME/.claude"
CODEX_DIR="$HOME/.codex"
GEMINI_DIR="$HOME/.gemini"

CLIS_FOUND=()
[ -d "$CLAUDE_DIR" ] && CLIS_FOUND+=("claude") || true
[ -d "$CODEX_DIR" ]  && CLIS_FOUND+=("codex")  || true
[ -d "$GEMINI_DIR" ] && CLIS_FOUND+=("gemini") || true

if [ ${#CLIS_FOUND[@]} -eq 0 ]; then
  warn "No AI CLI directory detected (~/.claude, ~/.codex, ~/.gemini)."
  warn "Installing under ~/.claude/ — register manually in your CLI if you use a different one."
  mkdir -p "$CLAUDE_DIR/plugins/marketplaces"
  CLIS_FOUND=("claude")
else
  ok "detected AI CLIs: ${CLIS_FOUND[*]}"
fi

# ---- clone or update the shared checkout ----

# All CLIs reference one on-disk checkout. Claude Code reads it via marketplace
# layout; Codex via symlink; Gemini via GEMINI.md @-include.
TARGET="$CLAUDE_DIR/plugins/marketplaces/$MARKETPLACE_NAME"

if [ -d "$TARGET/.git" ]; then
  say "found existing checkout at $TARGET — updating to $REF"
  if ! git -C "$TARGET" fetch --tags --prune --quiet 2>"$LOG_DIR/fetch.log"; then
    cat "$LOG_DIR/fetch.log" >&2
    die "git fetch failed. Inspect: $TARGET"
  fi
  git -C "$TARGET" checkout --quiet "$REF" 2>"$LOG_DIR/checkout.log" || {
    cat "$LOG_DIR/checkout.log" >&2
    die "git checkout $REF failed. Make sure the ref exists upstream."
  }
  if ! git -C "$TARGET" pull --ff-only --quiet 2>"$LOG_DIR/pull.log"; then
    warn "pull --ff-only failed (local diverged or detached head); leaving checkout at current commit"
  fi
else
  say "cloning $REPO_URL ($REF) → $TARGET"
  mkdir -p "$(dirname "$TARGET")"
  git clone --quiet "$REPO_URL" "$TARGET" 2>"$LOG_DIR/clone.log" || {
    cat "$LOG_DIR/clone.log" >&2
    die "git clone failed. Check network / repo access."
  }
  git -C "$TARGET" checkout --quiet "$REF" 2>"$LOG_DIR/checkout.log" || {
    cat "$LOG_DIR/checkout.log" >&2
    die "git checkout $REF failed inside fresh clone."
  }
fi

# Optional LFS pull. Failure is non-fatal — runtime falls back to HF lazy-fetch.
if command -v git-lfs >/dev/null 2>&1; then
  say "git-lfs detected — pulling embedding model"
  git -C "$TARGET" lfs pull >/dev/null 2>"$LOG_DIR/lfs.log" \
    || warn "git lfs pull failed; model will lazy-fetch from HuggingFace on first use"
else
  warn "git-lfs not installed; embedding model will lazy-fetch from HuggingFace (~118 MB on first semantic search)"
fi

# ---- install deps + verify ----

say "running npm install (logs at $LOG_DIR/npm-install.log)"
( cd "$TARGET" && npm install --no-audit --no-fund >"$LOG_DIR/npm-install.log" 2>&1 ) || {
  echo "--- last 40 lines of npm install ---" >&2
  tail -n 40 "$LOG_DIR/npm-install.log" >&2
  die "npm install failed. Full log: $LOG_DIR/npm-install.log"
}

say "running npm run check"
( cd "$TARGET" && npm run check >"$LOG_DIR/npm-check.log" 2>&1 ) || {
  echo "--- last 40 lines of npm run check ---" >&2
  tail -n 40 "$LOG_DIR/npm-check.log" >&2
  die "npm run check failed. Full log: $LOG_DIR/npm-check.log"
}
ok "all checks passed"

# Capture installed version (env-var approach avoids quote injection in path)
INSTALLED_VERSION=$(EVOLVE_TARGET="$TARGET" node -e \
  'console.log(require(process.env.EVOLVE_TARGET + "/.claude-plugin/plugin.json").version)')

# ---- register with each detected CLI ----

register_claude() {
  local plugins_json="$CLAUDE_DIR/plugins/installed_plugins.json"
  mkdir -p "$(dirname "$plugins_json")"

  if [ ! -f "$plugins_json" ]; then
    printf '{ "version": 2, "plugins": {} }\n' > "$plugins_json"
  fi

  # Pass everything via env to avoid heredoc quote-injection vulnerabilities
  EVOLVE_PJ="$plugins_json" \
  EVOLVE_KEY="$PLUGIN_NAME@$MARKETPLACE_NAME" \
  EVOLVE_INSTALL_PATH="$TARGET" \
  EVOLVE_VERSION="$INSTALLED_VERSION" \
  node -e '
    const fs = require("fs");
    const path = process.env.EVOLVE_PJ;
    const key  = process.env.EVOLVE_KEY;
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    data.version = data.version || 2;
    data.plugins = data.plugins || {};
    const entry = {
      scope: "user",
      installPath: process.env.EVOLVE_INSTALL_PATH,
      version: process.env.EVOLVE_VERSION,
      installedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    const list = data.plugins[key] || [];
    const idx = list.findIndex(e => e.scope === "user");
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], entry);
    else list.push(entry);
    data.plugins[key] = list;
    fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  '
  ok "registered with Claude Code (key: $PLUGIN_NAME@$MARKETPLACE_NAME)"
}

register_codex() {
  local codex_plugins="$CODEX_DIR/plugins"
  mkdir -p "$codex_plugins"
  local link="$codex_plugins/$PLUGIN_NAME"

  # Replace any existing entry (file, dir, symlink, broken symlink)
  if [ -L "$link" ] || [ -e "$link" ]; then
    rm -rf "$link"
  fi
  ln -s "$TARGET" "$link"
  ok "registered with Codex CLI (symlink: $link → $TARGET)"
}

register_gemini() {
  mkdir -p "$GEMINI_DIR"
  local gemini_md="$GEMINI_DIR/GEMINI.md"
  local marker="<!-- evolve-plugin-include: do-not-edit -->"
  local include_line="@$TARGET/GEMINI.md"

  # Idempotent: replace existing marker block; otherwise append
  if [ -f "$gemini_md" ] && grep -qF "$marker" "$gemini_md"; then
    awk -v m="$marker" -v inc="$include_line" '
      $0 == m { skip = !skip; print m; if (skip) print inc; next }
      !skip { print }
    ' "$gemini_md" > "$gemini_md.tmp" && mv "$gemini_md.tmp" "$gemini_md"
  else
    {
      [ -f "$gemini_md" ] && cat "$gemini_md"
      printf '\n%s\n%s\n%s\n' "$marker" "$include_line" "$marker"
    } > "$gemini_md.tmp" && mv "$gemini_md.tmp" "$gemini_md"
  fi
  ok "registered with Gemini CLI (sourced via $gemini_md)"
}

for cli in "${CLIS_FOUND[@]}"; do
  case "$cli" in
    claude) register_claude ;;
    codex)  register_codex  ;;
    gemini) register_gemini ;;
  esac
done

# ---- final report ----

cat <<EOF

${C_GREEN}=================================================================${C_RESET}
${C_GREEN}  Evolve v$INSTALLED_VERSION installed${C_RESET}
${C_GREEN}=================================================================${C_RESET}

  Location:    $TARGET
  CLIs wired:  ${CLIS_FOUND[*]}

  Next steps:
    1. Restart your AI CLI so it picks up the plugin
    2. Open any project — you should see [evolve] banner lines on session start
    3. /evolve-genesis (in Claude Code) for first-time project scaffolding
    4. npm run evolve:status (from $TARGET) for index health any time

  Upgrade:     curl -fsSL https://raw.githubusercontent.com/vTRKA/evolve-agent/main/install.sh | bash
  Manual:      cd "$TARGET" && npm run evolve:upgrade
  Uninstall:   rm -rf "$TARGET" + remove "$PLUGIN_NAME@$MARKETPLACE_NAME" from
               ~/.claude/plugins/installed_plugins.json

  Docs: https://github.com/vTRKA/evolve-agent#readme
EOF
