# Upgrade And Rollback

Supervibe upgrade is gated by installer health before any write operation.
Use `node scripts/supervibe-auto-update.mjs --dry-run --health` to inspect the
planned update, required backups, schema checks and rollback command.

Rollback requirements:

- Create a backup manifest under `.supervibe/backups/` before applying updates.
- Do not run schema migrations without a backup or full rebuild path.
- Block upgrade when command, skill, rule, package script or plugin manifest
  references are inconsistent.
- Prefer dry-run output in automated hosts and require explicit foreground
  upgrade for risky repairs.

Primary rollback command:

```bash
node scripts/supervibe-upgrade.mjs --rollback <backup-manifest>
```
