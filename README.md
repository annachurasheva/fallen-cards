# Fallen Cards — Парсер карточек павших солдат

## Что это за проект

Инструмент для автоматической генерации карточек павших солдат из источников:
- OBD Memorial (obd-memorial.ru) — основной источник
- CSV файлы с ручным вводом
- Другие архивы (pamyat-naroda.ru, podvignaroda.ru) — в будущем

**Связь с другими проектами:**
- Карточки публикуются в мемориальный блог: [mem-2026-soursecraft-site](https://github.com/annachurasheva/mem-2026-soursecraft-site)
- RSS-лента блога настроена для Дзен (требования см. в `docs/DZEN_RSS.md` блога)
- Комбайн для ручного ввода постов: [mdx-combine](https://github.com/annachurasheva/mdx-combine)

## Архитектура

Проект разделён на независимые модули:

```
src/
├─ parsers/              # Извлечение данных из источников
│  ├─ csv-reader.js      # Парсер CSV файлов
│  └─ obd-memorial/      # Парсер OBD Memorial (Puppeteer)
│
├─ normalizers/          # Нормализация сырых данных
│  ├─ person.js          # ФИО, даты, места
│  ├─ military-unit.js   # Воинские части (шифрограмма → полное название)
│  ├─ rank.js            # Звания
│  └─ location.js        # География (места рождения, захоронения)
│
├─ validators/           # Проверка качества данных
│  ├─ completeness.js    # Все ли поля заполнены
│  ├─ military-unit.js   # Валидность unit_id
│  └─ dates.js           # Корректность дат
│
├─ generators/           # Генерация выходных форматов
│  ├─ markdown-card.js   # Markdown для Astro блога
│  └─ json-card.js       # JSON для API
│
└─ pipelines/            # Оркестрация процессов
   ├─ csv-to-markdown.js # Полный цикл: CSV → нормализация → валидация → markdown
   └─ obd-to-markdown.js # Полный цикл: OBD → парсинг → нормализация → валидация → markdown
```

**Принцип разделения задач:**
- Каждый модуль делает **одну** задачу
- Модули не зависят друг от друга (можно тестировать отдельно)
- Пайплайны собирают модули в полные процессы

## Текущий статус (октябрь 2026)

**Сделано:**
- ✅ Структура репозитория
- ✅ Заглушки всех модулей
- ✅ Логика парсера OBD Memorial в `obd-edge_v03.js` (перенести в `src/parsers/obd-memorial/`)
- ✅ Логика генерации из CSV в `csv-to-fallen.mjs` (перенести в `src/pipelines/csv-to-markdown.js`)

**Не сделано:**
- ❌ Перенос кода из старых скриптов в модули
- ❌ Словари нормализации (units_dict.json, ranks_dict.json)
- ❌ Тесты для модулей
- ❌ CLI команды (scripts/*.js)

## Точки входа для нового ИИ

### Если нужно продолжить разработку:

1. **Прочитать старые скрипты:**
   - `obd-edge_v03.js` — логика парсера OBD Memorial
   - `csv-to-fallen.mjs` — логика генерации из CSV (в репозитории `memorial-korpech-crimea`, ветка `qwen3-memorial`)

2. **Перенести код в модули:**
   - Парсинг → `src/parsers/`
   - Нормализация → `src/normalizers/`
   - Валидация → `src/validators/`
   - Генерация → `src/generators/`

3. **Создать словари:**
   - `data/dictionaries/units_dict.json` — словарь воинских частей
   - `data/dictionaries/ranks_dict.json` — словарь званий

4. **Написать тесты:**
   - Использовать vitest
   - Тестировать каждый модуль отдельно

### Если нужно запустить генерацию:

```bash
# 1. Установить зависимости
npm install

# 2. Парсинг OBD (пока заглушка)
node scripts/parse-obd.js

# 3. Нормализация
node scripts/normalize.js --input=data/input/raw.csv --output=data/processed/normalized.json

# 4. Валидация
node scripts/validate.js --input=data/processed/normalized.json

# 5. Генерация карточек
node scripts/generate-cards.js --input=data/processed/normalized.json --output=data/output/
```

## Структура данных карточки

Целевой формат YAML frontmatter:

```yaml
---
id: "123456"
slug: "ivanov-ivan-ivanovich-1920"
status: "draft"

person:
  last_name: "Иванов"
  first_name: "Иван"
  middle_name: "Иванович"
  birth:
    date: "1920-05-15"
    location: "д. Петрово, Московская обл."
  death:
    date: "1942-03-12"
    cause: "убит в бою"

service:
  rank: "красноармеец"
  unit:
    raw: "398 сд 821 сп"
    normalized: "398-я стрелковая дивизия, 821-й стрелковый полк"
    id: "unit-398-sd-821-sp"
  conscription:
    location: "Московский РВК"

burial:
  primary:
    location: "с. Корпечь, Крым"
  current:
    location: "Братская могила, с. Фронтовое"

sources:
  - type: "ОБД Мемориал"
    url: "https://obd-memorial.ru/..."
---
```

## Инструменты разработки

### Запуск Edge для парсинга OBD Memorial

Перед парсингом нужно запустить Edge с remote debugging:

**Windows (PowerShell):**
```powershell
.\tools\run-edge-obd.ps1
```
## Контроль входа (два гейта)

| Гейт | Команда | Что проверяет | Когда запускать |
|---|---|---|---|
| 1. URL-листы | `node scripts/check-input.js` | дубли URL внутри файла, уже обработанные (журнал файла + глобальный), сколько новых | перед `parse-obd` |
| 2. CSV карточек | `node scripts/check-csv.js` | дубли document_id, дубли персон (ФИО+дата), уже сгенерированные карточки | перед `generate-cards` |

Оба гейта только печатают отчёт и ничего не пишут. Дубли персон ловим здесь, а не в Astro: дубль → одинаковый slug → падение сборки блога («Duplicate post slugs»).

## Контрольные точки

- **Коммиты старых скриптов:**
  - `obd-edge_v03.js`: https://github.com/annachurasheva/puppeteer-project/blob/main/obd-edge_v03.js
  - `csv-to-fallen.mjs`: https://github.com/annachurasheva/memorial-korpech-crimea/blob/qwen3-memorial/scripts/csv-to-fallen.mjs

- **Документация требований Дзен:**
  - https://github.com/annachurasheva/mem-2026-soursecraft-site/blob/main-qwen3/docs/DZEN_RSS.md
  
## Контрольные точки

### v0.1.0 — Начальная структура (commit 6f66d32)
- Создана архитектура с заглушками
- Все модули пустые, логика не реализована

### v0.2.0 — Парсер OBD (commit ???)
- Перенесена логика из obd-edge_v03.js
- Подключение к Edge на порту 9226
- Базовое извлечение полей работает

### v0.3.0 — Нормализация (commit ???)
- Словари units_dict.json, ranks_dict.json
- Нормализация воинских частей
- Валидация данных  

## Приоритеты разработки

1. **Перенос парсера OBD** из `obd-edge_v03.js` в `src/parsers/obd-memorial/`
2. **Создание словарей** для нормализации воинских частей
3. **Написание тестов** для нормализаторов
4. **Интеграция с блогом** (копирование .md в `src/content/posts/` блога)

## Контакты

Проект ведёт Anna Churasheva. По вопросам архитектуры — обращаться через GitHub Issues.