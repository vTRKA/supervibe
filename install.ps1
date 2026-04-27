# Evolve universal installer — Windows.
#
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/vTRKA/evolve-agent/main/install.ps1 | iex
#
# Override defaults:
#   $env:EVOLVE_REF = "v1.7.0"           # tag, branch, or commit
#   $env:EVOLVE_REPO = "git@github.com:my-fork/evolve.git"
#
# Idempotent — safe to re-run for upgrades.

$ErrorActionPreference = 'Stop'

$RepoUrl         = if ($env:EVOLVE_REPO) { $env:EVOLVE_REPO } else { 'https://github.com/vTRKA/evolve-agent.git' }
$Ref             = if ($env:EVOLVE_REF)  { $env:EVOLVE_REF }  else { 'main' }
$PluginName      = 'evolve'
$MarketplaceName = 'evolve-marketplace'

$LogDir = Join-Path $env:TEMP "evolve-install.$PID"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
trap { Remove-Item -Recurse -Force $LogDir -ErrorAction SilentlyContinue; break }

function Say  { param($m) Write-Host "[evolve-install] $m" -ForegroundColor Cyan }
function Ok   { param($m) Write-Host "[evolve-install] $m" -ForegroundColor Green }
function Warn { param($m) Write-Host "[evolve-install] $m" -ForegroundColor Yellow }
function Die  { param($m) Write-Host "[evolve-install] $m" -ForegroundColor Red; exit 1 }

# ---- preflight ----

if (-not (Get-Command git  -ErrorAction SilentlyContinue)) { Die 'git not found. Install git first.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Die 'node not found. Install Node.js 22+ (https://nodejs.org).' }
if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { Die 'npm not found. Comes with Node.js.' }

$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 22) {
  Die "Node.js 22+ required (you have $(node --version)). Upgrade: https://nodejs.org"
}
Ok "node $(node --version) ok"

# ---- detect AI CLIs ----

$ClaudeDir = Join-Path $HOME '.claude'
$CodexDir  = Join-Path $HOME '.codex'
$GeminiDir = Join-Path $HOME '.gemini'

$ClisFound = @()
if (Test-Path $ClaudeDir) { $ClisFound += 'claude' }
if (Test-Path $CodexDir)  { $ClisFound += 'codex'  }
if (Test-Path $GeminiDir) { $ClisFound += 'gemini' }

if ($ClisFound.Count -eq 0) {
  Warn 'No AI CLI directory detected (~/.claude, ~/.codex, ~/.gemini).'
  Warn 'Installing under ~/.claude/ — register manually if you use a different CLI.'
  New-Item -ItemType Directory -Force -Path (Join-Path $ClaudeDir 'plugins\marketplaces') | Out-Null
  $ClisFound = @('claude')
} else {
  Ok "detected AI CLIs: $($ClisFound -join ', ')"
}

# ---- clone or update the shared checkout ----

$Target = Join-Path $ClaudeDir "plugins\marketplaces\$MarketplaceName"

function Run-Git {
  param([string[]]$Args, [string]$LogName, [switch]$AllowFail)
  $log = Join-Path $LogDir "$LogName.log"
  & git @Args 2>&1 | Tee-Object -FilePath $log | Out-Null
  if ($LASTEXITCODE -ne 0 -and -not $AllowFail) {
    Get-Content $log | Write-Host
    Die "git $($Args -join ' ') failed. Log: $log"
  }
  return ($LASTEXITCODE -eq 0)
}

if (Test-Path (Join-Path $Target '.git')) {
  Say "found existing checkout at $Target — updating to $Ref"
  Run-Git @('-C', $Target, 'fetch', '--tags', '--prune', '--quiet') 'fetch'
  Run-Git @('-C', $Target, 'checkout', '--quiet', $Ref) 'checkout'
  if (-not (Run-Git @('-C', $Target, 'pull', '--ff-only', '--quiet') 'pull' -AllowFail)) {
    Warn 'pull --ff-only failed (local diverged or detached head); leaving checkout at current commit'
  }
} else {
  Say "cloning $RepoUrl ($Ref) -> $Target"
  New-Item -ItemType Directory -Force -Path (Split-Path $Target -Parent) | Out-Null
  Run-Git @('clone', '--quiet', $RepoUrl, $Target) 'clone'
  Run-Git @('-C', $Target, 'checkout', '--quiet', $Ref) 'checkout'
}

# Optional LFS pull
if (Get-Command git-lfs -ErrorAction SilentlyContinue) {
  Say 'git-lfs detected — pulling embedding model'
  if (-not (Run-Git @('-C', $Target, 'lfs', 'pull') 'lfs' -AllowFail)) {
    Warn 'git lfs pull failed; model will lazy-fetch from HuggingFace on first use'
  }
} else {
  Warn 'git-lfs not installed; embedding model will lazy-fetch from HuggingFace (~118 MB on first semantic search)'
}

# ---- install deps + verify ----

function Run-NpmStep {
  param([string]$ScriptName, [string[]]$NpmArgs)
  $log = Join-Path $LogDir "$ScriptName.log"
  Say "running $ScriptName (log: $log)"
  Push-Location $Target
  try {
    & npm @NpmArgs *>&1 | Tee-Object -FilePath $log | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host '--- last 40 lines ---'
      Get-Content $log -Tail 40 | Write-Host
      Die "$ScriptName failed. Full log: $log"
    }
  } finally {
    Pop-Location
  }
}

