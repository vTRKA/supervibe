# Evolve

[English](README.md) · **Русский**

Плагин, который превращает Claude Code, Codex и Gemini в команду из 73 специалистов с графом кода, памятью проекта и confidence-гейтами. Работает локально. Без Docker.

**v1.7.0** · MIT · Windows / macOS / Linux

---

## Что вы получаете

| Возможность | Что это значит |
|-------------|----------------|
| 73 специалиста | Каждый минимум 250 строк: persona, decision tree, procedure, output contract, anti-patterns, verification |
| Граф кода (10 языков) | tree-sitter symbols и edges. Запросы `--callers X`, `--callees Y`, `--neighbors Z --depth 2` |
| Семантический поиск кода | multilingual-e5-small. Работает оффлайн. Понимает русский, английский и 100 других языков |
| Память проекта | Пять категорий с FTS5 и per-chunk embeddings. Решения переиспользуются, не выводятся заново |
| Confidence engine | Двенадцать рубрик. Гейт при score ≥9. Override-rate >5% триггерит audit |
| 20 правил-дисциплин | `use-codegraph-before-refactor`, `anti-hallucination`, `commit-attribution`, `no-half-finished` и другие |
| Авто-переиндексация | PostToolUse hook плюс mtime-scan на старте сессии. Daemon `memory:watch` опционален |
| Agent evolution loop | Telemetry, детекция underperformer'ов, `/supervibe-strengthen` с user-gate |
| Re-dispatch suggester | Когда Task завершается с confidence < 8.0, хук смотрит прошлые high-confidence runs на похожих задачах и печатает `[supervibe] dispatch-hint:` с до 3 альтернативных агентов — никогда не запускает автоматически |
| Live preview-server | `localhost:PORT` с SSE hot reload, idle-shutdown, лимитом серверов |
| Multi-CLI | Один установщик настраивает Claude Code, Codex и Gemini |

Поддерживается 24 стека: PHP (Laravel) · TypeScript / JavaScript (Next.js, Nuxt, Vue, Svelte, React, Express, NestJS) · Python (FastAPI, Django + DRF) · Ruby (Rails) · Java / Kotlin (Spring) · C# (ASP.NET) · Go · Mobile (Flutter, iOS, Android) · Browser Extensions (Chrome MV3 / WXT / Plasmo / Vite-CRXJS) · GraphQL · PostgreSQL · MySQL · MongoDB · Elasticsearch · Redis.

---

## Установка

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1 | iex
```

Установщик находит все поддерживаемые AI CLI на машине, клонирует плагин в `~/.claude/plugins/marketplaces/supervibe-marketplace/`, прогоняет 220 тестов и регистрирует плагин в каждой CLI. Повторный запуск той же команды обновляет до свежей версии.

Перезапустите AI CLI. На следующей сессии увидите:

```
[supervibe] welcome — plugin v1.7.0 initialized for this project
[supervibe] code RAG ✓ N files / M chunks (fresh)
[supervibe] code graph ✓ N symbols / M edges (X% resolved)
```

**Требования:** Node.js 22+ и Git. Git LFS опционален — модель эмбеддингов скачивается с HuggingFace при первом использовании. Без Docker, Python и нативной компиляции.

### Обновление

Три способа — выбирайте удобный:

**One-liner (тот же стиль что установка):**

macOS / Linux:
```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/update.sh | bash
```

Windows (PowerShell):
```powershell
irm https://raw.githubusercontent.com/vTRKA/supervibe/main/update.ps1 | iex
```

**Из сессии AI CLI:**
```
/supervibe-update
```

**Вручную из папки плагина:**
```bash
cd ~/.claude/plugins/marketplaces/supervibe-marketplace
npm run supervibe:upgrade
```

Все три делают одно и то же: отказываются при незакомиченных правках в чекауте плагина, затем `git pull --ff-only` + LFS pull + `npm install` + прогон всех тестов + обновление upstream-check кэша. После — перезапустите AI CLI.

---

## Workflows

Три именованных flow покрывают большую часть повседневной работы. У каждого есть явная slash-команда — не нужно подбирать «правильную» фразу чтобы AI вспомнил про skill.

### Брейншторм → План → Реализация

Для любой новой фичи, компонента или изменения поведения.

```
/supervibe-brainstorm платежная идемпотентность
  ↓ совместный диалог, kill criteria, decision matrix
  ↓ сохраняет docs/specs/2026-04-28-payment-idempotency-design.md
  ↓ score ≥9 по requirements rubric
/supervibe-plan docs/specs/2026-04-28-payment-idempotency-design.md
  ↓ фазированный TDD-план, parallelization batches, risk register
  ↓ сохраняет docs/plans/2026-04-28-payment-idempotency.md
  ↓ score ≥9 по plan rubric
  ↓ выбор: subagent-driven ИЛИ inline-выполнение
