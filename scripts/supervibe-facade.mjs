#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SUPERVIBE_FACADE_SCHEMA_VERSION,
  getFacadeOperation,
  listFacadeOperations,
  validateFacadeCatalog,
  validateFacadeOperationContract,
} from "./lib/supervibe-facade-contract.mjs";

const SURFACE = Object.freeze({
  id: "supervibe-local-json-cli",
  kind: "local-json-cli",
  transport: "stdio",
  executesOperations: false,
  mcpServer: false,
});

const PRIVACY = Object.freeze({
  boundary: "local-only",
  sendsDataOffMachine: false,
  rawSecretsExpected: false,
  outputPolicy: "contract-metadata-only",
});

const DEGRADED = Object.freeze({
  degraded: false,
  reason: null,
  mode: "contract-catalog-read",
});

export function buildFacadeResponse(options = {}) {
  if (options.help || options.h || (!options.list && !options.operation)) {
    return envelope({
      ok: true,
      mode: "help",
      help: helpModel(),
    });
  }

  if (options.list) {
    const operations = listFacadeOperations();
    const validation = validateFacadeCatalog(operations);
    return envelope({
      ok: validation.pass,
      mode: "list",
      operations: operations.map(summarizeOperation),
      validation,
      exitCode: validation.pass ? 0 : 1,
    });
  }

  if (options.operation) {
    const operation = getFacadeOperation(options.operation);
    if (!operation) {
      return envelope({
        ok: false,
        mode: "operation",
        error: {
          code: "unknown-operation",
          message: "Unknown facade operation: " + options.operation,
        },
        operationId: options.operation,
        availableOperations: listFacadeOperations().map((item) => item.id),
        exitCode: 2,
      });
    }
    const validation = validateFacadeOperationContract(operation);
    return envelope({
      ok: validation.pass,
      mode: "operation",
      operation,
      validation,
      exitCode: validation.pass ? 0 : 1,
    });
  }

  return envelope({
    ok: false,
    mode: "error",
    error: {
      code: "unsupported-arguments",
      message: "Use --list or --operation <id>.",
    },
    exitCode: 2,
  });
}

export function parseFacadeArgs(argv = []) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") parsed.list = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--operation") parsed.operation = readOptionValue(argv, ++index, "--operation");
    else if (arg.startsWith("--operation=")) parsed.operation = readInlineValue(arg, "--operation");
    else throw new Error("Unknown argument: " + arg);
  }
  if (parsed.list && parsed.operation) throw new Error("Use only one facade mode: --list or --operation <id>.");
  return parsed;
}

function readOptionValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(flag + " requires a value.");
  return value;
}

function readInlineValue(arg, flag) {
  const value = arg.slice((flag + "=").length);
  if (!value) throw new Error(flag + " requires a value.");
  return value;
}

export function writeFacadeResponse(response, options = {}, stream = process.stdout) {
  if (options.json) {
    stream.write(JSON.stringify(stripExitCode(response), null, 2) + "\n");
    return;
  }
  if (response.mode === "list") {
    stream.write("SUPERVIBE_FACADE_OPERATIONS\n");
    for (const operation of response.operations) {
      stream.write("- " + operation.id + ": " + operation.riskClass + "; readOnly=" + operation.readOnly + "\n");
    }
    stream.write("VALIDATION: " + (response.validation.pass ? "pass" : "fail") + "\n");
    return;
  }
  if (response.mode === "help") {
    stream.write(response.help.usage + "\n");
    for (const option of response.help.options) stream.write("  " + option.name + "  " + option.description + "\n");
    return;
  }
  stream.write(JSON.stringify(stripExitCode(response), null, 2) + "\n");
}

function envelope(payload) {
  return {
    schemaVersion: SUPERVIBE_FACADE_SCHEMA_VERSION,
    ok: Boolean(payload.ok),
    surface: SURFACE,
    privacy: PRIVACY,
    degraded: DEGRADED,
    ...payload,
  };
}

function summarizeOperation(operation) {
  return {
    id: operation.id,
    description: operation.description,
    riskClass: operation.riskClass,
    cliEquivalent: operation.cliEquivalent,
    readOnly: operation.mutationPolicy?.mutatesWorkspace === false,
    privacyBoundary: operation.privacyBoundary,
    degradedMode: operation.degradedMode,
  };
}

function helpModel() {
  return {
    usage: "node scripts/supervibe-facade.mjs --list --json | --operation <id> --json",
    options: [
      { name: "--list", description: "List supported facade operation contracts." },
      { name: "--operation <id>", description: "Print one operation contract definition without executing it." },
      { name: "--json", description: "Emit stable JSON envelope output." },
      { name: "--help", description: "Show this help." },
    ],
  };
}

function stripExitCode(response) {
  const { exitCode, ...safeResponse } = response;
  return safeResponse;
}

async function main() {
  let options = {};
  try {
    options = parseFacadeArgs(process.argv.slice(2));
    const response = buildFacadeResponse(options);
    writeFacadeResponse(response, options);
    process.exitCode = response.ok ? 0 : response.exitCode || 1;
  } catch (error) {
    const response = envelope({
      ok: false,
      mode: "error",
      error: {
        code: "facade-cli-error",
        message: error.message,
      },
      exitCode: 1,
    });
    writeFacadeResponse(response, options);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) main();
