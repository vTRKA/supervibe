# Evolve standalone updater вЂ” Windows.
#
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/vTRKA/supervibe/main/update.ps1 | iex
#
# What it does:
#   1. Finds the existing plugin checkout (default: ~/.claude/plugins/marketplaces/supervibe-marketplace)
#   2. Refuses to clobber local edits (uncommitted changes в†’ stop)
#   3. Delegates to `npm run supervibe:upgrade` inside the checkout
#
# For first-time install, use install.ps1 вЂ” this script does not bootstrap.

$ErrorActionPreference = 'Stop'

$PluginRoot = if ($env:SUPERVIBE_PLUGIN_ROOT) {
  $env:SUPERVIBE_PLUGIN_ROOT
} else {
  Join-Path $HOME '.claude\plugins\marketplaces\supervibe-marketplace'
}
$ExpectedCommit = if ($env:SUPERVIBE_EXPECTED_COMMIT) { $env:SUPERVIBE_EXPECTED_COMMIT } else { '' }
$ExpectedPackageSha256 = if ($env:SUPERVIBE_EXPECTED_PACKAGE_SHA256) { $env:SUPERVIBE_EXPECTED_PACKAGE_SHA256.ToLowerInvariant() } else { '' }
$MinNodeVersion = [version]'22.5.0'

function Say  { param($m) Write-Host "[evolve-update] $m" -ForegroundColor Cyan }
function Ok   { param($m) Write-Host "[evolve-update] $m" -ForegroundColor Green }
function Warn { param($m) Write-Host "[evolve-update] $m" -ForegroundColor Yellow }
function Die  { param($m) Write-Host "[evolve-update] $m" -ForegroundColor Red; exit 1 }

