import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import {
  REQUIRED_DESIGN_SYSTEM_SECTIONS,
} from "./design-flow-state.mjs";
import {
  buildDesignPrototypeStageTriage,
} from "./design-workflow-status.mjs";
import {
  artifactRoot,
} from "./supervibe-artifact-roots.mjs";

export async function promoteDesignApprovalState(rootDir = process.cwd(), {
  slug = null,
  approvedBy = "user",
  approvedAt = new Date().toISOString(),
  feedbackHash = "manual-approval",
  approvalScope = "full",
} = {}) {
  const updatedFiles = [];
  const createdFiles = [];
  const issues = [];
  const prototypesRoot = artifactRoot(rootDir, "prototypes");
  const designSystemRoot = join(prototypesRoot, "_design-system");
  if (!existsSync(designSystemRoot)) {
    return {
      pass: false,
      updatedFiles,
      createdFiles,
      issues: [`missing design-system root: ${normalizeRelPath(relative(rootDir, designSystemRoot))}`],
    };
  }

  await promoteManifest(rootDir, designSystemRoot, { approvedBy, approvedAt, feedbackHash, updatedFiles });
  await promoteFlowState(rootDir, designSystemRoot, { approvedBy, approvedAt, feedbackHash, updatedFiles });
  await promoteSectionApprovals(rootDir, designSystemRoot, { approvedBy, approvedAt, feedbackHash, updatedFiles, createdFiles });
  await promoteMarkdownStatuses(rootDir, designSystemRoot, { updatedFiles });

  if (slug) {
    const prototypeRoot = join(prototypesRoot, slug);
    if (existsSync(prototypeRoot)) {
      await promotePrototypeConfig(rootDir, prototypeRoot, { approvedBy, approvedAt, feedbackHash, approvalScope, updatedFiles, createdFiles });
      if (prototypeArtifactExists(prototypeRoot) && approvalScope !== "design-system-only") {
        await writePrototypeApproval(rootDir, prototypeRoot, { approvedBy, approvedAt, feedbackHash, approvalScope, updatedFiles, createdFiles });
        await promoteMarkdownStatuses(rootDir, prototypeRoot, { updatedFiles });
        await writeDesignerPackageManifest(rootDir, designSystemRoot, prototypeRoot, { approvedAt, updatedFiles, createdFiles });
      }
    } else {
      issues.push(`prototype not found: ${normalizeRelPath(relative(rootDir, prototypeRoot))}`);
    }
  }

  return {
    pass: issues.length === 0,
    updatedFiles: [...new Set(updatedFiles)],
    createdFiles: [...new Set(createdFiles)],
    issues,
  };
}

async function writeDesignerPackageManifest(rootDir, designSystemRoot, prototypeRoot, context) {
  const path = join(prototypeRoot, "designer-package.json");
  const existed = existsSync(path);
  const artifacts = {
    direction: ".supervibe/artifacts/brandbook/direction.md",
    tokens: rel(rootDir, join(designSystemRoot, "tokens.css")),
    styleboard: rel(rootDir, join(designSystemRoot, "styleboard.html")),
    spec: rel(rootDir, join(prototypeRoot, "spec.md")),
    screenshots: rel(rootDir, join(prototypeRoot, "_screenshots")),
    rejectedAlternatives: rel(rootDir, join(prototypeRoot, "alternatives")),
    approvalState: rel(rootDir, join(prototypeRoot, ".approval.json")),
    knownRisks: rel(rootDir, join(prototypeRoot, "_reviews", "known-risks.md")),
  };
  const missing = Object.entries(artifacts)
    .filter(([, artifactPath]) => !existsSync(join(rootDir, ...artifactPath.split("/"))))
    .map(([key, artifactPath]) => ({ key, path: artifactPath }));
  await writeJson(path, {
    schemaVersion: 1,
    generatedAt: context.approvedAt,
    status: "approved",
    artifacts,
    missing,
  });
  (existed ? context.updatedFiles : context.createdFiles).push(rel(rootDir, path));
  context.updatedFiles.push(rel(rootDir, path));
}

async function promoteManifest(rootDir, designSystemRoot, context) {
  const path = join(designSystemRoot, "manifest.json");
  if (!existsSync(path)) return;
  const manifest = await readJson(path);
  if (!manifest) return;
  manifest.status = "approved";
  manifest.tokensState = "final";
  manifest.approved_at = context.approvedAt;
  manifest.approved_by = context.approvedBy;
  manifest.feedback_hash = context.feedbackHash;
  manifest.approved_sections = [...REQUIRED_DESIGN_SYSTEM_SECTIONS];
  manifest.sections = promoteSections(manifest.sections);
  await writeJson(path, manifest);
  context.updatedFiles.push(rel(rootDir, path));
}

