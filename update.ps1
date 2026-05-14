# Supervibe standalone updater - Windows.
#
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/vTRKA/supervibe/main/update.ps1 | iex
#
# What it does:
#   1. Finds the existing provider-scoped plugin checkout (Codex, then Claude, then Gemini)
#   2. If missing, delegates to install.ps1 for first-time install
#   3. Restores managed checkout tracked drift and refuses only if restore fails
#   4. Delegates to `npm run supervibe:upgrade` inside the checkout
#      (fetch + pull --ff-only + mirror cleanup + required ONNX model setup + install audit)
#
# Safe as the user-facing "install or update" entrypoint.
$ErrorActionPreference = 'Stop'

function Resolve-PluginRoot {
  if ($env:SUPERVIBE_PLUGIN_ROOT) { return $env:SUPERVIBE_PLUGIN_ROOT }
  $candidates = @(
    (Join-Path $HOME '.codex\plugins\marketplaces\supervibe-marketplace'),
    (Join-Path $HOME '.claude\plugins\marketplaces\supervibe-marketplace'),
    (Join-Path $HOME '.gemini\plugins\marketplaces\supervibe-marketplace')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path (Join-Path $candidate '.git')) { return $candidate }
  }
  return $candidates[0]
}

$PluginRoot = Resolve-PluginRoot
$ExpectedCommit = if ($env:SUPERVIBE_EXPECTED_COMMIT) { $env:SUPERVIBE_EXPECTED_COMMIT } else { '' }
$ExpectedPackageSha256 = if ($env:SUPERVIBE_EXPECTED_PACKAGE_SHA256) { $env:SUPERVIBE_EXPECTED_PACKAGE_SHA256.ToLowerInvariant() } else { '' }
$MinNodeVersion = [version]'22.5.0'

function Say  { param($m) Write-Host "[supervibe-update] $m" -ForegroundColor Cyan }
function Ok   { param($m) Write-Host "[supervibe-update] $m" -ForegroundColor Green }
function Warn { param($m) Write-Host "[supervibe-update] $m" -ForegroundColor Yellow }
function Die  { param($m) Write-Host "[supervibe-update] $m" -ForegroundColor Red; exit 1 }

function Invoke-FirstInstall {
  $installUrl = if ($env:SUPERVIBE_INSTALL_URL) {
    $env:SUPERVIBE_INSTALL_URL
  } else {
    'https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1'
  }
  Warn "no Supervibe install found at $PluginRoot"
  Say "running first-time installer from $installUrl"
  try {
    $installer = Invoke-RestMethod -Uri $installUrl -UseBasicParsing
    Invoke-Expression $installer
    exit 0
  } catch {
    Die "first-time install failed: $($_.Exception.Message)"
  }
}

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

