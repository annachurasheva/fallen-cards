# 📋 РЕГЛАМЕНТ ТЕСТИРОВАНИЯ generate-cards.js v3.0

> **ПЕРЕИЗДАНИЕ** регламента `docs/TASK-0022-2-test-generate-cards-js.md`
> под версию 3.0 (рефакторинг frontmatter по образцу `new-csv-to-markdown.mjs`).
> Старый регламент описывал v2.1 и более не актуален.

## Что изменилось в v3.0

| Аспект | v2.1 (старое) | v3.0 (новое) |
|---|---|---|
| Frontmatter | много полей (`document_id`, `unit_raw`, ключи мест/захоронений…) | `title`, `slug`, `unit_key` (массив) |
| Slug | `bitva-za-krym-1942-<источник>-<document_id>` | `bitva-za-krym-1942-<транслит ФИО>-<document_id>` |
| `unit_key` | строка или `null` | **массив** (зеркалит JSON-SCHEMA) |
| Нет unit_key | карточка создавалась с `unit_key: null` | **карточка НЕ создаётся** |
| «Воинская часть» | сырой `warunit` | `unit_key` |
| `cause_of_death` | выводился | **не выводится** |
| «Погиб» | выводился | **убрано** (сайт — памяти павших) |
| `--unit-key` | один ключ | **несколько** (вариант А) |
| Валидация `--input=` | нет (молча брался корень) | ошибка при пустом/несуществующем |
| Реестр slug | не было | `data/summary/slug_registry.txt` (заморозка) |

---

## Этап 1. Валидация аргументов (баг из note.txt)

**1.1. `--input=` без значения → ошибка**
```powershell
node scripts/generate-cards.js --input= --dry-run
```
Ожидаемо:
```
❌ Ошибка: --input= указан без значения (возможно, после = лишний пробел).
```

**1.2. `--input=` с пробелом → ошибка**
```powershell
node scripts/generate-cards.js --input= data\processed\83_bmp_2026-10-17_urls --dry-run
```
Ожидаемо: та же ошибка (аргумент распознан как `--input=`).

**1.3. Несуществующий путь → ошибка**
```powershell
node scripts/generate-cards.js --input=data\processed\no_such_dir --dry-run
```
Ожидаемо:
```
❌ Путь не найден: <абсолютный путь>
```

**1.4. `--unit-key=` без значения → ошибка**
```powershell
node scripts/generate-cards.js --input=data\processed\... --unit-key= --dry-run
```
Ожидаемо:
```
❌ Ошибка: --unit-key= указан без значения
```

**1.5. Корректный вызов — печать входа**
```powershell
node scripts/generate-cards.js --input=data\processed\83_bmp_2026-10-17_urls\83_bmp_2026-10-17_urls-fallen.csv --dry-run
```
Ожидаемо:
```
📂 Вход: файл <абсолютный путь>
   CSV файлов: 1
```

---

## Этап 2. Группа ключей `--unit-key` (вариант А)

**2.1. Один ключ**
```powershell
node scripts/generate-cards.js --input=data\processed\...\file-fallen.csv --unit-key=083-04-fallen-cards --dry-run
```
Ожидаемо: фильтрация по ключу, варианты `скф 57 арт. д-н 83 мсб`.

**2.2. Несколько ключей (404-я дивизия)**
```powershell
node scripts/generate-cards.js --input=data\processed\...\file-fallen.csv --unit-key=404-00-fallen-cards --unit-key=404-01-fallen-cards --unit-key=404-02-fallen-cards --dry-run
```
Ожидаемо:
```
🔍 Фильтрация по ключам: 404-00-fallen-cards, 404-01-fallen-cards, 404-02-fallen-cards
```

**2.3. Несуществующий ключ → ошибка**
```powershell
node scripts/generate-cards.js --input=... --unit-key=999-99-fallen-cards --dry-run
```
Ожидаемо:
```
❌ Ключ не найден в словаре: 999-99-fallen-cards
```

---

## Этап 3. Правило «нет unit-key → нет генерации»

**3.1. Прогон файла с нераспознанными warunit**
```powershell
node scripts/generate-cards.js --input=data\processed\tulumchak_2026-10-13_01\tulumchak_2026-10-13_01-fallen.csv --dry-run
```
Ожидаемо:
```
📊 Статистика прогона:
   Всего записей: 283
   С unit_key (кандидаты на генерацию): 32
   Без unit_key (пропущено): 249
   Создано/перезаписано карточек: 32 (DRY-RUN)
```

