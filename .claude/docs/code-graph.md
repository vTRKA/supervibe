# Code Graph (structural relationships)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Beyond semantic, the same `code.db` has a **code graph** with symbols + edges:

- **Symbols**: function / class / method / type / interface / enum (per language, tree-sitter S-expression queries)
- **Edges**: `calls`, `imports`, `extends`, `implements`, `references`

| Question | Command |
|----------|---------|
| Who calls X? | `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callers "X"` |
| What does X depend on? | `... --callees "X"` |
| Neighborhood of X | `... --neighbors "X" --depth 2` |
| Refactor blast-radius | `--callers "X"` then `--neighbors "X" --depth 2` |
| Most-connected symbols (orientation) | `... --top-symbols 20` |
| Same-name disambiguation | pass full ID `path:kind:name:line` instead of bare name |

**Discipline (enforced by rule `use-codegraph-before-refactor`):**

- BEFORE rename / extract method / move / inline: ALWAYS run `--callers` first — caller count is your blast radius
- BEFORE deleting a public symbol: confirm `--callers <symbol>` returns 0 in addition to running tests
- Cite graph evidence in agent output via 3-case template (Case A: callers found / Case B: zero callers verified / Case C: N/A with reason). Skipping the section on a structural change FAILS the agent-delivery rubric.

**Auto-startup:** SessionStart hook prints index status as the first 3 lines of every session. If you see `code graph ✗` or `WARN`, run `npm run code:index` before depending on graph queries.

**Languages covered:** TypeScript, JavaScript, TSX, JSX, Python, PHP, Go, Rust, Java, Ruby + **Vue / Svelte SFC** (script blocks parsed with TS/JS grammar, line numbers re-based; template-side refs extracted via lightweight regex covering `@click="x"`, `:prop="y"`, `{{ z }}`, `on:click={q}`, `bind:value={r}`, `{w}`).

**Vue/Svelte coverage realism:**
- ✅ Symbols + edges from `<script>` and `<script setup lang="ts">` (any lang) — full TS/JS coverage
- ✅ Multiple script blocks (Svelte's `<script context="module">` + instance script)
- ✅ Template-side method/computed/state references (regex-based, identifier-level)
- ❌ Template scoping (e.g., v-for item shadowing) not modeled
- ❌ `<style>` block ignored (CSS not part of code graph)
- ❌ Vue/Svelte directives' internal AST not parsed (regex extracts identifiers, not types)

**Coverage realism:** ~80% cross-file edge resolution baseline (industry standard for non-LSP graph extractors). Unresolved targets surface with `to_name` and `kind=external` — useful for "imports from third-party X".
