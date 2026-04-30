#!/usr/bin/env bash
# Evolve standalone updater — macOS + Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/update.sh | bash
#
# What it does:
#   1. Finds the existing plugin checkout (default: ~/.claude/plugins/marketplaces/supervibe-marketplace)
#   2. Refuses to clobber local edits (uncommitted changes → stop)
#   3. Delegates to `npm run supervibe:upgrade` inside the checkout, which does
#      git fetch → ff-only pull → lfs pull (if available) → npm install →
#      npm run check → refresh upstream-check cache
#
# To install for the first time, use install.sh instead — this script does
# not bootstrap a missing install (by design: update should be predictable,
# install needs CLI registration).

set -euo pipefail

PLUGIN_ROOT_DEFAULT="$HOME/.claude/plugins/marketplaces/supervibe-marketplace"
PLUGIN_ROOT="${SUPERVIBE_PLUGIN_ROOT:-$PLUGIN_ROOT_DEFAULT}"
EXPECTED_COMMIT="${SUPERVIBE_EXPECTED_COMMIT:-}"
EXPECTED_PACKAGE_SHA256="${SUPERVIBE_EXPECTED_PACKAGE_SHA256:-}"
MIN_NODE_VERSION="22.5.0"

if [ -t 1 ]; then
  C_BLUE='\033[0;34m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[0;33m'; C_RED='\033[0;31m'; C_RESET='\033[0m'
else
  C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_RESET=''
fi
say() { printf '%b[evolve-update]%b %s\n' "$C_BLUE"   "$C_RESET" "$*"; }
ok()  { printf '%b[evolve-update]%b %s\n' "$C_GREEN"  "$C_RESET" "$*"; }
warn(){ printf '%b[evolve-update]%b %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
die() { printf '%b[evolve-update]%b %s\n' "$C_RED"    "$C_RESET" "$*" >&2; exit 1; }

validate_safe_path() {
  local path="$1"
  [ -n "$path" ] || die "unsafe empty plugin root"
  case "$path" in
    "/"|"$HOME"|"$HOME/"|*"/../"*|*".."*) die "unsafe plugin root: $path" ;;
  esac
}

compute_package_sha256() {
  git -C "$PLUGIN_ROOT" archive --format=tar HEAD | node -e '
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256");
    process.stdin.on("data", (chunk) => hash.update(chunk));
    process.stdin.on("end", () => console.log(hash.digest("hex")));
  '
}

verify_checkout_integrity() {
  if [ -n "$EXPECTED_COMMIT" ]; then
    local actual_commit
    actual_commit=$(git -C "$PLUGIN_ROOT" rev-parse HEAD)
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
    printf '%b[evolve-update]%b Node.js %s+ is required for SQLite/RAG/CodeGraph. Install or upgrade Node now? [y/N] ' "$C_YELLOW" "$C_RESET" "$MIN_NODE_VERSION" > /dev/tty
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
  warn "Node.js $MIN_NODE_VERSION+ with node:sqlite is required before Supervibe can update."
  warn "Current node: $(command -v node >/dev/null 2>&1 && node --version || printf 'not found')"
  if ! confirm_node_install; then
    die "Node.js $MIN_NODE_VERSION+ is required for SQLite-backed semantic RAG, CodeGraph, project memory, and full checks. Set SUPERVIBE_INSTALL_NODE=1 to allow updater bootstrap, or install Node.js manually and re-run."
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

command -v git  >/dev/null || die "git not found."
ensure_node_runtime
command -v npm  >/dev/null || die "npm not found after Node.js setup. Reinstall Node.js $MIN_NODE_VERSION+ and re-run."
validate_safe_path "$PLUGIN_ROOT"
say "plan: will update existing checkout at $PLUGIN_ROOT and will not modify local edits"
say "plan: integrity pins expected_commit=${EXPECTED_COMMIT:-not set} package_sha256=$([ -n "$EXPECTED_PACKAGE_SHA256" ] && printf set || printf 'not set')"

# ---- locate install ----

if [ ! -d "$PLUGIN_ROOT/.git" ]; then
  cat >&2 <<EOF
${C_RED}[evolve-update]${C_RESET} no Supervibe install found at $PLUGIN_ROOT

If this is your first install, run:
  curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash

If your plugin lives elsewhere, point the updater at it:
  SUPERVIBE_PLUGIN_ROOT=/path/to/evolve curl -fsSL .../update.sh | bash
EOF
  exit 1
fi
ok "found checkout at $PLUGIN_ROOT"

# ---- safety: refuse to clobber local edits ----

dirty=$(git -C "$PLUGIN_ROOT" status --porcelain 2>/dev/null | head -n 5)
if [ -n "$dirty" ]; then
  echo "$dirty" >&2
  die "uncommitted changes in $PLUGIN_ROOT — commit or stash before updating."
fi

# ---- delegate to npm run supervibe:upgrade ----

say "running npm run supervibe:upgrade (does fetch + pull --ff-only + lfs pull + install + tests)"
( cd "$PLUGIN_ROOT" && npm run supervibe:upgrade ) || die "upgrade failed; see output above."
verify_checkout_integrity

ok "done. Restart your AI CLI to pick up the new plugin code."
ok "if any project has .claude/ overrides, run /evolve-adapt inside that project."
