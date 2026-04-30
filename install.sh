#!/usr/bin/env bash
# Supervibe universal installer — macOS + Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash
#
# Override defaults:
#   SUPERVIBE_REF=main             # tag, branch, or commit
#   SUPERVIBE_REPO=git@github.com:my-fork/supervibe.git
#   SUPERVIBE_EXPECTED_COMMIT=<sha>          # optional release provenance pin
#   SUPERVIBE_EXPECTED_PACKAGE_SHA256=<sha>  # optional git-archive checksum pin
#
# What it does (idempotent — safe to re-run):
#   1. Detects which AI CLIs are installed (Claude Code, Codex, Gemini)
#   2. Clones the Supervibe repo (LFS optional — model lazy-fetches from HuggingFace)
#   3. Ensures Node.js 22.5+ (prompted install/upgrade with user consent if needed)
#   4. Runs npm install + npm run check so SQLite/RAG/CodeGraph are available
#   5. Registers the plugin in every detected CLI:
#        - Claude:  ~/.claude/plugins/installed_plugins.json (idempotent JSON upsert)
#        - Codex:   ~/.codex/plugins/supervibe  (symlink to shared checkout)
#        - Gemini:  ~/.gemini/GEMINI.md      (idempotent include via marker)
#   5. Prints next steps

set -euo pipefail

REPO_URL="${SUPERVIBE_REPO:-https://github.com/vTRKA/supervibe.git}"
REF="${SUPERVIBE_REF:-main}"
EXPECTED_COMMIT="${SUPERVIBE_EXPECTED_COMMIT:-}"
EXPECTED_PACKAGE_SHA256="${SUPERVIBE_EXPECTED_PACKAGE_SHA256:-}"
PLUGIN_NAME="supervibe"
MARKETPLACE_NAME="supervibe-marketplace"
MIN_NODE_VERSION="22.5.0"
LOG_DIR="${TMPDIR:-/tmp}/evolve-install.$$"
mkdir -p "$LOG_DIR"
trap 'rm -rf "$LOG_DIR"' EXIT

# ---- output formatting (TTY-aware so logs stay clean) ----

if [ -t 1 ]; then
  C_BLUE='\033[0;34m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[0;33m'; C_RED='\033[0;31m'; C_RESET='\033[0m'
else
  C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_RESET=''
fi

say() { printf '%b[supervibe-install]%b %s\n' "$C_BLUE"   "$C_RESET" "$*"; }
ok()  { printf '%b[supervibe-install]%b %s\n' "$C_GREEN"  "$C_RESET" "$*"; }
warn(){ printf '%b[supervibe-install]%b %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
die() { printf '%b[supervibe-install]%b %s\n' "$C_RED"    "$C_RESET" "$*" >&2; exit 1; }

validate_safe_path() {
  local path="$1"
  [ -n "$path" ] || die "unsafe empty plugin target path"
  case "$path" in
    "/"|"$HOME"|"$HOME/"|*"/../"*|*".."*) die "unsafe plugin target path: $path" ;;
  esac
  case "$path" in
    "$HOME/.claude/plugins/marketplaces/$MARKETPLACE_NAME") ;;
    *) die "unexpected package root: $path" ;;
  esac
}

compute_package_sha256() {
  git -C "$TARGET" archive --format=tar HEAD | node -e '
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256");
    process.stdin.on("data", (chunk) => hash.update(chunk));
    process.stdin.on("end", () => console.log(hash.digest("hex")));
  '
}

verify_checkout_integrity() {
  if [ -n "$EXPECTED_COMMIT" ]; then
    local actual_commit
    actual_commit=$(git -C "$TARGET" rev-parse HEAD)
    [ "$actual_commit" = "$EXPECTED_COMMIT" ] || die "commit integrity mismatch: expected $EXPECTED_COMMIT got $actual_commit"
    ok "commit integrity verified: $EXPECTED_COMMIT"
  fi
  if [ -n "$EXPECTED_PACKAGE_SHA256" ]; then
    local actual_sha
    actual_sha=$(compute_package_sha256)
    [ "$actual_sha" = "$EXPECTED_PACKAGE_SHA256" ] || die "package checksum mismatch: expected $EXPECTED_PACKAGE_SHA256 got $actual_sha"
    ok "package checksum verified: $EXPECTED_PACKAGE_SHA256"
  fi
}

