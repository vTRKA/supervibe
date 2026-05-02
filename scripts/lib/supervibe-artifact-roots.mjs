import { isAbsolute, join, relative, resolve } from "node:path";

const SUPERVIBE_ARTIFACT_ROOT = ".supervibe/artifacts";

const LEGACY_TO_CANONICAL = Object.freeze([
  ["prototypes", `${SUPERVIBE_ARTIFACT_ROOT}/prototypes`],
  ["mockups", `${SUPERVIBE_ARTIFACT_ROOT}/mockups`],
  ["presentations", `${SUPERVIBE_ARTIFACT_ROOT}/presentations`],
  ["docs/specs", `${SUPERVIBE_ARTIFACT_ROOT}/specs`],
  ["docs/plans", `${SUPERVIBE_ARTIFACT_ROOT}/plans`],
  ["docs/adr", `${SUPERVIBE_ARTIFACT_ROOT}/adr`],
  ["docs/prd", `${SUPERVIBE_ARTIFACT_ROOT}/prd`],
  ["docs/requirements", `${SUPERVIBE_ARTIFACT_ROOT}/requirements`],
  ["docs/runbooks", `${SUPERVIBE_ARTIFACT_ROOT}/runbooks`],
  ["docs/slo", `${SUPERVIBE_ARTIFACT_ROOT}/slo`],
  ["docs/brand", `${SUPERVIBE_ARTIFACT_ROOT}/brand`],
  ["docs/voice", `${SUPERVIBE_ARTIFACT_ROOT}/voice`],
  ["docs/experiments", `${SUPERVIBE_ARTIFACT_ROOT}/experiments`],
  ["docs/postmortems", `${SUPERVIBE_ARTIFACT_ROOT}/postmortems`],
  ["docs/audits", ".supervibe/audits"],
  ["docs/follow-ups.md", `${SUPERVIBE_ARTIFACT_ROOT}/follow-ups.md`],
  ["docs/deprecations.md", `${SUPERVIBE_ARTIFACT_ROOT}/deprecations.md`],
  ["docs/permissions.md", `${SUPERVIBE_ARTIFACT_ROOT}/permissions.md`],
  ["screen-specs", `${SUPERVIBE_ARTIFACT_ROOT}/screen-specs`],
  ["brandbook", `${SUPERVIBE_ARTIFACT_ROOT}/brandbook`],
]);

export function artifactRoot(projectRoot, kind = "") {
  return join(projectRoot, ".supervibe", "artifacts", kind);
}

export function artifactRel(kind = "", rest = "") {
  return [SUPERVIBE_ARTIFACT_ROOT, kind, rest]
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/");
}

function projectRelativePath(filePath, projectRoot = process.cwd()) {
  const absPath = isAbsolute(filePath) ? resolve(filePath) : resolve(projectRoot, filePath);
  return relative(resolve(projectRoot), absPath).split("\\").join("/");
}

function isInsideSupervibe(filePath, projectRoot = process.cwd()) {
  const rel = projectRelativePath(filePath, projectRoot);
  return rel === ".supervibe" || rel.startsWith(".supervibe/");
}

export function legacyProjectArtifactMatch(filePath, projectRoot = process.cwd()) {
  const rel = projectRelativePath(filePath, projectRoot);
  if (!rel || rel === ".." || rel.startsWith("../") || isInsideSupervibe(filePath, projectRoot)) return null;

  for (const [legacy, canonical] of LEGACY_TO_CANONICAL) {
    if (rel === legacy || rel.startsWith(`${legacy}/`)) {
      const suffix = rel === legacy ? "" : rel.slice(legacy.length + 1);
      return {
        relPath: rel,
        legacyRoot: legacy,
        canonicalRoot: canonical,
        canonicalPath: [canonical, suffix].filter(Boolean).join("/"),
      };
    }
  }

  return null;
}

export function formatArtifactRootBlockReason(match) {
  return `Supervibe-owned artifact path ${match.relPath} is outside .supervibe. Write it under ${match.canonicalPath} instead.`;
}
