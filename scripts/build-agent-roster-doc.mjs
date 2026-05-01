#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { writeAgentRosterMarkdown } from "./lib/supervibe-agent-roster.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));

writeAgentRosterMarkdown({ rootDir })
  .then(({ outPath, roster }) => {
    console.log(`Agent roster written to ${outPath}`);
    console.log(`Agents: ${roster.count}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
