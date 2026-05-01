import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

const CODE_DB_SCHEMA_VERSION = 1;

export function detectCodeDbSchema(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  const codeFileColumns = tables.has("code_files")
    ? db.prepare("PRAGMA table_info(code_files)").all().map((row) => row.name)
    : [];
  const version = Number(db.prepare("PRAGMA user_version").get()?.user_version || 0);
  return {
    version,
    tables: [...tables],
    codeFileColumns,
    needsMigration: version < CODE_DB_SCHEMA_VERSION || (tables.has("code_files") && !codeFileColumns.includes("graph_version")),
  };
}

export function applyCodeDbMigrations(db, { dbPath = null } = {}) {
  const before = detectCodeDbSchema(db);
  const rowCountsBefore = collectRowCounts(db);
  const applied = [];
  const backupPath = before.needsMigration && dbPath ? backupCodeDb(dbPath) : null;

  if (!before.needsMigration) {
    return {
      pass: true,
      before,
      after: before,
      applied,
      backupPath,
      rowCountsBefore,
      rowCountsAfter: rowCountsBefore,
      rowCountOk: true,
    };
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS supervibe_schema_migrations (
      version INTEGER PRIMARY KEY,
      id TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  if (before.tables.includes("code_files") && !before.codeFileColumns.includes("graph_version")) {
    db.exec("ALTER TABLE code_files ADD COLUMN graph_version INTEGER NOT NULL DEFAULT 0;");
    applied.push("001-add-code-files-graph-version");
  }

  db.exec(`PRAGMA user_version = ${CODE_DB_SCHEMA_VERSION};`);
  db.prepare("INSERT OR IGNORE INTO supervibe_schema_migrations (version, id, applied_at) VALUES (?, ?, datetime('now'))")
    .run(CODE_DB_SCHEMA_VERSION, "code-db-schema-v1");

  const after = detectCodeDbSchema(db);
  const rowCountsAfter = collectRowCounts(db);
  const rowCountOk = rowCountsBefore.code_files === rowCountsAfter.code_files;

  return {
    pass: !after.needsMigration && rowCountOk,
    before,
    after,
    applied,
    backupPath,
    rowCountsBefore,
    rowCountsAfter,
    rowCountOk,
  };
}

export function recoverCorruptCodeDb({ dbPath, rootDir = process.cwd() } = {}) {
  if (!dbPath || !existsSync(dbPath)) {
    return { recovered: false, reason: "missing-db" };
  }
  const backupPath = `${dbPath}.corrupt-${Date.now()}.bak`;
  mkdirSync(dirname(backupPath), { recursive: true });
  renameSync(dbPath, backupPath);
  return {
    recovered: true,
    backupPath,
    rebuildCommand: `node scripts/build-code-index.mjs --root ${rootDir} --force --health`,
  };
}

export function formatCodeDbMigrationReport(report) {
  return [
    "SUPERVIBE_CODE_DB_MIGRATION",
    `PASS: ${report.pass}`,
    `FROM: ${report.before.version}`,
    `TO: ${report.after.version}`,
    `APPLIED: ${report.applied.join(", ") || "none"}`,
    `BACKUP: ${report.backupPath || "none"}`,
    `ROW_COUNT_OK: ${report.rowCountOk}`,
  ].join("\n");
}

function backupCodeDb(dbPath) {
  if (!existsSync(dbPath)) return null;
  const backupPath = `${dbPath}.schema-${Date.now()}.bak`;
  mkdirSync(dirname(backupPath), { recursive: true });
  copyFileSync(dbPath, backupPath);
  return backupPath;
}

function collectRowCounts(db) {
  const counts = {};
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  for (const table of ["code_files", "code_chunks", "code_symbols", "code_edges"]) {
    if (!tables.includes(table)) {
      counts[table] = 0;
      continue;
    }
    counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count || 0);
  }
  return counts;
}
