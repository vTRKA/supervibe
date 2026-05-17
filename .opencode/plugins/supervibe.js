// Supervibe plugin for OpenCode
// Auto-registers skills directory and bootstraps Supervibe indexes on session events.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SUPERVIBE_VERSION = "2.1.44";

const SupervibePlugin = async ({ client, directory, worktree }) => {
  const projectRoot = resolve(worktree || directory || process.cwd());

  function runSessionBootstrap(reason = "startup") {
    const result = spawnSync(process.execPath, [resolve(PLUGIN_ROOT, "scripts", "session-start-check.mjs")], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SUPERVIBE_PLUGIN_ROOT: PLUGIN_ROOT,
        SUPERVIBE_PROJECT_ROOT: projectRoot,
        SUPERVIBE_HOST: "opencode",
        SUPERVIBE_SESSION_START_REASON: reason,
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8,
    });
    const message = [result.stdout, result.stderr].map((part) => String(part || "").trim()).filter(Boolean).join("\n");
    if (message && client?.app?.log) {
      client.app.log({
        body: {
          service: "supervibe",
          level: result.status === 0 ? "info" : "warn",
          message,
        },
      }).catch(() => {});
    }
  }

  runSessionBootstrap("startup");

  return {
    config: async () => ({
      skills: {
        paths: [resolve(PLUGIN_ROOT, "skills")],
      },
    }),
    event: async ({ event }) => {
      if (event?.type === "session.created") runSessionBootstrap("startup");
      if (event?.type === "session.compacted") runSessionBootstrap("compact");
    },
    "experimental.chat.messages.transform": async () => ({
      messages: [{
        role: "user",
        content: "I have Supervibe skills available. Before broad repo search for command-like requests, run node scripts/supervibe-commands.mjs --match \"<user request>\" and hard-stop on missing slash commands. Use the trigger-safe workflow: /supervibe-brainstorm -> /supervibe-plan --from-brainstorm -> /supervibe-loop --atomize-plan <plan-path> --user-approved-plan -> provider-safe execution. Claimed command, skill, agent, reviewer, worker, validator, or external-tool invocations need runtime workflow receipts; do not emulate specialist producers from controller text.",
      }],
    }),
  };
};

export default SupervibePlugin;
