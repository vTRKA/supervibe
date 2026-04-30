# Supervibe universal installer - Windows.
#
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1 | iex
#
# Override defaults:
#   $env:SUPERVIBE_REF = "main"             # tag, branch, or commit
#   $env:SUPERVIBE_REPO = "git@github.com:my-fork/supervibe.git"
#   $env:SUPERVIBE_EXPECTED_COMMIT = "<sha>"          # optional release provenance pin
#   $env:SUPERVIBE_EXPECTED_PACKAGE_SHA256 = "<sha>"  # optional git-archive checksum pin
#
# Idempotent - safe to re-run for upgrades.

# Existing managed checkouts are cleaned before reinstall so stale files from
# older plugin versions cannot stay active.
$ErrorActionPreference = 'Stop'

$RepoUrl         = if ($env:SUPERVIBE_REPO) { $env:SUPERVIBE_REPO } else { 'https://github.com/vTRKA/supervibe.git' }
$Ref             = if ($env:SUPERVIBE_REF)  { $env:SUPERVIBE_REF }  else { 'main' }
$ExpectedCommit  = if ($env:SUPERVIBE_EXPECTED_COMMIT) { $env:SUPERVIBE_EXPECTED_COMMIT } else { '' }
$ExpectedPackageSha256 = if ($env:SUPERVIBE_EXPECTED_PACKAGE_SHA256) { $env:SUPERVIBE_EXPECTED_PACKAGE_SHA256.ToLowerInvariant() } else { '' }
$PluginName      = 'supervibe'
$MarketplaceName = 'supervibe-marketplace'
$MinNodeVersion = [version]'22.5.0'

$LogDir = Join-Path $env:TEMP "supervibe-install.$PID"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
trap { Remove-Item -Recurse -Force $LogDir -ErrorAction SilentlyContinue; break }

function Say  { param($m) Write-Host "[supervibe-install] $m" -ForegroundColor Cyan }
function Ok   { param($m) Write-Host "[supervibe-install] $m" -ForegroundColor Green }
function Warn { param($m) Write-Host "[supervibe-install] $m" -ForegroundColor Yellow }
function Die  { param($m) Write-Host "[supervibe-install] $m" -ForegroundColor Red; exit 1 }

