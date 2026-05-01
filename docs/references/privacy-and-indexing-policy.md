# Privacy And Indexing Policy

Supervibe indexes source context only when the file is safe and useful for code
retrieval. The privacy classifier runs before code indexing and graph extraction.

Classes:

- `source-code`: indexed and graph-enabled when the language is supported.
- `source-doc`: indexable as documentation, not graph-enabled.
- `generated`: skipped.
- `binary`: skipped.
- `archive`: skipped.
- `secret-like`: skipped; values are never printed.
- `local-config`: skipped.
- `unsupported`: skipped.

Diagnostics:

```bash
node scripts/supervibe-status.mjs --index-policy-diagnostics
node scripts/build-code-index.mjs --root . --explain-policy
```

Genesis and audit output should explain skipped classes by path and reason
without printing secret contents.
