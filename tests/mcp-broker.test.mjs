import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  REGISTRY_PATH_FOR_TEST,
  discoverMcpCapabilities,
  discoverMcps,
} from "../scripts/lib/mcp-registry.mjs";

test("MCP broker discovers host-neutral capabilities and write risk", async () => {
  const rootDir = join(tmpdir(), `supervibe-mcp-broker-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    REGISTRY_PATH_FOR_TEST(join(rootDir, ".supervibe", "memory", "mcp-registry.json"));
    const configPath = join(rootDir, "mcp.json");
    await writeFile(configPath, JSON.stringify({
      mcpServers: {
        playwright: { command: "npx", args: ["@playwright/mcp"] },
        firecrawl: { command: "npx", args: ["firecrawl-mcp"] },
      },
    }), "utf8");

    await discoverMcps({ configPath, host: "codex" });
    const broker = await discoverMcpCapabilities({ refresh: false });

    assert.ok(broker.capabilities.browser.length > 0);
    assert.ok(broker.capabilities.research.length > 0);
    assert.equal(broker.mcps.find((item) => item.name === "playwright").hostSources.includes("codex"), true);
    assert.equal(broker.mcps.find((item) => item.name === "playwright").riskClass, "interactive");
    assert.equal(broker.mcps.find((item) => item.name === "firecrawl").riskClass, "read");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
