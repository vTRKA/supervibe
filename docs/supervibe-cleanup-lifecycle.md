# Supervibe Cleanup Lifecycle

The cleanup lifecycle keeps `.supervibe` useful as current agent context instead of a long-lived dump of old plans, graphs, receipts, logs, and generated outputs.

## Modes

- `dry-run`: default. Builds reports only and never mutates files.
- `review`: same safety boundary as dry-run, but reports review-required targets explicitly.
- `auto-safe`: still dry-run in the lifecycle orchestrator; only hard allowlisted runtime/log trash can become a delete decision.
- `manual-apply`: destructive mode. It requires an action manifest, policy version, dry-run evidence, path containment under `.supervibe`, and explicit operator approval.
- `disabled`: reports no cleanup action.

## Lifecycle Classes

- `hot`: active workflow state, active plan pointer, active work graph, or current execution material.
- `protected`: trusted receipts, trusted receipt-linked outputs, compact manifests, compact archive blobs, ledgers, and runtime keys.
- `warm`: recent artifacts that are useful for review or handoff.
- `archivable`: completed workflow graphs and state that can move out of hot context after the configured grace period.
- `cold`: archive material retained for historical access.
- `trash` and `deletable`: generated logs, backups, stale runtime files, and safe temporary material.
- `unclassified`: requires human review and is never auto-safe.

Reachability always wins over age. A trusted receipt target, compact archive blob referenced by a live manifest, or active root cannot become a physical delete candidate because it is old. Untrusted workflow receipts and temporary workflow invocation folders remain recent diagnostics first, then become artifact-GC archive candidates after `workflowArtifactRetentionDays` when no active root protects them.

## Operator Flow

```bash
npm run supervibe:gc -- --lifecycle --mode dry-run
npm run supervibe:gc -- --lifecycle --mode review
npm run supervibe:gc -- --lifecycle --mode auto-safe
npm run supervibe:gc -- --artifacts --dry-run --archive-keep-last 5 --archive-retention-days 90
npm run supervibe:gc -- --artifacts --scheduled --auto --apply
npm run supervibe:gc -- --artifacts --dry-run --workflow-artifact-retention-days 90
npm run supervibe:gc -- --snapshots --dry-run --snapshot-max-bytes 52428800
npm run supervibe:gc -- --snapshots --apply
npm run validate:supervibe-cleanup-lifecycle
```

Default context excludes archivable, cold, trash, and unclassified cleanup lifecycle artifacts. History access remains explicit through history-capable commands and context pack `includeHistory` behavior.

Session start queues a detached auto-GC maintenance run when a retention schedule is due or artifact snapshots exceed their retention budget. The background lane uses `.supervibe/memory/auto-gc.lock`, records status in `.supervibe/memory/auto-gc-state.json`, applies only auto-safe memory/artifact/snapshot cleanup, and stays quiet when nothing is due. Disable it with `SUPERVIBE_AUTO_GC=off`.

## Archive Budgets

Artifact archive cleanup supports age, byte, and keep-last-N controls. Scheduled artifact GC reports `AUTO_SAFE_CANDIDATES` and `--auto` applies only hard-allowlisted stale runtime files, stale receipt archives, stale untrusted workflow receipts, stale workflow temp artifacts, unreferenced agent outputs, and compactable trusted agent outputs. Artifact snapshot retention separately enforces a default `keepLast=1`, `maxBytes=50MiB`, and `maxAgeDays=30` policy over `.supervibe/memory/artifact-snapshots/`; `latest.json` protects the canonical rollback snapshot while legacy/manual snapshot folders can be removed. Protected provenance exceptions always win, including compact archive blobs referenced by live compact manifests. Snapshot creation excludes rebuildable `code.db` and `memory.db` caches by default and records rebuild commands instead of copying potentially inconsistent SQLite files.

## Restore And Rollback

Compacted agent output writes a live manifest that records original path, archive path, content hashes, receipt ids, source command, restore command, and timestamp. Apply flows write an audit plan before mutation and an action log after mutation. Restore should be staging-first, non-overwriting by default, digest-verified, and followed by receipt or provenance validation.

## Release Gate

Run cleanup lifecycle validation before release, version bump, commit, or push:

```bash
npm run validate:supervibe-cleanup-lifecycle
npm run validate:workflow-receipts
npm run validate:agent-producer-receipts
npm run check
```