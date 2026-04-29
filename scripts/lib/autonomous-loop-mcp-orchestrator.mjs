export function discoverMcpTools(tools = []) {
  return tools.map((tool) => ({
    name: tool.name || tool,
    writeCapability: Boolean(tool.writeCapability),
    policyRisk: tool.writeCapability ? "medium" : "low",
    available: tool.available !== false,
  }));
}

export function planMcpUse(task, tools = []) {
  const discovered = discoverMcpTools(tools);
  const text = `${task.goal} ${task.category}`.toLowerCase();
  const preferred = text.includes("browser") ? "Playwright"
    : text.includes("design") ? "Figma"
    : text.includes("docs") || text.includes("library") ? "Context7"
    : null;
  const selected = discovered.find((tool) => tool.name.toLowerCase() === String(preferred || "").toLowerCase());
  return {
    required: Boolean(preferred),
    selected: selected || null,
    fallback: selected ? null : "local verification or documented skip",
  };
}
