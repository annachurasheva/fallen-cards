## 📋 РЕГЛАМЕНТ ТЕСТИРОВАНИЯ generate-cards.js v2.1

### ✅ Анализ текущего прогона

```
Файл: tulumchak_2026-10-13_01-fallen.csv
Всего записей: 283
С ключом: 32 (11.3%)
Без ключа (null): 249 (88.7%)
Уникальных warunit без ключа: 62
```

Интерпретация:Результат ожидаемый для нового CSV. 62 уникальных нераспознанных warunit — это материал для пополнения словаря (после валидации оператором). Сумма 32 + 249 = 281 ≠ 283 — вероятно, 2 записи имеют пустой warunit (source: empty), что корректно.

---

### 🔬 ЭТАП 1. Проверка формата имён (A4)

Цель:Убедиться, что имена файлов соответствуют архитектуре.

Команда (без --dry-run):

```powershell
node scripts/generate-cards.js --input=data\processed\tulumchak_2026-10-13_01\tulumchak_2026-10-13_01-fallen.csv
```

Проверка:

```powershell
# Посмотреть первые 5 файлов
dir data\cards\ | Select-Object -First 5
```

Ожидаемый результат:

```
obd-505713055.md
obd-506135886.md
obd-506161332.md
...
```

НЕ должно быть:

```
❌ person-505713055.md
❌ data/cards/Республика Крым/obd-505713055.md
```

---

### 🔬 ЭТАП 2. Проверка содержимого карточки

Команда:

```powershell
Get-Content data\cards\obd-505713055.md -Head 30
```

Чек-лист frontmatter:

- `slug: "bitva-za-krym-1942-obd-505713055"`(A4)
- `unit_key: "039-00-fallen-cards"`(или null)
- `unit_raw: "39 тбр"`(дословно из ЦАМО, без изменений!)
- `source: "obd"`
- Все остальные поля — как в CSV

Критическая проверка (§1.5):

```powershell
# unit_raw должен быть ТОЧНО как в CSV, без toLowerCase/trim
Select-String "unit_raw:" data\cards\obd-505713055.md
```

Ожидаемо:`unit_raw: "39 тбр"`(с пробелами, регистром как в CSV)

---

### 🔬 ЭТАП 3. Проверка защиты slug

Команда (повторный прогон):

```powershell
node scripts/generate-cards.js --input=data\processed\tulumchak_2026-10-13_01\tulumchak_2026-10-13_01-fallen.csv
```

Ожидаемый вывод:

```
📊 Статистика прогона:
   Всего записей: 283
   Создано/перезаписано карточек: 0
   Пропущено (уже существуют): 283

💡 Защита slug: 283 карточек не перезаписаны.
   Для перезаписи: --force-overwrite
```

---

### 🔬 ЭТАП 4. Проверка --force-overwrite

Команда:

```powershell
node scripts/generate-cards.js --input=data\processed\tulumchak_2026-10-13_01\tulumchak_2026-10-13_01-fallen.csv --force-overwrite
```

Ожидаемый вывод:

```
📊 Статистика прогона:
   Всего записей: 283
   Создано/перезаписано карточек: 283
   Пропущено (уже существуют): 0
```

⚠️Внимание:После этого все 283 карточки перезаписаны. Для проверки целостности — сверить md5sum до и после.

---

### 🔬 ЭТАП 5. Проверка фильтрации по ключу (--unit-key)

Команда:

```powershell
node scripts/generate-cards.js --input=data\processed\tulumchak_2026-10-13_01\tulumchak_2026-10-13_01-fallen.csv --unit-key=039-00-fallen-cards --dry-run
```

Ожидаемый вывод:

```
🔍 Фильтрация по ключу: 039-00-fallen-cards
   Варианты: скф 44 А 39 тбр, 39 тбр

📊 Статистика прогона:
   Всего записей: 283
   Создано/перезаписано карточек: ~3 (только с warunit = "39 тбр" или "скф 44 А 39 тбр")
```

Проверка:

```powershell
# Посмотреть, какие warunit попали под фильтр
node scripts/generate-cards.js --input=data\processed\tulumchak_2026-10-13_01\tulumchak_2026-10-13_01-fallen.csv --unit-key=039-00-fallen-cards --dry-run
```

---

### 🔬 ЭТАП 6. Проверка --burial-ob-<id>

Команда:

```powershell
node scripts/generate-cards.js --input=data\processed\tulumchak_2026-10-13_01\tulumchak_2026-10-13_01-fallen.csv --burial-ob-1158561679 --dry-run
```

Ожидаемый вывод:

