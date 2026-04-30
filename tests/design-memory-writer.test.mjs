import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildAcceptedDesignDecision,
  buildDesignMemoryEntry,
  buildRejectedDesignAlternative,
  writeDesignMemoryEntry,
} from "../scripts/lib/design-memory-writer.mjs";

test("design memory writer builds accepted and rejected entries with evidence", async () => {
  const accepted = buildAcceptedDesignDecision({
    title: "Use compact chart cards",
    summary: "Accepted compact cards for analytics dashboard charts.",
    rationale: "Matches approved dashboard density.",
    evidenceLinks: ["design-row:charts:12"],
    artifactPaths: ["prototypes/analytics/spec.md"],
    tags: ["charts", "tokens"],
    confidence: 9,
  });
  assert.equal(accepted.category, "decisions");
  assert.equal(accepted.tags.includes("design"), true);
  assert.equal(accepted.tags.includes("accepted"), true);

  const rejected = buildRejectedDesignAlternative({
    title: "Use decorative glass chart panels",
    summary: "Rejected glass panels for poor contrast.",
    rationale: "Contrast and density regressions.",
    evidenceLinks: ["review:ui-polish"],
    tags: ["charts"],
  });
  assert.equal(rejected.tags.includes("rejected"), true);
});

test("design memory writer rejects speculative decisions without evidence", () => {
  assert.throws(() => buildDesignMemoryEntry({
    type: "accepted-decision",
    title: "Speculative palette",
    summary: "No evidence yet.",
  }), /requires at least one evidence/);
});

test("design memory writer writes into existing memory categories", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-design-memory-"));
  const written = await writeDesignMemoryEntry({
    type: "learned-pattern",
    title: "Token-first chart states",
    summary: "Chart state styling should use approved tokens.",
    rationale: "Keeps implementation portable.",
    tags: ["charts", "tokens"],
  }, { projectRoot });
  const content = await readFile(written.path, "utf8");
  assert.match(written.path.replace(/\\/g, "/"), /\.claude\/memory\/patterns\/design-learned-pattern-token-first-chart-states\.md$/);
  assert.match(content, /tags: \["design", "charts", "tokens"\]/);
});