node_version_ge() {
  node -e '
    const min = process.argv[1].split(".").map(Number);
    const cur = process.versions.node.split(".").map(Number);
    process.exit(cur[0] > min[0] || (cur[0] === min[0] && (cur[1] > min[1] || (cur[1] === min[1] && cur[2] >= min[2]))) ? 0 : 1);
  ' "$1"
}

has_required_node_runtime() {
  command -v node >/dev/null 2>&1 || return 1
  node_version_ge "$MIN_NODE_VERSION" || return 1
  node -e 'import("node:sqlite").then((m) => process.exit(m.DatabaseSync ? 0 : 1)).catch(() => process.exit(1))' >/dev/null 2>&1
}

confirm_node_install() {
  case "${SUPERVIBE_INSTALL_NODE:-}" in
    1|true|TRUE|yes|YES|y|Y|да|ДА) return 0 ;;
    0|false|FALSE|no|NO|n|N|нет|НЕТ) return 1 ;;
  esac
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '%b[supervibe-install]%b Node.js %s+ is required for SQLite/RAG/CodeGraph. Install or upgrade Node now? [y/N] ' "$C_YELLOW" "$C_RESET" "$MIN_NODE_VERSION" > /dev/tty
    local answer
    IFS= read -r answer < /dev/tty || return 1
    case "$answer" in
      y|Y|yes|YES|да|ДА) return 0 ;;
    esac
  fi
  return 1
}

load_node_manager_env() {
  if [ -n "${NVM_DIR:-}" ] && [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
  elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    . "$NVM_DIR/nvm.sh"
  fi
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell bash)" || true
  elif [ -x "$HOME/.local/share/fnm/fnm" ]; then
    export PATH="$HOME/.local/share/fnm:$PATH"
    eval "$("$HOME/.local/share/fnm/fnm" env --shell bash)" || true
  fi
}

install_node_runtime() {
  warn "Node.js $MIN_NODE_VERSION+ with node:sqlite is required before Supervibe can install."
  warn "Current node: $(command -v node >/dev/null 2>&1 && node --version || printf 'not found')"
  if ! confirm_node_install; then
    die "Node.js $MIN_NODE_VERSION+ is required for SQLite-backed semantic RAG, CodeGraph, project memory, and full checks. Set SUPERVIBE_INSTALL_NODE=1 to allow installer bootstrap, or install Node.js manually and re-run."
  fi

  load_node_manager_env
  if command -v nvm >/dev/null 2>&1; then
    say "installing Node.js 22 via nvm"
    nvm install 22 >/dev/null
    nvm use 22 >/dev/null
  elif command -v fnm >/dev/null 2>&1; then
    say "installing Node.js 22 via fnm"
    fnm install 22
    fnm use 22
  elif command -v volta >/dev/null 2>&1; then
    say "installing Node.js 22 via Volta"
    volta install node@22
  elif command -v brew >/dev/null 2>&1; then
    say "installing Node.js via Homebrew"
    brew install node@22 || brew install node
    export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
    brew link --overwrite --force node@22 >/dev/null 2>&1 || true
  elif command -v curl >/dev/null 2>&1; then
    say "installing fnm into the user profile, then Node.js 22"
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
    export PATH="$HOME/.local/share/fnm:$PATH"
    eval "$("$HOME/.local/share/fnm/fnm" env --shell bash)"
    fnm install 22
    fnm use 22
  else
    die "No supported Node installer found. Install Node.js $MIN_NODE_VERSION+ from https://nodejs.org, then re-run."
  fi

  hash -r 2>/dev/null || true
  has_required_node_runtime || die "Node bootstrap finished, but Node.js $MIN_NODE_VERSION+ with node:sqlite is still unavailable. Restart the shell or install Node.js manually, then re-run."
  ok "node $(node --version) ok with node:sqlite"
}

