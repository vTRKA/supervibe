---
name: mcp-discovery
namespace: process
description: 'Use WHEN session starts OR WHEN user mentions visual/browser/desktop/data task to detect available MCP servers and proactively suggest agents that benefit from them. Triggers: MCP discovery, available tools, browser MCP, Figma MCP, Tauri MCP, current docs.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: brainstorm
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 2
last-verified: 2026-05-15T00:00:00.000Z
---

# MCP Discovery

## Overview

MCP Discovery selects live MCP capability from the runtime registry before an agent uses browser, desktop, design, crawl, search, or current-docs tooling. It exists to prevent two failures: hardcoding a host-specific tool namespace in shared instructions, and claiming a configured or desired MCP is available when runtime discovery did not prove it.


## When to Use

Use this skill when a task would benefit from external or interactive capability such as current documentation, browser automation, Tauri desktop verification, Figma extraction, web crawl/search, OpenAI API documentation, or local document parsing. Use it at session start when MCP state may affect agent routing, and before any claim that browser, Figma, Firecrawl, Context7, OpenAI-docs, or Tauri capability is available.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, keep scope safe, use real producers and runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

Also apply `docs/references/authoritative-source-catalog.md` and `docs/references/source-freshness-policy.md`: cite catalog ids for current-docs sources when available, report registry/source freshness with fallback, and treat unknown freshness as a blocker for 10/10 claims in the affected specialty.

## Step 0

1. Prefer a fresh registry from `node scripts/discover-mcps.mjs` or the SessionStart discovery output.
2. Read `.supervibe/memory/mcp-registry.json` after discovery. Treat it as the canonical availability source.
3. Use provider-config evidence only through registry fields such as `hostSources`, `configSources`, `availableTools` or `tools`, `capabilities`, `updatedAt`, `freshness`, `desiredCapabilities`, `missingCapabilities`, `availableToolsByHost`, and `adapterBinding` when those fields exist.
4. Do not read, quote, summarize, or copy raw provider config, environment values, private server URLs, profile names, cookies, localStorage, tokens, API keys, or user-home dumps into agent output or artifacts.
5. Use `docs/references/authoritative-source-catalog.md` for source ids and `docs/references/source-freshness-policy.md` for freshness states, stale handling, fallback hierarchy, and confidence caps.
6. Treat registry schema v2 and v3 defensively: `availableTools` is preferred; `tools` is accepted as an availability list only when the registry entry itself marks the MCP as discovered/available. Desired or catalog tools are never proof of runtime availability.

## Capability Names

Shared skills and shared agents should use host-neutral capability ids. Concrete host tool names belong only in adapter-managed bindings, runtime registries, or the host tool palette.

| Task need | Preferred capability order | Fallback when unavailable |
| --- | --- | --- |
| Current library docs | `context7`, then `research` | official docs or web source with citation |
| OpenAI product/API docs | `openai-docs`, then `research` | official OpenAI docs via web source |
| Browser interaction, screenshots, DOM, accessibility snapshot | `browser` | static scrape, local file inspection, or manual instructions |
| Native Tauri desktop verification, webview, IPC, windows, logs, devices | `tauri` | browser preview only, reported as not native-shell proof |
| Figma or design asset extraction | `figma` | user-provided screenshots or exported assets |
| Web crawl or structured scrape | `firecrawl`, then `browser` for one page | targeted web search/scrape with limitations |
| General web search or news | `firecrawl`, then `research` | web search with source links and recency notes |
| Local document parse | `firecrawl`, then local file read when plain text | direct file read with parser limitation |

Canonical capability ids currently recognized by the MCP registry include `context7`, `browser`, `figma`, `firecrawl`, `openai-docs`, and `tauri`. Registry entries may also expose descriptive capabilities such as `docs`, `research`, `visual`, `desktop`, `qa`, `ipc`, `api`, or `openai`; use those as matching hints, not as new provider names.

## Availability Rules

