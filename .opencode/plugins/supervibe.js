// Supervibe plugin for OpenCode
// Auto-registers skills directory and injects bootstrap context.
{
  name: "supervibe",
  version: "2.1.7",
  description: "Specialist agents (97), trigger-safe workflow routing, worktree-ready autonomous loops, design intelligence, code graph, semantic RAG, project memory, confidence gates.",
  hooks: {
    config: async (context) => {
      // Register skills directory for OpenCode discovery
      return {
        skills: {
          paths: [context.pluginDir + "/../../skills"]
        }
      };
    },
    "experimental.chat.messages.transform": async (context) => {
      // Inject bootstrap as a user message at session start
      return {
        messages: [{
          role: "user",
          content: "I have Supervibe skills available. Before broad repo search for command-like requests, run node scripts/supervibe-commands.mjs --match \"<user request>\" and hard-stop on missing slash commands. Use the trigger-safe workflow: /supervibe-brainstorm -> /supervibe-plan --from-brainstorm -> /supervibe-plan --review -> /supervibe-loop --atomize-plan -> provider-safe execution. Keep scope-safety active: reject or defer extra features that are not tied to approved user value. Claimed command, skill, agent, reviewer, worker, validator, or external-tool invocations need runtime workflow receipts; do not emulate specialist producers from controller text. For security work, route through /supervibe-security-audit. For prompt, system-instruction, agent-instruction, or intent-router work, use prompt-ai-engineer with eval and safety evidence. For router/network work, start with read-only network-router-engineer diagnostics. For design work, route through existing design/audit commands with memory, code, and design-intelligence evidence."
        }]
      };
    }
  }
};