ensure_node_runtime() {
  load_node_manager_env
  if has_required_node_runtime; then
    ok "node $(node --version) ok with node:sqlite"
    return
  fi
  install_node_runtime
}

# ---- preflight ----

command -v git  >/dev/null || die "git not found. Install git first."
ensure_node_runtime
command -v npm  >/dev/null || die "npm not found after Node.js setup. Reinstall Node.js $MIN_NODE_VERSION+ and re-run."

# ---- detect AI CLIs (by both directory and command in PATH) ----

CLAUDE_DIR="$HOME/.claude"
CODEX_DIR="$HOME/.codex"
GEMINI_DIR="$HOME/.gemini"

CLIS_FOUND=()
[ -d "$CLAUDE_DIR" ] && CLIS_FOUND+=("claude") || command -v claude >/dev/null 2>&1 && CLIS_FOUND+=("claude") || true
[ -d "$CODEX_DIR" ]  && CLIS_FOUND+=("codex")  || command -v codex >/dev/null 2>&1 && CLIS_FOUND+=("codex") || true
[ -d "$GEMINI_DIR" ] && CLIS_FOUND+=("gemini") || command -v gemini >/dev/null 2>&1 && CLIS_FOUND+=("gemini") || true
command -v cursor >/dev/null 2>&1     && CLIS_FOUND+=("cursor") || true
command -v copilot >/dev/null 2>&1    && CLIS_FOUND+=("copilot") || true
command -v opencode >/dev/null 2>&1   && CLIS_FOUND+=("opencode") || true