- A capability is available only when a registry MCP entry has a matching `capabilityId`, `name`, or `capabilities[]` value and a non-empty runtime tool list in `availableTools` or `tools`.
- `desiredCapabilities`, `missingCapabilities`, static catalogs, docs, and examples describe intent only. They do not authorize a tool call.
- If `availableToolsByHost` exists, prefer tools listed for the current host. If only another host has the capability, report it as unavailable in the current host and use fallback.
- If the current host tool palette does not expose the registry-listed tool family, do not invent a call. Report the mismatch and fall back.
- If the registry is missing, stale, malformed, or lacks runtime discovery evidence, report `selectedMcp: none`, mark freshness as `unknown`, `stale`, or `unavailable` per `docs/references/source-freshness-policy.md`, and explain the fallback and confidence cap.
- Unknown registry or source freshness blocks 10/10 for the affected MCP/current-docs specialty even when a fallback is usable.
- For interactive or mutating external tools, ask before actions that mutate external state, submit forms, upload files, or write to remote systems.

## Decision tree

```text
Task needs current library/OpenAI docs?
- Registry proves context7/openai-docs available in this host -> use the host tool and cite source catalog ids.
- Registry missing, stale, or host mismatch -> use official docs fallback and cap confidence.

Task needs browser/Figma/Tauri/Firecrawl execution?
- Registry entry has runtime tools for the current host -> use the tool and report selected capability.
- Capability exists only for another host -> report unavailable in current host and use fallback.
- No runtime tool list -> do not call or claim the tool; record selectedMcp none.

Task would mutate external state?
- Ask before submit/upload/write/navigation that changes remote state.
- Read-only inspection may proceed when registry evidence is current.
```

## Procedure

1. Classify the task category: `docs`, `openai-docs`, `browser`, `desktop-tauri`, `figma`, `crawl`, `search`, or `document-parse`.
2. Read `.supervibe/memory/mcp-registry.json`. If discovery is allowed and the registry is absent or stale, run `node scripts/discover-mcps.mjs` and read it again.
3. Build an availability view from registry entries only. Record `name`, capability match, `hostSources`, `configSources`, tool count, and freshness timestamp. Redact or omit sensitive config details.
4. Select the first available host-neutral capability from the category preference list.
5. Bind to the actual host tool only if the current host exposes that tool family. Use the host tool directly; do not write shared guidance with host-specific tool names.
6. When no safe tool is available, choose the fallback path and make the limitation explicit.
7. Include the output evidence contract in the response or durable artifact.

## Output contract

Every MCP decision must report:

```json
{
  "selectedCapability": "context7|browser|figma|firecrawl|openai-docs|tauri|none",
  "selectedMcp": "registry-name-or-none",
  "hostSources": ["host-id"],
  "toolFamilyUsed": "host-neutral-family-or-native-fallback",
  "fallback": "reason-or-null",
  "registryFreshness": "current|aging|stale|unknown|unavailable",
  "sourceCatalogIds": ["catalog-id-or-none"],
  "confidenceCap": "none|8|7|6|5|blocked",
  "unavailableCapabilities": ["capability-id"],
  "limitations": ["confidence-affecting limitation"]
}
```

For Tauri, also report whether native evidence was available for `webview`, `ipc`, `window`, `logs`, and `devices`. If only browser preview evidence was used, say it is frontend-preview evidence and not native Tauri shell proof.

## No-Prompt Path

If discovery already ran and the registry proves a matching capability is available in the current host, do not interrupt the user. Ask only when:

- the task requires a connector or capability that is not installed,
- the user must provide a URL, file, Figma file key, or node id,
- fallback would materially reduce quality,
- an MCP action would mutate external state,
- provider or registry evidence is stale enough to affect confidence.

## Fallback Reporting

Fallbacks are acceptable only when they are visible. Report the missing capability, the evidence source, the fallback chosen, the catalog id when available, the freshness state, and what confidence or coverage is lost under `docs/references/source-freshness-policy.md`.

Examples of acceptable fallback statements:

- `No browser capability was available in the current host; using static scrape, so interactive state is not verified.`
- `Tauri was discovered for another host only; using browser preview evidence and treating native IPC/window/log coverage as unverified.`
- `Figma capability is missing; ask for a screenshot or exported assets before design extraction.`
- `Registry freshness is cached; using official docs and marking currentness as unverified.`

## Common rationalizations