function Assert-SafePluginPath {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { Die 'unsafe empty plugin root' }
  if ($Path -match '\.\.') { Die "unsafe plugin root: $Path" }
  $full = [System.IO.Path]::GetFullPath($Path)
  $root = [System.IO.Path]::GetPathRoot($full)
  if ($full.TrimEnd('\') -eq $root.TrimEnd('\')) { Die "unsafe plugin root: $Path" }
}

function Get-PackageSha256 {
  $archive = Join-Path ([System.IO.Path]::GetTempPath()) "supervibe-update-package.$PID.tar"
  try {
    & git -C $PluginRoot archive --format=tar -o $archive HEAD
    if ($LASTEXITCODE -ne 0) { Die 'failed to create package archive for checksum verification' }
    return (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant()
  } finally {
    Remove-Item -Force $archive -ErrorAction SilentlyContinue
  }
}

function Test-CheckoutIntegrity {
  if ($ExpectedCommit) {
    $actualCommit = (git -C $PluginRoot rev-parse HEAD 2>$null) -join ''
    if ($actualCommit -ne $ExpectedCommit) { Die "commit integrity mismatch: expected $ExpectedCommit got $actualCommit" }
    Ok "commit integrity verified: $ExpectedCommit"
  }
  if ($ExpectedPackageSha256) {
    $actualSha = Get-PackageSha256
    if ($actualSha -ne $ExpectedPackageSha256) { Die "package checksum mismatch: expected $ExpectedPackageSha256 got $actualSha" }
    Ok "package checksum verified: $ExpectedPackageSha256"
  }
}

function Refresh-PathFromRegistry {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machinePath;$userPath;$env:Path"
}

function Test-NodeRuntime {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  try {
    $nodeVersionText = (node -p 'process.versions.node') -join ''
    if ([version]$nodeVersionText -lt $MinNodeVersion) { return $false }
    node -e "import('node:sqlite').then((m)=>process.exit(m.DatabaseSync?0:1)).catch(()=>process.exit(1))" *> $null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

function Confirm-NodeInstall {
  $consent = if ($env:SUPERVIBE_INSTALL_NODE) { $env:SUPERVIBE_INSTALL_NODE.ToLowerInvariant() } else { '' }
  if (@('1', 'true', 'yes', 'y') -contains $consent) { return $true }
  if (@('0', 'false', 'no', 'n') -contains $consent) { return $false }
  $answer = Read-Host "Node.js $MinNodeVersion+ is required for SQLite/RAG/CodeGraph. Install or upgrade Node now? [y/N]"
  return ($answer -match '^(y|yes)$')
}

function Install-NodeRuntime {
  Warn "Node.js $MinNodeVersion+ with node:sqlite is required before Supervibe can update."
  $currentNode = if (Get-Command node -ErrorAction SilentlyContinue) { (node --version) -join '' } else { 'not found' }
  Warn "Current node: $currentNode"
  if (-not (Confirm-NodeInstall)) {
    Die "Node.js $MinNodeVersion+ is required for SQLite-backed semantic RAG, CodeGraph, project memory, and full checks. Set SUPERVIBE_INSTALL_NODE=1 to allow updater bootstrap, or install Node.js manually and re-run."
  }

  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Say 'installing Node.js LTS via winget'
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
  } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
    Say 'installing Node.js LTS via Chocolatey'
    choco install nodejs-lts -y
  } elseif (Get-Command scoop -ErrorAction SilentlyContinue) {
    Say 'installing Node.js LTS via Scoop'
    scoop install nodejs-lts
  } elseif (Get-Command fnm -ErrorAction SilentlyContinue) {
    Say 'installing Node.js 22 via fnm'
    fnm install 22
    fnm use 22
  } elseif (Get-Command volta -ErrorAction SilentlyContinue) {
    Say 'installing Node.js 22 via Volta'
    volta install node@22
  } else {
    Die "No supported Node installer found. Install Node.js $MinNodeVersion+ from https://nodejs.org, then re-run."
  }

  Refresh-PathFromRegistry
  if (-not (Test-NodeRuntime)) {
    Die "Node bootstrap finished, but Node.js $MinNodeVersion+ with node:sqlite is still unavailable. Restart PowerShell or install Node.js manually, then re-run."
  }
  Ok "node $(node --version) ok with node:sqlite"
}

function Ensure-NodeRuntime {
  Refresh-PathFromRegistry
  if (Test-NodeRuntime) {
    Ok "node $(node --version) ok with node:sqlite"
    return
  }
  Install-NodeRuntime
}

# ---- preflight ----

if (-not (Get-Command git  -ErrorAction SilentlyContinue)) { Die 'git not found.' }
Ensure-NodeRuntime
if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { Die "npm not found after Node.js setup. Reinstall Node.js $MinNodeVersion+ and re-run." }
Assert-SafePluginPath $PluginRoot
Say "plan: will update existing checkout at $PluginRoot, preserve tracked local edits, and clean stale untracked files"
Say "plan: integrity pins expected_commit=$(if ($ExpectedCommit) { $ExpectedCommit } else { 'not set' }) package_sha256=$(if ($ExpectedPackageSha256) { 'set' } else { 'not set' })"

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

$status = @(git -C $PluginRoot status --porcelain 2>$null)
$trackedDirty = @($status | Where-Object { $_ -and -not $_.StartsWith('?? ') })
$untrackedDirty = @($status | Where-Object { $_ -and $_.StartsWith('?? ') })
if ($trackedDirty.Count -gt 0) {
  $trackedDirty | Write-Host
  Die "tracked local edits in $PluginRoot; commit or stash before updating. Untracked stale files are cleaned automatically."
}
if ($untrackedDirty.Count -gt 0) {
  Warn "$($untrackedDirty.Count) untracked stale file(s) will be removed by npm run supervibe:upgrade"
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
Test-CheckoutIntegrity

Ok 'done. Restart your AI CLI to pick up the new plugin code.'
Ok 'if any project has .claude/ overrides, run /evolve-adapt inside that project.'
