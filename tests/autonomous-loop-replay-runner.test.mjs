import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadBenchmarkCorpus, loadGoldenOutcomes } from "../scripts/lib/autonomous-loop-benchmark-corpus.mjs";
import {
  compareReplayToGolden,
  createReplaySnapshot,
  formatReplayDiff,
  replayArchivedRun,
  replayBenchmarkCase,
} from "../scripts/lib/autonomous-loop-replay-runner.mjs";
import { evaluateReplayOutcome } from "../scripts/lib/autonomous-loop-evaluator.mjs";

test("replay runner deterministically compares benchmark cases to golden outcomes", async () => {
  const corpus = await loadBenchmarkCorpus();
  const golden = await loadGoldenOutcomes();
  const caseDef = corpus.cases.find((entry) => entry.id === "plan-review-loop");
  const replay = replayBenchmarkCase(caseDef, golden.outcomes["plan-review-loop"]);

  assert.equal(replay.remoteMutation, false);
  assert.equal(replay.workspaceMutation, false);
  assert.equal(replay.comparison.pass, true);
  assert.equal(evaluateReplayOutcome({ replay }).pass, true);
});

test("replay runner reports exact artifact diffs and replays archived run dirs", async () => {
  const snapshot = createReplaySnapshot({ state: { run_id: "run1", status: "COMPLETE", next_action: "done", tasks: [] } });
  const comparison = compareReplayToGolden(snapshot, { status: "BLOCKED", nextAction: "done" });
  const dir = await mkdtemp(join(tmpdir(), "supervibe-replay-"));
  await writeFile(join(dir, "state.json"), JSON.stringify({ run_id: "run1", status: "COMPLETE", tasks: [] }), "utf8");
  const archived = await replayArchivedRun(dir);

  assert.equal(comparison.pass, false);
  assert.match(formatReplayDiff(comparison), /status/);
  assert.equal(archived.snapshot.runId, "run1");
});
