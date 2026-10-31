# fizikl-mcp

MCP-сервер (Model Context Protocol) для дневника питания [Физикл (Physical Life)](https://pht.space/app): тонкие обёртки над API `*.pht.space`. Локальный stdio-процесс для LLM-клиентов (ZCode, Claude Desktop, Cursor, Claude Code).

Статус: каркас + авторизация + инструмент `list_meals` (тикет 01 из `specs/fizikl-mcp/`). Остальные инструменты — по тикетам 03–06.

## Требования

- Node.js ≥ 20 (разрабатывалось на 24)
- Аккаунт Физикла

## Установка

```bash
npm install
npm run build
```

Создайте `.env` у корня проекта:

```
LOGIN=you@example.com
PASSWORD=ваш-пароль
```

Авторизация ленивая: сервер логинится при первом вызове инструмента. Refresh-токен (живёт 30 дней) сохраняется в `~/.fizikl-mcp/auth.json` с правами 600 — ре-логин нужен не чаще раза в месяц.

## Подключение к клиенту

Общий вид: клиент запускает процесс `node <путь-к-проекту>/dist/index.js`.

**ZCode** — workspace-конфигурация MCP (.zcode/mcp.json или через UI настроек MCP):

```json
{
  "mcpServers": {
    "fizikl": {
      "command": "node",
      "args": ["/absolute/path/to/fizikl-mcp/dist/index.js"]
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fizikl": {
      "command": "node",
      "args": ["/absolute/path/to/fizikl-mcp/dist/index.js"]
    }
  }
}
```

**Cursor / Claude Code** — та же пара `command`/`args` в соответствующем конфиге MCP.

После подключения у агента появится инструмент `mcp__fizikl__list_meals`.

## Инструменты

| Инструмент | Что делает |
|---|---|
| `list_meals()` | Приёмы пищи дневника и их slug (`zavtrak`, `obed`, `uzhin`, `perekus`) — slug нужен при записи съеденного. |

(По мере закрытия тикетов 03–06: `search_food`, `get_food`, `log_food`, `get_day_summary`, `delete_eaten_food`.)

Ошибки возвращаются инструментом на русском языке: проверьте `LOGIN`/`PASSWORD` в `.env` при сообщениях о входе.

## Разработка

```bash
npm test          # юнит-тесты (vitest + undici MockAgent, без живых запросов)
npm run typecheck # tsc --noEmit
npm run build     # tsc → dist/
npm run dev       # запуск без сборки (tsx src/index.ts)
```

Архитектура и решения — в `docs/adr/`, словарь терминов — в `GLOSSARY.md`, карта API Физикла — в `docs/research/pht-api.md`.

## Безопасность

- `.env` с кредами в `.gitignore`; не коммитите его.
- `~/.fizikl-mcp/auth.json` содержит refresh-токен — файл создаётся с правами 600.
- Сервер ходит только на прод-хосты Физикла (`pht.space`, `food-tracker.pht.space`, `search.pht.space`), зашитые константами.
