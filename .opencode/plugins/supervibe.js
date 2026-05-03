// Supervibe plugin for OpenCode
// Auto-registers skills directory and injects bootstrap context.
{
  name: "supervibe",
  version: "2.0.67",
  description: "Specialist agents (89), trigger-safe workflow routing, worktree-ready autonomous loops, design intelligence, code graph, semantic RAG, project memory, confidence gates.",
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
          content: "I have Supervibe skills available. Use the trigger-safe workflow: brainstorm -> plan -> review -> atomize -> epic -> provider-safe worktree execution when relevant. For security work, route through /supervibe-security-audit. For prompt, system-instruction, agent-instruction, or intent-router work, use prompt-ai-engineer with eval and safety evidence. For router/network work, start with read-only network-router-engineer diagnostics. For design work, route through existing design/audit commands with memory, code, and design-intelligence evidence."
        }]
      };
    }
  }
};
