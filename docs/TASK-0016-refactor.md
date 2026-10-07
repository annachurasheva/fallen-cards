Вы правы — 7-8 итераций на одном файле это тупик. Делаем новый файл с чистой схемой под задачу fallen-cards.

---

## 1. Новый файл: `unit_keys.json`

**Имя:** `data/dictionaries/unit_keys.json` (не `units_registry.json` — это архивное наследие).

**Схема:**

```json
{
  "_operator_note": {
    "purpose": "Реестр ключей воинских частей для fallen-cards. Назначение ключей — здесь; раскрытие в полные значения — в Astro-репо.",
    "required_fields": ["dict_keys", "type", "number", "parent"],
    "optional_fields": ["history_note"],
    "workflow": "1. Добавить dict_keys (все написания из CSV). 2. Указать type (полк/дивизия/фронт/ап/тбр/обс). 3. Указать number (число или null для фронтов). 4. Указать parent (ключ родителя: для полка — дивизия, для дивизии — фронт, null для фронтов). 5. history_note — опционально (краткая справка).",
    "boundary": "Этот файл — только для назначения ключей в fallen-cards. Поля children/camo_url/formation/disband/status_note/reference_url НЕ используются здесь — они принадлежат Astro-репо для раскрытия."
  },
  "unit-skf-front": {
    "dict_keys": ["СКФ"],
    "type": "фронт",
    "number": null,
    "parent": null,
    "history_note": "Северо-Кавказский фронт. Период в действующей армии: 01.11.1941 — 30.09.1942"
  },
  "unit-krymf-front": {
    "dict_keys": ["КрымФ"],
    "type": "фронт",
    "number": null,
    "parent": null,
    "history_note": "Крымский фронт. Период в действующей армии: 03.01.1942 — 13.08.1942"
  },
  "unit-398-sd": {
    "dict_keys": ["СКФ 398 сд", "скф 398 сд"],
    "type": "дивизия",
    "number": 398,
    "parent": "unit-skf-front"
  },
  "unit-404-sd": {
    "dict_keys": ["404 сд", "скф 404 сд 44 А", "СКФ 404 сд 44 А"],
    "type": "дивизия",
    "number": 404,
    "parent": "unit-krymf-front",
    "history_note": "Уничтожена в майском разгроме Керчи (операция «Охота на дроф», 8–20.05.1942)"
  },
  "unit-826-sp": {
    "dict_keys": [
      "СКФ 826 сп 398 сд",
      "скф 398 сд 826 сп",
      "скф 826 полк 398 див.",
      "скф 826 сп 398 див."
    ],
    "type": "полк",
    "number": 826,
    "parent": "unit-398-sd",
    "history_note": "Период в действующей армии: 23.11.1941 — 19.05.1942"
  },
  "unit-643-sp": {
    "dict_keys": ["643 сп 404 сд", "СКФ 643 сп 404 сд"],
    "type": "полк",
    "number": 643,
    "parent": "unit-404-sd"
  }
}
```

**Что убрано из архивного мусора:**

- `children` — не используется в fallen-cards
- `camo_url` — не используется (раскрытие в Astro)
- `formation` / `disband` — не используется
- `status_note` — не используется
- `reference_url` — не используется
- `version` — не нужно (внутренний формат)

---

## 2. Промпт Дельте

> **Контекст:** fallen-cards, база текущий HEAD. Рефакторинг словаря воинских частей: уход от архивного наследия `units_registry.json` к новому `unit_keys.json` с чистой схемой под задачу fallen-cards (назначение ключей, без мусора).
>
> **1. Создать `data/dictionaries/unit_keys.json`** со структурой из примера выше. Мигрировать ВСЕ существующие записи из `units_registry.json`, но только поля: `dict_keys`, `type`, `number`, `parent`, `history_note` (если есть). Все остальные поля (children, camo_url, formation, disband, status_note, reference_url) — отбросить.
>
> **2. Обновить `scripts/generate-cards.js`** — заменить чтение `units_registry.json` на `unit_keys.json`. Структура файла проще: `{_operator_note: {...}, unit-key-1: {...}, unit-key-2: {...}}` — без вложенного `units`. Найти все места где читается `unitsRegistryRaw.units || unitsRegistryRaw` и заменить на прямое чтение `unitKeysRaw` (без `.units`).
>
> **3. Обновить `scripts/units-report.js`** — то же: заменить `units_registry.json` на `unit_keys.json`, убрать обработку вложенного `.units`.
>
> **4. Обновить документацию:**
>
> - `data/dictionaries/README.md` — заменить упоминания `units_registry.json` на `unit_keys.json`, описать новую схему (dict_keys/type/number/parent + опциональный history_note), убрать архивные поля из описания.
> - `docs/ARCHITECTURE.md` — то же.
> - `docs/TASK-0014.md` — то же.
>
> **5. Удалить `data/dictionaries/units_registry.json`** — архивное наследие больше не нужно.
>
> **Критерий приёмки:** после применения `node scripts/units-report.js` и `node scripts/generate-cards.js --dry-run` работают без ошибок, используя новый файл. Все существующие ключи (unit-826-sp, unit-398-sd, unit-404-sd, unit-643-sp, unit-skf-front, unit-krymf-front) присутствуют в unit_keys.json с правильными dict_keys/type/number/parent.
>
> **Запрещено:** трогать логику назначения ключей (assignUnitKey), парсер CSV, остальные словари.
>
> **Тег:** `refactor: dictionaries — unit_keys.json (новая схема, без архивного мусора)`

---

## 3. Порядок

1. Отправляете промпт Дельте.
2. Она применяет рефакторинг, отдаёт Code Tool Record.
3. Вы применяете файлы, коммитите с тегом выше.
4. Push в оба зеркала.
5. Перезапуск `node scripts/units-report.js` — сверка, что все ключи на месте.
6. Дальше — пополнение словаря по отчёту units-report (TASK-0015 и далее).

Новое имя, новая схема, чистый старт. Архивный мусор остаётся в истории Git, но не тащится в рабочее пространство.

Отправляйте промпт.

---
