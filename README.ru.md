# Evolve

[English](README.md) · **Русский**

Плагин, который превращает Claude Code, Codex и Gemini в команду из 73 специалистов с графом кода, памятью проекта и confidence-гейтами. Работает локально. Без Docker.

**v1.7.0** · MIT · Windows / macOS / Linux · Claude Code · Codex CLI · Gemini CLI

---

## Установка

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/evolve-agent/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/vTRKA/evolve-agent/main/install.ps1 | iex
```

Установщик находит на вашей машине Claude Code, Codex или Gemini. Клонирует плагин в `~/.claude/plugins/marketplaces/evolve-marketplace/`, прогоняет 194 тестаов и регистрирует плагин в каждой найденной CLI.

Перезапустите CLI. На следующей сессии увидите:
```
[evolve] welcome — plugin v1.7.0 initialized for this project
[evolve] code RAG ✓ N files / M chunks (fresh)
[evolve] code graph ✓ N symbols / M edges (X% resolved)
```

**Требования:** Node.js 22+, Git. Git LFS опционален — модель эмбеддингов скачивается с HuggingFace при первом использовании. Без Docker, Python и нативной компиляции.

---

## Что делает

Четыре типа запросов, четыре конкретных результата:

| Вы просите | Что меняется |
|------------|--------------|
| Переименуй `processOrder` в `processCheckout` | Агент сначала запускает `--callers processOrder`, находит 14 вызывающих, правит все в одном PR, потом перезапускает запрос и убеждается что осталось 0. Ничего не пропущено. |
| Добавь endpoint оплаты с идемпотентностью | Поиск памяти находит ваше прошлое решение. Laravel-агент пишет failing test, реализует, запускает `pest` и `phpstan`, получает score 9.2, сохраняет решение в `solutions/`. |
| Юзеры жалуются что иногда payment висит | root-cause-debugger воспроизводит локально, сужает до пути освобождения Redis-лока, пишет incident-заметку с file:line и предложением фикса. |
| Сделай landing в духе Linear | Firecrawl скрапит Linear. creative-director предлагает три направления бренда. Дизайнер пишет state matrix. Открывается живой preview на `localhost:3047` с hot reload. accessibility-reviewer проверяет WCAG. |

---

## Что внутри

| Возможность | Что это значит |
|-------------|----------------|
| 73 специалиста | Каждый минимум 250 строк: persona, decision tree, procedure, output contract, anti-patterns, verification |
| Граф кода (10 языков) | tree-sitter symbols и edges. Запросы `--callers X`, `--callees Y`, `--neighbors Z --depth 2` |
| Семантический поиск кода | multilingual-e5-small. Работает оффлайн. Понимает русский, английский и 100 других языков |
| Память проекта | Пять категорий с FTS5 и per-chunk embeddings. Решения переиспользуются, не выводятся заново |
| Confidence engine | Двенадцать рубрик. Гейт при score ≥9. Override-rate >5% триггерит audit |
| 20 правил-дисциплин | `use-codegraph-before-refactor`, `anti-hallucination`, `commit-attribution`, `no-half-finished` и другие |
| Авто-переиндексация | PostToolUse hook плюс mtime-scan на старте сессии. Daemon `memory:watch` опционален |
| Agent evolution loop | Telemetry, детекция underperformer'ов, `/evolve-strengthen` с user-gate |
| Live preview-server | `localhost:PORT` с SSE hot reload, idle-shutdown, лимитом серверов |
| Multi-CLI | Один установщик настраивает Claude Code, Codex и Gemini |

---

## Поддерживаемые стеки

PHP: Laravel · TypeScript / JavaScript: Next.js, Nuxt, Vue, Svelte, React, Express, NestJS · Python: FastAPI, Django (с DRF) · Ruby: Rails · Java / Kotlin: Spring · C#: ASP.NET · Go · Mobile: Flutter, iOS, Android · API: GraphQL · Хранилища: PostgreSQL, MySQL, MongoDB, Elasticsearch, Redis

Парсеры графа кода: TypeScript, JavaScript, TSX, JSX, Python, PHP, Go, Rust, Java, Ruby. Vue и Svelte — whole-file chunking.

---

## Команды

### Слэш-команды

| Команда | Назначение |
|---------|-----------|
| `/evolve` | Авто-роутер: genesis, audit, strengthen, adapt, evaluate |
| `/evolve-genesis` | Первичный scaffolding `.claude/` под ваш стек |
| `/evolve-audit` | Health-check агентов, правил, памяти |
| `/evolve-strengthen [agent_id]` | Усиление слабого агента. Без аргумента — auto-trigger из telemetry |
| `/evolve-adapt` | Подтянуть upstream-улучшения агентов в проект |
| `/evolve-evaluate` | Прогон confidence на готовом артефакте |
| `/evolve-preview` | Управление preview-серверами |
| `/evolve-changelog` | Что изменилось с прошлой версии в этом проекте |

### NPM скрипты (запускать в папке плагина)

| Команда | Назначение |
|---------|-----------|
| `npm run evolve:status` | Health-check всех индексов |
| `npm run evolve:upgrade` | git pull, lfs pull, npm install, прогон тестов |
| `npm run evolve:upgrade-check` | Вручную проверить upstream |
| `npm run code:index` | Полная переиндексация |
| `npm run code:search -- --query "..."` | Семантический поиск |
| `npm run code:search -- --callers "Symbol"` | Граф: кто вызывает символ |
| `npm run memory:watch` | Опциональный watcher-демон |
| `npm run check` | Все 194 тестаов плюс валидация манифеста, frontmatter, footer'ов |

---

## Обновление

SessionStart hook раз в 24 часа в фоне делает upstream fetch. Если есть новые коммиты — на следующей сессии увидите:
```
[evolve] ⬆ upstream has 7 new commit(s) (latest tag: v1.8.0) — run `npm run evolve:upgrade`
```

Применить:
```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/vTRKA/evolve-agent/main/install.sh | bash
```
```powershell
# Windows
irm https://raw.githubusercontent.com/vTRKA/evolve-agent/main/install.ps1 | iex
```
Установщик идемпотентен. Повторный запуск обновляет существующий чекаут.

Или из папки плагина: `npm run evolve:upgrade`.

**Обновляется автоматически:** глобальные agents, skills, rules, rubrics, грамматики, embedding-модель, схема `code.db` и `memory.db` (через `CREATE TABLE IF NOT EXISTS`), регистрация в `installed_plugins.json`.

**Не трогается:** проектные `.claude/agents/`, `.claude/rules/`, `.claude/memory/`. Это ваши кастомизации и данные. Чтобы подтянуть upstream-изменения в проект — `/evolve-adapt`. Покажет diff и спросит перед записью.

---

## Альтернативная установка

Через marketplace-команду Claude Code:
```
/plugin marketplace add vTRKA/evolve-agent
/plugin install evolve@evolve-marketplace
```

Полностью ручная (для CI):
```bash
git clone https://github.com/vTRKA/evolve-agent ~/.claude/plugins/marketplaces/evolve-marketplace
cd ~/.claude/plugins/marketplaces/evolve-marketplace
npm install && npm run check
```
Затем upsert записи в `installed_plugins.json`. Готовый node-скрипт лежит в `install.sh`.

---

## Troubleshooting

**Плагин не виден после установки.** Проверьте регистрацию:
```bash
cat ~/.claude/plugins/installed_plugins.json | grep "evolve@"
ls ~/.claude/plugins/marketplaces/evolve-marketplace/.claude-plugin/plugin.json
```
Перезапустите CLI. Плагины подгружаются на старте сессии.

**Не работает в VS Code или Zed.** Эти расширения используют ту же установку Claude Code, что и terminal. Если в terminal banner появляется — он появится везде. Перезапустите IDE.

**`Protobuf parsing failed`.** Файл модели остался LFS-pointer'ом. Запустите `git lfs pull` в папке плагина, либо просто запустите поиск — модель скачается с HuggingFace (~118 MB).

**SQLite ошибки.** Нужен Node.js 22+ для встроенного `node:sqlite`. На младших версиях семантическая память не работает.

**Грязный код-индекс.** mtime-scan на SessionStart обычно ловит внешние правки. Для полного rebuild: `rm .claude/memory/code.db && npm run code:index`.

**Большой монорепо (более 10к файлов).** Индексировать инкрементально: `npm run code:index -- --since=HEAD~100`.

**Windows.** Если PowerShell ругается на Execution Policy: `Set-ExecutionPolicy -Scope Process Bypass` перед запуском. Codex symlink требует Developer Mode. Без него установщик копирует папку.

---

## Удаление

```bash
# macOS / Linux
rm -rf ~/.claude/plugins/marketplaces/evolve-marketplace
rm -f ~/.codex/plugins/evolve

