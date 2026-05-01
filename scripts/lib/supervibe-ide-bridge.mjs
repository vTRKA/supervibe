import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function createIdeBridgeDescriptor({
  rootDir = process.cwd(),
  graphPath = ".supervibe/memory/work-items/<epic-id>/graph.json",
  statePath = ".supervibe/memory/loops/<run-id>/state.json",
  port = 3057,
  generatedAt = new Date().toISOString(),
} = {}) {
  const baseUrl = `http://127.0.0.1:${Number(port) || 3057}`;
  const entryUrl = `${baseUrl}/`;
  return {
    schemaVersion: 1,
    kind: "supervibe-ide-bridge",
    generatedAt,
    rootDir: resolve(rootDir),
    displayName: "Supervibe Control Plane",
    entryUrl,
    webview: {
      mode: "localhost-widget",
      origin: baseUrl,
      bind: "127.0.0.1",
      cspConnectSrc: [baseUrl],
      sandbox: ["allow-scripts", "allow-forms", "allow-same-origin"],
      retainContextWhenHidden: true,
    },
    files: {
      graphPath,
      statePath,
    },
    endpoints: {
      graph: `${baseUrl}/api/graph?file=${encodeURIComponent(graphPath)}`,
      contextPack: `${baseUrl}/api/context-pack?file=${encodeURIComponent(graphPath)}&item=<item-id>`,
      run: `${baseUrl}/api/run?file=${encodeURIComponent(statePath)}`,
      report: `${baseUrl}/api/report?file=${encodeURIComponent(graphPath)}&type=sla`,
      gc: `${baseUrl}/api/gc`,
      action: `${baseUrl}/api/action`,
    },
    actions: {
      previewFirst: true,
      applyConfirmation: "confirm=apply-local",
      supported: ["claim", "defer", "close", "reopen"],
      forbidden: ["provider-cli", "mcp-write", "network-tracker", "deployment", "credential-mutation"],
    },
    widget: {
      title: "Supervibe",
      recommendedPlacement: "right-sidebar",
      launchCommand: `npm run supervibe:ui -- --port ${Number(port) || 3057} --file ${graphPath}`,
      refreshEndpoint: `${baseUrl}/api/index-status`,
    },
    hostHints: [
      "Open entryUrl in a browser, VS Code webview, Cursor webview, Zed webview, JetBrains tool window, or any localhost-capable IDE panel.",
      "Keep graph.json and state.json as the source of truth; the webview is a control surface, not a second task store.",
      "Use POST /api/action only after showing preview and sending confirm=apply-local for mutation.",
    ],
  };
}

export async function writeIdeBridgeDescriptor(outPath, descriptor) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
  return { outPath, bytes: Buffer.byteLength(JSON.stringify(descriptor, null, 2)) + 1 };
}

export function formatIdeBridgeReport(descriptor, writeResult = null) {
  return [
    "SUPERVIBE_IDE_BRIDGE",
    `URL: ${descriptor.entryUrl}`,
    `GRAPH: ${descriptor.files?.graphPath || "none"}`,
    `STATE: ${descriptor.files?.statePath || "none"}`,
    `BIND: ${descriptor.webview?.bind || "127.0.0.1"}`,
    `WIDGET: ${descriptor.webview?.mode || "localhost-widget"}`,
    `PREVIEW_FIRST: ${descriptor.actions?.previewFirst === true}`,
    `OUT: ${writeResult?.outPath || "not-written"}`,
  ].join("\n");
}
