import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { redactSensitiveText } from "./autonomous-loop-provider-policy-guard.mjs";

export const WORK_ITEM_COMMENT_TYPES = Object.freeze([
  "implementation-note",
  "reviewer-feedback",
  "blocker",
  "user-decision",
  "handoff",
  "delegated-question",
  "resolution",
]);

export function createWorkItemComment({
  workItemId,
  author = "supervibe-loop",
  type = "implementation-note",
  body = "",
  links = [],
  parentCommentId = null,
  resolvesCommentId = null,
  createdAt = new Date().toISOString(),
} = {}) {
  if (!workItemId) throw new Error("workItemId is required");
  if (!WORK_ITEM_COMMENT_TYPES.includes(type)) throw new Error(`Unknown work-item comment type: ${type}`);
  const safeBody = redactSensitiveText(body);
  return {
    commentId: `comment-${createHash("sha1").update(`${workItemId}:${type}:${safeBody}:${createdAt}`).digest("hex").slice(0, 10)}`,
    workItemId,
    author,
    type,
    body: safeBody,
    links: normalizeLinks(links),
    parentCommentId,
    resolvesCommentId,
    createdAt,
    status: resolvesCommentId ? "resolution" : type === "blocker" || type === "delegated-question" ? "open" : "noted",
  };
}

export async function appendWorkItemComment(filePath, comment) {
  await mkdir(dirname(filePath), { recursive: true });
  const entry = comment.commentId ? comment : createWorkItemComment(comment);
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export async function readWorkItemComments(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return content.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function writeWorkItemComments(filePath, comments = []) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${comments.map((comment) => JSON.stringify(comment)).join("\n")}${comments.length ? "\n" : ""}`, "utf8");
  return comments;
}

export function threadWorkItemComments(comments = []) {
  const byId = new Map(comments.map((comment) => [comment.commentId, { ...comment, replies: [] }]));
  const roots = [];
  for (const comment of byId.values()) {
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId).replies.push(comment);
    } else {
      roots.push(comment);
    }
  }
  return roots;
}

export function summarizeWorkItemComments(comments = []) {
  const openBlockers = comments.filter((comment) => ["blocker", "delegated-question"].includes(comment.type) && comment.status === "open");
  const resolvedIds = new Set(comments.map((comment) => comment.resolvesCommentId).filter(Boolean));
  return {
    total: comments.length,
    openBlockers: openBlockers.filter((comment) => !resolvedIds.has(comment.commentId)).length,
    reviewFeedback: comments.filter((comment) => comment.type === "reviewer-feedback").length,
    handoffs: comments.filter((comment) => comment.type === "handoff").length,
    decisions: comments.filter((comment) => comment.type === "user-decision").length,
  };
}

export function resolveWorkItemBlocker(comments = [], blockerCommentId, resolution = {}) {
  const blocker = comments.find((comment) => comment.commentId === blockerCommentId);
  if (!blocker || !["blocker", "delegated-question"].includes(blocker.type)) {
    return { ok: false, reason: "blocker_comment_not_found", comments };
  }
  if (!resolution.body && !(resolution.links || []).length) {
    return { ok: false, reason: "resolution_comment_or_link_required", comments };
  }
  const resolved = comments.map((comment) =>
    comment.commentId === blockerCommentId ? { ...comment, status: "resolved", resolvedAt: resolution.createdAt || new Date().toISOString() } : comment
  );
  const resolutionComment = createWorkItemComment({
    workItemId: blocker.workItemId,
    author: resolution.author || "supervibe-loop",
    type: "resolution",
    body: resolution.body || "Resolved by linked decision.",
    links: resolution.links || [],
    parentCommentId: blocker.commentId,
    resolvesCommentId: blocker.commentId,
    createdAt: resolution.createdAt,
  });
  return { ok: true, comments: [...resolved, resolutionComment], resolution: resolutionComment };
}

function normalizeLinks(links = []) {
  return links.map((link) => {
    if (typeof link === "string") return { type: "artifact", target: link };
    return {
      type: link.type || "artifact",
      target: link.target || link.path || link.url || "",
      label: link.label || null,
    };
  }).filter((link) => link.target);
}
