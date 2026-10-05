# Fallen Cards — карточки павших солдат

## Что это за проект

Инструмент для бережного учёта и подготовки карточек павших солдат из архивных источников:

- OBD Memorial (obd-memorial.ru) — основной источник
- Экспертные CSV-файлы (ручной ввод, сверка)

Данные хранятся дословно, как в источниках. Инструменты только учитывают и проверяют карточки, не переписывая факты.

**Связанные проекты:**
- Мемориальный блог: [mem-2026-soursecraft-site](https://github.com/annachurasheva/mem-2026-soursecraft-site)
- RSS-лента блога для Дзен (требования: `docs/DZEN_RSS.md` блога)
- Комбайн для ручного ввода постов: [mdx-combine](https://github.com/annachurasheva/mdx-combine)

## Терминология

- **fallen** («павшие») — карточки с подтверждённой гибелью (причина «убит»/«погиб» либо запись из списка захоронения с датой и местом).
- **unclassified** («ждут уточнения») — карточки, по которым причина/обстоятельства требуют дополнительной проверки.
- Классификация используется только внутри файлов и логов; содержимое архивных документов не изменяется.

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
│     └─ index.js          # подключение к Edge, постраничный сбор, CSV
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
├─ processed/              # результаты парсинга
│  ├─ experts/             # экспертные CSV (fallen.csv, other.csv, …)
│  └─ <имя_файла>/         # результаты по каждому входному файлу
│     ├─ <имя>__parser_mem2026.csv   # fallen (UTF-8 с BOM)
│     ├─ <имя>__other_mem2026_.csv   # unclassified (UTF-8 с BOM)
│     ├─ <имя>__session.log          # лог сессии
│     ├─ <имя>__errors.log           # ошибки страниц
│     └─ <имя>__processed.txt        # локальный журнал (id + url)
├─ summary/
│  └─ processed_ids.txt    # ГЛОБАЛЬНЫЙ журнал обработанных id
├─ dictionaries/           # словари (например, burials_*.json)
├─ logs/                   # логи
├─ scans/                  # сканы
└─ output/                 # сгенерированные карточки
```

Журнал обработанных хранит `id` (и, где есть, `url`) каждой принятой в работу персональной карточки. Локальные журналы лежат рядом с результатами парсинга, глобальный — в `data/summary/processed_ids.txt`.

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

Сначала запустите Edge с remote debugging (Windows/PowerShell):

```powershell
.	ools\run-edge-obd.ps1
```

Затем:

```bash
node scripts/parse-obd.js --input=имя_файла.txt
node scripts/parse-obd.js --input=имя_файла.txt --dry-run   # план без записи
node scripts/parse-obd.js --input=имя_файла.txt --limit=50
node scripts/parse-obd.js --input=имя_файла.txt --output=data/processed/
```

Результаты и журналы создаются в `data/processed/<имя_файла>/`, глобальный журнал дополняется автоматически.

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

- CSV пишутся в UTF-8 с BOM (для Excel).
- Постраничный лог парсера выводит только имя/номер карточки — без штампов категорий.
- Дубли персон (одинаковые ФИО + дата) ловятся на гейте 2, чтобы не порождать одинаковые slug в блоге.

Проект ведёт Anna Churasheva.