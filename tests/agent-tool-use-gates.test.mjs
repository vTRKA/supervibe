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
      { id: "memory-1", source: "memory", path: ".claude/memory/decisions/a.md", redacted: true },
      { id: "chunk-1", source: "rag", path: "scripts/lib/supervibe-evidence-ledger.mjs", redacted: true },
    ],
    verificationCommands: ["node --test tests/agent-tool-use-gates.test.mjs"],
    redactionStatus: "redacted",
  }, { rootDir });

  const report = await auditEvidenceLedger({ rootDir });
  assert.equal(report.pass, true, formatEvidenceLedgerStatus(report));
  assert.match(formatEvidenceLedgerStatus(report), /ENTRIES: 1/);
});
