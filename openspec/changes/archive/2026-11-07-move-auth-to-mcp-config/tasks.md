# Tasks

## 1. Код: креды только из окружения

- [x] 1.1 `src/config.ts`: удалить `loadEnvFile()` и ставшие ненужными импорты/`PROJECT_ROOT`; в `getCredentials()` переписать текст ошибки на «Не заданы LOGIN и PASSWORD. Передайте их через env-блок в конфигурации вашего MCP-клиента (см. README)». Проверка: `npm run typecheck` без ошибок.
- [x] 1.2 `src/index.ts`: убрать импорт и вызов `loadEnvFile()`. Проверка: `npm run typecheck` без ошибок.
- [x] 1.3 `src/fizikl/auth.ts`: в ошибке логина заменить «в .env» на «в env-блоке конфигурации MCP-клиента», сохранив слова «LOGIN и PASSWORD». Проверка: `npm test` — `tests/unit/auth.test.ts` зелёный (матч `/LOGIN и PASSWORD/`).
- [x] 1.4 `src/smoke.ts`: убрать `loadEnvFile` (импорт и вызов), шаг 1 переименовать в «Креды из окружения», док-комментарий — запуск `LOGIN=… PASSWORD=… npm run smoke`. Проверка: `npm run typecheck` без ошибок.

## 2. Конфигурация репозитория

- [x] 2.1 `git rm .zcode/config.json` (запись `fizikl` была в нём единственной). Проверка: `git ls-files` больше не содержит `.zcode/config.json`, файла нет на диске.
- [x] 2.2 Удалить `.env` и строку `.env` из `.gitignore`. Проверка: файла нет, строки в `.gitignore` нет.

## 3. Документация

- [x] 3.1 README: секцию «Создайте `.env`» заменить на настройку через env-блок (ZCode — юзер-скоуп `~/.zcode/cli/config.json` с полной записью command+args+env; Claude Desktop, Cursor, Claude Code — их персональные конфиги); убрать остальные упоминания `.env` (строки про «проверьте в .env», smoke, `.gitignore`) и извинение про абсолютный путь. Проверка: JSON-сниппеты из README валидны и копируются как есть.
- [x] 3.2 Новый `docs/adr/0007-credentials-in-mcp-client-config.md`: решение (B3, юзер-скоуп, удаление `.env`-лоадера), рассмотренные альтернативы, последствия (в т.ч. ограничение мультиаккаунтности). Проверка: файл существует, формат как у соседних ADR.

## 4. Сборка, миграция машины и приёмка

- [x] 4.1 `npm run build`; fail-fast: `node dist/index.js` без env → ненулевой exit и русская подсказка в stderr; `LOGIN=x PASSWORD=y node dist/index.js` → процесс стартует (stderr «сервер запущен», снять по таймауту).
- [x] 4.2 Вне репозитория: добавить полную запись `fizikl` с env-блоком в `~/.zcode/cli/config.json` (креды взять из бывшего `.env`), перезапустить ZCode. Проверка: Settings → MCP показывает fizikl connected, инструмент отвечает.
- [x] 4.3 Smoke с inline-env: `LOGIN=… PASSWORD=… npm run smoke` — полный цикл (логин → поиск → карточка → запись → итоги → удаление) проходит.
- [x] 4.4 Полный прогон `npm test` — все юнит-тесты зелёные.

## Workflow follow-up

- После ревью — заархивировать change: `/opsx:archive`.
- Проверить результат архивации (`openspec list` не показывает change, спека `server-configuration` появилась в главных спеках).
