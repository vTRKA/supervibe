# Evolve Framework for Claude Code

> **Самоэволюционирующий Claude Code плагин**: ваш проект получает 67+ специалистов-агентов с фиксированной методологией, семантический поиск по коду, граф зависимостей и дисциплину гейтов уверенности — всё работает локально, без Docker, без сторонних серверов.

```
+------------------------------------------------------------+
|  Claude Code  +  Evolve  =  46 экспертов на вашем проекте  |
|                                                            |
|  - Автоматически определяет ваш стек (Laravel/Next/etc)    |
|  - Подключает только нужных специалистов                   |
|  - Не даёт галлюцинировать (граф вызовов + RAG)            |
|  - Блокирует мерж пока confidence < 9/10                   |
|  - Запоминает решения и переиспользует                     |
+------------------------------------------------------------+
```

**Текущая версия:** v1.6.0 — стабильная. **103/103 теста зелёные.** Требуется Node 22+.

---

## Что это вообще такое

Представьте что в вашем Claude Code появилась команда специалистов:

- **Архитектор** который проверяет дизайн перед кодом
- **Refactoring-специалист** который не даёт переименовать функцию пока не найдёт всех вызывающих
- **Security-аудитор** который ищет инъекции и небезопасные конфиги
- **Стек-разработчики** для Laravel / Next.js / FastAPI / React (с реальным опытом каждого)
- **Code-reviewer** который не пропустит мерж без citations и тестов

Каждый агент — это **специалист со строгой структурой**: с Decision tree, Procedure, Output contract, Anti-patterns. Всего 46 агентов.

Плюс под капотом:
- **Семантический поиск по коду** (multilingual, RU + EN + 100 языков)
- **Граф вызовов** (TypeScript, Python, Go, Rust, Java, PHP, Ruby) — отвечает «кто вызывает X», «что сломается если переименовать Y»
- **Память проекта** — решения, паттерны, инциденты, learnings
- **Confidence engine** с 11 рубриками — каждая работа оценена 0–10, гейт блокирует <9
- **Auto-startup** — при старте сессии видите статус: индекс свежий, граф работает, X файлов, Y символов

---

## Установка (3 способа)

### Способ 1 — через Claude Code marketplace (когда опубликовано)

Самый простой способ для конечных пользователей.

```
# В Claude Code, открой command palette и набери:
/plugin install evolve
```

Готово. Плагин подхватится при следующем рестарте Claude Code.

> **Когда?** Marketplace-публикация запланирована после v1.7. До этого используйте Способ 2 или 3.

### Способ 2 — локальная установка из этого репозитория (РАБОТАЕТ ПРЯМО СЕЙЧАС)

Этот способ подходит когда плагин ещё не на маркетплейсе или хотите кастомную версию.

#### 2.1. Подготовка

Убедитесь что установлено:
- **Node.js 22+** — проверка: `node --version`
- **Git** — проверка: `git --version`
- **Git LFS** *(рекомендуется, не обязательно)* — проверка: `git lfs version`. Без LFS плагин всё равно работает: модель скачается с HuggingFace при первом использовании (~118 МБ, разово).

