# data/dictionaries — справочные словари для назначения ключей

Координата: `annachurasheva/fallen-cards` · `data/dictionaries/README.md` · 2026-10-07.
Роли репозиториев и модель ключей — `docs/ARCHITECTURE.md`.

## Назначение в этом репозитории

Слой подготовки карточек (TASK-0014) **назначает КЛЮЧИ** (unit / location /
burial / rebural), а не нормализует значения: сырые CSV схемы v03 пишутся
дословно из ЦАМО, раскрытие ключей в полные наименования делает Astro-генератор
по копиям словарей. Значения здесь используются только как основа для
сопоставления и выдачи ключа. Исходные CSV неприкосновенны.

## Роли файлов

- `warunits-fallen-cards.md` — **активный словарь warunit (WARUNITS_DICT v2)**:
  четыре колонки (ключ `<NNN>-fallen-cards`, развёрнутое имя из docs/TEXT или
  «— (оператор)», написания, примечания); собирается
  `scripts/build-warunits-table.js` из draft3-json. Регламент — `docs/WARUNITS-DICT.md`.
- `proposals/warunits-draft3-*.json/.md` — переписи прогонов с автослиянием по
  набору чисел (`scripts/build-warunits-dict.js`); атомарные пары с меткой времени,
  не перезаписываются; нумерация и merge_into — отсюда.
- ~~`units_dict.json`, `unit_keys.json`, `units_registry.json`,
  `unit_hierarchy.json`~~ — **аннулированы**, перемещены в `archive/` скриптом
  `scripts/clean-dictionaries.js`; конвейер их не читает.
- `units_raw_list.csv` — исторический верстак систематизации `warunit` (заменён
  переписью draft3; сохраняется как сырьё).
- `ranks_dict.json` — звания (справка при сверке `rank`).
- `burials_primary.json`, `burials_current.json` — захоронения: первичное
  и текущее; источник ключей `burial-*` для `primary_burial` / `current_burial`.
- `burial-objects.json` — словарь объектов TASK-0010 (Ак-Монайский перешеек),
  включая атрибут «дистанция от Корпечи».
- `plates_korpech_59.json` — плиты Корпечи (донор: `memorial-korpech-crimea`,
  ветка `qwen3-memorial`); признак «на плите» для downstream.
- `locations_dict.json` — **внешний импорт, только чтение**: формируется внешним
  процессом и импортируется готовым файлом — не удалять при наличии. Источник
  ключей `loc-*` (место рождения, призыва, перезахоронения).

Парсер (`scripts/parse-obd.js`) словари НЕ читает и НЕ изменяет.

## Пополнение словарей

Словари `burials_*`, `ranks_dict` — **рабочие инструменты fallen-cards**: они
живут и пополняются **здесь**. Словарь warunit ведётся по регламенту
**WARUNITS_DICT v2** (`docs/WARUNITS-DICT.md`): перепись —
`scripts/build-warunits-dict.js` (атомарные пары
`proposals/warunits-draft3-<метка>.json/.md`, перезапись запрещена), активный
словарь — `data/dictionaries/warunits-fallen-cards.md`
(`scripts/build-warunits-table.js`). Astro-репо
(`mem-2026-soursecraft-site`) получает **копии** словарей и раскрывает ключи при
генерации карточек. `locations_dict.json` — внешний импорт, только чтение.
Формулировки «пополнение в Astro», «зеркала только для чтения» выведены из оборота.

### Регламент очистки (перед каждым коммитом)

`node scripts/clean-dictionaries.js` — тупиковые файлы (аннулированные словари
unit-*, draft1/draft2, прочее без метки времени) переносятся в `archive/` с
префиксом `deprecated-<метка>-` (или удаляются флагом `--delete`). Файлы с метками
времени (`warunits-draft3-*`, `memorial_objects-*`), `plates_*.json` и `docs/`
не трогаются. **История проекта = файлы с метками времени.**

### Прежний цикл units-report (архивная справка)

Прежний цикл «units-report → proposals → решение Анны-Ch → правка
unit_keys/units_dict» выведен из действия вместе с аннулированием этих словарей;
`scripts/units-report.js` остаётся в репозитории как исторический инструмент,
словари unit-* более не поддерживаются.

## Правила форматов JSON

- кодировка UTF-8 без BOM;
- только двойные кавычки;
- запятая после последней пары ключ-значение не ставится;
- проверка синтаксиса перед коммитом (например, jsonlint.com);
- имена полей схемы v03 фиксированы: `rebural_from` — зафиксировано с опечаткой,
  потребители используют именно это имя (`docs/CSV_SCHEMA.md`).
