# Host Adapter Matrix

Supervibe genesis must choose the target AI host before planning writes. The
host detector reads explicit overrides, active runtime/current-chat hints, and
filesystem markers, then returns either a confident adapter or a one-question
selection state when multiple hosts are present.

| Host | Instruction surface | Config scope | Agents | Rules | Skills | Strategy |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | provider root instruction file | provider config folder | adapter agents folder | adapter rules folder | adapter skills folder | Markdown imports plus managed blocks |
| Codex | `AGENTS.md` | `.codex` | `.codex/agents` | `.codex/rules` | `.codex/skills` | `AGENTS.md` managed section |
| Cursor | `.cursor/rules/supervibe.mdc` | `.cursor` | `.cursor/agents` | `.cursor/rules` | `.cursor/skills` | Cursor rule files |
| Gemini | `GEMINI.md` | `.gemini` | `.gemini/agents` | `.gemini/rules` | `.gemini/skills` | `GEMINI.md` managed section |
| OpenCode | `opencode.json`, `AGENTS.md` | `.opencode` | `.opencode/agents` | `.opencode/rules` | `.opencode/skills` | JSON config plus `AGENTS.md` |

Detection order is evidence-based, not hard-coded to Claude. Precedence is:
`SUPERVIBE_HOST` / `SUPERVIBE_TARGET_HOST`, then active runtime hints such as
`CODEX_THREAD_ID`, then project files. If several host instruction surfaces
coexist without an active runtime or explicit host, genesis must
ask one host-selection question before writing. Use
`node scripts/supervibe-status.mjs --host-diagnostics` to inspect the selected
adapter, confidence and evidence.
