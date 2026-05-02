#!/usr/bin/env bash
# Supervibe universal installer - macOS + Linux.
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
# What it does (idempotent - safe to re-run):
#   1. Detects which AI CLIs are installed (Claude Code, Codex, Gemini)
#   2. Clones the Supervibe repo (LFS smudge disabled so clone cannot hang)
#   3. Ensures Node.js 22.5+ (prompted install/upgrade with user consent if needed)
#   4. Restores known installer-managed drift and cleans stale files before reinstalling
#   5. Downloads the required ONNX embedding model before registration
#   6. Runs npm ci + registry build + install lifecycle audit
#   7. Registers the plugin in every detected CLI:
#        - Claude:  ~/.claude/plugins/installed_plugins.json (idempotent JSON upsert)
#        - Codex:   ~/.codex/plugins/cache/supervibe-marketplace/supervibe/local
#                   ~/.codex/config.toml [plugins."supervibe@supervibe-marketplace"]
#                   ~/.codex/plugins/supervibe  (legacy symlink for older Codex builds)
#                   ~/.agents/skills/supervibe  (native skill discovery for Codex/Zed ACP)
#        - Gemini:  ~/.gemini/GEMINI.md      (idempotent include via marker)
#   8. Runs install lifecycle doctor and prints next steps

set -euo pipefail

REPO_URL="${SUPERVIBE_REPO:-https://github.com/vTRKA/supervibe.git}"
REF="${SUPERVIBE_REF:-main}"
EXPECTED_COMMIT="${SUPERVIBE_EXPECTED_COMMIT:-}"
EXPECTED_PACKAGE_SHA256="${SUPERVIBE_EXPECTED_PACKAGE_SHA256:-}"
PLUGIN_NAME="supervibe"
MARKETPLACE_NAME="supervibe-marketplace"
MIN_NODE_VERSION="22.5.0"
INSTALLER_MANAGED_MODEL_PATH="models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx"
LOG_DIR="${TMPDIR:-/tmp}/supervibe-install.$$"
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

is_wsl() {
  [ -r /proc/version ] && grep -qiE 'microsoft|wsl' /proc/version
}

guard_wsl_windows_install() {
  if ! is_wsl; then return; fi
  if [ "${SUPERVIBE_ALLOW_WSL_INSTALL:-}" = "1" ]; then
    warn "WSL install explicitly allowed by SUPERVIBE_ALLOW_WSL_INSTALL=1"
    return
  fi
  die "WSL detected. This installer would use WSL HOME=$HOME and WSL Node, not your Windows Codex/Claude/Gemini profile. For Windows install, run PowerShell: irm https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1 | iex. To intentionally install inside WSL, set SUPERVIBE_ALLOW_WSL_INSTALL=1."
}

git_no_lfs_smudge() {
  GIT_LFS_SKIP_SMUDGE=1 git \
    -c filter.lfs.smudge= \
    -c filter.lfs.required=false \
    "$@"
}

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

ensure_required_onnx_model() {
  say "ensuring required ONNX embedding model (log: $LOG_DIR/onnx-model.log)"
  ( cd "$TARGET" && node scripts/ensure-onnx-model.mjs >"$LOG_DIR/onnx-model.log" 2>&1 ) || {
    echo "--- last 80 lines of ONNX model setup ---" >&2
    tail -n 80 "$LOG_DIR/onnx-model.log" >&2
    die "required ONNX model setup failed. Check Git LFS or network access to HuggingFace, then re-run."
  }
  ok "required ONNX embedding model is ready"
}

restore_installer_managed_tracked_edits() {
  local root="$1"
  local status="$2"
  local line path
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in "?? "*) continue ;; esac
    path="${line#???}"
    case "$path" in *" -> "*) path="${path##* -> }" ;; esac
    case "$path" in
      "package-lock.json"|"$INSTALLER_MANAGED_MODEL_PATH")
        warn "restoring installer-managed tracked artifact: $path"
        git_no_lfs_smudge -C "$root" checkout -- "$path" >/dev/null 2>>"$LOG_DIR/restore-managed-artifacts.log" || {
          cat "$LOG_DIR/restore-managed-artifacts.log" >&2
          die "failed to restore installer-managed tracked artifact: $path"
        }
        ;;
    esac
  done <<EOF
