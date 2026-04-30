# Supervibe for OpenCode

Install Supervibe by adding it to your `opencode.json`:

```json
{
  "plugin": ["supervibe@git+https://github.com/vTRKA/supervibe.git"]
}
```

Restart OpenCode. The plugin auto-registers all skills automatically.

## Usage

After install, ask: "Tell me about your skills" or just start working — skills trigger automatically based on what you're doing.

## Updating

Supervibe updates automatically when you restart OpenCode (re-installed from git on each launch).

To follow the same live channel explicitly:

```json
{
  "plugin": ["supervibe@git+https://github.com/vTRKA/supervibe.git#main"]
}
```

For reproducible installs, pin a specific commit SHA instead of a release tag.

## How it works

The plugin registers the skills directory via the `config` hook, so OpenCode discovers all Supervibe skills without symlinks or manual config.

## Troubleshooting

1. Check OpenCode logs: `opencode run --print-logs "hello" 2>&1 | grep -i supervibe`
2. Make sure you're running a recent version of OpenCode
3. Skills need a `SKILL.md` file with valid YAML frontmatter — all Supervibe skills meet this requirement
