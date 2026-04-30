import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  appendWorkItemComment,
  createWorkItemComment,
  readWorkItemComments,
  resolveWorkItemBlocker,
  summarizeWorkItemComments,
  threadWorkItemComments,
  writeWorkItemComments,
} from "../scripts/lib/supervibe-work-item-comments.mjs";

test("work-item comments redact secrets and preserve evidence links", () => {
  const comment = createWorkItemComment({
    workItemId: "task-1",
    type: "implementation-note",
    body: "token=abcdefghijklmnop",
    links: ["progress.md", { type: "evidence", target: "tests.log" }],
  });

  assert.equal(comment.body, "[REDACTED_SECRET]");
  assert.equal(comment.links.length, 2);
});

test("comments append/read JSONL and produce thread summaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-comments-"));
  const file = join(dir, "comments.jsonl");
  const root = await appendWorkItemComment(file, createWorkItemComment({
    workItemId: "task-1",
    type: "reviewer-feedback",
    body: "Please add evidence link.",
  }));
  await appendWorkItemComment(file, createWorkItemComment({
    workItemId: "task-1",
    type: "handoff",
    body: "Evidence attached.",
    parentCommentId: root.commentId,
  }));

  const comments = await readWorkItemComments(file);
  const threads = threadWorkItemComments(comments);
  const summary = summarizeWorkItemComments(comments);

  assert.equal(comments.length, 2);
  assert.equal(threads[0].replies.length, 1);
  assert.equal(summary.reviewFeedback, 1);
  assert.equal(summary.handoffs, 1);
});

test("blocker resolution requires a resolution comment or linked decision", async () => {
  const blocker = createWorkItemComment({ workItemId: "task-1", type: "blocker", body: "Need approval." });
  assert.equal(resolveWorkItemBlocker([blocker], blocker.commentId).ok, false);

  const resolved = resolveWorkItemBlocker([blocker], blocker.commentId, {
    body: "Approved in review note.",
    links: [{ type: "decision", target: "decision-1" }],
  });
  assert.equal(resolved.ok, true);
  assert.equal(summarizeWorkItemComments(resolved.comments).openBlockers, 0);

  const dir = await mkdtemp(join(tmpdir(), "supervibe-comments-write-"));
  await writeWorkItemComments(join(dir, "comments.jsonl"), resolved.comments);
  assert.equal((await readWorkItemComments(join(dir, "comments.jsonl"))).length, 2);
});
