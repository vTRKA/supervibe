# Synthetic Shared Agent With Raw MCP Namespace

This intentionally invalid shared-agent fixture leaks a provider/tool namespace
directly into shared prompt text.

Invalid example:

```text
Use mcp__playwright__browser_click to press the approve button.
```

Expected gate result: fail.

Expected reason: shared agent content must not expose raw MCP tool namespaces.
