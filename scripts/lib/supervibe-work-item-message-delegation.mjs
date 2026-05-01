import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";

export const DELEGATED_MESSAGE_TYPES = Object.freeze([
  "delegated-question",
  "blocker-request",
  "review-request",
  "handoff-note",
]);

export const DELEGATED_MESSAGE_TARGETS = Object.freeze(["user", "reviewer", "worker", "future-session"]);

export function defaultDelegatedInboxPath(rootDir = process.cwd()) {
  return join(rootDir, ".supervibe", "memory", "work-items", "inbox.jsonl");
}

export function createDelegatedMessage({
  workItemId,
  type = "delegated-question",
  target = "user",
  body,
  links = [],
  status = "open",
  createdAt = new Date().toISOString(),
} = {}) {
  if (!workItemId || !body) throw new Error("delegated message requires workItemId and body");
  if (!DELEGATED_MESSAGE_TYPES.includes(type)) throw new Error(`unknown delegated message type: ${type}`);
  if (!DELEGATED_MESSAGE_TARGETS.includes(target)) throw new Error(`unknown delegated message target: ${target}`);
  return {
    messageId: `msg-${workItemId}-${createdAt}`.replace(/[^A-Za-z0-9_-]+/g, "-"),
    workItemId,
    type,
    target,
    body: redactSensitiveContent(body),
    links,
    status,
    createdAt,
  };
}

export async function appendDelegatedMessage(path, message) {
  await mkdir(dirname(path), { recursive: true });
  const existing = await readOptional(path);
  await writeFile(path, `${existing}${JSON.stringify(message)}\n`, "utf8");
  return message;
}

export async function readDelegatedInbox(path = defaultDelegatedInboxPath()) {
  const content = await readOptional(path);
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function summarizeDelegatedInbox(messages = []) {
  const open = messages.filter((message) => message.status === "open");
  return {
    open: open.length,
    blockers: open.filter((message) => message.type === "blocker-request").length,
    reviews: open.filter((message) => message.type === "review-request").length,
    byTarget: open.reduce((acc, message) => {
      acc[message.target] = (acc[message.target] || 0) + 1;
      return acc;
    }, {}),
  };
}

export function closeDelegatedMessage(messages = [], messageId, { resolutionCommentId = null, decisionLink = null, closedAt = new Date().toISOString() } = {}) {
  const message = messages.find((candidate) => candidate.messageId === messageId);
  if (!message) throw new Error(`delegated message not found: ${messageId}`);
  if (message.type === "blocker-request" && !resolutionCommentId && !decisionLink) {
    throw new Error("closing a delegated blocker requires a resolution comment or linked decision");
  }
  return messages.map((candidate) =>
    candidate.messageId === messageId
      ? { ...candidate, status: "closed", resolutionCommentId, decisionLink, closedAt }
      : candidate
  );
}

export function formatDelegatedInbox(messages = []) {
  const summary = summarizeDelegatedInbox(messages);
  return [
    "SUPERVIBE_DELEGATED_INBOX",
    `OPEN: ${summary.open}`,
    `BLOCKERS: ${summary.blockers}`,
    `REVIEWS: ${summary.reviews}`,
    ...messages.filter((message) => message.status === "open").map((message) => `- ${message.workItemId} ${message.type} -> ${message.target}: ${message.body}`),
  ].join("\n");
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return "";
    throw err;
  }
}
