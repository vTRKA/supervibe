import { MODEL_RELATIVE_PATH } from "../ensure-onnx-model.mjs";

export const INSTALLER_MANAGED_TRACKED_PATHS = Object.freeze([
  {
    path: "package-lock.json",
    reason: "package-lock drift from older installer or npm runs",
  },
  {
    path: MODEL_RELATIVE_PATH,
    reason: "required ONNX model artifact rehydrated by the installer",
  },
]);

const MANAGED_BY_PATH = new Map(INSTALLER_MANAGED_TRACKED_PATHS.map((entry) => [entry.path, entry]));

export function pathFromPorcelainLine(line) {
  const text = String(line || "").trimEnd();
  if (text.length < 4) return "";
  let path = text.slice(3);
  const renameMarker = " -> ";
  const renameIndex = path.lastIndexOf(renameMarker);
  if (renameIndex >= 0) path = path.slice(renameIndex + renameMarker.length);
  return normalizeGitPath(path);
}

export function partitionTrackedPorcelainLines(lines = []) {
  const installerManaged = [];
  const userOwned = [];
  const untracked = [];

  for (const line of lines) {
    const text = String(line || "").trimEnd();
    if (!text) continue;
    if (text.startsWith("?? ")) {
      untracked.push(text);
      continue;
    }

    const path = pathFromPorcelainLine(text);
    const managed = MANAGED_BY_PATH.get(path);
    if (managed) {
      installerManaged.push({ ...managed, line: text });
    } else {
      userOwned.push(text);
    }
  }

  return { installerManaged, userOwned, untracked };
}

function normalizeGitPath(path) {
  return String(path || "")
    .replace(/^"|"$/g, "")
    .replace(/\\/g, "/");
}
