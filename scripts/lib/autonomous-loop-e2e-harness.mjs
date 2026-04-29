import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runAutonomousLoop } from "./autonomous-loop-runner.mjs";

export async function runFixture(rootDir, fixtureName, options = {}) {
  const fixtureDir = join(rootDir, "tests", "fixtures", "autonomous-loop", fixtureName);
  await mkdir(fixtureDir, { recursive: true });
  const request = options.request || fixtureRequest(fixtureName);
  const result = await runAutonomousLoop({
    rootDir,
    request,
    dryRun: true,
    fixture: fixtureDir,
    maxLoops: 20,
  });
  await writeFile(join(fixtureDir, "last-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

export function fixtureRequest(fixtureName) {
  if (fixtureName.includes("docker")) return "validate Docker Compose app health check";
  if (fixtureName.includes("mcp")) return "validate app through MCP browser checks";
  if (fixtureName.includes("missing-credentials")) return "deploy to server with missing credentials";
  if (fixtureName.includes("flaky")) return "validate flaky tests and classify retries";
  if (fixtureName.includes("production")) return "prepare production deploy and stop for approval";
  return "validate local Node app and fix integration bugs";
}
