# Pre-write prototype guard

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

`scripts/hooks/pre-write-prototype-guard.mjs` (PreToolUse on Write|Edit) blocks writes to `prototypes/<slug>/` until `config.json` exists (forces viewport question to be asked first) AND blocks writes containing framework imports (`import … from`, `require()`, `<script src=…cdn…>`). Existing prototypes from before plan v2 — run `npm run migrate:prototype-configs` once to backfill default config.json.
