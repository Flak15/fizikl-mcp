# Physical Life (Fizikl) — активное исследование API дневника питания

- **Дата:** 2026-10-31
- **Цель:** выяснить, как приложение Physical Life записывает приёмы пищи, чтобы написать MCP-сервер.
- **Метод:** активное пробирование с реальным аккаунтом (креды в `.env`), чтение JS-бандлов кабинета, OpenAPI/Swagger-схемы с тестового контура.
- **Статус:** цикл записи приёма пищи **полностью проверен** (create → verify → delete на проде).
- Пассивная часть (домены, юрлица, CT-логи, сторы): см. [physical-life-app.md](physical-life-app.md).

---

## TL;DR

Приложение «Physical Life» (Физикл) — это клиент микросервисного бэкенда на `*.pht.space`.
Дневник питания живёт в сервисе **`food-tracker.pht.space`** (Django + DRF), поиск продуктов — в **`search.pht.space`** (FastAPI).

Минимальный цикл записи приёма пищи для MCP:

1. `POST https://pht.space/jwt-auth/api/token/` с `{username: <email>, password: <пароль>}` → `{access, refresh}` (это вход, как в мобильном приложении).
2. `GET https://search.pht.space/api/v1/search/food/?query=гречка` с заголовком `Authorization: Secret <access>` → список ID продуктов.
3. `GET https://food-tracker.pht.space/api/v1/food/<id>/` → продукт с порциями (`food_servings`, у каждой свой `id`).
4. `POST https://food-tracker.pht.space/api/v1/ration/eaten-food/create-list/` с массивом
   `[{serving: <serving_id>, serving_amount: <кол-во порций>, meal: "<slug>", eaten_date: "YYYY-MM-DD"}]` → **201 Created**.

Схема всего API (140 КБ, ~140 эндпоинтов) снята с тестового контура и сохранена рядом: [food-tracker-swagger.json](food-tracker-swagger.json), [search-openapi.json](search-openapi.json).

---

## 1. Аутентификация (проверено)

### Прямой JWT-логин — основной путь для MCP

```http
POST https://pht.space/jwt-auth/api/token/
Content-Type: application/json

{"username": "flak160@gmail.com", "password": "..."}
```

→ `200 {"access": "<JWT>", "refresh": "<JWT>"}`

- Access-токен живёт **3 часа**, refresh — **30 дней**.
- Обновление: `POST https://pht.space/jwt-auth/api/token/refresh/` c `{"refresh": "..."}` → новый `access` (проверено, 200).
- Claims access-токена: `user_id`, `client_id`, `flow_id`, `is_staff`, `expert`, `service: "pht"` и др.

### Схема авторизации к микросервисам

**Нестандартная**: заголовок

```
Authorization: Secret <access-JWT>
```

(не `Bearer`!). Именно так кабинет и приложение ходят в `food-tracker`/`food`/`search` (источник: `daily-report.js`, `jwt.js` кабинета + подтверждено запросами).

### Альтернативный веб-флоу (не нужен для MCP, но работает)

Веб-кабинет: `POST /accounts/login/` (Django-сессия + CSRF) → `GET /jwt-auth/api/token-by-session/` → те же JWT. Редирект-флоу в контент-SPA: `GET /jwt-auth/redirect-refresh-token/to-content/` → `https://content.pht.space/#/get-access-token/<refresh>/`.

---

## 2. Карта сервисов (роли подтверждены пробами)

| Хост | Стек | Роль |
|---|---|---|
| `pht.space` | Django (gunicorn/Caddy) | Кабинет + **auth-служба** (`/jwt-auth/api/token/`), отчёты «в тему» (`/api/food/report/create/`), FatSecret-настройки |
| `food-tracker.pht.space` | Django + DRF | **Дневник питания: приёмы пищи, съеденное, отчёты, база продуктов, распознавание еды** — главный сервис для MCP |
| `search.pht.space` | FastAPI | Поиск продуктов (`/api/v1|v2/search/food/`), поиск ингредиентов, внутренний LLM-поиск |
| `food.pht.space` | Django | «basis»: интеграция FatSecret (`/tracker-fatsecret/...`), нормы питания (`/api/v1/nutrition-norms/`), analytics, admin |
| `content.pht.space` | SPA (Vue) | Лента статей/видео, публикации |
| `energy.pht.space` | — | Энергобаланс (не пробировался) |