Установка Git LFS если нужно:
- **macOS**: `brew install git-lfs && git lfs install`
- **Windows**: уже встроен в Git for Windows ≥2.x — выполните `git lfs install`
- **Linux**: см. [git-lfs.com](https://git-lfs.com)

#### 2.2. Клонируйте репозиторий

```bash
# Клонируем (с LFS — модель и грамматики подтянутся автоматически)
git clone https://github.com/vTRKA/evolve ~/dev/evolve
cd ~/dev/evolve

# Если клонировали без LFS — подтянуть бинарники сейчас:
git lfs pull
```

#### 2.3. Установите зависимости и проверьте сборку

```bash
npm install
npm run check
```

Должно вывести: `tests 103, pass 103, fail 0`. Если что-то красное — см. раздел Troubleshooting ниже.

#### 2.4. Подключите плагин к Claude Code

**Linux / macOS:**

```bash
# Скопировать (или симлинк для удобства dev-обновлений)
mkdir -p ~/.claude/plugins/cache/local
ln -s ~/dev/evolve ~/.claude/plugins/cache/local/evolve/1.6.0
```

**Windows (PowerShell, от админа):**

```powershell
mkdir $HOME\.claude\plugins\cache\local\evolve\1.6.0 -Force
mklink /D "$HOME\.claude\plugins\cache\local\evolve\1.6.0" "D:\путь\к\evolve"
```

**Windows (без админа — копирование):**

```powershell
xcopy /E /I "D:\путь\к\evolve" "$HOME\.claude\plugins\cache\local\evolve\1.6.0"
```

#### 2.5. Перезапустите Claude Code

Плагин подгружается на старте сессии. Откройте Claude Code в любом проекте — должны появиться 3 строки в начале сессии:

```
[evolve] code RAG ✓ 35 files / 221 chunks (fresh)
[evolve] code graph ✓ 81 symbols / 426 edges (21% resolved)
```

Если видите эти строки — плагин работает.

### Способ 3 — режим разработчика (если хотите вносить правки в плагин)

Делаете симлинк (Способ 2.4 с `ln -s` / `mklink /D`), правите файлы в исходнике, изменения подхватываются на следующей сессии Claude Code. Никаких пере-`npm install` не нужно.

---

## Первые шаги после установки

Откройте Claude Code в **новом** или **существующем** проекте и попробуйте:

### 1. Проверить статус индексов в любой момент

```bash
npm run evolve:status
```

Вывод:
```
✓ Code RAG: 35 files, 221 chunks
✓ Code Graph: 81 symbols, 426 edges (21% cross-resolved)
✓ Memory: 14 entries, 22 tags
✓ File watcher: running (heartbeat 3s ago)
```

### 2. Запустить ваш первый scaffolding (создать `.claude/` структуру)

В Claude Code:

```
/evolve-genesis
```

Команда определит ваш стек (Laravel? Next.js? Python?), задаст пару уточняющих вопросов и создаст:
- `.claude/agents/` — специалисты под ваш стек
- `.claude/rules/` — правила вашего проекта
- `.claude/memory/` — структура памяти
- `CLAUDE.md` — system-prompt для будущих сессий

### 3. Задать вопрос с использованием графа

```
Кто вызывает функцию processPayment?
```

Claude автоматически вызовет `evolve:code-search` с graph-mode и покажет каждого caller'а с file:line.

### 4. Запустить watcher для автоматической переиндексации

В отдельном терминале:

```bash
npm run memory:watch
```

Теперь при каждом сохранении файла индекс обновляется автоматически (~50ms на файл).

---

## Что вы получаете

| Возможность | Что значит на практике |
|-------------|------------------------|
| **67+ агентов-специалистов** | Каждый — 250+ строк промпта с persona / decision tree / procedure / output contract |
| **Семантический Code RAG** | «Где у нас обрабатывается аутентификация?» — найдёт по смыслу, не по grep |
| **Code Graph (9 языков)** | «Кто вызывает X?», «Что сломается если переименую Y?» — реальные ответы из tree-sitter графа |
| **Project Memory** | Решения / паттерны / инциденты / learnings — поиск + автообновление через watcher |
| **Confidence Engine** | 11 рубрик. Гейт блокирует мерж пока score < 9. Override логируется. |
| **15 правил-дисциплин** | Например `use-codegraph-before-refactor` (severity: critical) — нельзя переименовать без `--callers` сначала |
| **MCP integration** | Реальные tools wired для context7, playwright, figma, firecrawl |
| **Auto-startup banner** | При старте сессии видите состояние индексов — никаких догадок |
| **WAL mode SQLite** | Concurrent watcher + manual reindex без deadlock |
| **Live mockup preview** | `evolve:preview-server` запускает `http://localhost:PORT` для HTML-мокапов с auto-reload; Playwright скриншоты опционально |
| **Reference templates** | 6 готовых шаблонов в `docs/templates/` — PRD, ADR, plan, RFC, brainstorm, intake |
| **Agent evolution loop** | Каждый Task tool dispatch логируется → агрегация в frontmatter `effectiveness:` → underperformer detector → `/evolve-strengthen` с user-gate. Без надзора ничего не меняется. |

---

## Чем Evolve отличается от superpowers

(superpowers — главный аналог; обе расширяют Claude Code через `.claude-plugin`. Сравнение фактическое, без оценочных суждений.)

**Только различающиеся возможности — то что реально влияет на выбор:**

| Возможность | Evolve | superpowers |
|-------------|--------|-------------|
| Граф вызовов (callers / callees / neighborhood) | ✅ tree-sitter, 9 языков, через SQLite | ❌ нет |
| Семантический Code RAG (multilingual e5, RU+EN+100 langs) | ✅ оффлайн, ~129MB bundled | ❌ нет |
| Память проекта (5 категорий с chokidar watcher + per-chunk embeddings) | ✅ полноценная | ⚠️ проще |
| Specialist-агенты с фиксированной структурой ≥250 строк | ✅ 67+ агентов | ⚠️ несколько ролей, без жёсткой структуры |
| Stack-aware scaffolding | ✅ 16+ стеков (Laravel / Next / Vue / Nuxt / Svelte / Django / Rails / Spring / .NET / Go / NestJS / Mobile / etc) | ❌ |
| Confidence engine (рубрики с весами + override-rate tracking) | ✅ 12 рубрик, гейт ≥9/10 | ⚠️ мягче |
| Live preview-server (localhost + hot-reload + idle-shutdown + max-limit) | ✅ pure-Node SSE | ❌ |
| Auto-startup banner (статус индексов на старте сессии) | ✅ | ❌ |
| Dynamic MCP discovery (агенты адаптируются к доступным MCP) | ✅ registry-driven с fallback | ❌ |
| Reference templates (PRD / ADR / plan / RFC / brainstorm / intake) | ✅ 6 готовых | ⚠️ частично |
| Agent evolution loop (invocation log → effectiveness tracker → underperformer detector → auto-strengthen) | ✅ полная петля | ❌ |
| Bundle size | ~140 МБ (модель + грамматики через LFS) | <10 МБ |

### Когда выбирать Evolve вместо superpowers

- Хотите **жёсткие гейты** (confidence-engine блокирует мерж пока score < 9), а не «мягкие» рекомендации
- Нужен **Code Graph** для рефакторов (`--callers`, `--neighbors`) — superpowers не имеет
- Нужен **семантический поиск по коду** (multilingual) — superpowers не имеет
- Работа на **русском / неанглийском** — Evolve embedding model тренировалась на 100 языках
- Делаете много **дизайна / мокапов** — preview-server из коробки
- Работаете со специфичным **стеком** (Laravel / Django / Rails / Spring / etc) — есть подготовленные специалисты
- Хотите **дисциплину** (anti-hallucination, no-half-finished, use-codegraph-before-refactor — формальные правила с severity)

### Когда выбирать superpowers вместо Evolve

- Меньший bundle size (без bundled-models)
- Не нужен Code Graph / семантический Code RAG (агенты пишут только английский text-only)
- Меньше specialist-агентов — проще onboarding
- Не нужны рубрики и confidence-гейты — хотите свободный flow
- Хотите минимальную инфраструктуру — без SQLite / WAL / SSE / chokidar / tree-sitter

### Можно использовать оба одновременно?

Да. Skills из superpowers и Evolve могут coexist в одном `.claude-plugin/`. Evolve преднамеренно использует те же conventions (markdown frontmatter, slash commands, hooks). Конфликты на уровне skill names не возникают — Evolve использует префикс `evolve:` namespace.

---

## Поддерживаемые стеки (сейчас)

- **Laravel** (PHP) — laravel-architect, laravel-developer, eloquent-modeler, queue-worker-architect
- **Next.js** (TypeScript) — nextjs-architect, nextjs-developer, server-actions-specialist
- **FastAPI** (Python) — fastapi-architect, fastapi-developer
- **React standalone** (Vite) — react-implementer
- **Postgres** — postgres-architect (миграции, индексы, репликация)
- **Redis** — redis-architect (Sentinel/Cluster decision tree)

Языки для Code Graph: TypeScript, JavaScript, TSX, JSX, Python, PHP, Go, Rust, Java, Ruby. Vue/Svelte — в v1.7.

---

## Системные требования

| Компонент | Версия | Проверка |
|-----------|--------|----------|
| Node.js | ≥22 (для `node:sqlite`) | `node --version` |
| Git | любой современный | `git --version` |
| Git LFS | рекомендуется | `git lfs version` |
| Свободного места | ~140 МБ | модель 113 МБ + грамматики 10 МБ + индексы вашего проекта |
| ОЗУ | ≥4 ГБ | для embeddings |
| ОС | Windows / macOS / Linux | всё работает на pure-JS |

**Не нужно:** Docker, Python, C компилятор, эмскриптен, какие-либо внешние сервисы. Всё локально, всё in-process.

---

## Cookbook — 5 готовых сценариев

### Сценарий 1: Новая фича в Laravel-проекте

```
Пользователь: "Добавь endpoint для создания заказа с idempotency"

# Под капотом происходит:
1. /evolve auto-detects stack=laravel
2. Invokes evolve:project-memory — ищет past idempotency решения
3. Invokes evolve:code-search --query "idempotency redis" — находит pattern
4. Invokes laravel-developer agent с pre-task graph check
5. agent пишет failing Pest test
6. Implements: FormRequest + Service + idempotent Job
7. Запускает pest + pint + phpstan
8. evolve:code-review проверяет 8-dim
9. evolve:confidence-scoring → score=9.2
10. evolve:add-memory сохраняет в .claude/memory/solutions/
```

### Сценарий 2: Refactor с blast-radius check

```
Пользователь: "Переименуй processOrder → processCheckout"

# Под капотом:
1. evolve:code-search --callers "processOrder" → 14 callers
2. Rule use-codegraph-before-refactor триггерит:
   - Если callers > 10 → escalate to architect-reviewer
3. architect-reviewer строит migration ADR
4. refactoring-specialist делает renames в одном PR
5. evolve:code-search --callers "processOrder" → 0 (validation)
6. Output contract: Case A — 14 callers updated в этом diff
```

### Сценарий 3: Дебаг продакшен-инцидента

```
Пользователь: "Юзеры жалуются что иногда payment висит"

# Под капотом:
1. root-cause-debugger agent (использует evolve:systematic-debugging)
2. Invokes evolve:project-memory --tags incident,payment
3. Invokes evolve:code-search --query "payment timeout retry"
4. Reproduce locally → narrow → root cause
5. Output: incident memo с file:line + reproduction steps + fix proposal
6. evolve:add-memory сохраняет в incidents/
```

### Сценарий 4: Brand redesign + landing page mockup

```
Пользователь: "Сделай новый landing page в духе Linear"

# Под капотом:
1. competitive-design-researcher (через Firecrawl MCP) скрапит Linear
2. creative-director предлагает 3 направления + mood boards
3. ux-ui-designer строит spec со state matrix
4. evolve:landing-page skill генерирует HTML/CSS в mockups/
5. evolve:preview-server поднимает http://localhost:3047 ← preview
6. (опционально) Playwright MCP делает screenshot
7. ui-polish-reviewer 8-dim review
8. accessibility-reviewer WCAG check
```

### Сценарий 5: Database migration safety

```
Пользователь: "Добавь колонку email_verified_at"

# Под капотом:
1. db-reviewer agent
2. Invokes evolve:code-search --callers "User" — найти все queries
3. Migration-safety pattern: 3-deploy column add (NOT VALID + VALIDATE)
4. postgres-architect генерирует миграцию с CONCURRENTLY
5. Lock duration estimate < 500ms ✓
6. Replication impact: < 2s ✓
7. Plan включает rollback step (DROP CONCURRENTLY если что)
8. evolve:add-memory → patterns/safe-column-add
```

---

## Troubleshooting (типичные проблемы)

### `/evolve` не распознаётся в Claude Code

1. Проверьте что плагин в правильном месте: `ls ~/.claude/plugins/cache/local/evolve/1.6.0/.claude-plugin/plugin.json`
2. Запустите валидацию манифеста: `cd ~/dev/evolve && npm run validate:plugin-json`
3. Перезапустите Claude Code — плагины подгружаются только на старте сессии
4. Проверьте `~/.claude/plugins/installed_plugins.json` — должна быть запись `evolve`

### Агенты не загружаются

- Откройте `.claude-plugin/plugin.json` и проверьте что массив `agents:[]` содержит реальные пути
- Каждый путь должен начинаться с `./agents/` и заканчиваться `.md`
- `npm run validate:frontmatter` — должно показать `OK` для всех 46 агентов

### Embeddings не работают (Protobuf parsing failed)

Это значит модель `model_quantized.onnx` оказалась 134-байтным LFS pointer'ом вместо 113 МБ файла. Это случается при клоне без Git LFS.

```bash
cd ~/dev/evolve
git lfs pull
# или установите LFS и повторите клон
```

Альтернатива: запустите без `--no-embeddings` — плагин автоматически скачает модель с HuggingFace при первом вызове (~118 МБ, разово).

### SQLite ошибки

- Нужен Node 22+ (built-in `node:sqlite`). Проверьте: `node --version`
- На Node <22 семантическая память не работает; используйте плагин-версию ≤1.1.x как fallback

### Код-индекс грязный после внешних изменений

```bash
rm .claude/memory/code.db
npm run code:index
```

Полный rebuild занимает ~30 секунд на 1000-файловом проекте.

### Большой монорепо (>10к файлов)

Используйте lazy mode — индексирует только изменённое:

```bash
npm run code:index -- --since=HEAD~100
```

### Husky пишет «deprecated»

Husky 9+ депрекейтнул две первые строки в hook-файлах. Проверьте `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push` — там должны быть только команды без shebang.

### Windows path issues

- Используйте forward slashes в скриптах (Node нормализует)
- Избегайте пробелов в путях установки (или экранируйте кавычками)
- Husky хуки могут попросить `git config core.autocrlf input`

---

## Команды плагина

После установки в Claude Code доступны:

| Команда | Что делает |
|---------|-----------|
| `/evolve` | Авто-определяет какую фазу запустить (genesis / audit / strengthen / adapt / evaluate) |
| `/evolve-genesis` | Первичный scaffolding `.claude/` с агентами под ваш стек |
| `/evolve-audit` | Проверка свежести агентов / правил / памяти |
| `/evolve-strengthen` | Усиление слабых агентов до спека |
| `/evolve-adapt` | Адаптация под изменения в коде |
| `/evolve-evaluate` | Прогон confidence на готовом результате |
| `/evolve-score` | Применить рубрику к артефакту вручную |
| `/evolve-override` | Залогировать override со стороны человека |
| `/evolve-preview` | Управление preview серверами (start / list / kill) |

NPM скрипты (запускать в plugin-dir):

| Команда | Что делает |
|---------|-----------|
| `npm run evolve:status` | Полный health-check индексов |
| `npm run code:index` | Полная переиндексация кода |
| `npm run code:search -- --query "..."` | Семантический поиск по коду |
| `npm run code:search -- --callers "Symbol"` | Кто вызывает символ (граф) |
| `npm run memory:watch` | Запустить файл-watcher (auto-reindex) |
| `npm run check` | Прогнать все 103 теста + валидацию |
| `npm run evolve:preview -- --root <dir>` | Запустить preview сервер для директории |
| `npm run evolve:preview -- --list` | Список запущенных |
| `npm run evolve:preview -- --kill <port>` | Killshop |

---

## Удаление

```bash
# Удалить из cache Claude Code
rm -rf ~/.claude/plugins/cache/local/evolve

# Из installed_plugins.json (либо через UI Claude Code)
# /plugin uninstall evolve

# Удалить генерированные индексы в вашем проекте (опционально)
rm -rf .claude/memory/code.db .claude/memory/memory.db
```

---

## Документация

- **`docs/getting-started.md`** — расширенный getting-started с примерами на каждую возможность
- **`docs/specs/`** — design-документы каждой фазы
- **`docs/plans/`** — implementation-планы (последний — Phase D codegraph)
- **`agents/`** — все 46 агентов; читайте, учитесь, копируйте паттерны
- **`skills/`** — 40 process skills (TDD, debugging, brainstorming, code-review и т.д.)
- **`rules/`** — 15 проектных правил
- **`confidence-rubrics/`** — 11 рубрик для скоринга
- **`CHANGELOG.md`** — история версий

---

## Contributing

См. `CONTRIBUTING.md`. Если впервые — самый лёгкий вход:

1. Открыть `agents/_core/code-reviewer.md` — это canonical reference агента
2. Открыть любого агента поменьше (например `agents/_design/copywriter.md`) — попробуйте найти что бы вы добавили
3. PR с улучшением + объяснением WHY в commit message

---

## License

MIT — см. `LICENSE`.

---

## Благодарности

- **tree-sitter** — парсинг 9 языков через WASM, без native compilation
- **HuggingFace transformers.js** — multilingual embedding model в pure JS
- **Aider's repo-map** (Paul Gauthier) — концептуальный донор для code graph
- **Claude Code team** — за расширяемую plugin-архитектуру
