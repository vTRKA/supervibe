import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
  issueWorkflowInvocationReceipt,
} from "./supervibe-workflow-receipt-runtime.mjs";

const BRANDBOOK_PRODUCER_ID = "supervibe:brandbook";
const BRANDBOOK_PRODUCER_STAGE = "stage-2-design-system";
const DESIGN_SYSTEM_ROOT = ".supervibe/artifacts/prototypes/_design-system";

const KNOWN_ROOT_OUTPUTS = Object.freeze([
  "tokens.css",
  "manifest.json",
  "design-flow-state.json",
  "styleboard.html",
  "motion.css",
  "voice.md",
  "accessibility.md",
]);

export function resolveBrandbookTemplatePath({
  pluginRoot = process.cwd(),
  target = "web",
} = {}) {
  const normalizedTarget = String(target || "web").toLowerCase();
  const candidate = join(pluginRoot, "templates", "brandbook-target-baselines", `${normalizedTarget}.md`);
  if (existsSync(candidate)) return normalizeRelPath(relative(pluginRoot, candidate));
  const fallback = join(pluginRoot, "templates", "brandbook-target-baselines", "web.md");
  return existsSync(fallback) ? normalizeRelPath(relative(pluginRoot, fallback)) : null;
}

export function planBrandbookProducer({
  rootDir = process.cwd(),
  pluginRoot = rootDir,
  sourceDir,
  target = "web",
  slug = null,
  handoffId = null,
} = {}) {
  const issues = [];
  if (!sourceDir) issues.push("sourceDir required");
  const absSourceDir = sourceDir ? resolveProjectPath(rootDir, sourceDir) : null;
  if (absSourceDir && !existsSync(absSourceDir)) issues.push(`sourceDir missing: ${normalizeRelPath(sourceDir)}`);
  const templatePath = resolveBrandbookTemplatePath({ pluginRoot, target });
  if (!templatePath) issues.push(`brandbook target baseline missing for ${target}`);
  const outputs = absSourceDir && existsSync(absSourceDir)
    ? discoverBrandbookSourceOutputs(rootDir, absSourceDir)
    : [];
  if (outputs.length === 0) issues.push("sourceDir contains no recognized brandbook outputs");
  const rels = new Set(outputs.map((item) => item.rel));
  for (const required of ["tokens.css", "manifest.json", "design-flow-state.json"]) {
    if (!rels.has(required)) issues.push(`${required} is required for brandbook producer output`);
  }
  const configSnapshot = slug ? prototypeConfigSnapshotPath(rootDir, slug, handoffId) : null;
  return {
    schemaVersion: 1,
    producerId: BRANDBOOK_PRODUCER_ID,
    stageId: BRANDBOOK_PRODUCER_STAGE,
    command: "/supervibe-design",
    target,
    slug,
    handoffId,
    sourceDir: sourceDir ? normalizeRelPath(sourceDir) : null,
    templatePath,
    transactionRequired: true,
    phases: ["prepare", "write-temp", "validate", "promote", "receipt", "planner-refresh"],
    configSnapshot,
    outputs,
    pass: issues.length === 0,
    issues,
  };
}

export async function runBrandbookProducer({
  rootDir = process.cwd(),
  pluginRoot = rootDir,
  sourceDir,
  target = "web",
  slug = null,
  handoffId,
  reason = "brandbook executable producer promoted candidate design-system outputs",
  runTimestamp = null,
  dryRun = false,
  secret = null,
} = {}) {
  if (!handoffId) throw new Error("handoffId required");
  const timestamp = runTimestamp || new Date().toISOString();
  const plan = planBrandbookProducer({ rootDir, pluginRoot, sourceDir, target, slug, handoffId });
  if (!plan.pass) {
    return {
      pass: false,
      dryRun,
      plan,
      phases: phaseResult(["prepare"], false, plan.issues),
    };
  }
  if (dryRun) {
    return {
      pass: true,
      dryRun: true,
      plan,
      phases: phaseResult(["prepare"], true, []),
    };
  }

  const transactionDir = join(
    rootDir,
    ".supervibe",
    "artifacts",
    "_workflow-transactions",
    "supervibe-design",
    sanitizeId(handoffId),
    `${sanitizeId(BRANDBOOK_PRODUCER_ID)}-${sanitizeId(BRANDBOOK_PRODUCER_STAGE)}-${sanitizeId(timestamp)}`,
  );
  const stagedOutputs = await stageBrandbookOutputs({ rootDir, transactionDir, outputs: plan.outputs });
  const inputEvidence = await writeProducerInputEvidence({
    rootDir,
    transactionDir,
    pluginRoot,
    target,
    slug,
    handoffId,
    templatePath: plan.templatePath,
    sourceDir,
    outputs: plan.outputs,
  });
  const validation = validateStagedBrandbookOutputs(rootDir, stagedOutputs);
  if (!validation.pass) {
    return {
      pass: false,
      dryRun: false,
      plan,
      transactionDir: normalizeRelPath(relative(rootDir, transactionDir)),
      phases: phaseResult(["prepare", "write-temp", "validate"], false, validation.issues),
      validation,
    };
  }
  const promoted = await promoteBrandbookOutputs({ rootDir, stagedOutputs });
  const receiptResult = await issueWorkflowInvocationReceipt({
    rootDir,
    command: "/supervibe-design",
    subjectType: "skill",
    subjectId: BRANDBOOK_PRODUCER_ID,
    skillId: BRANDBOOK_PRODUCER_ID,
    stage: BRANDBOOK_PRODUCER_STAGE,
    invocationReason: reason,
    inputEvidence,
    outputArtifacts: promoted.map((item) => item.outputArtifact),
    startedAt: timestamp,
    completedAt: timestamp,
    runTimestamp: timestamp,
    handoffId,
    secret,
  });
  const producerOutput = {
    schemaVersion: 1,
    producerId: BRANDBOOK_PRODUCER_ID,
    stageId: BRANDBOOK_PRODUCER_STAGE,
    handoffId,
    transactionDir: normalizeRelPath(relative(rootDir, transactionDir)),
    outputArtifacts: promoted.map((item) => item.outputArtifact),
    receiptPath: receiptResult.receiptPath,
    artifactLinksPath: receiptResult.artifactLinksPath,
    completedAt: timestamp,
  };
  const producerOutputPath = join(transactionDir, "producer-output.json");
  await writeFile(producerOutputPath, `${JSON.stringify(producerOutput, null, 2)}\n`, "utf8");
  return {
    pass: true,
    dryRun: false,
    plan,
    transactionDir: normalizeRelPath(relative(rootDir, transactionDir)),
    phases: phaseResult(["prepare", "write-temp", "validate", "promote", "receipt", "planner-refresh"], true, []),
    validation,
    promoted,
    receiptPath: receiptResult.receiptPath,
    artifactLinksPath: receiptResult.artifactLinksPath,
    producerOutputPath: normalizeRelPath(relative(rootDir, producerOutputPath)),
  };
}