```

`/supervibe-brainstorm` можно пропустить если у вас уже есть утверждённый spec, `/supervibe-plan` — для тривиальных однострочных правок.

### Дизайн-pipeline → Live preview

Для любой визуальной поверхности — landing-страниц, in-product флоу, полной бренд-работы.

```
/supervibe-design лендинг в стиле Linear для покупателей dev-tools
  ↓ creative-director: бренд-направление (mood-board, токены, DO/DON'T)
  ↓ ux-ui-designer: state matrix, флоу, спецификация взаимодействия
  ↓ copywriter: каждая видимая строка отточена
  ↓ prototype-builder: 1:1 HTML/CSS в prototypes/<slug>/
  ↓ AUTO: supervibe:preview-server поднимает http://localhost:NNNN с hot reload
  ↓ ui-polish-reviewer + accessibility-reviewer параллельно
  ↓ score ≥9 по prototype rubric
```

Управлять запущенными серверами: `/supervibe-preview --list` / `--kill <port>`.

### Refactor with safety

Для любого rename / move / extract / delete на публичный символ.

```
ask: кто вызывает processPayment?
  ↓ AI запускает supervibe:code-search --callers "processPayment"
  ↓ показывает N вызывающих с file:line
если N > 10:
  ↓ правило use-codegraph-before-refactor эскалирует → architect-reviewer
  ↓ migration ADR
refactoring-specialist делает rename в одном PR
  ↓ verifies --callers "processPayment" возвращает 0
  ↓ score ≥9, ничего не упущено
```

У этого flow нет slash-команды — триггер это сам вопрос. Граф + дисциплинарные правила делают всё остальное.

---

## Команды

Слэш-команды (запускать внутри AI CLI сессии):

| Команда | Что делает |
|---------|-----------|
| `/evolve` | Авто-роутер: выбирает genesis, audit, strengthen, adapt, evaluate или update |
| `/supervibe-brainstorm <topic>` | Явный запуск брейншторма — создаёт утверждённую спецификацию |
| `/supervibe-plan [<spec-path>]` | Превращает утверждённую спецификацию в фазированный TDD-план |
| `/supervibe-design <brief>` | End-to-end дизайн-pipeline: бренд → spec → прототип → live preview |
| `/supervibe-genesis` | Первичный scaffold `.claude/` под ваш стек |
| `/supervibe-audit` | Health-check агентов, правил, памяти |
| `/supervibe-strengthen [agent_id]` | Усиление слабого агента. Без аргумента — auto-trigger из telemetry |
| `/supervibe-adapt` | Подтянуть upstream-улучшения в проект |
| `/supervibe-evaluate` | Прогон confidence на готовом артефакте |
| `/supervibe-preview` | Управление live preview серверами |
| `/supervibe-changelog` | Что изменилось с прошлой версии в этом проекте |
| `/supervibe-update` | Обновить сам плагин (git pull + lfs + install + тесты). Идемпотентно |
| `/supervibe-score` | Оценить артефакт по рубрике без сохранения |
| `/supervibe-override` | Залогировать override при приёме результата ниже гейта |

Shell-команды (запускать в папке плагина `~/.claude/plugins/marketplaces/supervibe-marketplace/`):

| Команда | Что делает |
|---------|-----------|
| `npm run supervibe:status` | Health-check всех индексов |
| `npm run supervibe:upgrade` | git pull, lfs pull, npm install, прогон всех тестов |
| `npm run supervibe:upgrade-check` | Вручную проверить upstream |
| `npm run code:index` | Полная переиндексация |
| `npm run code:search -- --query "..."` | Семантический поиск |
| `npm run code:search -- --callers "Symbol"` | Граф: кто вызывает символ |
| `npm run memory:watch` | Опциональный watcher-демон |
| `npm run check` | Все 196 тестов плюс валидация манифеста, frontmatter, footer'ов |

---

## Troubleshooting

**Баннера нет после установки.** Перезапустите установщик — он идемпотентен и обновит все три Claude config файла. Затем полностью перезапустите AI CLI (закройте десктоп-приложение, не просто откройте новый чат).

**Не виден в VS Code или Zed.** Эти IDE читают те же `~/.claude/` что и terminal. Если в terminal баннер есть — перезапустите IDE. Если всё равно ничего — перезапустите установщик.

**`Protobuf parsing failed`.** Файл модели остался LFS-pointer'ом. Запустите `git lfs pull` в `~/.claude/plugins/marketplaces/supervibe-marketplace`, либо просто запустите code search — модель скачается с HuggingFace (~118 МБ).

**SQLite ошибки.** Нужен Node.js 22+ для встроенного `node:sqlite`. На младших версиях семантическая память не работает.

**Грязный код-индекс.** mtime-scan на старте сессии ловит внешние правки. Для полного rebuild: `rm .claude/memory/code.db && npm run code:index` из папки проекта.

**Windows.** Если PowerShell ругается на Execution Policy: `Set-ExecutionPolicy -Scope Process Bypass`. Codex symlink требует Developer Mode — без него установщик копирует папку.

---

## Удаление

```bash
# macOS / Linux
rm -rf ~/.claude/plugins/marketplaces/supervibe-marketplace
rm -f  ~/.codex/plugins/evolve

node -e "
const fs=require('fs'),p=process.env.HOME+'/.claude/plugins/installed_plugins.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
delete d.plugins['evolve@evolve-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

node -e "
const fs=require('fs'),p=process.env.HOME+'/.claude/plugins/known_marketplaces.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
delete d['evolve-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

node -e "
const fs=require('fs'),p=process.env.HOME+'/.claude/settings.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
if(d.enabledPlugins) delete d.enabledPlugins['evolve@evolve-marketplace'];
if(d.extraKnownMarketplaces) delete d.extraKnownMarketplaces['evolve-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

sed -i.bak '/<!-- supervibe-plugin-include: do-not-edit -->/,/<!-- supervibe-plugin-include: do-not-edit -->/d' ~/.gemini/GEMINI.md 2>/dev/null || true
```

Windows-эквивалент: замените `rm -rf` на `Remove-Item -Recurse -Force` и запустите те же node `-e` блоки (пути через `$HOME` работают и в PowerShell).

Индексы проектов — это ваши данные, удаляйте только если уверены: `rm -rf .claude/memory/code.db .claude/memory/memory.db`.
