# Release Security

Supervibe v2.0.33 release candidates must pass the local release security gate before publishing or tagging.

## Release Provenance

Every release candidate must record:

- package version from `package.json`
- commit SHA from `git rev-parse HEAD`
- generated timestamp from the release audit
- manifest paths for Claude, Codex, Cursor, Gemini, and marketplace metadata
- checksums for package, lockfile, installers, update scripts, README, changelog, and release integrity docs

The deterministic report is produced by:

```bash
npm run audit:release-security
```

Release verification commands:

```bash
npm test -- tests/supervibe-release-security-audit.test.mjs tests/supervibe-install-integrity.test.mjs tests/supervibe-dependency-provenance.test.mjs
npm run audit:release-security
npm run check
```

## Dependency And License Evidence

Dependency provenance is generated from `package.json` and `package-lock.json`.
The reviewed third-party license inventory lives in [third-party-licenses.md](third-party-licenses.md).

The gate checks:

- lockfile root version and dependency specs match `package.json`
- direct dependency lock entries include version, source, integrity, license, and engine evidence
- installer and updater scripts use the project-owned live-main channel by default, keep optional commit/checksum pins, and do not advertise foreign mutable branch download URLs
- license inventory includes every direct dependency with locked version and license

## Install Integrity Evidence

Install and update integrity expectations live in [install-integrity.md](install-integrity.md).
The gate checks that POSIX and Windows scripts share live-main defaults, optional commit pin, package checksum, path-safety, and pre-write explanation behavior.

## Vulnerability Exceptions

Known vulnerability exceptions are allowed only when each exception includes:

- `id`
- `severity`
- `rationale`
- `owner`
- `expiresAt`
- `mitigation`

Expired vulnerability exceptions fail the release gate. High or critical npm audit findings without an exception fail the release gate.

Current v2.0.33 status: no active vulnerability exceptions are recorded.

## Release Notes Requirement

Release notes must mention release security and install integrity when these gates change. The changelog entry must stay synchronized with README install links, manifest versions, registry metadata, and this document.
