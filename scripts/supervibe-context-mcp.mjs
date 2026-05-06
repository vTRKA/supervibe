#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function buildContextMcpSelfTest({ rootDir = process.cwd() } = {}) {
  const memoryDir = join(rootDir, '.supervibe', 'memory');
  const resources = [
    resource('supervibe://memory', 'Project Memory', 'project-memory', existsSync(memoryDir), 'memory-index', 'Read-only memory entries and local memory index metadata.'),
    resource('supervibe://code-context', 'Code Context', 'mcp-context-server', existsSync(join(memoryDir, 'code.db')), 'context-pack', 'Read-only Code RAG and CodeGraph context pack entrypoint.'),
    resource('supervibe://code-graph', 'Code Graph', 'codegraph', existsSync(join(memoryDir, 'code.db')), 'graph-summary', 'Read-only graph summaries for callers, callees, impact and neighbors.'),
    resource('supervibe://repo-map', 'Repository Map', 'repo-map-context-budget', true, 'repo-map-selection', 'Read-only Aider-style repository map and token budget summary.'),
    resource('supervibe://project-knowledge-graph', 'Project Knowledge Graph', 'memory-knowledge-graph', existsSync(memoryDir), 'knowledge-graph-summary', 'Read-only GraphRAG-inspired project memory, file and symbol graph summary.'),
    resource('supervibe://agent-regression', 'Agent Regression Checks', 'agent-rag-regression-harness', true, 'agent-regression-report', 'Read-only promptfoo-style regression case summary for routing, retrieval and safety gates.'),
    resource('supervibe://runtime-trace', 'Runtime Trace', 'runtime-trace-spine', true, 'trace-readiness', 'Read-only OpenTelemetry-compatible local trace readiness and JSONL span metadata.'),
    resource('supervibe://scip-import', 'SCIP Import Readiness', 'scip-import-readiness', true, 'scip-import-readiness', 'Read-only optional SCIP import readiness and deferred binary parser gate.'),
    resource('supervibe://host-context', 'Host Context', 'host-context', true, 'host-context-summary', 'Read-only host instruction and plugin metadata surfaces.'),
    resource('supervibe://tool-metadata', 'Tool Metadata', 'tool-risk-metadata', true, 'tool-metadata-summary', 'Read-only MCP/tool capability and risk metadata.'),
  ];
  const resourceTemplates = [
    {
      uriTemplate: 'supervibe://memory/{id}',
      name: 'Memory Entry',
      readOnly: true,
      schema: { params: ['id'], output: 'memory-entry' },
      riskLevel: 'low',
    },
    {
      uriTemplate: 'supervibe://code-graph/{symbol}',
      name: 'CodeGraph Symbol Neighborhood',
      readOnly: true,
      schema: { params: ['symbol'], output: 'graph-neighborhood' },
      riskLevel: 'low',
    },
    {
      uriTemplate: 'supervibe://repo-map/{tier}',
      name: 'Repo Map Tier',
      readOnly: true,
      schema: { params: ['tier'], output: 'repo-map-selection' },
      riskLevel: 'low',
    },
  ];
  return {
    schemaVersion: 1,
    pass: resources.every((item) => item.readOnly === true && item.schema?.output && item.riskLevel)
      && resourceTemplates.every((item) => item.readOnly === true && item.schema?.output && item.riskLevel),
    mode: 'self-test',
    resources,
    resourceTemplates,
  };
}

function resource(uri, name, technology, available, output, description) {
  return {
    uri,
    name,
    technology,
    readOnly: true,
    available: Boolean(available),
    riskLevel: 'low',
    schema: {
      input: 'none',
      output,
    },
    description,
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
