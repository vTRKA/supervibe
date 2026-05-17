import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadNodeSqliteDatabaseSync } from "../scripts/lib/node-sqlite-runtime.mjs";
import {
  applyCodeDbMigrations,
  detectCodeDbSchema,
  formatCodeDbMigrationReport,
  recoverCorruptCodeDb,
} from "../scripts/lib/supervibe-db-migrations.mjs";

test("old code.db schema migrates with backup and row counts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-db-"));
  const dbPath = join(rootDir, "code.db");
  try {
    const DatabaseSync = await loadNodeSqliteDatabaseSync();
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE code_files (
        path TEXT PRIMARY KEY,
        language TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        line_count INTEGER NOT NULL,
        indexed_at TEXT NOT NULL
      );
      INSERT INTO code_files VALUES ('src/a.ts', 'typescript', 'hash', 1, 'now');
    `);

    const before = detectCodeDbSchema(db);
    assert.equal(before.version, 0, "schema version missing migration path");

    const report = applyCodeDbMigrations(db, { dbPath });
    const after = detectCodeDbSchema(db);
    const indexes = db.prepare("PRAGMA index_list(code_chunk_entities)").all().map((row) => row.name);
    const migration = db.prepare("SELECT id FROM supervibe_schema_migrations WHERE version = ?").get(2);
    db.close();

    assert.equal(report.pass, true, formatCodeDbMigrationReport(report));
    assert.equal(report.rowCountsBefore.code_files, 1);
    assert.equal(report.rowCountsAfter.code_files, 1);
    assert.equal(after.version, 2);
    assert.ok(after.tables.includes("code_chunk_entities"));
    assert.ok(indexes.includes("idx_chunk_entities_path"));
    assert.ok(indexes.includes("idx_chunk_entities_type_name"));
    assert.ok(indexes.includes("idx_chunk_entities_entity_id"));
    assert.equal(migration.id, "code-db-schema-v2");
    assert.equal(existsSync(report.backupPath), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("corrupt code.db is moved aside with rebuild command", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-db-corrupt-"));
  const dbPath = join(rootDir, "code.db");
  try {
    await writeFile(dbPath, "not a sqlite database", "utf8");
    const recovery = recoverCorruptCodeDb({ dbPath, rootDir });

    assert.equal(recovery.recovered, true);
    assert.equal(existsSync(dbPath), false);
    assert.equal(existsSync(recovery.backupPath), true);
    assert.match(recovery.rebuildCommand, /build-code-index\.mjs --root/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
