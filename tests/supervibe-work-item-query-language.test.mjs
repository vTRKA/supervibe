import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStructuredWorkItemQuery,
  compileNaturalLanguageWorkItemQuery,
  formatStructuredWorkItemQueryResult,
  getDueAt,
  parseWorkItemQuery,
  tokenizeQuery,
  WORK_ITEM_QUERY_FIELDS,
  WORK_ITEM_SORT_FIELDS,
} from "../scripts/lib/supervibe-work-item-query-language.mjs";

const index = [
  {
    itemId: "a",
    title: "Integration blocker",
    effectiveStatus: "blocked",
    labels: ["integration"],
    createdAt: "2026-04-28T00:00:00.000Z",
    blockedReason: "ci",
    repo: "web",
    package: "ui",
    risk: "high",
    dueAt: "2026-04-30T10:00:00.000Z",
  },
  {
    itemId: "b",
    title: "Ready work",
    effectiveStatus: "ready",
    labels: ["feature"],
    createdAt: "2026-04-29T00:00:00.000Z",
    priority: 5,
    severity: "critical",
    dueAt: "2026-05-02T10:00:00.000Z",
  },
];

test("structured query parses only whitelisted filters and sorts", () => {
  const parsed = parseWorkItemQuery('status:blocked label:integration sort:age unknown:exec("bad")');

  assert.ok(WORK_ITEM_QUERY_FIELDS.includes("status"));
  assert.ok(WORK_ITEM_SORT_FIELDS.includes("age"));
  assert.equal(parsed.safe, true);
  assert.equal(parsed.filters.status[0].value, "blocked");
  assert.equal(parsed.sort[0].field, "age");
  assert.ok(parsed.warnings.some((warning) => warning.code === "unknown-field"));
  assert.deepEqual(tokenizeQuery('label:"needs review" status:blocked'), ["label:needs review", "status:blocked"]);
});

test("structured query filters status, label, due state, risk, and formats results", () => {
  const result = applyStructuredWorkItemQuery(index, "status:blocked label:integration risk:high due:soon sort:age", {
    now: "2026-04-30T09:00:00.000Z",
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].itemId, "a");
  assert.match(formatStructuredWorkItemQueryResult(result), /MATCHED: 1\/2/);
  assert.equal(getDueAt(result.items[0]), "2026-04-30T10:00:00.000Z");
});

test("natural language compiles to safe structured filters when confidence is high", () => {
  const compiled = compileNaturalLanguageWorkItemQuery("show overdue high risk work", {
    currentOwner: "worker-1",
  });

  assert.ok(compiled.confidence >= 0.8);
  assert.equal(compiled.parsed.safe, true);
});
