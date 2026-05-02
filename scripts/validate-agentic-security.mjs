#!/usr/bin/env node
import {
  formatAgenticSecurityReport,
  scanAgenticSecurityPolicy,
} from './lib/agentic-security-scanner.mjs';

const report = scanAgenticSecurityPolicy({
  operations: [
    { id: 'local-read-diagnostics', class: 'read-only diagnostic', approval: 'not-required' },
    { id: 'release-publish', class: 'production mutation', approval: 'documented-release-gate' },
    { id: 'mcp-writeback', class: 'MCP writeback', approval: 'documented-human-checkpoint' },
  ],
});

console.log(formatAgenticSecurityReport(report));
if (!report.pass) process.exitCode = 1;
