# Internal Command Specs

These files document legacy, diagnostic, plugin-maintenance, and internal escape-hatch flows that should not appear in the normal slash-command surface.

The published slash commands live in `commands/`. Keeping these specs outside that directory reduces user-facing command noise while preserving implementation notes and backward-compatibility context for maintainers.

Current hidden specs:
- `supervibe-changelog.md` - changelog display and migration planning.
- `supervibe-debug.md` - failed invocation diagnostics.
- `supervibe-deploy.md` - local prototype handoff integration into production code.
- `supervibe-evaluate.md` - legacy alias behavior for `/supervibe-score --record`.
- `supervibe-memory-gc.md` - reversible memory archival.
- `supervibe-override.md` - override log schema and rationale requirements.
- `supervibe-test.md` - plugin developer QA wrapper.
