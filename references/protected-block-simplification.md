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
- Malformed starts or ends produce warnings and block destructive simplification.
- Protected blocks are not a reason to skip tests; they are a reason to avoid rewriting a region.