function discoverBrandbookSourceOutputs(rootDir, absSourceDir) {
  const outputs = [];
  for (const rel of KNOWN_ROOT_OUTPUTS) {
    const sourcePath = join(absSourceDir, ...rel.split("/"));
    if (existsSync(sourcePath) && statSync(sourcePath).isFile()) {
      outputs.push(outputRecord(rootDir, absSourceDir, sourcePath, rel));
    }
  }
  const componentsDir = join(absSourceDir, "components");
  if (existsSync(componentsDir)) {
    for (const sourcePath of walkFiles(componentsDir)) {
      if (!sourcePath.endsWith(".md")) continue;
      const rel = normalizeRelPath(relative(absSourceDir, sourcePath));
      outputs.push(outputRecord(rootDir, absSourceDir, sourcePath, rel));
    }
  }
  return outputs.sort((left, right) => left.outputArtifact.localeCompare(right.outputArtifact));
}

function outputRecord(rootDir, absSourceDir, sourcePath, rel) {
  const sourceArtifact = normalizeRelPath(relative(rootDir, sourcePath));
  return {
    sourceArtifact,
    outputArtifact: normalizeRelPath(`${DESIGN_SYSTEM_ROOT}/${rel}`),
    rel,
    sha256: sha256(readFileSync(sourcePath)),
  };
}

async function stageBrandbookOutputs({ rootDir, transactionDir, outputs }) {
  const staged = [];
  for (const item of outputs) {
    const sourcePath = resolveProjectPath(rootDir, item.sourceArtifact);
    const tempArtifact = normalizeRelPath(`${normalizeRelPath(relative(rootDir, transactionDir))}/write-temp/${item.rel}`);
    const tempPath = resolveProjectPath(rootDir, tempArtifact);
    await mkdir(dirname(tempPath), { recursive: true });
    await copyFile(sourcePath, tempPath);
    staged.push({ ...item, tempArtifact });
  }
  return staged;
}

async function writeProducerInputEvidence({
  rootDir,
  transactionDir,
  pluginRoot,
  target,
  slug,
  handoffId,
  templatePath,
  sourceDir,
  outputs,
}) {
  const evidenceDir = join(transactionDir, "input-evidence");
  await mkdir(evidenceDir, { recursive: true });
  const evidence = {
    schemaVersion: 1,
    producerId: BRANDBOOK_PRODUCER_ID,
    stageId: BRANDBOOK_PRODUCER_STAGE,
    target,
    slug,
    handoffId,
    sourceDir: normalizeRelPath(sourceDir),
    templatePath,
    outputCount: outputs.length,
    outputArtifacts: outputs.map((item) => item.outputArtifact),
  };
  const evidencePath = join(evidenceDir, "producer-input.json");
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const inputEvidence = [normalizeRelPath(relative(rootDir, evidencePath))];
  const absTemplate = templatePath ? join(pluginRoot, ...templatePath.split("/")) : null;
  if (absTemplate && existsSync(absTemplate)) {
    const templateSnapshot = join(evidenceDir, "target-baseline.snapshot.md");
    await copyFile(absTemplate, templateSnapshot);
    inputEvidence.push(normalizeRelPath(relative(rootDir, templateSnapshot)));
  }
  if (slug) {
    const configPath = join(rootDir, ".supervibe", "artifacts", "prototypes", slug, "config.json");
    if (existsSync(configPath)) {
      const configSnapshot = join(evidenceDir, `config.snapshot.${BRANDBOOK_PRODUCER_STAGE}.json`);
      await copyFile(configPath, configSnapshot);
      inputEvidence.push(normalizeRelPath(relative(rootDir, configSnapshot)));
    }
  }
  return inputEvidence;
}

