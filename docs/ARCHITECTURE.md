# ARCHITECTURE.md — итоговая архитектура проекта fallen-cards

Координата: `annachurasheva/fallen-cards` · `docs/ARCHITECTURE.md` · 2026-10-07,
ревизия 2026-10-11 (WARUNITS_DICT v2 + регламент очистки).
Документ фиксирует единую непротиворечивую картину слоёв, ролей репозиториев
и схемы имён карточек. При расхождении с более ранними записками приоритет — здесь.

## 1. Картина слоёв

```
fallen-cards (сырьё и ключи)
  парсер OBD → CSV схемы v03, реестр, повторы, ошибки
  слой объектов Ак-Монайского перешейка (TASK-0010)
  слой подготовки: назначение КЛЮЧЕЙ (unit / location / burial / rebural)
  → data/cards/<источник>-<document_id>.md с frontmatter и ключами
      │
mem-2026-soursecraft-site (Astro 5.1.5, производственный слой)
  словари подмен и раскрытия (warunits-fallen-cards.md, locations_dict, burials_*)
  SCHEMA карточки по ключам; теги «сослуживцы»; авторы/персоны (authors.yaml)
  статика → RSS
      │
  Дзен  →  ОК (аудитория 50+)
      │
mem-ok-s-admin
  OG-представления карточек, собранные на тех же ключах
      │
  обратный поток: живые люди (малые поселения, родовые связи, имена и отчества
  дедов и их братьев) → уточнения, новые источники (в т.ч. pmn) → fallen-cards
```

## 2. Смысловая рамка

- **Только Ак-Монайский перешеек, Крым.** Германий, Польш, Карелий и прочих
  театров в массиве не будет.
- `country_burial` / `region_burial` в схеме v03 — значение по умолчанию
  «Россия, Республика Крым»; любое иное значение в прогоне — сигнал на аудит
  входного файла, а не основание для расширения рамки.
- **Мост к живым, не архивная бухгалтерия.** Ключ — единая валюта всех слоёв:
  выдан один раз в fallen-cards, раскрывается Astro, переиспользуется в OG для ОК.
  Современные названия малых поселений (locations_dict) — это и есть мост к живым:
  по ним внуки ищут бабушкины рассказы, а аудитория ОК приходит по имени и отчеству,
  которые помнит. Поэтому **OG-карточка ведёт именем и отчеством**, а не шифрограммой
  и не артикулом.
- Словарь объектов (TASK-0010) ограничен захоронениями на Ак-Монайском перешейке;
  атрибут «дистанция от Корпечи» имеет смысл только в этой рамке (Хафуз — 12 км).

## 3. Модель ключей

**fallen-cards не нормализует и не подменяет значения — он выдаёт ключи.**
Нормализация и раскрытие — Astro-генератор по копиям словарей.

```
fallen-cards (здесь)
  ↓
  данные павших (CSV схемы v03, дословно из ЦАМО)
  + словарь warunit: scripts/build-warunits-dict.js → draft3-пары (json+md),
    scripts/build-warunits-table.js → активный словарь
    data/dictionaries/warunits-fallen-cards.md (ключ, имя, написания, примечания)
  + карточки с КЛЮЧАМИ в frontmatter
  ↓
Astro-генератор (mem-2026-soursecraft-site)
  ↓
  копии словарей (warunits-fallen-cards.md, locations_dict, ranks_dict, burials_*)
  + логика раскрытия ключей → полные значения
  + SCHEMA карточки по ключам
  ↓
  статика → прод
```

Карточка из fallen-cards содержит ключи, например:

```yaml
title: "Самошвили Резо Цуцкович"
slug: "bitva-za-krym-1942-obd-1161514741"
unit_key: "<NNN>-fallen-cards"
location_key: "loc-duscheti"
burial_current_key: "burial-hafuz-66-3"
rebural_from_key: "loc-dalnie-kamyshi"
published: 2026-10-06
```

Astro при сборке раскрывает `unit_key` в полное наименование + краткий боевой путь
(реестр unit_keys.json аннулирован, WARUNITS_DICT v2 — см. ниже и
`docs/WARUNITS-DICT.md`); берёт `loc-duscheti` из locations_dict и даёт
современное название. Поля реестра (`formation`, `disband`,
`history_note`, `camo_url`, `reference_url`) входят в карточку **только на этапе
раскрытия в Astro** — никогда в исходник карточки из fallen-cards. Пополнение
словарей (новый полк, новая локация) → перегенерация статики → выгрузка.
Карточки в fallen-cards не меняются: ключ тот же.