$status
EOF
}

clean_managed_checkout() {
  local root="$1"
  local status tracked_dirty untracked_count
  status=$(git -C "$root" status --porcelain 2>/dev/null || true)
  restore_installer_managed_tracked_edits "$root" "$status"
  status=$(git -C "$root" status --porcelain 2>/dev/null || true)
  tracked_dirty=$(printf '%s\n' "$status" | grep -v -E '^\?\? ' | sed '/^$/d' || true)
  if [ -n "$tracked_dirty" ]; then
    printf '%s\n' "$tracked_dirty" >&2
    die "user-owned tracked local edits in $root; commit/stash them before reinstalling. Installer-managed artifacts are restored automatically, and untracked stale files are cleaned automatically."
  fi
  untracked_count=$(printf '%s\n' "$status" | grep -c -E '^\?\? ' || true)
  if [ "$untracked_count" -gt 0 ]; then
    warn "removing $untracked_count untracked stale file(s) from managed plugin checkout"
  fi
  say "cleaning managed checkout (git clean -ffdx)"
  git -C "$root" clean -ffdx >/dev/null 2>"$LOG_DIR/git-clean.log" || {
    cat "$LOG_DIR/git-clean.log" >&2
    die "git clean failed. Inspect: $root"
  }
  assert_checkout_mirror_clean "$root" "pre-update cleanup"
}

assert_checkout_mirror_clean() {
  local root="$1"
  local stage="$2"
  local status
  if ! status=$(git -C "$root" status --porcelain --untracked-files=all 2>"$LOG_DIR/git-status-mirror.log"); then
    cat "$LOG_DIR/git-status-mirror.log" >&2
    die "git status failed while checking managed checkout mirror after $stage."
  fi
  status=$(printf '%s\n' "$status" | sed '/^$/d' || true)
  if [ -n "$status" ]; then
    printf '%s\n' "$status" >&2
    die "managed checkout is not a clean mirror after $stage; stale files may remain active."
  fi
}

quarantine_non_git_target() {
  local root="$1"
  local stamp backup_dir backup
  stamp=$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || date +%Y%m%dT%H%M%S)
  backup_dir="$ANTHROPIC_CONFIG_DIR/plugins/.supervibe-install-backups"
  backup="$backup_dir/$MARKETPLACE_NAME.non-git.$stamp"
  mkdir -p "$backup_dir"
  warn "found non-git plugin target at $root; moving it aside before clean reinstall"
  mv "$root" "$backup" || die "failed to move non-git target to $backup"
  ok "old non-git target quarantined at $backup"
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
    1|true|TRUE|yes|YES|y|Y) return 0 ;;
    0|false|FALSE|no|NO|n|N) return 1 ;;
  esac
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '%b[supervibe-install]%b Node.js %s+ is required for SQLite/RAG/CodeGraph. Install or upgrade Node now? [y/N] ' "$C_YELLOW" "$C_RESET" "$MIN_NODE_VERSION" > /dev/tty
    local answer
    IFS= read -r answer < /dev/tty || return 1
    case "$answer" in
      y|Y|yes|YES) return 0 ;;
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
    die "Node.js $MIN_NODE_VERSION+ is required for SQLite-backed semantic RAG, CodeGraph, and project memory. Set SUPERVIBE_INSTALL_NODE=1 to allow installer bootstrap, or install Node.js manually and re-run."
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

guard_wsl_windows_install
command -v git  >/dev/null || die "git not found. Install git first."
ensure_node_runtime
command -v npm  >/dev/null || die "npm not found after Node.js setup. Reinstall Node.js $MIN_NODE_VERSION+ and re-run."

