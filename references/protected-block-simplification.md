# Protected Block Simplification

Use protected blocks when simplification or refactoring must preserve generated, vendor, legal, migration, security, or user-owned content.

Markers:

```text
// supervibe-simplify-ignore-start: reason
...
// supervibe-simplify-ignore-end
```

Rules:

- A reason is required.
- Nested blocks are allowed only when the parser can match them safely.
- Malformed starts or ends produce warnings and block destructive simplification or refactor edits.
- Protected blocks are not a reason to skip tests; they are a reason to avoid rewriting a region.
- Protected blocks do not authorize rewriting user-owned host instruction text. Use the managed-block migrator for host instruction updates and preserve user-owned sections outside managed blocks.

Workflow primitive:

```js
import {
  evaluateProtectedSimplification,
  inspectProtectedSimplificationBlocks,
} from "../scripts/lib/protected-block-simplification.mjs";

const report = inspectProtectedSimplificationBlocks(currentText);
const gate = evaluateProtectedSimplification(currentText, [
  { startLine: 12, endLine: 18 },
], { report });

if (!gate.pass) {
  // Stop and route around protected spans; do not delete or rewrite guarded code.
}
```

Use `evaluateProtectedSimplification(text, touchedRanges)` before automated simplification, bulk rule application, compatibility refactors, or review approval when a diff touches generated, vendored, migration, security, legal, compatibility, or user-owned content. `touchedRanges` are 1-based inclusive line ranges from the proposed edit, not just newly added lines.

Blocking conditions:

- Any malformed marker warning from `inspectProtectedSimplificationBlocks`.
- Any touched range that overlaps a protected block, including the marker lines.
- Any simplification proposal that treats the protected marker as permission to weaken tests, ownership, legal, security, or managed-block guarantees.
