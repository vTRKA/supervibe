import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendEvidenceRecord,
  auditEvidenceLedger,
  createEvidenceRecord,
  formatEvidenceLedgerStatus,
  repairEvidenceLedgerRedactionStatus,
} from "../scripts/lib/supervibe-evidence-ledger.mjs";

test("evidence ledger fails delivery when required context evidence is missing", () => {
  const record = createEvidenceRecord({
    taskId: "T28",
    agentId: "code-reviewer",
    retrievalPolicy: { memory: "mandatory", rag: "mandatory", codegraph: "mandatory", reason: "non-trivial refactor" },
    memoryIds: [],
    ragChunkIds: ["chunk-a"],
    graphSymbols: [],
    citations: [{ id: "c1", source: "rag", path: "scripts/lib/example.mjs" }],
    verificationCommands: ["node --test"],
    redactionStatus: "redacted",
  });

  assert.equal(record.gate.pass, false, "required memory or graph evidence was missing but task passed");
  assert.match(record.gate.failures.join("\n"), /required memory evidence missing/);
  assert.match(record.gate.failures.join("\n"), /required graph evidence missing/);
  assert.ok(record.gate.creates.includes("strengthen-task"));
});

test("evidence ledger passes cited, redacted and verified delivery", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-evidence-ledger-"));
  await appendEvidenceRecord({
    taskId: "T28",
    agentId: "code-reviewer",
    retrievalPolicy: { memory: "mandatory", rag: "mandatory", codegraph: "mandatory", reason: "non-trivial code work" },
    memoryIds: ["memory-1"],
    ragChunkIds: ["chunk-1"],
    graphSymbols: ["evaluateEvidenceGate"],
    citations: [
      { id: "memory-1", source: "memory", path: ".supervibe/memory/decisions/a.md", redacted: true },
      { id: "chunk-1", source: "rag", path: "scripts/lib/supervibe-evidence-ledger.mjs", redacted: true },
    ],
    verificationCommands: ["node --test tests/agent-tool-use-gates.test.mjs"],
    redactionStatus: "redacted",
  }, { rootDir });

  const report = await auditEvidenceLedger({ rootDir });
  assert.equal(report.pass, true, formatEvidenceLedgerStatus(report));
  assert.match(formatEvidenceLedgerStatus(report), /ENTRIES: 1/);
});

test("evidence ledger treats append-only repair entries as superseding older agent task evidence", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-evidence-ledger-repair-"));
  const base = {
    taskId: "T41 enforce atomization task budget",
    agentId: "worker-t41-atomization-budget",
    retrievalPolicy: { memory: "optional", rag: "optional", codegraph: "optional", reason: "task-local verification" },
    verificationCommands: ["node --test tests/supervibe-loop-scheduler.test.mjs"],
  };
  await appendEvidenceRecord({
    ...base,
    redactionStatus: "unknown",
  }, { rootDir });
  let report = await auditEvidenceLedger({ rootDir });
  assert.equal(report.pass, false);
  assert.equal(report.total, 1);
  assert.equal(report.rawTotal, 1);

  await appendEvidenceRecord({
    ...base,
    redactionStatus: "not-needed",
    diagnosticEvents: [{ type: "redaction-status-repair", message: "repair test" }],
  }, { rootDir });
  report = await auditEvidenceLedger({ rootDir });
  assert.equal(report.pass, true, formatEvidenceLedgerStatus(report));
  assert.equal(report.total, 1);
  assert.equal(report.rawTotal, 2);
});

test("evidence ledger redaction repair is dry-run by default and appends only on apply", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-evidence-ledger-redaction-"));
  await appendEvidenceRecord({
    taskId: "Read-only tail execution order and parallelism scan for active Supervibe loop graph",
    agentId: "tail-readiness-explorer",
    retrievalPolicy: { memory: "optional", rag: "optional", codegraph: "optional", reason: "read-only scan" },
    verificationCommands: ["read-only graph and plan inspection; no full check"],
    redactionStatus: "unknown",
  }, { rootDir });

  const preview = await repairEvidenceLedgerRedactionStatus({ rootDir, apply: false });
  assert.equal(preview.planned.length, 1);
  assert.equal(preview.appended.length, 0);
  assert.equal((await auditEvidenceLedger({ rootDir })).pass, false);

  const applied = await repairEvidenceLedgerRedactionStatus({
    rootDir,
    apply: true,
    now: "2026-05-13T00:00:00.000Z",
  });
  assert.equal(applied.planned.length, 1);
  assert.equal(applied.appended.length, 1);
  const report = await auditEvidenceLedger({ rootDir });
  assert.equal(report.pass, true, formatEvidenceLedgerStatus(report));
  assert.equal(report.entries[0].redactionStatus, "not-needed");
});
