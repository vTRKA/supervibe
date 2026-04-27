# Getting Started with Evolve

Evolve is a self-evolving Claude Code plugin: stack-aware scaffolding + 15-year-persona agents + 10-point confidence engine + autonomous proactivity.

## Install

### Option A — Claude Code plugin (recommended)

1. Clone or download to `~/.claude/plugins/cache/evolve/<version>/` (or your plugin dir)
2. Restart Claude Code; plugin auto-loads
3. Verify: type `/evolve` — should respond with auto-detect dispatcher

### Option B — Local dev

```bash
git clone <evolve-repo> ~/dev/evolve
cd ~/dev/evolve
nvm use      # uses Node 20 from .nvmrc
npm install
npm run check    # validates everything works
```

Symlink to your Claude plugins dir:
```bash
ln -s ~/dev/evolve ~/.claude/plugins/cache/evolve/0.1.0
```

## Your First Project (5 minutes)

### 1. Empty project

```bash
mkdir my-saas && cd my-saas
git init
```

### 2. Open Claude Code

In the new project, Claude Code session starts. The plugin's `evolve-orchestrator` agent will detect the empty `.claude/` and propose:

```
📊 Discovered: empty project (no .claude/agents/, no CLAUDE.md routing)
⚡ Recommend: /evolve-genesis
🎯 Why: bootstrap stack-aware scaffold from empty repo
⏭ Run? (y/n)
```

Type `y`.

### 3. Discovery questionnaire

`evolve:stack-discovery` runs. You'll be asked one question at a time:

- "What are you building?" → web-app
- "Backend stack?" → laravel
- "Frontend stack?" → nextjs
- "Primary data store?" → postgres
- "Infrastructure features?" → redis-cache, queue
- ... (architecture, design, testing, deployment)

### 4. Genesis

`evolve:genesis` composes the matching stack-pack (`laravel-nextjs-postgres-redis`):

- Copies all attached agents to `.claude/agents/`
- Copies all attached rules to `.claude/rules/`
- Generates `.claude/settings.json` with full deny-list
- Generates `CLAUDE.md` with routing table
- Sets up husky + commitlint + lint-staged
- Creates skeleton dirs: `backend/`, `frontend/`, `prototypes/`, `docs/`

After ~30 seconds: scaffolded project ready.

### 5. First feature

Tell Claude:
> Add a user-billing module with subscription plans.

`evolve:_meta:evolve-orchestrator` proposes:
> ⚡ Recommend: evolve:requirements-intake (complexity ≥4)

Type `y`. The framework chains:
1. `evolve:requirements-intake` → asks clarifying questions
2. `evolve:brainstorming` (if complexity ≥7) → spec
3. `evolve:writing-plans` → phased plan
4. `evolve:executing-plans` → executes with TDD per task
5. `evolve:_core:code-reviewer` → review
6. `evolve:_core:quality-gate-reviewer` → final ≥9 gate

Every artifact is confidence-scored ≥9 before progression. Override with `/evolve-override "<reason>"` if needed.

## Command reference

| Command | What it does |
|---------|--------------|
| `/evolve` | Auto-detect dispatcher; suggests next phase |
| `/evolve-genesis` | Bootstrap empty project with stack-pack |
| `/evolve-audit` | Health-check artifacts (stale/weak/coverage) |
| `/evolve-strengthen` | Deepen weak agents/skills/rules |
| `/evolve-adapt` | Sync to stack changes (new modules/deps) |
| `/evolve-evaluate` | Track effectiveness in journal |
| `/evolve-score <type> [path]` | Score artifact against rubric |
| `/evolve-override "<reason>"` | Escape-hatch past BLOCK gate (logged) |

## Common workflows

### New feature
1. User: "add X"
2. Orchestrator → requirements-intake → brainstorming/plan → execute → review → quality-gate

### Bug fix
1. User: "fix Y"
2. Orchestrator → root-cause-debugger (systematic-debugging) → tdd → code-review

### Brand reset / new product UI
1. User: "let's design the brandbook"
2. Orchestrator → creative-director → brandbook skill → prototype-builder materializes
3. All subsequent UI work consults `prototypes/_brandbook/`

### Periodic health check (weekly)
1. User: `/evolve-audit`
2. Audit reports stale/weak/coverage gaps
3. User confirms strengthen/adapt actions

## Troubleshooting

**Q: `/evolve` doesn't appear**
- Check plugin is installed: `ls ~/.claude/plugins/cache/`
- Restart Claude Code

**Q: Agents don't load**
- Verify `agents/` dir structure matches `agents/<namespace>/<name>.md`
- Run plugin's `npm run validate:frontmatter` to check shape

**Q: Confidence-scoring blocks too often**
- Check the failed dimension; address gap (preferred)
- Or `/evolve-override "<reason ≥10 chars>"` (logged for audit)

**Q: I want a stack not in the catalog (e.g., Vue + Django)**
- Phase 5 atomic packs let `evolve:genesis` compose; fingerprint the stack and try
- If composition score <9, contribute a new full pack via `CONTRIBUTING.md`

## Where to next

- `CONTRIBUTING.md` — add agents/skills/rules
- `docs/skill-authoring.md` — write a new skill
- `docs/agent-authoring.md` — write a new agent
- `docs/rule-authoring.md` — write a new rule
- `docs/specs/2026-04-27-evolve-framework-design.md` — full architecture spec
