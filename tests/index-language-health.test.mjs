import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIndexHealthSnapshot,
  evaluateIndexHealthGate,
  formatIndexHealthGate,
} from "../scripts/lib/supervibe-index-health.mjs";

test("index health reports independent source and graph readiness by language", () => {
  const health = buildIndexHealthSnapshot({
    manifest: {
      eligibleSourceFiles: 12,
      indexedSourceFiles: 7,
      languageCoverage: {
        typescript: { eligible: 6, indexed: 6, filesWithSymbols: 6 },
        rust: { eligible: 6, indexed: 1, filesWithSymbols: 0 },
      },
      crossResolvedEdges: { resolved: 0, total: 0 },
    },
  });

  const gate = evaluateIndexHealthGate(health, { coverageThreshold: 0.9 });
  assert.equal(gate.languageReadiness.typescript.sourceReady, true);
  assert.equal(gate.languageReadiness.typescript.graphReady, true);
  assert.equal(gate.languageReadiness.rust.sourceReady, false);
  assert.equal(gate.languageReadiness.rust.graphReady, false);
  assert.match(gate.languageReadiness.rust.repairCommand, /--language rust/);

  const text = formatIndexHealthGate(gate);
  assert.match(text, /LANGUAGE_READY:/);
  assert.match(text, /typescript: source=true graph=true/);
  assert.match(text, /rust: source=false graph=false/);
});