async function promoteFlowState(rootDir, designSystemRoot, context) {
  const path = join(designSystemRoot, "design-flow-state.json");
  const flow = existsSync(path) ? await readJson(path) : {};
  if (!flow) return;
  flow.creative_direction = {
    ...(flow.creative_direction || {}),
    status: flow.creative_direction?.status || "selected",
  };
  flow.design_system = {
    ...(flow.design_system || {}),
    status: "approved",
    approved_at: context.approvedAt,
    approved_by: context.approvedBy,
    approved_sections: [...REQUIRED_DESIGN_SYSTEM_SECTIONS],
    feedback_hash: context.feedbackHash,
    sections: promoteSections(flow.design_system?.sections),
  };
  flow.prototype = {
    ...(flow.prototype || {}),
    requested: "ALLOWED",
    status: flow.prototype?.status || "prototype-ready",
    next_action: "Build prototype / revise DS / stop",
    handoff_blocked_reason: "handoff requires approved prototype, not only approved design system",
  };
  await writeJson(path, flow);
  context.updatedFiles.push(rel(rootDir, path));
}

async function promoteSectionApprovals(rootDir, designSystemRoot, context) {
  const approvalRoot = join(designSystemRoot, ".approvals");
  await mkdir(approvalRoot, { recursive: true });
  for (const section of REQUIRED_DESIGN_SYSTEM_SECTIONS) {
    const path = join(approvalRoot, `${section}.json`);
    const existed = existsSync(path);
    const approval = existed ? await readJson(path) : { section };
    if (!approval) continue;
    approval.section = approval.section || section;
    approval.status = "approved";
    approval.approved_at = context.approvedAt;
    approval.approved_by = context.approvedBy;
    approval.feedback_hash = context.feedbackHash;
    await writeJson(path, approval);
    (existed ? context.updatedFiles : context.createdFiles).push(rel(rootDir, path));
  }
}

async function promotePrototypeConfig(rootDir, prototypeRoot, context) {
  const path = join(prototypeRoot, "config.json");
  const existed = existsSync(path);
  const config = existed ? await readJson(path) : {};
  if (!config) return;
  const hasPrototype = prototypeArtifactExists(prototypeRoot);
  config.approval = hasPrototype && context.approvalScope !== "design-system-only" ? "approved" : "design-system-approved";
  config.status = hasPrototype && context.approvalScope !== "design-system-only" ? "approved" : "prototype-ready";
  config.approvedAt = context.approvedAt;
  config.approvedBy = context.approvedBy;
  config.feedbackHash = context.feedbackHash;
  config.approvalScope = context.approvalScope;
  config.prototypeUnlocked = true;
  config.prototypeExists = hasPrototype;
  config.handoffBlocked = !hasPrototype || context.approvalScope === "design-system-only";
  config.nextAction = hasPrototype && context.approvalScope !== "design-system-only"
    ? "Package handoff"
    : "Build prototype / revise DS / stop";
  config.stageTriage = buildDesignPrototypeStageTriage(config.stageTriage, {
    mode: config.mode || config.executionMode || "full-prototype-pipeline",
    reason: "design-system approved; prototype phase ready",
  });
  await writeJson(path, config);
  (existed ? context.updatedFiles : context.createdFiles).push(rel(rootDir, path));
  if (!existed) context.updatedFiles.push(rel(rootDir, path));
}

async function writePrototypeApproval(rootDir, prototypeRoot, context) {
  const path = join(prototypeRoot, ".approval.json");
  const existed = existsSync(path);
  const approval = existed ? await readJson(path) : {};
  if (!approval) return;
  approval.status = "approved";
  approval.approvedAt = context.approvedAt;
  approval.approvedBy = context.approvedBy;
  approval.feedbackHash = context.feedbackHash;
  approval.approvalScope = context.approvalScope;
  approval.tokensState = "final";
  await writeJson(path, approval);
  (existed ? context.updatedFiles : context.createdFiles).push(rel(rootDir, path));
  if (!existed) context.updatedFiles.push(rel(rootDir, path));
}

async function promoteMarkdownStatuses(rootDir, startDir, context) {
  for (const file of walkMarkdown(startDir)) {
    const before = await readFile(file, "utf8");
    const after = before
      .replace(/(^|\n)(Status|Approval):\s*(candidate|draft|needs_revision|needs-revision)\b/gi, `$1$2: approved`)
      .replace(/(^|\n)(State):\s*(candidate|draft|needs_revision|needs-revision)\b/gi, `$1$2: approved`);
    if (after === before) continue;
    await writeFile(file, after, "utf8");
    context.updatedFiles.push(rel(rootDir, file));
  }
}

function promoteSections(value) {
  const sections = value && typeof value === "object" ? { ...value } : {};
  for (const section of REQUIRED_DESIGN_SYSTEM_SECTIONS) {
    const current = sections[section];
    sections[section] = current && typeof current === "object"
      ? { ...current, status: "approved" }
      : "approved";
  }
  return sections;
}

function prototypeArtifactExists(prototypeRoot) {
  return existsSync(join(prototypeRoot, "index.html"));
}

function walkMarkdown(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdown(full));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    if (statSync(full).size > 1_000_000) continue;
    files.push(full);
  }
  return files;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rel(rootDir, path) {
  return normalizeRelPath(relative(rootDir, path));
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/");
}
