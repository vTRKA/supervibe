#!/usr/bin/env node
import {
  createProviderConfigDoctorReport,
  formatProviderConfigDoctorReport,
} from "./lib/supervibe-provider-config-doctor.mjs";

function parseArgs(argv) {
  const args = { _: [] };
  const booleans = new Set(["json", "apply", "help"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (booleans.has(key)) args[key] = true;
    else {
      args[key] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function printHelp() {
  console.log(`SUPERVIBE_PROVIDER_CONFIG_DOCTOR_HELP
Usage:
  node scripts/supervibe-provider-config-doctor.mjs [--root <project>] [--home <home>] [--provider <id>] [--json]

This command is preview-only. It detects provider config presence, redacts
sensitive values, and prints patch previews. It never writes provider config.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.apply) {
    throw new Error("Provider config doctor is preview-only; explicit apply flow is not implemented");
  }
  const report = createProviderConfigDoctorReport({
    rootDir: args.root || process.cwd(),
    homeDir: args.home,
    provider: args.provider,
    manifestPath: args.manifest,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatProviderConfigDoctorReport(report));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
