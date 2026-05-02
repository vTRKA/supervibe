#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function buildContextMcpSelfTest({ rootDir = process.cwd() } = {}) {
  const memoryDir = join(rootDir, '.supervibe', 'memory');
  const resources = [
    {
      uri: 'supervibe://memory',
      name: 'Project Memory',
      readOnly: true,
      available: existsSync(memoryDir),
      description: 'Read-only memory entries and local memory index metadata.',
    },
    {
      uri: 'supervibe://code-context',
      name: 'Code Context',
      readOnly: true,
      available: existsSync(join(memoryDir, 'code.db')),
      description: 'Read-only Code RAG and CodeGraph context pack entrypoint.',
    },
    {
      uri: 'supervibe://code-graph',
      name: 'Code Graph',
      readOnly: true,
      available: existsSync(join(memoryDir, 'code.db')),
      description: 'Read-only graph summaries for callers, callees, impact and neighbors.',
    },
    {
      uri: 'supervibe://host-context',
      name: 'Host Context',
      readOnly: true,
      available: true,
      description: 'Read-only host instruction and plugin metadata surfaces.',
    },
    {
      uri: 'supervibe://tool-metadata',
      name: 'Tool Metadata',
      readOnly: true,
      available: true,
      description: 'Read-only MCP/tool capability and risk metadata.',
    },
  ];
  return {
    schemaVersion: 1,
    pass: resources.every((resource) => resource.readOnly === true),
    mode: 'self-test',
    resources,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--self-test')) {
    console.log(JSON.stringify(buildContextMcpSelfTest(), null, 2));
    return;
  }
  if (args.has('--stdio')) {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      result: buildContextMcpSelfTest(),
      id: 'supervibe-context-mcp-self-test',
    }));
    return;
  }
  console.log('Usage: node scripts/supervibe-context-mcp.mjs --self-test | --stdio --self-test');
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('supervibe-context-mcp.mjs');
if (isMain) main().catch((err) => {
  console.error(`supervibe-context-mcp error: ${err.message}`);
  process.exit(1);
});