- "The MCP is listed in config, so it is available" is rejected; only runtime-discovered tool lists prove availability.
- "A desired capability is enough for routing" is rejected; desired capabilities are backlog intent, not executable tools.
- "A tool exists in another host, so this host can use it" is rejected; host-specific availability must match the current host.
- "Fallback worked, so confidence is still 10/10" is rejected when freshness, interactivity, native shell, or source currentness was not proven.

## Red flags

- The output names a concrete host tool without a registry-backed current-host availability match.
- The artifact includes raw provider config content, command arguments, private URLs, cookies, tokens, or profile names.
- Browser preview evidence is described as native Tauri IPC/window/log/device proof.
- Registry freshness is unknown or stale but the response still claims current MCP coverage or 10/10 maturity.

## Checklist

- [ ] Task category is classified before selecting a tool.
- [ ] Registry was read or a missing/stale registry fallback was recorded.
- [ ] Selected capability is host-neutral and available in the current host.
- [ ] Fallback, freshness, limitations, and confidence cap are explicit.
- [ ] No sensitive provider configuration or private runtime state is exposed.
- [ ] Durable outputs include the Output contract fields.

## Failure modes

- Stale registry: rerun discovery when allowed; otherwise mark freshness stale and cap confidence.
- Host mismatch: do not use another host tool binding; choose fallback and mark native/interactive proof missing.
- Missing tool palette: report selectedMcp none even if registry metadata mentions the capability.
- Sensitive registry data: redact by omission and record freshness as unknown when proof would require disclosure.
- Tool call fails: preserve the command/error summary, switch to fallback, and avoid completion claims for missing proof.

## Guard rails

- Do not mutate provider configs, remote systems, files, forms, or uploads from this skill without an owner-approved workflow.
- Do not use static catalogs, examples, desired capabilities, or installed package names as runtime availability proof.
- Do not lower the evidence bar for design, browser, Tauri, Figma, Firecrawl, OpenAI-docs, or current-docs claims.
- Do not claim 10/10 MCP or current-docs maturity when registry/source freshness is unknown, stale, or host-mismatched.

## Privacy And Provider Config Guardrails

- Registry outputs must stay allowlist-only: capability id, MCP name, safe tool identifiers when already in registry, host id, config source path class, availability state, timestamp, fallback, and missing-capability reason.
- Do not expose raw command arguments, private URLs, user-home config content, environment values, secrets, cookies, localStorage, profile names, or auth headers.
- If freshness proof would require exposing private provider config or user-home dumps, mark the capability freshness as `unknown` or `unavailable` and use a safe redacted fallback instead.
- Do not mutate provider configs from this skill. Provider-home config repair belongs to the owning provider-config workflow.
- Project runtime configs are out of scope for MCP discovery updates unless a separate owner-approved workflow explicitly authorizes that scope.

## Anti-Patterns

- Hardcoding concrete MCP tool names in shared agent or skill instructions.
- Treating a desired capability, static catalog entry, or installed provider config as proof that the current host can call the tool.
- Calling a tool family that is not present in the current host palette.
- Omitting fallback reason, registry freshness, host source, or limitations.
- Using browser preview evidence as if it proved native Tauri IPC, window, log, or device behavior.
- Copying provider config contents or private endpoint details into registry evidence or agent output.

## Verification

Before claiming MCP discovery was handled:

- The registry was read or a missing-registry fallback was documented.
- The selected capability is host-neutral.
- The selected MCP has a runtime-discovered tool list, or `selectedMcp` is `none` with fallback reason.
- The output names freshness/currentness, source catalog ids when applicable, confidence cap, and limitations.
- Unknown source or registry freshness is reported as blocking 10/10 for the affected specialty.
- No unavailable or unlisted tool was claimed as used.
- No raw provider config or sensitive data was exposed.

## When Not To Use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it to replace a specialist producer, worker, reviewer, or runtime receipt requirement.
- Do not use it when required source evidence, RAG/CodeGraph, or verification is missing and the task depends on those gates.

## Related

- Registry helper: `scripts/lib/mcp-registry.mjs`
- Discovery command: `scripts/discover-mcps.mjs`
- Registry artifact: `.supervibe/memory/mcp-registry.json`
- Provider config boundary: `scripts/lib/supervibe-provider-config-applier.mjs`
- Cross-agent policy: `docs/references/agent-tool-use-matrix.md`
