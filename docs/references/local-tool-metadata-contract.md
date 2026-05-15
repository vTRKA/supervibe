# Local Tool Metadata Contract

Every command, skill and local script exposed to agents gets deterministic metadata:

- Stable name and aliases
- Short description
- Input shape
- Side-effect level
- Approval policy
- Required context sources
- Token-cost hint
- Owner

MCP registry metadata additionally records adapter namespace bindings:

- `availableTools` lists the concrete runtime or provider-config tools observed for the MCP.
- `canonicalTools` keeps the host-neutral reference catalog for documentation and compatibility.
- `adapterTools` lists the host-specific overlay, such as Codex underscore-style MCP namespaces.
- `toolNamespace`, `toolNamespacesByHost`, and `adapterBinding` bind concrete tools to the host adapter that exposed them.
- Agents must prefer runtime `availableToolsByHost[host]` or `adapterBinding` over hardcoded MCP tool names when a host-specific namespace exists.

Safety defaults:

- Writes, migrations, network use, external APIs and private screenshots require explicit user confirmation.
- Read-only diagnostics can run without confirmation but must cite evidence.
- Tool lists are sorted deterministically and can be filtered by intent to reduce prompt size.

MCP capability metadata:

- Recommended MCPs are governed by the declared desired capabilities in
  `scripts/lib/mcp-registry.mjs`, not by ad hoc prose in agent prompts.
- Current declared capability ids are `context7`, `browser`, `figma`,
  `firecrawl`, `openai-docs`, and `tauri`.
- Preferred MCPs are Context7 for third-party library docs, Playwright for
  browser interaction and screenshots, Figma MCP for design-source extraction,
  Firecrawl for web research and structured extraction, OpenAI developer docs
  MCP for OpenAI API and model documentation, and Tauri MCP for native desktop
  webview, IPC, window, logs, device, and setup verification.
- If runtime discovery does not prove an MCP available, metadata and agent
  output must name the fallback instead of implying the MCP was used.

Run:

```bash
node --test tests/local-tool-metadata-contract.test.mjs
node scripts/supervibe-status.mjs --capabilities
```
