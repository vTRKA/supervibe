import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveHostAdapter } from "./supervibe-host-detector.mjs";

export function parseInstructionDocument(content = "") {
  const lines = String(content).split(/\r?\n/);
  const headings = [];
  const imports = [];
  const managedBlocks = [];
  const externalManagedBlocks = [];
  let activeBlock = null;
  let activeExternalBlock = null;

  lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      headings.push({ level: heading[1].length, text: heading[2], line: index + 1 });
    }
    const markdownImport = line.match(/^\s*@(.+?)\s*$/) || line.match(/^\s*!include\s+(.+?)\s*$/i);
    if (markdownImport) {
      imports.push({ target: markdownImport[1].trim(), line: index + 1 });
    }
    const begin = line.match(/SUPERVIBE:BEGIN managed-context\s+([A-Za-z0-9_-]+)/);
    if (begin) {
      activeBlock = { adapterId: begin[1], startLine: index + 1, startIndex: index };
    }
    const end = line.match(/SUPERVIBE:END managed-context\s+([A-Za-z0-9_-]+)/);
    if (end && activeBlock) {
      managedBlocks.push({
        ...activeBlock,
        endLine: index + 1,
        endIndex: index,
        content: lines.slice(activeBlock.startIndex + 1, index).join("\n"),
      });
      activeBlock = null;
    }
    const externalBegin = line.match(/<!--\s*([A-Za-z0-9_-]+):BEGIN\s+managed-context(?:\s+([A-Za-z0-9_-]+))?\s*-->/i);
    if (externalBegin && externalBegin[1].toUpperCase() !== "SUPERVIBE") {
      activeExternalBlock = {
        owner: externalBegin[1],
        contextId: externalBegin[2] || null,
        startLine: index + 1,
        startIndex: index,
      };
    }
    const externalEnd = line.match(/<!--\s*([A-Za-z0-9_-]+):END\s+managed-context(?:\s+([A-Za-z0-9_-]+))?\s*-->/i);
    if (externalEnd && activeExternalBlock && externalEnd[1] === activeExternalBlock.owner) {
      externalManagedBlocks.push({
        ...activeExternalBlock,
        endLine: index + 1,
        endIndex: index,
        content: lines.slice(activeExternalBlock.startIndex + 1, index).join("\n"),
      });
      activeExternalBlock = null;
    }
  });

  return { headings, imports, managedBlocks, externalManagedBlocks };
}

export function applyManagedContextBlock({ adapterId, currentContent = "", generatedContent = "" } = {}) {
  return buildMigrationContent({ adapterId, currentContent, generatedContent }).afterContent;
}

export function planContextMigration({
  rootDir = process.cwd(),
  adapterId = "claude",
  instructionPath = null,
  currentContent = null,
  generatedContent = "",
} = {}) {
  const adapter = resolveHostAdapter(adapterId);
  const targetPath = instructionPath || adapter.instructionFiles[0];
  const absolutePath = join(rootDir, targetPath);
  const content = currentContent ?? (existsSync(absolutePath) ? readExistingFileSyncSafe(absolutePath) : "");
  const migration = buildMigrationContent({ adapterId, currentContent: content, generatedContent });
  const parsed = parseInstructionDocument(content);
  const afterParsed = parseInstructionDocument(migration.afterContent);
  const externalOwners = [...new Set(parsed.externalManagedBlocks.map((block) => block.owner))].sort();
  const otherSupervibeBlocks = parsed.managedBlocks
    .filter((block) => block.adapterId !== adapterId)
    .map((block) => block.adapterId)
    .sort();

  return {
    dryRun: true,
    adapterId,
    instructionPath: targetPath,
    absolutePath,
    backupPath: `${absolutePath}.supervibe.bak`,
    beforeContent: content,
    afterContent: migration.afterContent,
    diff: createLineDiff(content, migration.afterContent),
    parsed,
    afterParsed,
    operations: [
      { type: migration.replaced ? "replace-managed-block" : "append-managed-block", adapterId, path: targetPath },
      { type: "preserve-user-sections", headings: parsed.headings.map((heading) => heading.text) },
      ...(externalOwners.length > 0 ? [{
        type: "preserve-external-managed-blocks",
        count: parsed.externalManagedBlocks.length,
        owners: externalOwners,
      }] : []),
      ...(otherSupervibeBlocks.length > 0 ? [{
        type: "preserve-other-supervibe-managed-blocks",
        count: otherSupervibeBlocks.length,
        adapterIds: otherSupervibeBlocks,
      }] : []),
    ],
  };
}

export async function writeContextMigrationPlan(plan, { approved = false } = {}) {
  if (!approved) {
    throw new Error("context migration write requires explicit approval");
  }
  await mkdir(dirname(plan.absolutePath), { recursive: true });
  if (existsSync(plan.absolutePath)) {
    await copyFile(plan.absolutePath, plan.backupPath);
  }
  await writeFile(plan.absolutePath, plan.afterContent, "utf8");
  return {
    written: true,
    path: plan.absolutePath,
    backupPath: existsSync(plan.backupPath) ? plan.backupPath : null,
  };
}

function buildMigrationContent({ adapterId, currentContent = "", generatedContent = "" }) {
  const adapter = resolveHostAdapter(adapterId);
  const block = [
    adapter.managedBlock.begin,
    String(generatedContent).trimEnd(),
    adapter.managedBlock.end,
  ].join("\n");
  const pattern = new RegExp(`${escapeRegExp(adapter.managedBlock.begin)}[\\s\\S]*?${escapeRegExp(adapter.managedBlock.end)}`, "m");
  if (pattern.test(currentContent)) {
    return {
      replaced: true,
      afterContent: currentContent.replace(pattern, block),
    };
  }
  const separator = currentContent.trimEnd() ? "\n\n" : "";
  return {
    replaced: false,
    afterContent: `${currentContent.trimEnd()}${separator}${block}\n`,
  };
}

function createLineDiff(before, after) {
  const beforeLines = String(before).split(/\r?\n/);
  const afterLines = String(after).split(/\r?\n/);
  const diff = [];
  for (const line of beforeLines) {
    if (!afterLines.includes(line)) diff.push(`-${line}`);
  }
  for (const line of afterLines) {
    if (!beforeLines.includes(line)) diff.push(`+${line}`);
  }
  return diff.join("\n");
}

function readExistingFileSyncSafe(path) {
  return readFileSync(path, "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