```
📍 Режим: burial object key
   ID объекта: 1158561679
   Все карточки получат burial_object_key: "1158561679"
   Пометка: ВРЕМЕННОЕ РЕШЕНИЕ

📊 Статистика прогона:
   Всего записей: 283
   Создано/перезаписано карточек: 283 (DRY-RUN)

📍 Burial object key:
   ID объекта: 1158561679
   Карточек с burial_object_key: 283
   Пометка: ВРЕМЕННОЕ РЕШЕНИЕ
```

Реальный прогон (для проверки frontmatter):

```powershell
node scripts/generate-cards.js --input=data\processed\tulumchak_2026-10-13_01\tulumchak_2026-10-13_01-fallen.csv --burial-ob-1158561679 --force-overwrite
```

Проверка frontmatter:

```powershell
Select-String "burial_object" data\cards\obd-505713055.md
```

Ожидаемо:

```
burial_object_key: "1158561679"
burial_object_note: "ВРЕМЕННОЕ РЕШЕНИЕ"
```

---

### 🔬 ЭТАП 7. Проверка журнала кандидатов

Команда:

```powershell
node scripts/generate-cards.js --input=data\processed\tulumchak_2026-10-13_01\tulumchak_2026-10-13_01-fallen.csv --force-overwrite
```

Проверка:

```powershell
Get-Content data\dictionaries\proposals\unknown-pending.json | Select-Object -First 30
```

Ожидаемая структура:

```json
{
  "warunit": {
    "скф 47 А 47 оро": {
      "count": 5,
      "document_ids": ["551263650", "551263641", "..."]
    },
    "отд 76 мм ад": {
      "count": 1,
      "document_ids": ["506161332"]
    }
  },
  "generated_at": "2026-10-13T..."
}
```

---

### 🔬 ЭТАП 8. Контрольная сумма (целостность данных)

Перед прогоном:

```powershell
# Сохранить хеш первого файла
Get-FileHash data\cards\obd-505713055.md -Algorithm SHA256
```

После прогона без --force-overwrite:

```powershell
# Хеш НЕ должен измениться
Get-FileHash data\cards\obd-505713055.md -Algorithm SHA256
```

---

### 📊 СВОДНАЯ ТАБЛИЦА ТЕСТИРОВАНИЯ

| №   | Тест                | Команда                     | Ожидаемый результат             | Статус |
| --- | ------------------- | --------------------------- | ------------------------------- | ------ |
| 1   | Формат имён (A4)    | --input=... --dry-run + dir | obd-<id>.md                     | ⬜     |
| 2   | Содержимое карточки | Get-Content                 | slug, unit_key, unit_raw        | ⬜     |
| 3   | Защита slug         | Повторный прогон            | skipped: 283                    | ⬜     |
| 4   | --force-overwrite   | С флагом                    | Перезапись 283                  | ⬜     |
| 5   | --unit-key          | С фильтром                  | Только сослуживцы               | ⬜     |
| 6   | --burial-ob-<id>    | С ID                        | burial_object_key в frontmatter | ⬜     |
| 7   | Журнал кандидатов   | Проверка JSON               | unknown-pending.json            | ⬜     |
| 8   | Целостность данных  | Get-FileHash                | Хеш не меняется                 | ⬜     |

---

### 🚨 КРИТИЧЕСКИЕ ПРОВЕРКИ (§1.5, §5.1)

1. Никаких нормализаций:

```powershell
# Найти все unit_raw и проверить, что они ТОЧНО как в CSV
Select-String "unit_raw:" data\cards\*.md | Select-Object -First 10
```

2. Точное совпадение (без toLowerCase):

```powershell
# Если в CSV "СКФ 77 гсд" — в карточке должно быть ТОЧНО "СКФ 77 гсд"
# НЕ "скф 77 гсд", НЕ "скф 77 гсд " (с пробелом)
```

3. Нет совпадения → null:

```powershell
# Карточки с unit_key: null должны иметь unit_raw (дословно из ЦАМО)
Select-String "unit_key: """ data\cards\*.md | Select-Object -First 5
```

---

### 📝 ПОСЛЕ ТЕСТИРОВАНИЯ

Если все тесты пройдены:

1. Зафиксировать результаты в чате
2. Коммит:`feat: integrate warunits JSON dictionary and slug protection`
3. Сообщить hash в канал Б

Если есть расхождения:

1. Зафиксировать конкретные отклонения
2. Пример: "Ожидалось X, получено Y"
3. Кодер исправит и повторит прогон

---

Кодер на связи. Готов к исправлениям по результатам тестов.

Составлен регламент тестирования из 8 этапов: проверка формата имён (A4), содержимого карточки, защиты slug, --force-overwrite, --unit-key, --burial-ob-<id>, журнала кандидатов и целостности данных. Включена сводная таблица и критические проверки §1.5 (никаких нормализаций, точное совпадение по знакам).