# ---- detect AI CLIs (by both directory and command in PATH) ----

ANTHROPIC_CONFIG_DIR="$HOME/.claude"
CODEX_DIR="$HOME/.codex"
GEMINI_DIR="$HOME/.gemini"

CLIS_FOUND=()
[ -d "$ANTHROPIC_CONFIG_DIR" ] && CLIS_FOUND+=("claude") || command -v claude >/dev/null 2>&1 && CLIS_FOUND+=("claude") || true
[ -d "$CODEX_DIR" ]  && CLIS_FOUND+=("codex")  || command -v codex >/dev/null 2>&1 && CLIS_FOUND+=("codex") || true
[ -d "$GEMINI_DIR" ] && CLIS_FOUND+=("gemini") || command -v gemini >/dev/null 2>&1 && CLIS_FOUND+=("gemini") || true
command -v cursor >/dev/null 2>&1     && CLIS_FOUND+=("cursor") || true
command -v copilot >/dev/null 2>&1    && CLIS_FOUND+=("copilot") || true
command -v opencode >/dev/null 2>&1   && CLIS_FOUND+=("opencode") || true

if [ ${#CLIS_FOUND[@]} -eq 0 ]; then
  warn "No AI CLI detected. Installing under ~/.claude/ - register manually in your CLI if needed."
  mkdir -p "$ANTHROPIC_CONFIG_DIR/plugins/marketplaces"
  CLIS_FOUND=("claude")
else
  ok "detected AI CLIs: ${CLIS_FOUND[*]}"
fi

# ---- clone or update the shared checkout ----

# All CLIs reference one on-disk checkout. Claude Code reads it via marketplace
# layout; Codex via symlink; Gemini via GEMINI.md @-include.
TARGET="$ANTHROPIC_CONFIG_DIR/plugins/marketplaces/$MARKETPLACE_NAME"
validate_safe_path "$TARGET"
say "plan: will install or update checkout at $TARGET"
say "plan: will modify Claude config under $ANTHROPIC_CONFIG_DIR, Codex plugin cache/config + native skill links under $CODEX_DIR and ~/.agents, and Gemini include under $GEMINI_DIR when those CLIs are detected"
say "plan: integrity pins ref=$REF expected_commit=${EXPECTED_COMMIT:-not set} package_sha256=$([ -n "$EXPECTED_PACKAGE_SHA256" ] && printf set || printf 'not set')"

if [ -d "$TARGET/.git" ]; then
  clean_managed_checkout "$TARGET"
  say "found existing checkout at $TARGET - updating to $REF"
  if ! git_no_lfs_smudge -C "$TARGET" fetch --tags --prune --quiet 2>"$LOG_DIR/fetch.log"; then
    cat "$LOG_DIR/fetch.log" >&2
    die "git fetch failed. Inspect: $TARGET"
  fi
  git_no_lfs_smudge -C "$TARGET" checkout --quiet "$REF" 2>"$LOG_DIR/checkout.log" || {
    cat "$LOG_DIR/checkout.log" >&2
    die "git checkout $REF failed. Make sure the ref exists upstream."
  }
  if ! git_no_lfs_smudge -C "$TARGET" pull --ff-only --quiet 2>"$LOG_DIR/pull.log"; then
    warn "pull --ff-only failed (local diverged or detached head); leaving checkout at current commit"
  fi
  assert_checkout_mirror_clean "$TARGET" "checkout update"
else
  say "cloning $REPO_URL ($REF) -> $TARGET"
  if [ -e "$TARGET" ]; then
    quarantine_non_git_target "$TARGET"
  fi
  mkdir -p "$(dirname "$TARGET")"
  git_no_lfs_smudge clone --quiet "$REPO_URL" "$TARGET" 2>"$LOG_DIR/clone.log" || {
    cat "$LOG_DIR/clone.log" >&2
    die "git clone failed. Check network / repo access."
  }
  git_no_lfs_smudge -C "$TARGET" checkout --quiet "$REF" 2>"$LOG_DIR/checkout.log" || {
    cat "$LOG_DIR/checkout.log" >&2
    die "git checkout $REF failed inside fresh clone."
  }
  assert_checkout_mirror_clean "$TARGET" "fresh clone"
fi

verify_checkout_integrity

ensure_required_onnx_model

# ---- install deps + generated registry ----

say "running npm ci (logs at $LOG_DIR/npm-ci.log)"
( cd "$TARGET" && npm ci --no-audit --no-fund >"$LOG_DIR/npm-ci.log" 2>&1 ) || {
  echo "--- last 40 lines of npm ci ---" >&2
  tail -n 40 "$LOG_DIR/npm-ci.log" >&2
  die "npm ci failed. Full log: $LOG_DIR/npm-ci.log"
}

say "running npm run registry:build"
( cd "$TARGET" && npm run registry:build >"$LOG_DIR/npm-registry-build.log" 2>&1 ) || {
  echo "--- last 40 lines of npm run registry:build ---" >&2
  tail -n 40 "$LOG_DIR/npm-registry-build.log" >&2
  die "npm run registry:build failed. Full log: $LOG_DIR/npm-registry-build.log"
}

ok "install preparation passed"

ensure_unix_bin_links() {
  say "linking macOS/Linux terminal commands (log: $LOG_DIR/unix-bin-links.log)"
  if ( cd "$TARGET" && node scripts/install-unix-bin-links.mjs --plugin-root "$TARGET" >"$LOG_DIR/unix-bin-links.log" 2>&1 ); then
    ok "terminal commands linked (supervibe, supervibe-adapt, supervibe-status, ...)"
    if grep -q 'PATH_READY: false' "$LOG_DIR/unix-bin-links.log"; then
      warn "terminal commands were linked under ${SUPERVIBE_BIN_DIR:-$HOME/.local/bin}, but that directory is not on PATH yet. Add: export PATH=\"${SUPERVIBE_BIN_DIR:-$HOME/.local/bin}:\$PATH\""
    fi
  else
    warn "terminal command linking needs attention; slash commands still work in the AI CLI"
    tail -n 80 "$LOG_DIR/unix-bin-links.log" >&2 || true
  fi
}

ensure_unix_bin_links

# Capture installed version (env-var approach avoids quote injection in path)
INSTALLED_VERSION=$(SUPERVIBE_TARGET="$TARGET" node -e \
  'console.log(require(process.env.SUPERVIBE_TARGET + "/.claude-plugin/plugin.json").version)')

# ---- register with each detected CLI ----

REGISTERED_HOSTS=()

register_claude() {
  # Claude Code requires three coordinated files for a plugin to be loaded
  # AND enabled on session start. Our installer upserts each idempotently:
  #   1. ~/.claude/plugins/installed_plugins.json  -> "<plugin>@<marketplace>" entry
  #   2. ~/.claude/plugins/known_marketplaces.json -> marketplace metadata
  #   3. host settings JSON                        -> enabledPlugins + extraKnownMarketplaces
  # Missing #2 or #3 is what makes a "successful" install invisible in the IDE.

  local plugins_dir="$ANTHROPIC_CONFIG_DIR/plugins"
  local plugins_json="$plugins_dir/installed_plugins.json"
  local marketplaces_json="$plugins_dir/known_marketplaces.json"
  local settings_json="$ANTHROPIC_CONFIG_DIR/settings.json"
  mkdir -p "$plugins_dir"

  [ -f "$plugins_json"      ] || printf '{ "version": 2, "plugins": {} }\n' > "$plugins_json"
  [ -f "$marketplaces_json" ] || printf '{}\n'                                > "$marketplaces_json"
  [ -f "$settings_json"     ] || printf '{}\n'                                > "$settings_json"

  local commit_sha
  commit_sha=$(git -C "$TARGET" rev-parse HEAD 2>/dev/null || echo "")

  # All paths and values pass through env vars - never interpolate into JS source
  SUPERVIBE_PJ="$plugins_json" \
  SUPERVIBE_MJ="$marketplaces_json" \
  SUPERVIBE_SJ="$settings_json" \
  SUPERVIBE_KEY="$PLUGIN_NAME@$MARKETPLACE_NAME" \
  SUPERVIBE_MARKETPLACE="$MARKETPLACE_NAME" \
  SUPERVIBE_REPO_SLUG="${REPO_URL#https://github.com/}" \
  SUPERVIBE_INSTALL_PATH="$TARGET" \
  SUPERVIBE_VERSION="$INSTALLED_VERSION" \
  SUPERVIBE_COMMIT_SHA="$commit_sha" \
  node -e '
    const fs = require("fs");
    const now = new Date().toISOString();
    const repoSlug = (process.env.SUPERVIBE_REPO_SLUG || "").replace(/\.git$/, "");

    // 1. installed_plugins.json
    const pjPath = process.env.SUPERVIBE_PJ;
    const pjKey  = process.env.SUPERVIBE_KEY;
    const pj = JSON.parse(fs.readFileSync(pjPath, "utf8"));
    pj.version = pj.version || 2;
    pj.plugins = pj.plugins || {};
    const pjEntry = {
      scope: "user",
      installPath: process.env.SUPERVIBE_INSTALL_PATH,
      version: process.env.SUPERVIBE_VERSION,
      installedAt: now,
      lastUpdated: now,
    };
    if (process.env.SUPERVIBE_COMMIT_SHA) pjEntry.gitCommitSha = process.env.SUPERVIBE_COMMIT_SHA;
    const list = pj.plugins[pjKey] || [];
    const idx  = list.findIndex(e => e.scope === "user");
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], pjEntry);
    else list.push(pjEntry);
    pj.plugins[pjKey] = list;
    fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + "\n");

    // 2. known_marketplaces.json
    const mpPath = process.env.SUPERVIBE_MJ;
    const mpName = process.env.SUPERVIBE_MARKETPLACE;
    const mp = JSON.parse(fs.readFileSync(mpPath, "utf8"));
    mp[mpName] = {
      source: { source: "github", repo: repoSlug },
      installLocation: process.env.SUPERVIBE_INSTALL_PATH,
      lastUpdated: now,
      autoUpdate: true,
    };
    fs.writeFileSync(mpPath, JSON.stringify(mp, null, 2) + "\n");

    // 3. settings.json - enabledPlugins + extraKnownMarketplaces
    const sjPath = process.env.SUPERVIBE_SJ;
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

  # Legacy compatibility path used by older Codex builds and external-agent wrappers.
  if [ -L "$link" ] || [ -e "$link" ]; then
    rm -rf "$link"
  fi
  ln -s "$TARGET" "$link"

  # Native Codex plugin store path. Current Codex reads enabled plugins from
  # ~/.codex/config.toml and resolves them under plugins/cache/<marketplace>/<name>/<version>.
  local codex_cache_parent="$CODEX_DIR/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME"
  mkdir -p "$codex_cache_parent"
  local cache_link="$codex_cache_parent/local"
  if [ -L "$cache_link" ] || [ -e "$cache_link" ]; then
    rm -rf "$cache_link"
  fi
  ln -s "$TARGET" "$cache_link"

  local codex_config="$CODEX_DIR/config.toml"
  SUPERVIBE_CODEX_CONFIG="$codex_config" \
  SUPERVIBE_CODEX_PLUGIN_KEY="$PLUGIN_NAME@$MARKETPLACE_NAME" \
  node -e '
    const fs = require("fs");
    const configPath = process.env.SUPERVIBE_CODEX_CONFIG;
    const pluginKey = process.env.SUPERVIBE_CODEX_PLUGIN_KEY;
    const pluginHeader = `[plugins."${pluginKey}"]`;

    function escapeRegExp(value) {
      return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function upsertSectionSetting(text, sectionHeader, settingKey, settingLine) {
      const headerRe = new RegExp(`^${escapeRegExp(sectionHeader)}[ \t]*$`, "m");
      const match = headerRe.exec(text);
      if (!match) {
        return `${text.trimEnd()}\n\n${sectionHeader}\n${settingLine}\n`;
      }
      const bodyStart = match.index + match[0].length;
      const rest = text.slice(bodyStart);
      const nextRel = rest.search(/^\s*\[/m);
      const bodyEnd = nextRel === -1 ? text.length : bodyStart + nextRel;
      let body = text.slice(bodyStart, bodyEnd);
      const settingRe = new RegExp(`^\\s*${escapeRegExp(settingKey)}\\s*=.*$`, "m");
      if (settingRe.test(body)) {
        body = body.replace(settingRe, settingLine);
      } else {
        body = body.endsWith("\n") || body === "" ? `${body}${settingLine}\n` : `${body}\n${settingLine}\n`;
      }
      return text.slice(0, bodyStart) + body + text.slice(bodyEnd);
    }

    let text = "";
    try {
      text = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    text = upsertSectionSetting(text, "[features]", "plugins", "plugins = true");
    text = upsertSectionSetting(text, pluginHeader, "enabled", "enabled = true");
    fs.writeFileSync(configPath, `${text.trimEnd()}\n`);
  '

  local agents_skills="$HOME/.agents/skills"
  mkdir -p "$agents_skills"
  local skill_link="$agents_skills/$PLUGIN_NAME"
  if [ -L "$skill_link" ] || [ -e "$skill_link" ]; then
    rm -rf "$skill_link"
  fi
  ln -s "$TARGET/skills" "$skill_link"
  ok "registered with Codex CLI (cache: $cache_link -> $TARGET; config: $codex_config; legacy plugin: $link -> $TARGET; skills: $skill_link -> $TARGET/skills)"
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
    claude) register_claude; REGISTERED_HOSTS+=("claude") ;;
    codex)  register_codex;  REGISTERED_HOSTS+=("codex")  ;;
    gemini) register_gemini; REGISTERED_HOSTS+=("gemini") ;;
  esac