function Get-PorcelainPath {
  param([string]$Line)
  if ([string]::IsNullOrWhiteSpace($Line) -or $Line.Length -lt 4) { return '' }
  $path = $Line.Substring(3)
  $marker = ' -> '
  $idx = $path.LastIndexOf($marker)
  if ($idx -ge 0) { $path = $path.Substring($idx + $marker.Length) }
  return $path.Replace('\', '/')
}

function Restore-InstallerManagedTrackedEdits {
  param([string]$Path, [string[]]$Status)
  $restored = 0
  foreach ($line in $Status) {
    if (-not $line -or $line.StartsWith('?? ')) { continue }
    $trackedPath = Get-PorcelainPath $line
    if (-not $trackedPath) { continue }
    Warn "restoring managed checkout tracked drift: $trackedPath"
    & git -C $Path checkout -- $trackedPath
    if ($LASTEXITCODE -ne 0) { Die "failed to restore managed checkout tracked drift: $trackedPath" }
    $restored += 1
  }
  if ($restored -gt 0) {
    Warn "restored $restored tracked local plugin drift file(s); edit project files instead of the managed plugin checkout"
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
    return (Test-NodeSqliteImport)
  } catch {
    return $false
  }
}

function Test-NodeSqliteImport {
  $previousNodeNoWarnings = $env:NODE_NO_WARNINGS
  try {
    $env:NODE_NO_WARNINGS = '1'
    node -e "import('node:sqlite').then((m)=>process.exit(m.DatabaseSync?0:1)).catch(()=>process.exit(1))" *> $null
    return ($LASTEXITCODE -eq 0)
  } finally {
    if ($null -eq $previousNodeNoWarnings) {
      Remove-Item Env:NODE_NO_WARNINGS -ErrorAction SilentlyContinue
    } else {
      $env:NODE_NO_WARNINGS = $previousNodeNoWarnings
    }
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
    Die "Node.js $MinNodeVersion+ is required for SQLite-backed semantic RAG, CodeGraph, and project memory. Set SUPERVIBE_INSTALL_NODE=1 to allow updater bootstrap, or install Node.js manually and re-run."
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

function Install-WindowsTerminalCommands {
  param([string]$Path)
  $binRoot = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME 'AppData\Local' }
  $binDir = Join-Path $binRoot 'Supervibe\bin'
  Say "refreshing Windows terminal commands in $binDir"
  Push-Location $Path
  try {
    $report = (& node (Join-Path 'scripts' 'install-windows-bin-shims.mjs') --plugin-root $Path --bin-dir $binDir) -join "`n"
    if ($LASTEXITCODE -ne 0) {
      Write-Host $report
      Die 'Windows terminal command shim refresh failed.'
    }
  } finally {
    Pop-Location
  }
  if ($report -match 'PATH_READY: false') {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($userPath -split ';' | Where-Object { $_ })
    if (-not ($entries | Where-Object { $_.TrimEnd('\') -ieq $binDir.TrimEnd('\') })) {
      $newUserPath = if ($userPath) { "$userPath;$binDir" } else { $binDir }
      [Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
      Refresh-PathFromRegistry
    }
    Warn "terminal commands were refreshed under $binDir; restart PowerShell if Get-Command supervibe-update still cannot see them."
  } else {
    Ok "terminal commands refreshed (supervibe, supervibe-adapt, supervibe-update)"
  }
}

# ---- locate install ----

Assert-SafePluginPath $PluginRoot
if (-not (Test-Path (Join-Path $PluginRoot '.git'))) {
  Invoke-FirstInstall
}
Ok "found checkout at $PluginRoot"

# ---- preflight ----

if (-not (Get-Command git  -ErrorAction SilentlyContinue)) { Die 'git not found.' }
Ensure-NodeRuntime
if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { Die "npm not found after Node.js setup. Reinstall Node.js $MinNodeVersion+ and re-run." }
Say "plan: will update existing checkout at $PluginRoot, restore managed checkout tracked drift, and clean stale untracked files"
Say "plan: integrity pins expected_commit=$(if ($ExpectedCommit) { $ExpectedCommit } else { 'not set' }) package_sha256=$(if ($ExpectedPackageSha256) { 'set' } else { 'not set' })"

# ---- safety: refuse to clobber local edits ----

$status = @(git -C $PluginRoot status --porcelain 2>$null)
Restore-InstallerManagedTrackedEdits $PluginRoot $status
$status = @(git -C $PluginRoot status --porcelain 2>$null)
$trackedDirty = @($status | Where-Object { $_ -and -not $_.StartsWith('?? ') })
$untrackedDirty = @($status | Where-Object { $_ -and $_.StartsWith('?? ') })
if ($trackedDirty.Count -gt 0) {
  $trackedDirty | Write-Host
  Die "tracked plugin checkout drift remains after restore in $PluginRoot; inspect permissions or git checkout errors before updating. Untracked stale files are cleaned automatically."
}
if ($untrackedDirty.Count -gt 0) {
  Warn "$($untrackedDirty.Count) untracked stale file(s) will be removed by npm run supervibe:upgrade"
}

# ---- delegate to npm run supervibe:upgrade ----

Say 'running npm run supervibe:upgrade (fetch + pull --ff-only + mirror cleanup + required ONNX model setup + install audit)'
Push-Location $PluginRoot
try {
  npm run supervibe:upgrade
  if ($LASTEXITCODE -ne 0) { Die 'upgrade failed; see output above.' }
} finally {
  Pop-Location
}
Test-CheckoutIntegrity
Install-WindowsTerminalCommands $PluginRoot

Ok 'done. Restart your AI CLI to pick up the new plugin code.'
Ok 'terminal aliases supervibe-update and supervibe-adapt are available in PowerShell after PATH refresh; /supervibe-adapt is not a PowerShell slash command.'
Ok 'if any project has selected host adapter overrides, open that project in your AI CLI session and send /supervibe-adapt there.'
