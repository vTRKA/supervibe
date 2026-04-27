---
description: "Show what changed in Evolve since the last version this project saw. Reads CHANGELOG.md and the .evolve-version marker."
---

# /evolve-changelog

Display CHANGELOG entries between the project's last-seen Evolve version and the currently installed plugin version. Use when the SessionStart banner shows `⬆ plugin upgraded X → Y`.

## Procedure

1. Read `$CLAUDE_PLUGIN_ROOT/.claude-plugin/plugin.json` to get current plugin version.
2. Read `.claude/memory/.evolve-version` from the project to get last-seen version (created by SessionStart hook).
3. If equal: respond "Project is on the latest plugin version (vX). No changelog to show."
4. Otherwise read `$CLAUDE_PLUGIN_ROOT/CHANGELOG.md` and extract every `## [VERSION] — DATE` section between (lastSeen, current], inclusive of current.
5. Print the extracted sections verbatim, but cap at 4000 chars total. If more, summarize newest-first with "(see CHANGELOG.md for full list)".
6. Highlight any **breaking changes** (lines containing `BREAKING`, `Removed`, or `Migration`).

## Output contract

```
=== What changed since vX in this project ===

## [v Y.Z.W] — YYYY-MM-DD
<verbatim changelog body>
...

[breaking changes called out at top if any]

To upgrade the plugin itself: `npm run evolve:upgrade` in the plugin checkout.
```

## When NOT to invoke

- During the same session that SessionStart already showed the upgrade banner — Claude already has context.
- If `.claude/memory/.evolve-version` does not exist — that means no version-bump tracking yet (first session under this plugin install). Respond accordingly.

## Related

- `/evolve-adapt` — propagate plugin changes into project-level `.claude/agents/` overrides
- `npm run evolve:upgrade` — actually pull a newer plugin version
