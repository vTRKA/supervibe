# Evolve Framework for Claude Code

> Превратите Claude Code в команду из 73 специалистов — со своим графом кода, памятью проекта и дисциплиной гейтов уверенности. Локально, без Docker, без сторонних серверов.

```
+-----------------------------------------------------------------+
|  73 агента  ·  45 skills  ·  19 правил  ·  12 рубрик уверенности |
|                                                                 |
|  Code Graph (10 языков)  ·  Semantic RAG (RU+EN+100 langs)       |
|  Project Memory  ·  Auto-reindex  ·  Live preview-server         |
|                                                                 |
|  Pure Node 22+. Никаких внешних сервисов. 178/178 тестов ✓        |
+-----------------------------------------------------------------+
```

**Версия:** v1.7.0 · **Лицензия:** MIT · **Платформы:** Windows / macOS / Linux

---

## TL;DR — поставить за 60 секунд

```bash
git clone https://github.com/vTRKA/evolve ~/dev/evolve && cd ~/dev/evolve
npm install && npm run check
ln -s ~/dev/evolve ~/.claude/plugins/cache/local/evolve/1.7.0  # Linux/macOS
```

Перезапустите Claude Code. Дальше для обновлений: `npm run evolve:upgrade` в той же папке. На старте сессии должны появиться 3 строки:

```
[evolve] code RAG ✓ N files / M chunks (fresh)
[evolve] code graph ✓ N symbols / M edges (X% resolved)
[evolve] MCPs available ✓ K (context7, playwright, ...)
```

