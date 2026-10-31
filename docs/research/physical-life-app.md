# Physical Life (дневник питания) — пассивное исследование бэкенда

- **Дата исследования:** 2026-10-31
- **Цель:** подготовить данные для MCP-сервера, записывающего приёмы пищи в приложение Physical Life (App Store ID 1636297151).
- **Метод:** только пассивные источники — страницы сторов, публичные сайты, приватность-политики, DNS (`dig`), Certificate Transparency (`crt.sh`), `whois`, публичная iTunes Lookup API. **Логины не выполнялись, эндпоинты не пробировались** (активную проверку выполняет другой процесс).
- Разделение: [ФАКТ] — подтверждено источником (ссылка указана); [ГИПОТЕЗА] — предположение, требует активной проверки.

---

## 1. Идентичность приложения и разработчика

### [ФАКТ] Приложение
| Параметр | Значение | Источник |
|---|---|---|
| iOS App ID | 1636297151 | https://apps.apple.com/il/app/physical-life/id1636297151 |
| Название | Physical Life — «Science-based weight loss» | там же |
| iOS bundle id | `co.pht.life` | https://itunes.apple.com/lookup?id=1636297151 |
| Текущая версия | 0.33.0 от 2026-10-08; первый релиз 2023-03-01; iOS 15.5+; EN/RU; бесплатно, без IAP | iTunes Lookup + App Store |
| Android пакет | `co.pht.life.pht_mobile_project` (Android 8.0+, 10K+ установок, рейтинг 4.8/382) | https://play.google.com/store/apps/details?id=co.pht.life.pht_mobile_project |
| Поддержка | **info@fizikl.org** (официальный ответ разработчика в отзывах Play) | страница Google Play (ответ FIZIKL IQ-FZCO) |
| Адрес разработчика | Techno Hub 2, office I132-H, Dubai Silicon Oasis, ОАЭ; тел. +971 58 877 3754 | карточка разработчика на Google Play |
| Сайт разработчика (из метаданных Play) | **https://pht.space/app** (параметр `appstore:developer_url`) | HTML Google Play |
| Privacy policy | https://pht.space/policy/ (RU: https://pht.space/policy-ru/), обновлена 2024-08-16 | App Store + текст политики |
| Сестринское приложение | TransformMate (id1577194080), политика на `tmate.pht.space/policy` (на 2026-10-31 TLS этого хоста сломан) | https://apps.apple.com/us/app/transformmate-the-gain-changer/id1577194080 |

### [ФАКТ] Юридические лица и бренд
- Продавец в сторах: **FIZIKL IQ – FZCO** (ОАЭ); строка copyright в сторах: «PHYSICAL PTE. LTD.» (Сингапур). Источники: App Store / Google Play.
- Для пользователей из СНГ оператор — **ОсОО «Эйджэнси»** (Киргизия); на сайте fizikl.org указан ИНН 01107202310370. Источники: https://pht.space/policy/, https://fizikl.org/
- Бренд — «Физикл» (Fizikl), основатель — **Олег Зингилевский** (Oleg Zingilevskii, контактное лицо в privacy-политике; instagram.com/zingilevskiy; youtube @physical.transformation; vk.com/fiztransform; telegram @fiztransform; вакансии @physicaljobs). Источники: https://pht.space/policy/, https://fizikl.org/, HTML https://pht.space/
- Контакты из политики: info@physical-transformation.com; в футере кабинета: info@fizikl.org. Источники: https://pht.space/policy/, https://pht.space/

### [ФАКТ] Заявленная обработка данных / интеграции (из privacy-политики и лейблов Apple)
- Собираются: имя, email, телефон, дата рождения, антропометрия, фото/видео, геолокация, IP, usage-данные. Источник: https://pht.space/policy/ + «App Privacy» на App Store.
- Сторонние сервисы: **Metabase, Google Analytics, Firebase, Firebase Cloud Message, Stripe** (платежи). Источник: https://pht.space/policy/
- Политика заявляет «серверы в ОАЭ» — фактически почти все хосты резолвятся в RU/EU-хостингах (см. §3, несоответствие отмечено как наблюдение).

---

## 2. Веб-версия (личный кабинет) и авторизация

### [ФАКТ] Веб-кабинет существует и является тем же продуктом
- **https://pht.space/** — полнофункциональный веб-кабинет: заголовок страницы «Вход в приложение | Physical Transformation», баннер «Приветствую в приложении Физикл». Неаутентифицированный `/` редиректит на `/welcome-page/?next=/` (стандартный `login_required` Django). Источник: HTML https://pht.space/ (curl 2026-10-31).
- **https://pht.space/app** — публичный лендинг приложения (RU/EN через `?language=en`). Источник: https://pht.space/app
- **https://content.pht.space** — проиндексирован поисковиками с той же страницей «Welcome to pht app». Источник: выдача веб-поиска.