Run-NpmStep 'npm install' @('install', '--no-audit', '--no-fund')
Run-NpmStep 'npm run check' @('run', 'check')
Ok 'all checks passed'

$InstalledVersion = (Get-Content (Join-Path $Target '.claude-plugin\plugin.json') -Raw | ConvertFrom-Json).version

# ---- register with each detected CLI ----

function Register-Claude {
  $pluginsJson = Join-Path $ClaudeDir 'plugins\installed_plugins.json'
  New-Item -ItemType Directory -Force -Path (Split-Path $pluginsJson -Parent) | Out-Null

  if (-not (Test-Path $pluginsJson)) {
    Set-Content -Path $pluginsJson -Value '{ "version": 2, "plugins": {} }' -Encoding UTF8
  }

  $key = "$PluginName@$MarketplaceName"

  # Pass paths via env vars so we never inject them into JS source — handles
  # paths with quotes, backslashes, spaces, unicode safely.
  $env:EVOLVE_PJ = $pluginsJson
  $env:EVOLVE_KEY = $key
  $env:EVOLVE_INSTALL_PATH = $Target
  $env:EVOLVE_VERSION = $InstalledVersion

  $script = @'
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
'@

  $script | & node -
  if ($LASTEXITCODE -ne 0) { Die 'Failed to register in installed_plugins.json' }

  Remove-Item Env:EVOLVE_PJ, Env:EVOLVE_KEY, Env:EVOLVE_INSTALL_PATH, Env:EVOLVE_VERSION -ErrorAction SilentlyContinue
  Ok "registered with Claude Code (key: $key)"
}

function Register-Codex {
  $codexPlugins = Join-Path $CodexDir 'plugins'
  New-Item -ItemType Directory -Force -Path $codexPlugins | Out-Null
  $link = Join-Path $codexPlugins $PluginName

  if (Test-Path $link) { Remove-Item -Recurse -Force $link }

  # Try native PowerShell symlink (cleaner than mklink)
  try {
    New-Item -ItemType SymbolicLink -Path $link -Target $Target -ErrorAction Stop | Out-Null
    Ok "registered with Codex CLI (symlink: $link)"
  } catch {
    Warn 'symlink failed (no admin / Developer Mode) — falling back to copy'
    Warn 'enable Developer Mode for symlinks: Settings → For Developers → Developer Mode'
    Copy-Item -Recurse -Path $Target -Destination $link
    Ok "registered with Codex CLI (copy: $link)"
  }
}

function Register-Gemini {
  New-Item -ItemType Directory -Force -Path $GeminiDir | Out-Null
  $geminiMd = Join-Path $GeminiDir 'GEMINI.md'
  $marker = '<!-- evolve-plugin-include: do-not-edit -->'
  $includeLine = "@$Target/GEMINI.md"
  $newBlock = "$marker`r`n$includeLine`r`n$marker"

  if ((Test-Path $geminiMd) -and ((Get-Content $geminiMd -Raw) -match [regex]::Escape($marker))) {
    $content = Get-Content $geminiMd -Raw
    $pattern = "$([regex]::Escape($marker))[\s\S]*?$([regex]::Escape($marker))"
    $content = [regex]::Replace($content, $pattern, $newBlock)
    Set-Content -Path $geminiMd -Value $content -Encoding UTF8
  } else {
    Add-Content -Path $geminiMd -Value "`r`n$newBlock`r`n" -Encoding UTF8
  }
  Ok "registered with Gemini CLI (sourced via $geminiMd)"
}

foreach ($cli in $ClisFound) {
  switch ($cli) {
    'claude' { Register-Claude }
    'codex'  { Register-Codex  }
    'gemini' { Register-Gemini }
  }
}

# Cleanup logs on success
Remove-Item -Recurse -Force $LogDir -ErrorAction SilentlyContinue

# ---- final report ----

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Green
Write-Host "  Evolve v$InstalledVersion installed" -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Green
Write-Host ''
Write-Host "  Location:    $Target"
Write-Host "  CLIs wired:  $($ClisFound -join ', ')"
Write-Host ''
Write-Host '  Next steps:'
Write-Host '    1. Restart your AI CLI so it picks up the plugin'
Write-Host '    2. Open any project — you should see [evolve] banner lines on session start'
Write-Host '    3. /evolve-genesis (in Claude Code) for first-time project scaffolding'
Write-Host "    4. npm run evolve:status (from $Target) for index health any time"
Write-Host ''
Write-Host '  Upgrade:     irm https://raw.githubusercontent.com/vTRKA/evolve-agent/main/install.ps1 | iex'
Write-Host "  Manual:      cd '$Target'; npm run evolve:upgrade"
Write-Host "  Uninstall:   Remove-Item -Recurse '$Target' + remove '$PluginName@$MarketplaceName'"
Write-Host '               from ~/.claude/plugins/installed_plugins.json'
Write-Host ''
Write-Host '  Docs: https://github.com/vTRKA/evolve-agent#readme'
Write-Host ''