function Assert-SafePluginPath {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { Die 'unsafe empty plugin target path' }
  if ($Path -match '\.\.') { Die "unsafe plugin target path: $Path" }
  $full = [System.IO.Path]::GetFullPath($Path)
  $root = [System.IO.Path]::GetPathRoot($full)
  if ($full.TrimEnd('\') -eq $root.TrimEnd('\')) { Die "unsafe plugin target path: $Path" }
  $expected = [System.IO.Path]::GetFullPath((Join-Path $HOME ".claude\plugins\marketplaces\$MarketplaceName"))
  if ($full.TrimEnd('\') -ne $expected.TrimEnd('\')) { Die "unexpected package root: $Path" }
}

function Get-PackageSha256 {
  $archive = Join-Path $LogDir 'package.tar'
  & git -C $Target archive --format=tar -o $archive HEAD
  if ($LASTEXITCODE -ne 0) { Die 'failed to create package archive for checksum verification' }
  return (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant()
}

function Test-CheckoutIntegrity {
  if ($ExpectedCommit) {
    $actualCommit = (git -C $Target rev-parse HEAD 2>$null) -join ''
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
  Warn "Node.js $MinNodeVersion+ with node:sqlite is required before Supervibe can install."
  $currentNode = if (Get-Command node -ErrorAction SilentlyContinue) { (node --version) -join '' } else { 'not found' }
  Warn "Current node: $currentNode"
  if (-not (Confirm-NodeInstall)) {
    Die "Node.js $MinNodeVersion+ is required for SQLite-backed semantic RAG, CodeGraph, project memory, and full checks. Set SUPERVIBE_INSTALL_NODE=1 to allow installer bootstrap, or install Node.js manually and re-run."
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

if (-not (Get-Command git  -ErrorAction SilentlyContinue)) { Die 'git not found. Install git first.' }
Ensure-NodeRuntime
if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { Die "npm not found after Node.js setup. Reinstall Node.js $MinNodeVersion+ and re-run." }

# ---- detect AI CLIs (by both directory and command in PATH) ----

$ClaudeDir = Join-Path $HOME '.claude'
$CodexDir  = Join-Path $HOME '.codex'
$GeminiDir = Join-Path $HOME '.gemini'

$ClisFound = @()
if (Test-Path $ClaudeDir) { $ClisFound += 'claude' } elseif (Get-Command claude -ErrorAction SilentlyContinue) { $ClisFound += 'claude' }
if (Test-Path $CodexDir)  { $ClisFound += 'codex' } elseif (Get-Command codex -ErrorAction SilentlyContinue) { $ClisFound += 'codex' }
if (Test-Path $GeminiDir) { $ClisFound += 'gemini' } elseif (Get-Command gemini -ErrorAction SilentlyContinue) { $ClisFound += 'gemini' }
if (Get-Command cursor -ErrorAction SilentlyContinue)   { $ClisFound += 'cursor' }
if (Get-Command copilot -ErrorAction SilentlyContinue)  { $ClisFound += 'copilot' }
if (Get-Command opencode -ErrorAction SilentlyContinue) { $ClisFound += 'opencode' }

if ($ClisFound.Count -eq 0) {
  Warn 'No AI CLI detected. Installing under ~/.claude/ - register manually if needed.'
  New-Item -ItemType Directory -Force -Path (Join-Path $ClaudeDir 'plugins\marketplaces') | Out-Null
  $ClisFound = @('claude')
} else {
  Ok "detected AI CLIs: $($ClisFound -join ', ')"
}

# ---- clone or update the shared checkout ----

$Target = Join-Path $ClaudeDir "plugins\marketplaces\$MarketplaceName"
Assert-SafePluginPath $Target
Say "plan: will install or update checkout at $Target"
Say "plan: will modify Claude config under $ClaudeDir, Codex plugin link under $CodexDir, and Gemini include under $GeminiDir when those CLIs are detected"
Say "plan: integrity pins ref=$Ref expected_commit=$(if ($ExpectedCommit) { $ExpectedCommit } else { 'not set' }) package_sha256=$(if ($ExpectedPackageSha256) { 'set' } else { 'not set' })"

function Run-Git {
  param([string[]]$Args, [string]$LogName, [switch]$AllowFail, [switch]$SkipLfsSmudge)
  $log = Join-Path $LogDir "$LogName.log"
  $gitArgs = $Args
  $oldSkip = $env:GIT_LFS_SKIP_SMUDGE
  if ($SkipLfsSmudge) {
    $gitArgs = @('-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.required=false') + $Args
    $env:GIT_LFS_SKIP_SMUDGE = '1'
  }
  try {
    & git @gitArgs 2>&1 | Tee-Object -FilePath $log | Out-Null
    if ($LASTEXITCODE -ne 0 -and -not $AllowFail) {
      Get-Content $log | Write-Host
      Die "git $($Args -join ' ') failed. Log: $log"
    }
    return ($LASTEXITCODE -eq 0)
  } finally {
    if ($SkipLfsSmudge) {
      if ($null -eq $oldSkip) { Remove-Item Env:GIT_LFS_SKIP_SMUDGE -ErrorAction SilentlyContinue }
      else { $env:GIT_LFS_SKIP_SMUDGE = $oldSkip }
    }
  }
}

function Invoke-CleanManagedCheckout {
  param([string]$Path)
  $status = @(git -C $Path status --porcelain 2>$null)
  $trackedDirty = @($status | Where-Object { $_ -and -not $_.StartsWith('?? ') })
  if ($trackedDirty.Count -gt 0) {
    $trackedDirty | Write-Host
    Die "tracked local edits in $Path; commit/stash them before reinstalling. Untracked stale files are cleaned automatically."
  }
  $untrackedDirty = @($status | Where-Object { $_ -and $_.StartsWith('?? ') })
  if ($untrackedDirty.Count -gt 0) {
    Warn "removing $($untrackedDirty.Count) untracked stale file(s) from managed plugin checkout"
  }
  Say 'cleaning managed checkout (git clean -ffdx)'
  Run-Git @('-C', $Path, 'clean', '-ffdx') 'git-clean'
}

function Move-NonGitTargetAside {
  param([string]$Path)
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
  $backupDir = Join-Path (Join-Path $ClaudeDir 'plugins') '.supervibe-install-backups'
  $backup = Join-Path $backupDir "$MarketplaceName.non-git.$stamp"
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  Warn "found non-git plugin target at $Path; moving it aside before clean reinstall"
  Move-Item -LiteralPath $Path -Destination $backup
  Ok "old non-git target quarantined at $backup"
}

if (Test-Path (Join-Path $Target '.git')) {
  Invoke-CleanManagedCheckout $Target
  Say "found existing checkout at $Target - updating to $Ref"
  Run-Git @('-C', $Target, 'fetch', '--tags', '--prune', '--quiet') 'fetch' -SkipLfsSmudge
  Run-Git @('-C', $Target, 'checkout', '--quiet', $Ref) 'checkout' -SkipLfsSmudge
  if (-not (Run-Git @('-C', $Target, 'pull', '--ff-only', '--quiet') 'pull' -AllowFail -SkipLfsSmudge)) {
    Warn 'pull --ff-only failed (local diverged or detached head); leaving checkout at current commit'
  }
} else {
  Say "cloning $RepoUrl ($Ref) -> $Target"
  if (Test-Path $Target) {
    Move-NonGitTargetAside $Target
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $Target -Parent) | Out-Null
  Run-Git @('clone', '--quiet', $RepoUrl, $Target) 'clone' -SkipLfsSmudge
  Run-Git @('-C', $Target, 'checkout', '--quiet', $Ref) 'checkout' -SkipLfsSmudge
}

Test-CheckoutIntegrity

# Optional LFS pull
if (Get-Command git-lfs -ErrorAction SilentlyContinue) {
  Say 'git-lfs detected - pulling embedding model'
  if (-not (Run-Git @('-C', $Target, 'lfs', 'pull') 'lfs' -AllowFail)) {
    Warn 'git lfs pull failed; model will lazy-fetch from HuggingFace on first use'
  }
} else {
  Warn 'git-lfs not installed; embedding model will lazy-fetch from HuggingFace (~118 MB on first semantic search)'
}

# ---- install deps + verify ----

function Run-NpmStep {
  param([string]$ScriptName, [string[]]$NpmArgs)
  $safeLogName = $ScriptName -replace '[\\/:*?"<>|\s]+', '-'
  $log = Join-Path $LogDir "$safeLogName.log"
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
Run-NpmStep 'npm run registry:build' @('run', 'registry:build')
Run-NpmStep 'npm run check' @('run', 'check')
Ok 'all checks passed'

$InstalledVersion = (Get-Content (Join-Path $Target '.claude-plugin\plugin.json') -Raw | ConvertFrom-Json).version

# ---- register with each detected CLI ----

function Register-Claude {
  # Claude Code needs three JSON files in sync to actually load AND enable a
  # plugin: installed_plugins.json + known_marketplaces.json + settings.json
  # (enabledPlugins + extraKnownMarketplaces). Missing any of these makes the
  # install silently invisible.

  $pluginsDir       = Join-Path $ClaudeDir 'plugins'
  $pluginsJson      = Join-Path $pluginsDir 'installed_plugins.json'
  $marketplacesJson = Join-Path $pluginsDir 'known_marketplaces.json'
  $settingsJson     = Join-Path $ClaudeDir  'settings.json'
  New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null

  if (-not (Test-Path $pluginsJson))      { Set-Content -Path $pluginsJson      -Value '{ "version": 2, "plugins": {} }' -Encoding UTF8 }
  if (-not (Test-Path $marketplacesJson)) { Set-Content -Path $marketplacesJson -Value '{}'                              -Encoding UTF8 }
  if (-not (Test-Path $settingsJson))     { Set-Content -Path $settingsJson     -Value '{}'                              -Encoding UTF8 }

  $key = "$PluginName@$MarketplaceName"

  $commitSha = (git -C $Target rev-parse HEAD 2>$null) -join ''
  if ($LASTEXITCODE -ne 0) { $commitSha = '' }

  # Derive owner/repo from the URL we cloned from
  $repoSlug = $RepoUrl -replace '^https://github\.com/', '' -replace '\.git$', ''

  $env:EVOLVE_PJ            = $pluginsJson
  $env:EVOLVE_MJ            = $marketplacesJson
  $env:EVOLVE_SJ            = $settingsJson
  $env:EVOLVE_KEY           = $key
  $env:EVOLVE_MARKETPLACE   = $MarketplaceName
  $env:SUPERVIBE_REPO_SLUG     = $repoSlug
  $env:EVOLVE_INSTALL_PATH  = $Target
  $env:EVOLVE_VERSION       = $InstalledVersion
  $env:EVOLVE_COMMIT_SHA    = $commitSha

  $script = @'
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

// 3. settings.json - enabledPlugins + extraKnownMarketplaces
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
'@

  $script | & node -
  if ($LASTEXITCODE -ne 0) { Die 'Failed to register Claude Code config (installed_plugins / known_marketplaces / settings)' }

  Remove-Item Env:EVOLVE_PJ, Env:EVOLVE_MJ, Env:EVOLVE_SJ, Env:EVOLVE_KEY, Env:EVOLVE_MARKETPLACE, Env:SUPERVIBE_REPO_SLUG, Env:EVOLVE_INSTALL_PATH, Env:EVOLVE_VERSION, Env:EVOLVE_COMMIT_SHA -ErrorAction SilentlyContinue

  Ok 'registered with Claude Code: installed_plugins + known_marketplaces + settings.enabledPlugins'
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
    Warn 'symlink failed (no admin / Developer Mode) - falling back to copy'
    Warn 'enable Developer Mode for symlinks: Settings > For Developers > Developer Mode'
    Copy-Item -Recurse -Path $Target -Destination $link
    Ok "registered with Codex CLI (copy: $link)"
  }
}

function Register-Gemini {
  New-Item -ItemType Directory -Force -Path $GeminiDir | Out-Null
  $geminiMd = Join-Path $GeminiDir 'GEMINI.md'
  $marker = '<!-- supervibe-plugin-include: do-not-edit -->'
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

$RegisteredHosts = @()
foreach ($cli in $ClisFound) {
  switch ($cli) {
    'claude' { Register-Claude; $RegisteredHosts += 'claude' }
    'codex'  { Register-Codex;  $RegisteredHosts += 'codex'  }
    'gemini' { Register-Gemini; $RegisteredHosts += 'gemini' }
  }
}

$env:SUPERVIBE_INSTALL_HOSTS = ($RegisteredHosts -join ' ')
Run-NpmStep 'npm run supervibe:install-doctor' @('run', 'supervibe:install-doctor')
Remove-Item Env:SUPERVIBE_INSTALL_HOSTS -ErrorAction SilentlyContinue
Ok 'install lifecycle doctor passed'

# Cleanup logs on success
Remove-Item -Recurse -Force $LogDir -ErrorAction SilentlyContinue

# ---- final report ----

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Green
Write-Host "  Supervibe v$InstalledVersion installed" -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Green
Write-Host ''
Write-Host "  Location:    $Target"
Write-Host "  CLIs wired:  $($ClisFound -join ', ')"
Write-Host "  Runtime:     Node $(node --version) with node:sqlite"
Write-Host "  Install audit: .supervibe/audits/install-lifecycle/latest.json"
Write-Host ''
Write-Host '  Next steps:'
Write-Host '    1. Restart your AI CLI so it picks up the plugin'
Write-Host '    2. Open any project - you should see [supervibe] banner lines on session start'
Write-Host '    3. /supervibe-genesis (in Claude Code) for first-time project scaffolding'
Write-Host "    4. npm run supervibe:status (from $Target) for index health any time"
Write-Host ''
Write-Host '  Upgrade:     irm https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1 | iex'
Write-Host "  Manual:      cd '$Target'; npm run supervibe:upgrade"
Write-Host "  Uninstall:   Remove-Item -Recurse '$Target' + remove '$PluginName@$MarketplaceName'"
Write-Host '               from ~/.claude/plugins/installed_plugins.json'
Write-Host ''
Write-Host '  Docs: https://github.com/vTRKA/supervibe#readme'
Write-Host ''