### [ФАКТ] Механизм входа — email + пароль (Django-сессия)
- Форма входа: `POST https://pht.space/accounts/login/` с `csrfmiddlewaretoken` и полями **`login` (type=email)** и **`password`**. Источник: HTML https://pht.space/accounts/login/ (curl 2026-10-31).
- URL-паттерны (`/accounts/login/`, `/accounts/signup/`, `/accounts/password/reset/`) — типовой **django-allauth**; ссылка «Создать аккаунт» (`/accounts/signup/`) присутствует в HTML, но **закомментирована** — саморегистрация закрыта, доступ по инвайтам/оплате. Источник: HTML https://pht.space/
- Смена языка для неавторизованных: `GET /set_not_auth_user_language/?lang=ru|en`. Источник: HTML https://pht.space/
- Sign in with Apple / Google нигде не заявлены (ни в сторе, ни в кабинете). Источники: App Store, HTML pht.space.

### [ФАКТ] Стек веб-кабинета
Заголовки ответа `https://pht.space/`: `server: gunicorn`, `via: 2.0 Caddy` / `1.1 Caddy`, `vary: Accept-Language, Origin, Cookie`, `x-frame-options: DENY`. Источник: curl -I (2026-10-31).
- Выводы из заголовков (наблюдения): Python/Django за **gunicorn** за реверс-прокси **Caddy**; `Vary: Origin` — настроен CORS (ожидаемо для API, потребляемого мобильным приложением/сервисами).
- Публичные JS-бандлы кабинета (`base-auth.*.js`, `page_welcome.js`) не содержат ссылок на API — кабинет сервер-сайдный. Источник: fetched static (2026-10-31).

---

## 3. Домены и хосты (DNS + Certificate Transparency)

Полный список субдоменов получен из CT-логов: https://crt.sh/?q=pht.space (запрос 2026-10-31). IP — `dig` на 2026-10-31.

### Продакшн-хосты, резолвятся сейчас [ФАКТ]
| Хост | IP | Провайдер (whois) | Вероятная роль |
|---|---|---|---|
| **pht.space** | 153.51.117.250 | — (early-registration блок, ARIN) | веб-кабинет (Django/gunicorn/Caddy) |
| **feedback.pht.space** | 153.51.117.250 | — | обратная связь (тот же сервер, что кабинет) |
| **food-tracker.pht.space** | 88.218.60.35 | VDSINA (RU) | **сервис дневника питания — главный кандидат для MCP** |
| **search.pht.space** | 88.218.60.35 | VDSINA (RU) | поиск (единый сервер с food-tracker) |
| **food.pht.space** | 89.110.98.14 | VDSINA (RU) | сервис «еда» |
| **content.pht.space** | 89.110.98.14 | VDSINA (RU) | контент (статьи/видео), публично отдаёт кабинет |
| **metrics.pht.space** | 89.110.98.14 | VDSINA (RU) | метрики/трекеры |
| **energy.pht.space** | 147.45.154.42 | RIPE-ERX | энергобаланс/калории |
| ipt.pht.space | 89.110.98.14 | VDSINA | «ТМейт» (индивидуальные программы) |
| transformmate.pht.space / tmate.pht.space | 89.110.98.14 | VDSINA | TransformMate |
| shop.pht.space | 89.169.137.212 | — | магазин |
| letters.pht.space | 185.215.4.22 | **Tilda Publishing** | рассылки |
| monitoring.pht.space | 93.183.92.237 | — | мониторинг |
| clickhouse.pht.space | 158.160.41.135 | Yandex Cloud* | аналитика (ClickHouse) |
| gitlab.pht.space | 178.154.233.148 | Yandex Cloud* | self-hosted GitLab (код бэкенда!) |
| vault.pht.space | 138.16.163.49 | — | HashiCorp Vault |
| superset.pht.space | 51.250.72.201 | Yandex Cloud* | BI |
| demo.pht.space | 51.250.95.56 | Yandex Cloud* | демо |

\* «Yandex Cloud» — по диапазонам 51.250.x/84.201.x/178.154.x/158.160.x; в whois значатся RIPE/NL — наблюдение, не факт.

### Тестовые/прочие хосты, резолвятся [ФАКТ]
- **test.mobile.pht.space** → 51.250.82.248 — существует сервис «mobile» (прод-`mobile.pht.space` в DNS отсутствует, но в CT-истории есть сертификаты test.mobile/old-test.mobile)
- test.food-tracker.pht.space и test.search.pht.space → 84.201.157.96; test.food.pht.space → 62.84.116.88
- test.energy.pht.space нет; demo.ipt / vue.ipt → 51.250.1.106; stress-test → 178.154.223.211; mike → 84.252.128.251; isp.hosting → 178.154.214.166

### Хосты только в CT-истории (сертификаты были, DNS сейчас нет) [ФАКТ]
`datalens.pht.space` (Yandex DataLens), `sentry.pht.space`, `metabase.pht.space`, `metabase2/metabase.pht.space`, `old.pht.space`, `sandbox*.pht.space`, `ng.pht.space`, `gitlab-temp.pht.space`, `hakaton1/2.pht.space`, `ya-to-jira.pht.space`, `prod.ipt.pht.space`, многочисленные `test*`/`new.test*`/`old-test*` варианты food/food-tracker/search/content/mobile/energy/metrics/feedback/shop.
`api.pht.space` не встречается ни в DNS, ни в CT — API-хост с таким именем отсутствует.