**Владение словарями (TASK-0016, ревизия 2026-10-11):** словари `burials_*`,
`ranks_dict` — рабочие инструменты fallen-cards. Словарь воинских частей переведён
на **WARUNITS_DICT v2**: аннулированы `unit_keys.json`, `units_dict.json`,
`units_registry.json`, `unit_hierarchy.json` (перемещены в
`data/dictionaries/archive/` с префиксом `deprecated-<метка>-`). Действующая
цепочка: `scripts/build-warunits-dict.js` (перепись warunit из CSV
`data/processed/**` с автоматическим слиянием по набору чисел; атомарная пара
`proposals/warunits-draft3-<timestamp>.json/.md`; перезапись запрещена) →
`scripts/build-warunits-table.js` (механическая сборка активного четырёхколоночного
словаря `data/dictionaries/warunits-fallen-cards.md`: ключ `<NNN>-fallen-cards`,
развёрнутое имя только из docs/TEXT или «— (оператор)», написания, примечания).
Astro-репо получает копии и раскрывает по ним ключи при генерации.
`locations_dict` — внешний импорт, только чтение. Формулировки «пополнение в Astro»,
«зеркала только для чтения» выведены из оборота.

**Регламент очистки (история = файлы с метками времени):** перед каждым коммитом —
`node scripts/clean-dictionaries.js`: тупиковые файлы уходят в
`data/dictionaries/archive/` (или удаляются с `--delete`); защищаются и не
трогаются файлы с метками времени (`warunits-draft3-*`, `memorial_objects-*`),
`plates_*.json` и `docs/`.

## 4. Роли репозиториев — окончательная карта

| Репозиторий | Роль |
|---|---|
| `fallen-cards` | сырой слой: парсер, CSV схемы v03, реестр, объекты перешейка (TASK-0010); поставщик карточек с **ключами** в frontmatter |
| `mem-2026-soursecraft-site` (Astro 5.1.5, main-qwen3) | производственный слой: словари, логика раскрытия ключей, SCHEMA карточки, сборка статики, прод |
| `memorial-korpech-crimea` (qwen3-memorial) | архив, донор идей и ранних плит (plates_korpech_59.json) |
| `mem-ok-s-admin` | OG-представления карточек на тех же ключах |

Формулировки «копии репозиториев», «синхронизация репозиториев», «владелец Astro»
в значении ролей — выведены из оборота; роли определяются таблицей выше.

## 5. Схема имён карточек — зафиксировано

- Папка: `data/cards/`.
- Файл: `<источник>-<document_id>.md`, источники `obd` и `pmn`
  (префикс источника обязателен).
- Slug: `bitva-za-krym-1942-<источник>-<document_id>` — источник в slug,
  потому что пространства id у obd и pmn разные и не должны пересекаться в URL.
- ФИО — только в `title` и H1; slug детерминированный, без ФИО.
- Визуальные тесты (просмотр карточки в Astro dev + превью OG в контуре
  mem-ok-s-admin) входят в приёмку TASK-0014 до выгрузки на прод.

## 6. Данные и координаты выходных файлов

- CSV парсера: схема v03, 24 колонки — `docs/CSV_SCHEMA.md`; UTF-8 без BOM.
- Реестр обработанных: `data/summary/processed_ids.txt` (обновляется строго
  после записи CSV).
- Результаты прогонов: `data/processed/<имя>/` — `<имя>-fallen.csv`,
  `<имя>-unclassified.csv`, `<имя>-error.csv`, `<имя>-repeats.txt`.
- Карточки с ключами (после TASK-0014): `data/cards/<obd|pmn>-<document_id>.md`.
- Словарь warunit (WARUNITS_DICT v2, регламент — §3 и `docs/WARUNITS-DICT.md`):
  переписи прогонов — атомарные пары
  `warunits-draft3-<YYYY-MM-DD_HHMM>[-SS].json/.md`
  (`scripts/build-warunits-dict.js`; метка одна на прогон, `-SS` при коллизии,
  перезапись запрещена). В текущем workspace исторические пары лежат в
  `data/dictionaries/` (0424, 0425); писатель скрипта направлен на
  `data/dictionaries/proposals/`. Активный словарь —
  `data/dictionaries/warunits-fallen-cards.md`
  (`scripts/build-warunits-table.js`).
- Объекты захоронений (TASK-0010/0020):
  `data/dictionaries/memorial_objects/memorial_objects-<YYYY-MM-DD_HHMM>[-SS].csv`
  и `memorial_objects-errors-<та же метка>.csv` (`tools/obd-edge-objects.js`;
  18 канонических колонок; перезапись запрещена). Прогоны оператора с их
  метками живут в его рабочем окружении.
- Очистка тупиков перед коммитом: `node scripts/clean-dictionaries.js` →
  `data/dictionaries/archive/deprecated-<метка>-<файл>` (или удаление с
  `--delete`); защищаются файлы с метками времени, `plates_*.json`, `docs/`.
