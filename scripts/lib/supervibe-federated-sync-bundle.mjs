import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";

const BUNDLE_FILES = ["manifest.json", "graph.json", "status.json", "comments.json", "evidence.json", "mapping.json"];

export function createFederatedSyncBundle({
  graph = {},
  status = {},
  comments = [],
  evidence = [],
  mapping = {},
  packageVersion = "unknown",
  sourceRoot = process.cwd(),
  createdAt = "deterministic-local",
} = {}) {
  const files = {
    "graph.json": redactJson(graph),
    "status.json": redactJson(status),
    "comments.json": redactJson(comments),
    "evidence.json": redactJson(evidence),
    "mapping.json": redactJson(mapping),
  };
  const manifest = {
    schemaVersion: 1,
    packageVersion,
    sourceRoot: redactText(sourceRoot),
    createdAt,
    remoteMutation: false,
    files: Object.fromEntries(Object.entries(files).map(([file, value]) => [file, { sha256: sha256(JSON.stringify(value)) }])),
  };
  return {
    manifest,
    files: {
      "manifest.json": manifest,
      ...files,
    },
  };
}

export async function writeFederatedSyncBundle(bundle, outDir) {
  await mkdir(outDir, { recursive: true });
  for (const [file, value] of Object.entries(bundle.files || {})) {
    await writeFile(join(outDir, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
  return { outDir, files: Object.keys(bundle.files || {}) };
}

export async function readFederatedSyncBundle(bundleDir) {
  const files = {};
  for (const file of BUNDLE_FILES) {
    files[file] = JSON.parse(await readFile(join(bundleDir, file), "utf8"));
  }
  return { manifest: files["manifest.json"], files };
}

export function validateFederatedSyncBundle(bundle, { expectedPackageVersion = null } = {}) {
  const issues = [];
  const manifest = bundle.manifest || bundle.files?.["manifest.json"];
  if (!manifest) addIssue(issues, "manifest-missing", "sync bundle manifest is missing");
  if (manifest?.schemaVersion !== 1) addIssue(issues, "schema-version-unsupported", "sync bundle schemaVersion must be 1");
  if (expectedPackageVersion && manifest?.packageVersion !== expectedPackageVersion) {
    addIssue(issues, "package-version-mismatch", `bundle package ${manifest?.packageVersion} does not match ${expectedPackageVersion}`);
  }
  if (manifest?.remoteMutation !== false) addIssue(issues, "remote-mutation-not-allowed", "sync bundle import cannot perform remote mutation");

  for (const file of BUNDLE_FILES.filter((name) => name !== "manifest.json")) {
    const value = bundle.files?.[file];
    const expected = manifest?.files?.[file]?.sha256;
    if (!value) addIssue(issues, "bundle-file-missing", `${file} is missing`);
    if (value && expected && sha256(JSON.stringify(value)) !== expected) {
      addIssue(issues, "bundle-checksum-mismatch", `${file} checksum mismatch`);
    }
    if (value && containsSensitiveData(value)) {
      addIssue(issues, "bundle-sensitive-data", `${file} contains unredacted sensitive data`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export async function importFederatedSyncBundle(bundleDir, options = {}) {
  const bundle = await readFederatedSyncBundle(bundleDir);
  const validation = validateFederatedSyncBundle(bundle, options);
  const conflictReport = createSyncConflictReport({
    localGraph: options.localGraph || {},
    incomingGraph: bundle.files["graph.json"] || {},
    mapping: bundle.files["mapping.json"] || {},
  });
  return {
    ok: validation.valid,
    dryRun: options.dryRun !== false,
    validation,
    conflictReport,
    remoteMutation: false,
    writesPlanned: validation.valid && options.dryRun === false ? ["graph", "comments", "evidence", "mapping"] : [],
  };
}

export function createSyncConflictReport({ localGraph = {}, incomingGraph = {}, mapping = {} } = {}) {
  const localIds = new Set((localGraph.items || localGraph.tasks || []).map((item) => item.itemId || item.id));
  const incomingIds = new Set((incomingGraph.items || incomingGraph.tasks || []).map((item) => item.itemId || item.id));
  const localOnly = [...localIds].filter((id) => !incomingIds.has(id));
  const remoteOnly = [...incomingIds].filter((id) => !localIds.has(id));
  const both = [...incomingIds].filter((id) => localIds.has(id));
  const changed = both.filter((id) => {
    const local = findItem(localGraph, id);
    const incoming = findItem(incomingGraph, id);
    return stableHash(local) !== stableHash(incoming);
  });
  const duplicates = findDuplicates(incomingGraph);
  const stale = Object.values(mapping.items || {}).filter((item) => item.status === "stale" || item.externalStatus === "stale").map((item) => item.nativeId || item.itemId);
  return {
    localOnly,
    remoteOnly,
    bothChanged: changed,
    duplicate: duplicates,
    stale,
    summary: `local-only=${localOnly.length} remote-only=${remoteOnly.length} both-changed=${changed.length} duplicate=${duplicates.length} stale=${stale.length}`,
  };
}

function findItem(graph, id) {
  return (graph.items || graph.tasks || []).find((item) => (item.itemId || item.id) === id) || null;
}

function findDuplicates(graph = {}) {
  const seen = new Set();
  const dupes = new Set();
  for (const item of graph.items || graph.tasks || []) {
    const id = item.itemId || item.id;
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

function redactJson(value) {
  return JSON.parse(redactText(JSON.stringify(value || null)));
}

function redactText(value) {
  return redactSensitiveContent(String(value || ""))
    .replace(/[A-Z]:\\\\Users\\\\[^"\\]+/g, "[USER_PATH]")
    .replace(/[A-Z]:\\Users\\[^\\"]+/g, "[USER_PATH]")
    .replace(/\/home\/[^/\\"]+/g, "/home/[USER]");
}

function containsSensitiveData(value) {
  const text = JSON.stringify(value);
  return /token\s*[:=]\s*(?!\[REDACTED\])[^"'\s]+|password\s*[:=]\s*(?!\[REDACTED\])[^"'\s]+|sk-[A-Za-z0-9_-]{16,}|[A-Z]:\\\\Users\\\\/i.test(text);
}

function stableHash(value) {
  return sha256(JSON.stringify(value || {}));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function addIssue(issues, code, message) {
  issues.push({ code, message });
}