node -e "
const fs=require('fs'),p=process.env.HOME+'/.claude/plugins/installed_plugins.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
delete d.plugins['evolve@evolve-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

sed -i.bak '/<!-- evolve-plugin-include: do-not-edit -->/,/<!-- evolve-plugin-include: do-not-edit -->/d' ~/.gemini/GEMINI.md 2>/dev/null || true
```

Опционально. Удалить индексы из проектов только если уверены что не нужны — это ваши данные:
```bash
rm -rf .claude/memory/code.db .claude/memory/memory.db
```

---

## Документация

- [`docs/getting-started.md`](docs/getting-started.md) — расширенный getting-started
- [`CLAUDE.md`](CLAUDE.md) — system context, загружаемый на старте сессии
- [`CHANGELOG.md`](CHANGELOG.md) — история версий
- [`docs/templates/`](docs/templates/) — PRD, ADR, plan, RFC, brainstorm, intake
- `agents/_core/code-reviewer.md` — canonical reference агента
- 73 агента · 45 skills · 20 правил · 12 рубрик

---

## Сравнение с superpowers

| | Evolve | superpowers |
|--|--------|-------------|
| Граф кода (10 языков) | да | нет |
| Семантический поиск (multilingual) | да | нет |
| Specialist-агенты | 73, ≥250 строк, фиксированная структура | меньше, более свободная структура |
| Stack-aware scaffolding | 23 стека | нет |
| Confidence engine | 12 рубрик, гейт ≥9 | мягче |
| Live preview-server | да (pure-Node SSE) | нет |
| Авто-reindex без демона | да | нет |
| Agent evolution loop | да | нет |
| Multi-CLI (Claude / Codex / Gemini) | да | только Claude Code |
| Размер бандла | ~140 МБ | <10 МБ |

Можно ставить оба одновременно. Namespace `evolve:` предотвращает конфликты имён.

---

## Contributing

См. [`CONTRIBUTING.md`](CONTRIBUTING.md). Самый короткий путь:
1. Прочитайте `agents/_core/code-reviewer.md` — canonical reference
2. Возьмите более компактного агента (`agents/_design/copywriter.md`) и найдите одно улучшение
3. Откройте PR. Объясните *почему* в commit message. Не добавляйте агентскую атрибуцию в коммиты — см. правило `commit-attribution`

## Благодарности

tree-sitter (WASM-парсинг 10 языков). HuggingFace transformers.js (multilingual embeddings). [Aider's repo-map](https://aider.chat) (концептуальный донор для графа кода). Команда Claude Code (расширяемая plugin-архитектура).

---

MIT — см. [`LICENSE`](LICENSE).
