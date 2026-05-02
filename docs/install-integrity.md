# Install Integrity

Supervibe installers are designed to make local changes explicit before writing and to support optional release provenance pins.

## Live Main Install URLs

The default public install channel follows `main`, matching the repository's
push-to-main release workflow:

```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash
```

```powershell
irm https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1 | iex
```

Update scripts follow the same live-main rule:

```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/update.sh | bash
```

```powershell
irm https://raw.githubusercontent.com/vTRKA/supervibe/main/update.ps1 | iex
```

Strict consumers can still pin `SUPERVIBE_REF` to a tag or commit before
running the one-liner. Foreign mutable raw download URLs remain blocked by the
release security gate.

## Optional Integrity Pins

Before running an installer or updater, callers can set:

- `SUPERVIBE_EXPECTED_COMMIT` to require the checkout commit SHA to match release provenance
- `SUPERVIBE_EXPECTED_PACKAGE_SHA256` to require the git archive checksum to match release provenance

POSIX example:

```bash
SUPERVIBE_EXPECTED_COMMIT=<sha> \
SUPERVIBE_EXPECTED_PACKAGE_SHA256=<sha256> \
curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash
```

PowerShell example:

```powershell
$env:SUPERVIBE_EXPECTED_COMMIT = '<sha>'
$env:SUPERVIBE_EXPECTED_PACKAGE_SHA256 = '<sha256>'
irm https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1 | iex
```

## Path Safety

Installers refuse empty paths, root paths, path traversal, and unexpected package roots before mutating local config. The default install root is:

```text
~/.claude/plugins/marketplaces/supervibe-marketplace
```

Update scripts refuse path traversal and root paths for `SUPERVIBE_PLUGIN_ROOT`, then require the target to already be a git checkout.

## Pre-Write Explanation

Installers print the checkout path, config areas they will modify, and integrity pin status before clone, checkout, dependency install, or CLI registration.

## Cross-Platform Expectations

`install.sh`, `install.ps1`, `update.sh`, and `update.ps1` share these release expectations:

- live-main defaults with optional `SUPERVIBE_REF` tag/commit pinning
- optional commit verification
- optional package checksum verification
- user-owned tracked checkout edit refusal for updates and reinstalls
- installer-managed `package-lock.json` and ONNX model drift are restored before dirty-check failure so required model hydration does not permanently block future updates
- stale untracked/ignored files are cleaned from the managed plugin checkout before reinstall so removed commands, routes, generated leftovers, or old files cannot stay active
- install/update asserts the managed checkout is a clean mirror after cleanup, clone, checkout, or `git pull --ff-only`, before runtime files are generated
- `registry.yaml` is regenerated before the final install lifecycle audit
- `npm run supervibe:install-doctor` writes `.supervibe/audits/install-lifecycle/latest.json` and fails install/update success if package metadata, registry generation, stale-file cleanup, or required host registration is incomplete
- path-safety checks before writes
- Node.js 22.5+ with `node:sqlite` is required before installation or update continues
- when Node is missing or too old, installers ask for explicit consent before attempting a user-level Node bootstrap; `SUPERVIBE_INSTALL_NODE=1` allows unattended bootstrap and `SUPERVIBE_INSTALL_NODE=0` fails fast
- user install/update scripts do not run the developer test suite; `npm run check` stays manual/CI-only, while user updates run dependency install, registry build, mirror cleanup, and install-doctor