done

say "running install lifecycle doctor"
( cd "$TARGET" && SUPERVIBE_INSTALL_HOSTS="${REGISTERED_HOSTS[*]}" npm run supervibe:install-doctor >"$LOG_DIR/install-doctor.log" 2>&1 ) || {
  echo "--- install lifecycle doctor ---" >&2
  tail -n 80 "$LOG_DIR/install-doctor.log" >&2
  die "install lifecycle doctor failed. Full log: $LOG_DIR/install-doctor.log"
}
ok "install lifecycle doctor passed"

# ---- final report ----

cat <<EOF

${C_GREEN}=================================================================${C_RESET}
${C_GREEN}  Supervibe v$INSTALLED_VERSION installed${C_RESET}
${C_GREEN}=================================================================${C_RESET}

  Location:    $TARGET
  CLIs wired:  ${CLIS_FOUND[*]}
  Runtime:     Node $(node --version) with node:sqlite
  Terminal:    ${SUPERVIBE_BIN_DIR:-$HOME/.local/bin}/supervibe-adapt (macOS/Linux, no leading slash)
  Install audit: .supervibe/audits/install-lifecycle/latest.json

  Next steps:
    1. Restart your AI CLI so it picks up the plugin
    2. Open any project - you should see [supervibe] banner lines on session start
    3. /supervibe-genesis (in Claude Code) for first-time project scaffolding
    4. npm run supervibe:status (from $TARGET) for index health any time

  Upgrade:     curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash
  Manual:      cd "$TARGET" && npm run supervibe:upgrade
  Uninstall:   rm -rf "$TARGET" + remove "$PLUGIN_NAME@$MARKETPLACE_NAME" from
               ~/.claude/plugins/installed_plugins.json

  Docs: https://github.com/vTRKA/supervibe#readme
EOF