Готово. Подробная инструкция для Windows и без LFS — [ниже](#установка-подробно).

---

## Зачем это вам

**Без Evolve** Claude Code — это умный универсал, который местами галлюцинирует, забывает прошлые решения, переименовывает функции не проверив всех вызывающих, и пишет код «в среднем хорошо».

**С Evolve** каждая задача проходит через специалиста под ваш стек, с явной процедурой, ссылками на ваш проект (file:line) и confidence-score ≥9 на выходе.

Конкретно:

| Запрос пользователя | Что меняется |
|---------------------|--------------|
| «Переименуй `processOrder` в `processCheckout`» | Сначала `--callers processOrder` → видим 14 вызывающих → правка в одном PR с проверкой 0 callers после; нет «забыл одно место». |
| «Добавь endpoint для оплаты» | Поиск памяти → находит прошлое решение по идемпотентности → laravel-developer пишет failing test → реализация → pest+phpstan → confidence 9.2 → запись в `solutions/`. |
| «Юзеры жалуются что иногда payment висит» | root-cause-debugger по systematic-debugging methodology → reproduce → narrow → root cause → incident memo с file:line. |
| «Сделай landing в духе Linear» | Скрап Linear через Firecrawl MCP → 3 направления brand → ux-ui-designer spec → live-preview на `localhost:3047` с hot-reload → a11y review. |

Подробные cookbook-сценарии — в разделе [«Cookbook»](#cookbook).

---

## Что внутри (ключевое)

| Возможность | Что это значит на практике |
|-------------|---------------------------|
| **73 агента-специалиста** | Каждый ≥250 строк: persona / decision tree / procedure / output contract / anti-patterns / verification. Не «помощник», а исполнитель с фиксированной методологией. |
| **Code Graph (10 языков)** | tree-sitter symbols + edges в SQLite. Запросы: `--callers X`, `--callees Y`, `--neighbors Z --depth 2`. Реальные ответы, не grep. |
| **Semantic Code RAG** | multilingual-e5-small (RU+EN+100 языков). «Где у нас обрабатывается аутентификация?» — найдёт по смыслу. Bundled оффлайн ~129 МБ. |
| **Project Memory** | 5 категорий (decisions / patterns / incidents / learnings / solutions) с FTS5 + per-chunk embeddings. Решения переиспользуются автоматически. |
| **Confidence Engine** | 12 рубрик с весами. Гейт ≥9 для блокирующего accept, ≥8 с override + логирование. Override-rate >5% триггерит audit. |
| **19 правил-дисциплин** | `use-codegraph-before-refactor` (severity: critical), `anti-hallucination`, `no-half-finished` и др. Не советы — формальные правила с проверкой. |
| **Auto-reindex без daemon'ов** | (1) PostToolUse hook на Write/Edit, (2) mtime-scan на SessionStart ловит внешние правки. Daemon `memory:watch` опционально для long-sessions. |
| **Agent evolution loop** | Каждая Task-задача логируется → underperformer detector → `/evolve-strengthen` с user-gate. Слабые агенты усиливаются с человеком в петле. |
| **Live preview-server** | `localhost:PORT` с hot-reload через SSE — для дизайна/мокапов. Pure node:http, idle-shutdown, max-limit. |
| **MCP integration** | Динамический discovery (context7, playwright, figma, firecrawl) с graceful fallback на WebFetch. |
| **Reference templates** | 6 готовых шаблонов в `docs/templates/` — PRD, ADR, plan, RFC, brainstorm, intake. |

---

## Установка (подробно)

### Требования

| Что | Зачем | Проверка |
|-----|-------|----------|
| **Node.js ≥22** | для `node:sqlite` (built-in, без native compile) | `node --version` |
| **Git** | склонировать | `git --version` |
| **Git LFS** *(рекомендуется)* | подтянуть embedding-модель + WASM грамматики | `git lfs version` |
| ~140 МБ диска | модель + грамматики + индексы вашего проекта | — |
| ОЗУ ≥4 ГБ | для embeddings | — |

> **Не нужно:** Docker, Python, C-компилятор, Emscripten, никаких external services. Всё локально.

Если нет Git LFS:
- macOS: `brew install git-lfs && git lfs install`
- Windows: уже встроен в Git for Windows ≥2.x — `git lfs install`
- Linux: см. [git-lfs.com](https://git-lfs.com)

Без LFS плагин всё равно работает — модель скачается с HuggingFace при первом использовании (~118 МБ, разово).

### Linux / macOS — три способа

**A. Symlink (для разработки и быстрых обновлений)** — рекомендую:

```bash
git clone https://github.com/vTRKA/evolve ~/dev/evolve
cd ~/dev/evolve
git lfs pull          # если LFS установлен
npm install
npm run check         # должно показать tests 178, pass 178

mkdir -p ~/.claude/plugins/cache/local/evolve
ln -s ~/dev/evolve ~/.claude/plugins/cache/local/evolve/1.7.0
```

**B. Копирование (если symlink-и неудобны):**

```bash
cp -r ~/dev/evolve ~/.claude/plugins/cache/local/evolve/1.7.0
```

**C. Marketplace** *(планируется после v1.7)*:

```
/plugin install evolve
```

### Windows

**PowerShell, от админа** (для symlink):

```powershell
git clone https://github.com/vTRKA/evolve D:\dev\evolve
Set-Location D:\dev\evolve
git lfs pull
npm install
npm run check

New-Item -ItemType Directory -Force "$HOME\.claude\plugins\cache\local\evolve" | Out-Null
cmd /c mklink /D "$HOME\.claude\plugins\cache\local\evolve\1.7.0" "D:\dev\evolve"
```

**Без админа** (копирование):

```powershell
xcopy /E /I "D:\dev\evolve" "$HOME\.claude\plugins\cache\local\evolve\1.7.0"
```

### Проверка

Перезапустите Claude Code. Откройте любой проект. В начале сессии:

```
[evolve] code RAG ✓ 35 files / 221 chunks (fresh)
[evolve] code graph ✓ 81 symbols / 426 edges (21% resolved)
[evolve] MCPs available ✓ 4 (context7, playwright, mcp-server-figma, mcp-server-firecrawl)
```

Если строки появились — плагин работает. Если нет — раздел [Troubleshooting](#troubleshooting).

---

## Первая сессия — 3 минуты

### 1. Статус индексов в любой момент

```bash
npm run evolve:status
```

Покажет: code RAG, code graph, memory, watcher heartbeat, preview servers, MCPs, agent telemetry.

### 2. Genesis для нового проекта

В Claude Code:

```
/evolve-genesis
```

Определит ваш стек (по `package.json` / `composer.json` / `go.mod` / etc), задаст пару уточняющих вопросов и создаст `.claude/agents/` + `.claude/rules/` + `.claude/memory/` + `CLAUDE.md` под ваш проект.

### 3. Спросите Claude что-то с использованием графа

```
Кто вызывает функцию processPayment?
```

Claude сам вызовет `evolve:code-search --callers` и покажет каждого caller'а с file:line.

### 4. Авто-переиндексация — уже работает

Ничего запускать не надо. Покрытие:

| Источник правки | Как ловится |
|-----------------|-------------|
| Claude правит файл через Write/Edit | PostToolUse hook → reindex за ~50–500ms |
| Claude пишет в `.claude/memory/...md` | Тот же hook → memory FTS обновляется |
| Внешний редактор / `git pull` / CI | mtime-scan на SessionStart → реиндексирует / убирает удалённые |
| Real-time во время длинной сессии с правками в IDE параллельно | Опционально: `npm run memory:watch` (chokidar daemon) |

Контроль через env:
- `EVOLVE_HOOK_NO_INDEX=1` — выключить pseudo-watcher
- `EVOLVE_HOOK_EMBED=1` — включить embeddings в hook (медленнее)

---

## Поддерживаемые стеки

**23 стека из коробки** (плюс генерик-агенты для всего остального):

- **PHP**: Laravel
- **TypeScript/JS**: Next.js, Nuxt, Vue, Svelte, React (Vite), Express, NestJS
- **Python**: FastAPI, Django (+ DRF)
- **Ruby**: Rails
- **Java/Kotlin**: Spring
- **C#/.NET**: ASP.NET
- **Go**: standalone services
- **Mobile**: Flutter, iOS (Swift), Android (Kotlin)
- **API**: GraphQL schema
- **Storage**: PostgreSQL, MySQL, MongoDB, Elasticsearch, Redis

Code Graph покрывает **10 языков**: TypeScript, JavaScript, TSX, JSX, Python, PHP, Go, Rust, Java, Ruby. Vue/Svelte — whole-file chunking (без graph).

---

## Чем Evolve отличается от superpowers

(superpowers — главный аналог в экосистеме Claude Code. Сравнение фактическое.)

| Возможность | Evolve | superpowers |
|-------------|--------|-------------|
| Code Graph (callers / callees / neighborhood, 10 языков) | ✅ | ❌ |
| Semantic Code RAG (multilingual e5, оффлайн ~129 МБ) | ✅ | ❌ |
| Project Memory (5 категорий + per-chunk embeddings) | ✅ | ⚠️ проще |
| Specialist-агентов | ✅ 73, ≥250 строк, фиксированная структура | ⚠️ меньше, без жёсткой структуры |
| Stack-aware scaffolding | ✅ 23 стека | ❌ |
| Confidence engine (рубрики + override-rate tracking) | ✅ 12 рубрик, гейт ≥9 | ⚠️ мягче |
| Live preview-server (SSE hot-reload) | ✅ pure-Node | ❌ |
| Auto-reindex без daemon'а | ✅ PostToolUse + mtime-scan | ❌ |
| Agent evolution loop (telemetry → underperformer detect → strengthen) | ✅ замкнутая петля | ❌ |
| Bundle size | ~140 МБ (модель + грамматики) | <10 МБ |

**Можно использовать оба одновременно.** Skills из обоих coexist в одном `.claude-plugin/`. Evolve использует префикс `evolve:` — конфликтов имён нет.

**Когда выбирать Evolve:** жёсткие гейты, большой кодбейс с рефакторами, работа на русском или другом неанглийском, live-preview для дизайна, специфичный стек, любите дисциплину.

**Когда superpowers:** меньший bundle, английский текст, минимум инфраструктуры, не нужны рубрики и Code Graph.

---

## Cookbook

### 1. Новая фича в Laravel

```
> Добавь endpoint для создания заказа с idempotency

  /evolve auto-detects stack=laravel
  → evolve:project-memory   (ищет past idempotency решения)
  → evolve:code-search      ("idempotency redis" → находит pattern)
  → laravel-developer       (с pre-task graph check)
  → failing Pest test → FormRequest + Service + idempotent Job
  → pest + pint + phpstan
  → evolve:code-review (8-dim) → confidence 9.2
  → evolve:add-memory → solutions/idempotent-order.md
```

### 2. Refactor с blast-radius check

```
> Переименуй processOrder → processCheckout

  evolve:code-search --callers "processOrder" → 14 callers
  → rule use-codegraph-before-refactor триггерит escalate (callers > 10)
  → architect-reviewer строит migration ADR
  → refactoring-specialist делает renames в одном PR
  → --callers "processOrder" → 0  (validation)
  → output: Case A — 14 callers updated
```

### 3. Дебаг продакшен-инцидента

```
> Юзеры жалуются что иногда payment висит

  root-cause-debugger (через systematic-debugging methodology)
  → evolve:project-memory --tags incident,payment
  → evolve:code-search --query "payment timeout retry"
  → reproduce locally → narrow → root cause
  → incident memo с file:line + steps + fix proposal
  → evolve:add-memory → incidents/
```

### 4. Brand redesign + landing mockup

```
> Сделай новый landing в духе Linear

  competitive-design-researcher (Firecrawl MCP) скрапит Linear
  → creative-director: 3 направления + mood boards
  → ux-ui-designer: spec со state matrix
  → evolve:landing-page → HTML/CSS в mockups/
  → evolve:preview-server → http://localhost:3047 (hot-reload)
  → (опц.) Playwright MCP screenshot
  → ui-polish-reviewer (8-dim) → accessibility-reviewer (WCAG)
```

### 5. Database migration safety

```
> Добавь колонку email_verified_at

  db-reviewer
  → evolve:code-search --callers "User"  (find all queries)
  → 3-deploy column add (NOT VALID + VALIDATE)
  → postgres-architect: миграцию с CONCURRENTLY
  → lock estimate < 500ms ✓; replication impact < 2s ✓
  → plan включает rollback (DROP CONCURRENTLY)
  → evolve:add-memory → patterns/safe-column-add
```

---

## Команды

### Слэш-команды в Claude Code

| Команда | Назначение |
|---------|-----------|
| `/evolve` | Авто-роутер: genesis / audit / strengthen / adapt / evaluate |
| `/evolve-genesis` | Первичный scaffolding `.claude/` под ваш стек |
| `/evolve-audit` | Health-check агентов / правил / памяти |
| `/evolve-strengthen [agent_id]` | Усиление слабых агентов; без аргумента — auto-trigger из telemetry |
| `/evolve-adapt` | Адаптация под изменения в коде |
| `/evolve-evaluate` | Прогон confidence на готовом артефакте |
| `/evolve-score` | Применить рубрику вручную |
| `/evolve-override` | Залогировать override |
| `/evolve-preview` | Управление preview-серверами |
| `/evolve-changelog` | Что изменилось с прошлой версии плагина для этого проекта |

### NPM скрипты (в plugin-dir)

| Команда | Назначение |
|---------|-----------|
| `npm run evolve:status` | Полный health-check |
| `npm run evolve:upgrade` | Обновить плагин (git pull + lfs + install + check) |
| `npm run evolve:upgrade-check` | Принудительно проверить upstream (обычно работает в фоне) |
| `npm run code:index` | Полная переиндексация кода |
| `npm run code:search -- --query "..."` | Семантический поиск |
| `npm run code:search -- --callers "Symbol"` | Граф: кто вызывает |
| `npm run memory:watch` | Опциональный watcher daemon |
| `npm run check` | Все 178 тестов + валидация манифеста / frontmatter / footers |
| `npm run evolve:preview -- --root <dir>` | Поднять preview-сервер |

---

## Troubleshooting

### `/evolve` не распознаётся

1. Путь: `ls ~/.claude/plugins/cache/local/evolve/1.7.0/.claude-plugin/plugin.json`
2. Манифест: `cd ~/dev/evolve && npm run validate:plugin-json`
3. **Перезапустите Claude Code** — плагины подгружаются на старте сессии
4. `~/.claude/plugins/installed_plugins.json` должна содержать запись `evolve`

### Embeddings не работают (Protobuf parsing failed)

Это значит `model_quantized.onnx` оказался 134-байтным LFS pointer'ом. Решение:

```bash
cd ~/dev/evolve
git lfs pull
```

Или: запустите без `--no-embeddings` — плагин автоматически скачает модель с HF (~118 МБ, разово).

### SQLite ошибки

Нужен Node 22+ (built-in `node:sqlite`). На Node <22 семантическая память не работает; используйте версию плагина ≤1.1.x как fallback.

### Грязный код-индекс после внешних изменений

Обычно ловится mtime-scan на SessionStart автоматически. Если что-то пошло не так — полный rebuild:

```bash
rm .claude/memory/code.db
npm run code:index
```

~30 секунд на 1000-файловом проекте.

### Большой монорепо (>10к файлов)

Lazy mode индексирует только изменённое:

```bash
npm run code:index -- --since=HEAD~100
```

### Windows

- Forward slashes в скриптах (Node нормализует) или экранируйте кавычками пути с пробелами
- Husky хуки могут попросить `git config core.autocrlf input`
- Для symlink в `.claude/plugins/cache/local/...` нужны admin-права (или используйте копирование)

### Husky пишет «deprecated»

Husky 9+ депрекейтнул две первые строки в hook-файлах. Проверьте `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push` — там должны быть только команды, без shebang.

---

## Обновление

### Авто-проверка на старте сессии

При каждом старте Claude Code SessionStart hook читает кэш `.claude-plugin/.upgrade-check.json` и, если плагин отстал от upstream'а, печатает баннер:

```
[evolve] ⬆ upstream has 7 new commit(s) (latest tag: v1.8.0) — run `npm run evolve:upgrade`
```

Кэш обновляется в фоне (детач-процесс через `git fetch`) с rate-limit раз в 24 часа — никогда не блокирует старт сессии. Первая сессия после установки баннера не покажет (кэш пуст); следующая сессия покажет результат фонового запроса.

Если хотите принудительно проверить прямо сейчас:

```bash
npm run evolve:upgrade-check
```

Если оффлайн / нет remote — баннер не показывается, ошибка тихо пишется в кэш.

### Применить обновление

После выхода новой версии плагина:

### Если установлен через symlink (Способ A)

```bash
cd ~/dev/evolve            # или D:\dev\evolve на Windows
npm run evolve:upgrade
```

Скрипт сделает:
1. `git fetch + git pull --ff-only` (откажется если есть локальные правки — сначала закоммитьте/застэшите)
2. `git lfs pull` (модель + грамматики, если LFS установлен)
3. `npm install` (пин-версии из lockfile)
4. `npm run check` (172 теста должны остаться зелёными)
5. Покажет diff `vX.Y.Z → vA.B.C` и попросит перезапустить Claude Code

После рестарта Claude Code в каждом проекте на старте сессии увидите:

```
[evolve] ⬆ plugin upgraded 1.7.0 → 1.8.0. See CHANGELOG.md or run /evolve-changelog for what's new.
```

### Если установлен через копирование (Способ B)

Перетащите свежий чекаут поверх старого:

```bash
git pull               # в папке исходника
cd ~/dev/evolve && npm install && npm run check

# Linux/macOS
rm -rf ~/.claude/plugins/cache/local/evolve/1.7.0
cp -r ~/dev/evolve ~/.claude/plugins/cache/local/evolve/1.8.0

# Windows
Remove-Item -Recurse -Force "$HOME\.claude\plugins\cache\local\evolve\1.7.0"
xcopy /E /I "D:\dev\evolve" "$HOME\.claude\plugins\cache\local\evolve\1.8.0"
```

> Папка содержит версию (`1.7.0` / `1.8.0`) — Claude Code загружает плагин по последней папке, поэтому держать одновременно две версии безопасно для миграции.

### Marketplace (когда опубликовано)

```
/plugin update evolve
```

### Что обновляется автоматически, а что нет

| Что | Обновляется при upgrade плагина |
|-----|--------------------------------|
| Глобальные агенты в `agents/`, skills, rules, рубрики | ✅ да |
| WASM-грамматики, embedding-модель | ✅ да (через `git lfs pull`) |
| Схема `code.db` / `memory.db` | ✅ авто-миграция через `CREATE TABLE IF NOT EXISTS` при первой сессии после upgrade. Полностью пере-индексировать не нужно. |
| Ваши проектные `.claude/agents/`, `.claude/rules/` (если делали `/evolve-genesis`) | ❌ остаются как есть — это ВАШИ кастомизации |
| `.claude/memory/` записи (decisions / patterns / etc) | ❌ это ваши данные |

Если хотите подтянуть свежие upstream-агенты в проект — используйте `/evolve-adapt` (он сравнит ваши проектные оверрайды с источником и покажет diff с user-gate).

### Что делать если что-то сломалось после upgrade

1. Проверьте changelog: `/evolve-changelog` или `cat ~/dev/evolve/CHANGELOG.md`
2. Откатиться на предыдущую версию:
   ```bash
   cd ~/dev/evolve
   git checkout v1.7.0   # или нужный тег
   npm install && npm run check
   ```
3. Сообщить о баге: GitHub Issues

---

## Удаление

```bash
# Linux/macOS
rm -rf ~/.claude/plugins/cache/local/evolve

# Windows PowerShell
Remove-Item -Recurse -Force "$HOME\.claude\plugins\cache\local\evolve"

# Опционально: индексы в проекте
rm -rf .claude/memory/code.db .claude/memory/memory.db
```

---

## Документация

- **[`docs/getting-started.md`](docs/getting-started.md)** — расширенный getting-started
- **[`CLAUDE.md`](CLAUDE.md)** — system context для агентов; читайте чтобы понять как плагин видит ваш проект
- **[`CHANGELOG.md`](CHANGELOG.md)** — история версий
- **`docs/specs/`** — design-документы каждой фазы
- **`docs/plans/`** — implementation-планы
- **`docs/templates/`** — 6 готовых шаблонов (PRD / ADR / plan / RFC / brainstorm / intake)
- **`agents/`** — 73 агента; `agents/_core/code-reviewer.md` — canonical reference
- **`skills/`** — 45 process skills
- **`rules/`** — 19 проектных правил
- **`confidence-rubrics/`** — 12 рубрик

---

## Contributing

См. `CONTRIBUTING.md`. Самый лёгкий вход:

1. Откройте `agents/_core/code-reviewer.md` — canonical reference
2. Найдите более компактного агента (например `agents/_design/copywriter.md`) и подумайте что бы вы добавили
3. PR с улучшением + объяснением WHY в commit message

---

## Благодарности

- **tree-sitter** — парсинг 10 языков через WASM, без native compilation
- **HuggingFace transformers.js** — multilingual embedding model в pure JS
- **Aider's repo-map** (Paul Gauthier) — концептуальный донор для code graph
- **Claude Code team** — за расширяемую plugin-архитектуру

---

**License:** MIT — см. [`LICENSE`](LICENSE).
