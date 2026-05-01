# Host Adapter Matrix

Supervibe genesis must choose the target AI host before planning writes. The
host detector reads filesystem markers and active CLI hints, then returns either
a confident adapter or a one-question selection state when multiple hosts are
present.

| Host | Primary instruction file | Model folder | Agents | Rules | Skills | Strategy |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | `CLAUDE.md` | `.claude` | `.claude/agents` | `.claude/rules` | `.claude/skills` | Markdown imports plus managed blocks |
| Codex | `AGENTS.md` | `.codex` | `.codex/agents` | `.codex/rules` | `.codex/skills` | `AGENTS.md` managed section |
| Cursor | `.cursor/rules/supervibe.mdc` | `.cursor` | `.cursor/agents` | `.cursor/rules` | `.cursor/skills` | Cursor rule files |
| Gemini | `GEMINI.md` | `.gemini` | `.gemini/agents` | `.gemini/rules` | `.gemini/skills` | `GEMINI.md` managed section |
| OpenCode | `opencode.json`, `AGENTS.md` | `.opencode` | `.opencode/agents` | `.opencode/rules` | `.opencode/skills` | JSON config plus `AGENTS.md` |

Detection order is evidence-based, not hard-coded to Claude. If `CLAUDE.md`,
`AGENTS.md` and `.cursor/rules` coexist without `SUPERVIBE_HOST`, genesis must
ask one host-selection question before writing. Use
`node scripts/supervibe-status.mjs --host-diagnostics` to inspect the selected
adapter, confidence and evidence.
