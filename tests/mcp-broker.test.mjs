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


test("MCP broker records runtime palette states for agent handoff", async () => {
  const rootDir = join(tmpdir(), `supervibe-mcp-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    REGISTRY_PATH_FOR_TEST(join(rootDir, ".supervibe", "memory", "mcp-registry.json"));

    const configPath = join(rootDir, "empty-mcp.json");
    await writeFile(configPath, JSON.stringify({ mcpServers: {} }), "utf8");

    await discoverMcps({
      configPath,
      host: "codex",
      runtimeTools: [
        "mcp__mcp_server_context7__query_docs",
        "mcp__mcp_server_firecrawl__firecrawl_search",
        "mcp__mcp_server_figma__get_figma_data",
        "mcp__playwright__browser_snapshot",
        "mcp__openaiDeveloperDocs__search_openai_docs",
      ],
      allowConfigToolFallback: false,
    });
    const broker = await discoverMcpCapabilities({ refresh: false });

    const states = new Map(broker.capabilityStates.map((item) => [item.capabilityId, item]));
    for (const capability of ["context7", "firecrawl", "figma", "browser", "openai-docs"]) {
      assert.equal(states.get(capability).state, "runtime-available", capability);
      assert.equal(states.get(capability).confidenceCap, 10, capability);
    }
    assert.equal(states.get("tauri").state, "unavailable");
    assert.equal(broker.agentHandoff.runtimePaletteProvided, true);
    assert.equal(broker.agentHandoff.capabilities.find((item) => item.capabilityId === "figma").state, "runtime-available");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});