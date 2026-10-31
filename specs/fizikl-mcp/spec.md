# fizikl-mcp — MCP-сервер дневника питания Физикл

Локальный stdio MCP-сервер на TypeScript: тонкие обёртки над API дневника питания Физикла (Physical Life) для LLM-клиентов.

## Решения

Все решения зафиксированы в ADR и глоссарии — читать перед реализацией:

- `docs/adr/0001-stack-typescript-mcp-sdk.md` — стек
- `docs/adr/0002-transport-stdio-local.md` — транспорт stdio
- `docs/adr/0003-fizikl-auth-token-persistence.md` — авторизация Физикла
- `docs/adr/0004-tools-thin-wrappers.md` — 6 инструментов, тонкие обёртки
- `docs/adr/0005-defaults-date-meal.md` — дефолты даты и приёма пищи
- `docs/adr/0006-testing-vitest-nock-manual-smoke.md` — тестирование
- `GLOSSARY.md` — словарь терминов (использовать его терминологию)
- `docs/research/pht-api.md` — проверенная карта API (истина по эндпоинтам)
