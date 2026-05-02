---
name: terminal-file-io
description: "Terminal commands and file writes must preserve UTF-8 text, avoid shell-redirection data loss, and keep generated evidence machine-readable."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-05-03
related-rules: [confidence-discipline]
---

# Terminal And File I/O

## Why this rule exists

Encoding damage is a workflow bug, not a cosmetic issue. A single Windows shell redirection can turn readable non-ASCII text into mojibake or question marks, corrupting prompts, approval evidence, command metadata, and generated Markdown/JSON.

Concrete consequence of NOT following: a design approval or trigger phrase is saved as unreadable text, later validators cannot distinguish user evidence from generated guesses, and agents repeat the same routing mistake.

## When this rule applies

- Any command that writes JSON, Markdown, YAML, CSS, HTML, evidence, memory, command output, or generated Supervibe artifacts.
- Any Windows PowerShell session that handles non-ASCII text.
- Any script that captures subprocess output for machine-readable evidence.

## What to do

- Prefer Node file APIs for text writes: `fs.writeFile(path, data, "utf8")`, `fs.appendFile(path, data, "utf8")`, or `fs.promises.*` with `"utf8"`.
- Avoid legacy PowerShell redirection operators (`>`, `>>`, `Out-File` without `-Encoding utf8`) for non-ASCII or machine-readable files.
- In PowerShell, use `Set-Content -Encoding utf8`, `Add-Content -Encoding utf8`, or Node scripts for durable file writes.
- When spawning child processes from Node, request text output with `encoding: "utf8"` when using sync APIs, or decode buffers with `TextDecoder("utf-8", { fatal: true })` when strict validation matters.
- Keep machine-readable approval evidence ASCII where possible. Preserve exact user text only when the evidence semantics require it.
- Keep `.editorconfig` and `.gitattributes` authoritative: UTF-8 charset, LF endings, final newline, and LF normalization for text surfaces.

## Examples

### Bad

```powershell
"approved by user" > .supervibe/artifacts/prototypes/demo/.approval.json
```

Why this is bad: shell defaults can differ by host and code page; JSON may be invalid or text may be corrupted.

### Good

```js
await fs.writeFile(path, JSON.stringify(receipt, null, 2), "utf8");
```

Why this is good: the encoding is explicit, portable, and testable.

## Enforcement

- `scripts/validate-text-encoding.mjs` rejects replacement characters, repairable mojibake, and suspicious question-mark runs.
- `scripts/validate-terminal-file-policy.mjs` verifies `.editorconfig`, `.gitattributes`, host contexts, generated managed context, and this rule preserve the terminal/file I/O contract.
- Code review should reject new shell write paths for non-ASCII evidence unless the command explicitly sets UTF-8.

## Related rules

- `confidence-discipline` - verification evidence must be readable and durable.
