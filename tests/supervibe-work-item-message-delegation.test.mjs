import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWorkItemIndex, queryWorkItems } from "../scripts/lib/supervibe-work-item-query.mjs";
import {
  appendDelegatedMessage,
  closeDelegatedMessage,
  createDelegatedMessage,
  DELEGATED_MESSAGE_TARGETS,
  DELEGATED_MESSAGE_TYPES,
  defaultDelegatedInboxPath,
  formatDelegatedInbox,
  readDelegatedInbox,
  summarizeDelegatedInbox,
} from "../scripts/lib/supervibe-work-item-message-delegation.mjs";

test("delegated messages are redacted, persisted, summarized, and surfaced in work-item queries", async () => {
  assert.ok(DELEGATED_MESSAGE_TYPES.includes("blocker-request"));
  assert.ok(DELEGATED_MESSAGE_TARGETS.includes("user"));

  const root = await mkdtemp(join(tmpdir(), "supervibe-inbox-"));
  const path = defaultDelegatedInboxPath(root);
  const message = createDelegatedMessage({
    workItemId: "t1",
    type: "blocker-request",
    target: "user",
    body: "Need approval token=secret-value-that-must-redact",
  });
  await appendDelegatedMessage(path, message);
  const inbox = await readDelegatedInbox(path);

  assert.match(inbox[0].body, /\[REDACTED\]/);
  assert.equal(summarizeDelegatedInbox(inbox).blockers, 1);
  assert.match(formatDelegatedInbox(inbox), /BLOCKERS: 1/);

  const index = createWorkItemIndex({
    graph: { items: [{ itemId: "t1", title: "Blocked" }], tasks: [{ id: "t1", status: "open" }] },
    delegatedMessages: inbox,
  });
  assert.equal(index[0].effectiveStatus, "delegated");
  assert.match(queryWorkItems("show inbox", { index }).answer, /t1/);
});

test("closing delegated blockers requires a resolution comment or linked decision", () => {
  const message = createDelegatedMessage({ workItemId: "t1", type: "blocker-request", body: "Need decision" });
  assert.throws(() => closeDelegatedMessage([message], message.messageId), /resolution comment/);
  const closed = closeDelegatedMessage([message], message.messageId, { resolutionCommentId: "comment-1" });
  assert.equal(closed[0].status, "closed");
});