Тестовые контуры: `test.food-tracker.pht.space` (живёт, с **включённым DEBUG и swagger/**), `test.food.pht.space` (DEBUG включён), `test.search.pht.space`.

---

## 3. Дневник питания: проверенные эндпоинты (прод)

Все запросы с `Authorization: Secret <access>`. База: `https://food-tracker.pht.space`.

### Приёмы пищи (meals)

```
GET /api/v1/ration/meal/list/
→ [{"id":28742,"name":"завтрак","slug":"zavtrak","icon":"icon_breakfast","is_enable":true,"is_default":true},
   {"id":28743,"name":"обед","slug":"obed",...},
   {"id":28744,"name":"ужин","slug":"uzhin",...},
   {"id":28745,"name":"перекус","slug":"perekus",...}]
```

Создание/переименование своих приёмов: `POST /api/v1/ration/meal/create/` `{name}`, `PATCH .../meal/update/{id}/`, `PATCH .../meal/disable/{id}/`, `DELETE .../meal/destroy/{id}/`.

### Поиск продукта

```
GET https://search.pht.space/api/v1/search/food/?query=гречка&page_size=50&page=1&is_base=false
→ ["143370", "143369", "949095", ...]   # список ID продуктов (строками)
```

Параметры (из OpenAPI): `query`* (string), `page_size` (int, default 50), `page` (int, default 1), `is_base` (bool, default false).
Есть `GET /api/v2/search/food/` (те же параметры) и `POST /api/v1/search/ingredients/`.

### Карточка продукта (гидратация + порции)

```
GET /api/v1/food/143370/
→ {"id":143370,"name":"Крупа гречневая, сухая","brand_name":null,"is_base":true,
   "category":{"id":1452,"name":"Гречневая крупа (сухая)"},
   "default_serving":{"id":293021,"serving_amount":100},
   "food_servings":[
     {"id":293022,"name":"oz","metric_weight":28.3495,"metric_unit":"г","calories":97.2,...},
     {"id":1488052,"name":"порция","metric_weight":80.0,...},
     {"id":293021,"name":"г","metric_weight":1.0,"is_default":true,...}],
   "cooking_coefficient":2.5, ...}
```

- У каждой порции посчитаны КБЖУ + полный набор витаминов/минералов на порцию.
- `default_serving.serving_amount` — дефолтное количество (для «г» = 100, т.е. 100 грамм).
- `cooking_coefficient` — коэффициент разварки (сухая/варёная).
- Альтернативная выдача списка по ID: `GET /api/v1/food/list-by-id/`, `GET /api/v1/food/id-list/`, листинг `GET /api/v1/food/list/`.
- Составы («SUBWAY с беконом» и т.п. — готовые блюда/рецепты): `GET /api/v1/food-composition/` (пагинация), `GET /api/v1/food-composition/{id}/`.

### Запись съеденного — ПРОВЕРЕННЫЙ ЦИКЛ ЗАПИСИ

```
POST /api/v1/ration/eaten-food/create-list/
[{"serving": 293021, "serving_amount": 100, "meal": "obed", "eaten_date": "2026-10-31", "translation": "ru"}]
→ 201 Created [{id: 24402683, ...полная запись...}]
```

Поля (`EatenFoodCreate` из swagger):
- `serving` (int) — ID порции продукта;
- `serving_amount` (number, ≥0.01, обяз.) — количество порций (= сколько раз по `metric_weight` порции; для порции «г, 1 г» — просто граммы);
- `meal` (string, обяз.) — slug приёма пищи (`zavtrak|obed|uzhin|perekus` или свой);
- `eaten_date` (date, обяз.) — `YYYY-MM-DD`;
- `metric_weight` (number) — альтернатива порциям: задать вес напрямую;
- `translation` (string ≤3) — язык добавления (`ru`);
- `recipe` / `recipe_constructor` / `llm_recipe` — если добавляется рецепт, а не продукт;
- `is_beverage`, `matched_catalog_is_beverage` — снапшоты типа «еда/напиток».

Тело — **массив** (можно несколькими элементами за раз; ответ — массив созданных записей).

Прочее по съеденному:
- `GET /api/v1/ration/eaten-food/list/?eaten_date=2026-10-31` — все записи за дату (с полной вложенной структурой food/servings);
- `PATCH|PUT /api/v1/ration/eaten-food/update/{id}/` (схема `EatenFoodUpdate`);
- `DELETE /api/v1/ration/eaten-food/destroy/{id}/` — проверено: 204, запись исчезает;
- `DELETE /api/v1/ration/eaten-food/list/destroy/` — удаление списком ID;
- `POST /api/v1/ration/eaten-food/sync/` — синхронизация (оригинация/офлайн-режим приложения).

### Дневные отчёты (итоги дня)

```
GET /api/v1/report/list/calendar/
→ [{"pk":5248538,"eaten_date":"2026-10-31","weight":"83.30","calories":1851.4,
   "protein":109.075,"fat":74.586,"carbohydrate":181.61,"fiber":24.04,
   "food_weight":921.6,"beverage_kcal":111.0,"ed":1.9,...}, ...]
```

- `GET /api/v1/report/list/board/` — отчёты для «личной темы»; `GET /api/v1/report/summary-average/{external_user_id}/` — средние КБЖУ за период;
- `POST /api/v1/report/create/` — создание отчёта (в приложении, судя по `create_at` сегодняшнего отчёта, создаётся автоматически при первом съеденном за день — для MCP явно дёргать не обязательно);
- `DELETE /api/v1/report/destroy/{eaten_date}/`.

### Распознавание еды (ИИ) — есть, но с дневным лимитом

- `POST /api/v1/recognition/natural-language-recognition/` `{text*, language, region}` — распознавание еды из текста («200 г гречки и куриная грудка 150 г»). Проверено: эндпоинт жив, но вернул `429 {"detail": "Daily limit exceeded"}` — у аккаунта исчерпан дневной лимит LLM-запросов.
- `POST /api/v1/recognition/image-recognition/` — из фотографии.
- `GET /api/v1/metrics/limits_requests/` (+`/main/`, `/chips/`) — остатки лимитов (FS + LLM).
- Отдельный LLM-конструктор рациона: `POST /api/llm/v1/sessions/*` (init/stream, refine, convert, finish — «для MCP backend», т.е. у самого Физикла есть внутренний MCP-подобный сервис).

Полный список эндпоинтов (~140: рецепты, конструктор, рекомендации, меню, витрины кураторов, admin): в [food-tracker-swagger.json](food-tracker-swagger.json).

---

## 4. Как это использует приложение (выводы)

1. Мобильное приложение логинится по email+паролю → получает JWT на `pht.space`, дальше ходит в микросервисы с `Authorization: Secret <jwt>`.
2. Встроенный дневник питания (КБЖУ, витамины, минералы, «чёрные метки», коэффициенты готовки) — это `food-tracker` + `search`; пользовательская база — собственная (не FatSecret), с верификацией модераторами (`is_verified`), копированием эталонов (`food-composition/copy/{id}`) и пользовательскими продуктами (`food/create`).
3. FatSecret — **опциональная** интеграция (настройка в профиле кабинета, «фудтрекер» для веб-флоу «сдать отчёт в тему»); на исследуемом аккаунте не выбрана, и для MCP она не нужна.
4. Веб-кабинет `pht.space` — сервер-сайл Django; там же живёт `/api/food/report/create/` (отчёт «в тему потока»), который при отсутствии выбранного фудтрекера отвечает `403 "Не выбрана система отслеживания продуктов питания"` — к дневнику в приложении это отношения не имеет.

---

## 5. Рекомендации для MCP-сервера

- **Auth:** логин по `.env` → хранить `access`+`refresh`, обновлять по exp (refresh на 30 дней; при истечении — полный ре-логин).
- **Инструменты (минимальный набор):**
  1. `search_food(query)` → search v1 → ID;
  2. `get_food(id)` → карточка с порциями (или сразу `food/list-by-id` пачкой);
  3. `log_food(serving_id, amount, meal, date)` → eaten-food/create-list;
  4. `get_day_summary(date)` → report/list/calendar + eaten-food/list;
  5. `delete_eaten_food(id)` — для исправлений;
  6. (опц.) `list_meals()`, `recognize_text(text)` — с учётом дневного лимита (сначала проверять `metrics/limits_requests`).
- **Единицы:** для «просто граммов» использовать порцию-грамм (`name: "г"`, `metric_weight: 1`) и `serving_amount = <граммы>`; альтернатива — `metric_weight` без порции.
- **Даты:** `eaten_date` — календарная дата без времени; приём пищи выбирается slug'ом.
- **Витрины:** тестовый контур `test.food-tracker.pht.space/swagger/` (drf-yasg) и `test.search.pht.space/docs` (FastAPI) открыты анонимно — удобно следить за изменениями API, но писать туда ничего нельзя.
- **Гигиена:** `.env` с кредами сейчас не в `.gitignore` (репозиторий без gitignore) — добавить перед первым коммитом.

## 6. Изменчивость

- Все факты сняты 2026-10-31 с прод-хостов; версия приложения 0.33.0.
- Схема swagger может расходиться с продом (снята с тестового контура), но все ключевые эндпоинты из неё проверены на проде напрямую.
- `Secret`-схема авторизации и 3ч/30д TTL токенов подтверждены фактическими запросами.