**3.2. Журнал кандидатов (реальный прогон)**
```powershell
node scripts/generate-cards.js --input=data\processed\tulumchak_2026-10-13_01\tulumchak_2026-10-13_01-fallen.csv
```
Ожидаемо: `data/dictionaries/proposals/unknown-pending.json` с нераспознанными warunit.

---

## Этап 4. Frontmatter и slug

**4.1. Реальный прогон одного файла**
```powershell
node scripts/generate-cards.js --input=data\processed\tulumchak_2026-10-13_01\tulumchak_2026-10-13_01-fallen.csv
```

**4.2. Проверка карточки**
```powershell
Get-Content data\cards\obd-505713055.md -Head 20
```
Ожидаемо:
```yaml
---
title: "Фамилия Имя Отчество"
slug: "bitva-za-krym-1942-<транслит ФИО>-505713055"
unit_key:
  - "039-00-fallen-cards"
---
# Фамилия Имя Отчество

**Звание** ...
**Воинская часть** — 039-00-fallen-cards
...
```

**4.3. Проверка: нет `unit_raw`, нет `cause_of_death`, нет «Погиб»**
```powershell
Select-String "unit_raw|cause_of_death|Погиб" data\cards\obd-505713055.md
```
Ожидаемо: пусто.

---

## Этап 5. Реестр slug

**5.1. После реального прогона**
```powershell
Get-Content data\summary\slug_registry.txt -Head 10
```
Ожидаемо:
```
# document_id	slug	unit_key
505713055	bitva-za-krym-1942-<транслит>-505713055	039-00-fallen-cards
```

**5.2. Заморозка slug (повторный прогон)**
```powershell
node scripts/generate-cards.js --input=... --force-overwrite
```
Ожидаемо: slug в карточке **не изменился** (совпадает с реестром).

**5.3. `--dry-run` не обновляет реестр**
```powershell
node scripts/generate-cards.js --input=... --dry-run
```
Ожидаемо: реестр не изменился (размер тот же).

---

## Этап 6. Защита slug (повторный прогон без `--force-overwrite`)

```powershell
node scripts/generate-cards.js --input=...
```
Ожидаемо:
```
Создано/перезаписано карточек: 0
Пропущено (уже существуют): N
💡 Защита slug: N карточек не перезаписаны.
```

---

## Этап 7. `--burial-ob-<id>` (режим не сломан)

```powershell
node scripts/generate-cards.js --input=... --burial-ob-1158561679 --dry-run
```
Ожидаемо: в frontmatter появляются `burial_object_key` и `burial_object_note` перед `unit_key`.

---

## Этап 8. Целостность данных

```powershell
Get-FileHash data\cards\obd-505713055.md -Algorithm SHA256
```
После повторного прогона без `--force-overwrite` хеш **не должен измениться**.

---

## Сводная таблица

| № | Тест | Команда | Ожидаемый результат | Статус |
|---|---|---|---|---|
| 1.1 | `--input=` пусто | `--input= --dry-run` | Ошибка | ⬜ |
| 1.2 | `--input=` с пробелом | `--input= data\...` | Ошибка | ⬜ |
| 1.3 | Путь не найден | `--input=no_such` | Ошибка | ⬜ |
| 1.4 | `--unit-key=` пусто | `--unit-key= --dry-run` | Ошибка | ⬜ |
| 1.5 | Корректный вход | файл + `--dry-run` | Печать входа | ⬜ |
| 2.1 | Один ключ | `--unit-key=083-04...` | Фильтрация | ⬜ |
| 2.2 | Группа ключей | 3× `--unit-key=404-...` | Фильтрация по группе | ⬜ |
| 2.3 | Несуществующий ключ | `--unit-key=999-...` | Ошибка | ⬜ |
| 3.1 | Нет unit-key | `--dry-run` | Пропуск, счётчик | ⬜ |
| 3.2 | Журнал кандидатов | реальный прогон | `unknown-pending.json` | ⬜ |
| 4.1 | Frontmatter | `Get-Content` | title/slug/unit_key-массив | ⬜ |
| 4.2 | Нет unit_raw/cause/Погиб | `Select-String` | Пусто | ⬜ |
| 5.1 | Реестр slug | `Get-Content` | id→slug→unit_key | ⬜ |
| 5.2 | Заморозка slug | повторный прогон | slug не меняется | ⬜ |
| 5.3 | dry-run не пишет | `--dry-run` | реестр не меняется | ⬜ |
| 6 | Защита slug | повторный прогон | skipped: N | ⬜ |
| 7 | burial-ob | `--burial-ob-...` | burial_object_key | ⬜ |
| 8 | Целостность | `Get-FileHash` | хеш не меняется | ⬜ |
