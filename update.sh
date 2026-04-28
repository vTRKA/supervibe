#!/usr/bin/env bash
# Evolve standalone updater — macOS + Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/update.sh | bash
#
# What it does:
#   1. Finds the existing plugin checkout (default: ~/.claude/plugins/marketplaces/evolve-marketplace)
#   2. Refuses to clobber local edits (uncommitted changes → stop)
#   3. Delegates to `npm run supervibe:upgrade` inside the checkout, which does
#      git fetch → ff-only pull → lfs pull (if available) → npm install →
#      npm run check → refresh upstream-check cache
#
# To install for the first time, use install.sh instead — this script does
# not bootstrap a missing install (by design: update should be predictable,
# install needs CLI registration).

set -euo pipefail

PLUGIN_ROOT_DEFAULT="$HOME/.claude/plugins/marketplaces/evolve-marketplace"
PLUGIN_ROOT="${SUPERVIBE_PLUGIN_ROOT:-$PLUGIN_ROOT_DEFAULT}"

if [ -t 1 ]; then
  C_BLUE='\033[0;34m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[0;33m'; C_RED='\033[0;31m'; C_RESET='\033[0m'
else
  C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_RESET=''
fi
say() { printf '%b[evolve-update]%b %s\n' "$C_BLUE"   "$C_RESET" "$*"; }
ok()  { printf '%b[evolve-update]%b %s\n' "$C_GREEN"  "$C_RESET" "$*"; }
warn(){ printf '%b[evolve-update]%b %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
die() { printf '%b[evolve-update]%b %s\n' "$C_RED"    "$C_RESET" "$*" >&2; exit 1; }

# ---- preflight ----

command -v git  >/dev/null || die "git not found."
command -v node >/dev/null || die "node not found. Install Node.js 22+ (https://nodejs.org)."
command -v npm  >/dev/null || die "npm not found."

# ---- locate install ----

if [ ! -d "$PLUGIN_ROOT/.git" ]; then
  cat >&2 <<EOF
${C_RED}[evolve-update]${C_RESET} no Evolve install found at $PLUGIN_ROOT

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

ok "done. Restart your AI CLI to pick up the new plugin code."
ok "if any project has .claude/ overrides, run /evolve-adapt inside that project."