if [ ${#CLIS_FOUND[@]} -eq 0 ]; then
  warn "No AI CLI detected. Installing under ~/.claude/ — register manually in your CLI if needed."
  mkdir -p "$CLAUDE_DIR/plugins/marketplaces"
  CLIS_FOUND=("claude")
else
  ok "detected AI CLIs: ${CLIS_FOUND[*]}"
fi

# ---- clone or update the shared checkout ----

# All CLIs reference one on-disk checkout. Claude Code reads it via marketplace
# layout; Codex via symlink; Gemini via GEMINI.md @-include.
TARGET="$CLAUDE_DIR/plugins/marketplaces/$MARKETPLACE_NAME"
validate_safe_path "$TARGET"
say "plan: will install or update checkout at $TARGET"
say "plan: will modify Claude config under $CLAUDE_DIR, Codex plugin link under $CODEX_DIR, and Gemini include under $GEMINI_DIR when those CLIs are detected"
say "plan: integrity pins ref=$REF expected_commit=${EXPECTED_COMMIT:-not set} package_sha256=$([ -n "$EXPECTED_PACKAGE_SHA256" ] && printf set || printf 'not set')"

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

verify_checkout_integrity

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
  # Claude Code requires three coordinated files for a plugin to be loaded
  # AND enabled on session start. Our installer upserts each idempotently:
  #   1. ~/.claude/plugins/installed_plugins.json  → "<plugin>@<marketplace>" entry
  #   2. ~/.claude/plugins/known_marketplaces.json → marketplace metadata
  #   3. ~/.claude/settings.json                   → enabledPlugins + extraKnownMarketplaces
  # Missing #2 or #3 is what makes a "successful" install invisible in the IDE.

  local plugins_dir="$CLAUDE_DIR/plugins"
  local plugins_json="$plugins_dir/installed_plugins.json"
  local marketplaces_json="$plugins_dir/known_marketplaces.json"
  local settings_json="$CLAUDE_DIR/settings.json"
  mkdir -p "$plugins_dir"

  [ -f "$plugins_json"      ] || printf '{ "version": 2, "plugins": {} }\n' > "$plugins_json"
  [ -f "$marketplaces_json" ] || printf '{}\n'                                > "$marketplaces_json"
  [ -f "$settings_json"     ] || printf '{}\n'                                > "$settings_json"

  local commit_sha
  commit_sha=$(git -C "$TARGET" rev-parse HEAD 2>/dev/null || echo "")

  # All paths and values pass through env vars — never interpolate into JS source
  EVOLVE_PJ="$plugins_json" \
  EVOLVE_MJ="$marketplaces_json" \
  EVOLVE_SJ="$settings_json" \
  EVOLVE_KEY="$PLUGIN_NAME@$MARKETPLACE_NAME" \
  EVOLVE_MARKETPLACE="$MARKETPLACE_NAME" \
  SUPERVIBE_REPO_SLUG="${REPO_URL#https://github.com/}" \
  EVOLVE_INSTALL_PATH="$TARGET" \
  EVOLVE_VERSION="$INSTALLED_VERSION" \
  EVOLVE_COMMIT_SHA="$commit_sha" \
  node -e '
    const fs = require("fs");
    const now = new Date().toISOString();
    const repoSlug = (process.env.SUPERVIBE_REPO_SLUG || "").replace(/\.git$/, "");

    // 1. installed_plugins.json
    const pjPath = process.env.EVOLVE_PJ;
    const pjKey  = process.env.EVOLVE_KEY;
    const pj = JSON.parse(fs.readFileSync(pjPath, "utf8"));
    pj.version = pj.version || 2;
    pj.plugins = pj.plugins || {};
    const pjEntry = {
      scope: "user",
      installPath: process.env.EVOLVE_INSTALL_PATH,
      version: process.env.EVOLVE_VERSION,
      installedAt: now,
      lastUpdated: now,
    };
    if (process.env.EVOLVE_COMMIT_SHA) pjEntry.gitCommitSha = process.env.EVOLVE_COMMIT_SHA;
    const list = pj.plugins[pjKey] || [];
    const idx  = list.findIndex(e => e.scope === "user");
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], pjEntry);
    else list.push(pjEntry);
    pj.plugins[pjKey] = list;
    fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + "\n");

    // 2. known_marketplaces.json
    const mpPath = process.env.EVOLVE_MJ;
    const mpName = process.env.EVOLVE_MARKETPLACE;
    const mp = JSON.parse(fs.readFileSync(mpPath, "utf8"));
    mp[mpName] = {
      source: { source: "github", repo: repoSlug },
      installLocation: process.env.EVOLVE_INSTALL_PATH,
      lastUpdated: now,
      autoUpdate: true,
    };
    fs.writeFileSync(mpPath, JSON.stringify(mp, null, 2) + "\n");

    // 3. settings.json — enabledPlugins + extraKnownMarketplaces
    const sjPath = process.env.EVOLVE_SJ;
    const sj = JSON.parse(fs.readFileSync(sjPath, "utf8"));
    sj.enabledPlugins = sj.enabledPlugins || {};
    sj.enabledPlugins[pjKey] = true;
    sj.extraKnownMarketplaces = sj.extraKnownMarketplaces || {};
    sj.extraKnownMarketplaces[mpName] = {
      source: { source: "github", repo: repoSlug },
      autoUpdate: true,
    };
    fs.writeFileSync(sjPath, JSON.stringify(sj, null, 2) + "\n");
  '
  ok "registered with Claude Code: installed_plugins + known_marketplaces + settings.enabledPlugins"
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
  local marker="<!-- supervibe-plugin-include: do-not-edit -->"
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
${C_GREEN}  Supervibe v$INSTALLED_VERSION installed${C_RESET}
${C_GREEN}=================================================================${C_RESET}

  Location:    $TARGET
  CLIs wired:  ${CLIS_FOUND[*]}
  Runtime:     Node $(node --version) with node:sqlite

  Next steps:
    1. Restart your AI CLI so it picks up the plugin
    2. Open any project — you should see [supervibe] banner lines on session start
    3. /supervibe-genesis (in Claude Code) for first-time project scaffolding
    4. npm run supervibe:status (from $TARGET) for index health any time

  Upgrade:     curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash
  Manual:      cd "$TARGET" && npm run supervibe:upgrade
  Uninstall:   rm -rf "$TARGET" + remove "$PLUGIN_NAME@$MARKETPLACE_NAME" from
               ~/.claude/plugins/installed_plugins.json

  Docs: https://github.com/vTRKA/supervibe#readme
EOF
