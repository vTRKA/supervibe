# Figma Source-Of-Truth Flow

Supervibe treats Figma as an optional design source of truth, not as a silent
authority. Approved project memory, checked-in tokens, accessibility
requirements, and code facts still win when they conflict with Figma data.

## Capability Modes

The flow adapts to the MCP tools available in the user's runtime:

| Mode | Available capability | Allowed behavior |
| --- | --- | --- |
| `none` | No Figma MCP | Ask for screenshots or exported assets; document limited evidence. |
| `read-only` | File data and asset download | Extract variables/components/assets, then generate local tokens and prototype evidence. |
| `writeback` | Native Figma write tools available | Propose approved updates back to Figma after an explicit target-scoped approval. |
| `code-connect` | Code Connect metadata present in repo | Compare Figma components to production components and include parity evidence. |

If capability is unknown, agents must assume `read-only` at most and fail
closed before any remote mutation.

## Flow

1. **Intake.** Capture Figma file URL/key, node IDs, branch/page, target surface,
   approved source status, and whether Figma or repo tokens are canonical.
2. **Extract.** Use `supervibe:mcp-discovery` for `figma`; when available, read
   variables, components, text styles, effects, layout grids, assets, and
   relevant node metadata.
3. **Normalize.** Write local evidence under
   `.supervibe/artifacts/prototypes/<slug>/figma-source/`:
   - `source.json` - file key, node IDs, timestamps, capability mode.
   - `variables.json` - raw extracted variables and aliases.
   - `components.json` - component names, variants, states, and properties.
   - `assets/` - downloaded image/icon assets when allowed.
   - `mapping.md` - Figma component/token to local token/component mapping.
4. **Token Sync.** Convert approved Figma variables into
   `.supervibe/artifacts/prototypes/_design-system/tokens.css` or an extension request. Do not
   overwrite approved repo tokens without a system-level approval.
5. **Prototype.** Build native HTML/CSS/JS from the local design-system contract,
   not directly from raw Figma values. Every raw Figma value must map to an
   approved token or a documented drift exception.
6. **Code Parity.** When Code Connect or project component metadata exists,
   compare Figma components against production component names, props, states,
   and token use. Missing parity becomes a handoff issue, not an implicit code
   change.
7. **Drift Audit.** Before approval, generate
   `.supervibe/artifacts/prototypes/<slug>/figma-source/drift-report.md` with:
   - token drift
   - component/variant drift
   - missing states
   - asset license/source gaps
   - accessibility mismatches
   - code parity gaps
8. **Approval-Gated Writeback.** If writeback tools exist and the user approves
   the exact Figma target, propose remote changes as a patch list. Without
   writeback capability, produce `figma-source/manual-patch.md` for a designer.

## Hard Boundaries

- Do not mutate Figma without an explicit approval covering file, page/node,
  action type, and timebox.
- Do not upload screenshots, user data, PII, secrets, customer names, internal
  URLs, or production credentials into Figma.
- Do not treat Figma as newer than checked-in tokens unless the source status is
  confirmed.
- Do not make production code match a Figma component that fails accessibility,
  privacy, or platform constraints.
- Do not silently resolve Figma/repo drift; classify it as system-level,
  instance-level, or rejected.

## Required Evidence

Design-facing outputs influenced by this flow include:

```yaml
Figma Source Evidence:
  capabilityMode: "none | read-only | writeback | code-connect"
  fileKey: "<redacted-or-public-key>"
  nodeIds: ["<node-id>"]
  extractedAt: "<ISO>"
  sourceStatus: "approved | candidate | stale | unknown"
  tokenMapping: ".supervibe/artifacts/prototypes/<slug>/figma-source/mapping.md"
  driftReport: ".supervibe/artifacts/prototypes/<slug>/figma-source/drift-report.md"
  writeback: "not-available | blocked-for-approval | proposed | applied"
```

## Related

- `/supervibe-design`
- `supervibe:design-intelligence`
- `supervibe:mcp-discovery`
- `supervibe:tokens-export`
- `templates/design-system/tokens.css.tpl`
