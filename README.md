# Fallen Cards — сырьё и ключи мемориального проекта

## Что это за проект

Инструмент бережного учёта павших солдат Ак-Монайского перешейка (Крым) из
архивных источников:

- OBD Memorial (obd-memorial.ru) — основной источник
- Экспертные CSV-файлы (ручной ввод, сверка)

Данные хранятся дословно, как в источниках. Инструменты только учитывают и
проверяют карточки, не переписывая факты.

**Роль репозитория в архитектуре** (`docs/ARCHITECTURE.md`): fallen-cards —
сырой слой: парсер, CSV схемы v03, реестр, объекты перешейка; поставщик
карточек с **ключами** в frontmatter. Значения здесь НЕ нормализуются и
не подменяются — назначаются КЛЮЧИ (`unit_key`, `location_key`, `burial_*_key`,
`rebural_from_key`); раскрытие ключей в полные значения делает Astro-генератор
по словарям Astro-репо.

**Связанные проекты:**
- Производственный слой (Astro 5.1.5): [mem-2026-soursecraft-site](https://github.com/annachurasheva/mem-2026-soursecraft-site) — словари, SCHEMA карточки, сборка статики, прод
- OG-представления карточек для ОК: [mem-ok-s-admin](https://github.com/annachurasheva/mem-ok-s-admin)
- Архив, донор идей и ранних плит: [memorial-korpech-crimea](https://github.com/annachurasheva/memorial-korpech-crimea) (ветка `qwen3-memorial`)

## Схема имён карточек (после TASK-0014)

- Папка: `data/cards/`; файл: `<источник>-<document_id>.md`, источники `obd` и `pmn`.
- Slug: `bitva-za-krym-1942-<источник>-<document_id>` (префикс источника обязателен:
  пространства id у obd и pmn разные).

## Терминология

- **fallen** («павшие») — записи со статусом выбытия «убит»/«погиб».
- **unclassified** («ждут уточнения») — все остальные статусы (пропал без вести,
  попал в плен, умер от ран, пустое и любое другое).
- Классификация используется только внутри файлов и логов; содержимое архивных
  документов не изменяется.

## Структура репозитория

```
scripts/
├─ parse-obd.js            # парсинг карточек OBD Memorial (Edge + Puppeteer)
├─ check-input.js          # контроль URL-листов перед парсингом
├─ check-csv.js            # контроль CSV перед генерацией карточек
├─ register-experts.js     # учёт экспертных CSV в глобальном журнале
├─ normalize.js            # нормализация (сейчас — без изменений данных)
├─ validate.js             # валидация
└─ generate-cards.js       # генерация карточек

src/
├─ parsers/
│  ├─ csv-reader.js        # чтение CSV
│  └─ obd-memorial/        # парсер OBD Memorial
│     ├─ extractors.js     # извлечение полей из DOM (HEADERS, pageExtractor)
│     ├─ classifier.js     # классификация fallen / unclassified
│     ├─ progress.js       # построчный прогресс (индикация жизни)
│     └─ index.js          # подключение к Edge, постраничный сбор, onRecord
├─ normalizers/
│  ├─ person.js            # ФИО, даты, места
│  ├─ military-unit.js     # воинские части
│  ├─ rank.js              # звания
│  └─ location.js          # география (collectBurials)
├─ validators/
│  ├─ input-control.js     # контроль URL-листов (журнал файла + глобальный)
│  ├─ csv-control.js       # контроль CSV (document_id, персоны)
│  ├─ registry.js          # работа с журналами и экспертными CSV
│  ├─ completeness.js      # полнота полей
│  ├─ dates.js             # корректность дат
│  ├─ military-unit.js     # валидность unit_id
│  └─ report.js            # отчёты
├─ generators/
│  ├─ markdown-card.js     # Markdown для Astro
│  └─ json-card.js         # JSON
└─ pipelines/
   ├─ batch-processor.js   # пакетная обработка
   ├─ csv-to-markdown.js   # CSV → markdown
   └─ obd-to-markdown.js   # OBD → markdown
```

## Данные

```
data/
├─ raw/                    # входные списки URL (.txt)
├─ csv/                    # CSV с ручным вводом
├─ processed/              # результаты парсинга (схема v03, UTF-8 без BOM)
│  ├─ experts/             # экспертные CSV (fallen.csv, other.csv, …)
│  └─ <имя_файла>/         # результаты по каждому входному файлу
│     ├─ <имя>-fallen.csv        # статус «убит»/«погиб»
│     ├─ <имя>-unclassified.csv  # остальные статусы
│     ├─ <имя>-error.csv         # техошибки (TIMEOUT/NETWORK/PARSE_ERROR/EMPTY_PAGE)
│     └─ <имя>-repeats.txt       # URL, уже учтённые в реестре
├─ summary/
│  └─ processed_ids.txt    # ГЛОБАЛЬНЫЙ реестр обработанных id (обновляется строго после CSV)
├─ dictionaries/           # справочные словари для назначения ключей (см. README там же)
├─ cards/                  # карточки с ключами в frontmatter: <obd|pmn>-<document_id>.md (TASK-0014)
├─ logs/                   # логи
├─ scans/                  # сканы
└─ output/                 #legacy: старые сгенерированные карточки (до схемы с ключами)
```

Реестр обработанных хранит `id` (и `url`) каждой принятой в работу персональной
карточки. Локальных журналов больше нет — единственный реестр глобальный,
`data/summary/processed_ids.txt`.

## Рабочий процесс

### 1. Контроль входа (два гейта)

| Гейт | Команда | Что проверяет |
|---|---|---|
| 1. URL-листы | `node scripts/check-input.js` | дубли URL внутри файла; сколько уже в журнале файла и в глобальном журнале; сколько новых |
| 2. CSV карточек | `node scripts/check-csv.js` | дубли document_id; дубли персон (ФИО+дата); уже сгенерированные карточки |

Оба гейта также показывают блок по экспертным файлам (`data/processed/experts/`): сколько уникальных `document_id` в каждом CSV, сколько из них уже учтено в журнале файла и в глобальном журнале, какие id новые. Гейты только печатают отчёт и ничего не пишут.

### 2. Учёт экспертных карточек

```bash
# Показать, что будет добавлено в глобальный журнал (без записи)
node scripts/register-experts.js --dry-run

# Внести недостающие document_id из data/processed/experts/*.csv в глобальный журнал
node scripts/register-experts.js
```

После этого `check-input.js` и `check-csv.js` считают эти карточки уже принятыми в работу.

### 3. Парсинг OBD Memorial

Сначала запустите Edge с remote debugging и парсер через лаунчер (Windows, PowerShell 7+):

```powershell
pwsh -File .\tools\run-edge-obd.ps1 --input=имя_файла.txt
```

Лаунчер поднимает/переиспользует Edge CDP, запускает `node scripts/parse-obd.js`,
пробрасывает вывод построчно и печатает сторож при тишине ≥ 30 с.
Требование: PowerShell 7+ (`pwsh`); Windows PowerShell 5.1 не поддерживается.

Прямой запуск (если Edge уже активен на порту 9226):

```bash
node scripts/parse-obd.js --input=имя_файла.txt
node scripts/parse-obd.js --input=имя_файла.txt --dry-run   # план без записи
node scripts/parse-obd.js --input=имя_файла.txt --limit=50
node scripts/parse-obd.js --input=имя_файла.txt --output=data/processed/
```

Результаты создаются в `data/processed/<имя_файла>/`, глобальный реестр
дополняется автоматически (строго после записи CSV; ошибки в реестр не попадают).

### 4. Дальнейшие шаги

```bash
node scripts/normalize.js --input=<файл|папка>
node scripts/validate.js --input=<...>
node scripts/generate-cards.js --input=<...> --output=data/output/
```

## Запуск из package.json

```bash
npm run check:input
npm run check:csv
npm run parse:obd
npm run normalize
npm run validate
npm run generate
```

## Заметки

- Все файлы, которые пишет код, — UTF-8 без BOM (схема v03, см. docs/CSV_SCHEMA.md).
- Прогресс парсера постстрочный, тон строгий: только `fallen` / `unclassified` / `error`, без эмодзи.
- Дубли персон (одинаковые ФИО + дата) ловятся на гейте 2 и в TASK-0011 (смысловые дубли), чтобы не порождать одинаковые slug в блоге.

Проект ведёт Anna Churasheva.