# Evolve standalone updater — Windows.
#
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/vTRKA/supervibe/main/update.ps1 | iex
#
# What it does:
#   1. Finds the existing plugin checkout (default: ~/.claude/plugins/marketplaces/supervibe-marketplace)
#   2. Refuses to clobber local edits (uncommitted changes → stop)
#   3. Delegates to `npm run supervibe:upgrade` inside the checkout
#
# For first-time install, use install.ps1 — this script does not bootstrap.

$ErrorActionPreference = 'Stop'

$PluginRoot = if ($env:SUPERVIBE_PLUGIN_ROOT) {
  $env:SUPERVIBE_PLUGIN_ROOT
} else {
  Join-Path $HOME '.claude\plugins\marketplaces\supervibe-marketplace'
}

function Say  { param($m) Write-Host "[evolve-update] $m" -ForegroundColor Cyan }
function Ok   { param($m) Write-Host "[evolve-update] $m" -ForegroundColor Green }
function Warn { param($m) Write-Host "[evolve-update] $m" -ForegroundColor Yellow }
function Die  { param($m) Write-Host "[evolve-update] $m" -ForegroundColor Red; exit 1 }

# ---- preflight ----

if (-not (Get-Command git  -ErrorAction SilentlyContinue)) { Die 'git not found.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Die 'node not found. Install Node.js 22+ (https://nodejs.org).' }
if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { Die 'npm not found.' }

# ---- locate install ----

if (-not (Test-Path (Join-Path $PluginRoot '.git'))) {
  Write-Host "[evolve-update] no Supervibe install found at $PluginRoot" -ForegroundColor Red
  Write-Host ''
  Write-Host 'If this is your first install, run:'
  Write-Host '  irm https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1 | iex'
  Write-Host ''
  Write-Host 'If your plugin lives elsewhere, point the updater at it:'
  Write-Host '  $env:SUPERVIBE_PLUGIN_ROOT = "C:\path\to\evolve"; irm .../update.ps1 | iex'
  exit 1
}
Ok "found checkout at $PluginRoot"

# ---- safety: refuse to clobber local edits ----

$dirty = git -C $PluginRoot status --porcelain 2>$null
if ($dirty) {
  Write-Host $dirty
  Die "uncommitted changes in $PluginRoot — commit or stash before updating."
}

# ---- delegate to npm run supervibe:upgrade ----

Say 'running npm run supervibe:upgrade (fetch + pull --ff-only + lfs pull + install + tests)'
Push-Location $PluginRoot
try {
  npm run supervibe:upgrade
  if ($LASTEXITCODE -ne 0) { Die 'upgrade failed; see output above.' }
} finally {
  Pop-Location
}

Ok 'done. Restart your AI CLI to pick up the new plugin code.'
Ok 'if any project has .claude/ overrides, run /evolve-adapt inside that project.'
