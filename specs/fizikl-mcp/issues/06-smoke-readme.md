# 06: Smoke-цикл на прод + финальный README

**What to build:** Ручной smoke-скрипт `npm run smoke`, прогоняющий живой цикл на проде с кредами из `.env`: логин → поиск → карточка → запись → проверка дня → удаление. Финальный README: что за сервер, полный список инструментов, конфиг-сниппеты для ZCode / Claude Desktop / Cursor, как прогонять тесты и smoke.

**Blocked by:** 03 (search_food + get_food), 04 (log_food + delete_eaten_food), 05 (get_day_summary)

**Status:** ready-for-agent

- [ ] `npm run smoke` проходит весь цикл на проде и оставляет дневник чистым (запись удалена)
- [ ] Smoke не требует ручных шагов, кроме запуска; креды читаются из `.env`
- [ ] README описывает все 6 инструментов, их параметры и дефолты (дата/приём пищи)
- [ ] README содержит конфиг-сниппеты для ZCode / Claude Desktop / Cursor
- [ ] `npm test` зелёные, `npm run build` чистый