### Прочие домены компании [ФАКТ]
| Домен | IP | Роль | Источник |
|---|---|---|---|
| **fizikl.org** | 138.16.181.73 | сайт бренда «Физикл» (ОсОО «Эйджэнси»); юр. документы: `/offer/`, `/policy/`, **`/soglasie-life-app/`** (согласие именно для Life-приложения) | https://fizikl.org/ |
| potok.fizikl.org | 185.65.148.19 | воронка продажи программ (Физикл Премиум) | https://fizikl.org/ |
| store.fizikl.org | 185.215.4.22 | мерч (Tilda) | https://fizikl.org/ |
| **physical-transformation.com** | 5.181.161.97 (www) | маркетинговый сайт (Tilda); домен контактной почты info@physical-transformation.com | https://physical-transformation.com/, https://pht.space/policy/ |
| ipt-online.org | — | сайт продукта «ТМейт» | https://fizikl.org/ |

---

## 4. Паттерны API

### [ФАКТ] Наблюдаемые паттерны
- Веб-кабинет: сервер-сайд Django, пути вида `/accounts/<action>/`, `/welcome-page/`, `/set_not_auth_user_language/`; аутентификация сессией + CSRF. Источник: HTML pht.space.
- Микросервисная архитектура: под каждый домен — отдельный сервис (food, food-tracker, search, energy, content, metrics, feedback, letters, shop, ipt, transformmate). Источник: CT-логи + DNS.
- Пары «прод + тест» для каждого сервиса (например, `test.food-tracker.pht.space`). Источник: CT + DNS.
- CORS включён на кабинете (`Vary: Origin`). Источник: заголовки ответа.

### [ГИПОТЕЗА] Для проверки активным процессом
1. **`food-tracker.pht.space` — основной API дневника питания мобильного приложения** (запись приёмов пищи), `search.pht.space` — поиск по базе продуктов (общий IP 88.218.60.35 = одно развёртывание за прокси). Это главные кандидаты для MCP-сервера.
2. `food.pht.space` — база продуктов/дневник старой версии кабинета; `energy.pht.space` — расчёт энергобаланса/норм калорий; `metrics.pht.space` — вес/шаги/измерения; `content.pht.space` — статьи/видео.
3. Мобильное приложение раньше ходило на `mobile.pht.space` (сохранился test-хост), позже API разнесли по микросервисам.
4. API, вероятно, REST/JSON на Python (Django/Django REST Framework или FastAPI — веб точно Django); аутентификация приложения — токен (JWT или DRF token), веб — сессия.
5. Реальный base URL мобильного приложения надёжнее всего снять перехватом трафика (mitmproxy/Charles) — ст     оры и публичные JS его не раскрывают.
6. Безопасная песочница для проб: `test.food-tracker.pht.space` / `test.search.pht.space` (84.201.157.96), но данные тестовые.
7. Альтернативный путь MCP без мобильного API: репликация сессионного входа веб-кабинета (CSRF из `GET /accounts/login/` → `POST /accounts/login/` с `login`/`password` → сессионная кука) и использование тех же форм/эндпоинтов кабинета, которыми пользуется веб-UI (дневник в кабинете присутствует — приложение и кабинет едины, см. титул «Вход в приложение»).

---

## 5. Источники
1. App Store (IL): https://apps.apple.com/il/app/physical-life/id1636297151
2. iTunes Lookup API: https://itunes.apple.com/lookup?id=1636297151
3. Google Play: https://play.google.com/store/apps/details?id=co.pht.life.pht_mobile_project
4. APKPure-листинг (без скачивания): https://apkpure.com/physical-life/co.pht.life.pht_mobile_project
5. Privacy policy (EN): https://pht.space/policy/ ; (RU): https://pht.space/policy-ru/
6. Веб-кабинет: https://pht.space/ , https://pht.space/accounts/login/ , https://pht.space/app (HTML/заголовки сняты curl 2026-10-31)
7. TransformMate: https://apps.apple.com/us/app/transformmate-the-gain-changer/id1577194080
8. Сайт бренда: https://fizikl.org/
9. Certificate Transparency: https://crt.sh/?q=pht.space
10. DNS (`dig`) и `whois` — выполнены 2026-10-31
11. Веб-поиск: наличие веб-версии pht.space; GitHub-репозиторий BigBread57/fizikl проверен и признан посторонним (сервис загрузки картинок, unrelated).

## 6. Примечания
- В репозитории `/Users/nb/fizikl-mcp/.env` уже лежат учётные данные (LOGIN/PASSWORD). В рамках данного исследования они **не использовались**; убедитесь, что файл не попадает в git-историю.
- Публичной документации API не существует (поиск по github.com и вебу ничего не дал).
