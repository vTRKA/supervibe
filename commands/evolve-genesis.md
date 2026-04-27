---
description: "Bootstrap a project's .claude/ scaffold from a stack-pack matched to detected project stack. STUB in v0.1.0 — full implementation lands in Phase 5."
---

# /evolve-genesis (stub)

Phase 5 of the Evolve roadmap. Currently not implemented.

When implemented, this command will:
1. Run `evolve:stack-discovery` to identify the project's stack
2. Match against `stack-packs/` to select or compose a pack
3. Copy pack artifacts to the target project (`.claude/`, `husky/`, configs, structure)
4. Generate `CLAUDE.md` and `settings.json` from templates
5. Score the resulting scaffold against `confidence-rubrics/scaffold.yaml` ≥9

For now, respond to the user: "Genesis is not yet implemented in v0.1.0 (Phase 5 work). Currently available: /evolve-score, /evolve-override."