function validateStagedBrandbookOutputs(rootDir, stagedOutputs) {
  const issues = [];
  const byRel = new Map(stagedOutputs.map((item) => [item.rel, item]));
  if (!byRel.has("tokens.css")) issues.push("tokens.css is required for brandbook producer output");
  if (!byRel.has("manifest.json")) issues.push("manifest.json is required for brandbook producer output");
  if (!byRel.has("design-flow-state.json")) issues.push("design-flow-state.json is required for brandbook producer output");
  for (const item of stagedOutputs) {
    const absPath = resolveProjectPath(rootDir, item.tempArtifact);
    const text = readFileSync(absPath, "utf8");
    if (item.rel.endsWith(".json")) {
      try {
        JSON.parse(text);
      } catch {
        issues.push(`${item.rel} is not valid JSON`);
      }
    }
    if (item.rel === "tokens.css" && !/:root\s*\{/.test(text)) {
      issues.push("tokens.css must include a :root token block");
    }
    if (item.rel === "styleboard.html" && !/<html[\s>]/i.test(text)) {
      issues.push("styleboard.html must be an HTML document");
    }
  }
  return { pass: issues.length === 0, issues };
}

async function promoteBrandbookOutputs({ rootDir, stagedOutputs }) {
  const promoted = [];
  const transactionRoot = stagedOutputs[0]?.tempArtifact
    ? resolveProjectPath(rootDir, stagedOutputs[0].tempArtifact).split(`${sep}write-temp${sep}`)[0]
    : join(rootDir, ".supervibe", "artifacts", "_workflow-transactions", "supervibe-design", "unknown");
  const promoteDir = join(transactionRoot, "promote-temp");
  const backupDir = join(transactionRoot, "promote-backup");
  const prepared = [];
  await mkdir(promoteDir, { recursive: true });
  await mkdir(backupDir, { recursive: true });

  for (const item of stagedOutputs) {
    const sourcePath = resolveProjectPath(rootDir, item.tempArtifact);
    const outputPath = resolveProjectPath(rootDir, item.outputArtifact);
    const preparedPath = join(promoteDir, ...item.rel.split("/"));
    const backupPath = join(backupDir, ...item.rel.split("/"));
    await mkdir(dirname(preparedPath), { recursive: true });
    if (existsSync(outputPath)) await mkdir(dirname(backupPath), { recursive: true });
    await copyFile(sourcePath, preparedPath);
    prepared.push({
      item,
      outputPath,
      preparedPath,
      backupPath,
      hadExisting: existsSync(outputPath),
    });
  }

  try {
    for (const item of prepared) {
      await mkdir(dirname(item.outputPath), { recursive: true });
      if (item.hadExisting) await rename(item.outputPath, item.backupPath);
    }
    for (const item of prepared) {
      await rename(item.preparedPath, item.outputPath);
      promoted.push(item.item);
    }
  } catch (error) {
    for (const item of prepared.reverse()) {
      if (existsSync(item.outputPath)) {
        await rm(item.outputPath, { force: true }).catch(() => {});
      }
      if (item.hadExisting && existsSync(item.backupPath)) {
        await mkdir(dirname(item.outputPath), { recursive: true });
        await rename(item.backupPath, item.outputPath).catch(() => {});
      }
    }
    throw error;
  }

  for (const item of prepared) {
    if (item.hadExisting && existsSync(item.backupPath)) {
      await rm(item.backupPath, { force: true }).catch(() => {});
    }
  }
  await rm(promoteDir, { recursive: true, force: true }).catch(() => {});
  return promoted;
}

function prototypeConfigSnapshotPath(rootDir, slug, handoffId) {
  const configPath = join(rootDir, ".supervibe", "artifacts", "prototypes", slug, "config.json");
  if (!existsSync(configPath)) return null;
  return normalizeRelPath(`.supervibe/artifacts/_workflow-transactions/supervibe-design/${sanitizeId(handoffId || slug || "handoff")}/input-evidence/config.snapshot.${BRANDBOOK_PRODUCER_STAGE}.json`);
}

function phaseResult(phases, pass, issues) {
  return phases.map((phase) => ({ phase, pass, issues: pass ? [] : issues }));
}

function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function resolveProjectPath(rootDir, path) {
  const normalized = normalizeRelPath(path);
  const abs = join(rootDir, ...normalized.split("/"));
  const rel = normalizeRelPath(relative(rootDir, abs));
  if (rel.startsWith("..")) throw new Error(`path escapes root: ${path}`);
  return abs;
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/").replace(/^\.\//, "");
}

function sanitizeId(value) {
  return String(value ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
