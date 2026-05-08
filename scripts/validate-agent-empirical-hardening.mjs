#!/usr/bin/env node
import {
  formatAgentEmpiricalHardeningReport,
  validateAgentEmpiricalHardening,
} from "./lib/supervibe-agent-empirical-hardening.mjs";

const report = validateAgentEmpiricalHardening({ rootDir: process.cwd() });
console.log(formatAgentEmpiricalHardeningReport(report));
if (!report.pass) process.exitCode = 1;
