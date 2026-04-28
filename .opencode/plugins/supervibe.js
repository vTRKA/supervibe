// Supervibe plugin for OpenCode
// Auto-registers skills directory and injects bootstrap context.
{
  name: "supervibe",
  version: "1.7.0",
  description: "Specialist agents (79), code graph (10 langs), semantic RAG, project memory, confidence gates.",
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
          content: "I have Supervibe skills available. When relevant, invoke them via the skill tool."
        }]
      };
    }
  }
};
