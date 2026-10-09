Code Tool Record:`str_replace_editor create`+`str_replace ×3`,`bash mv/node --check/эмуляция приёмки`— изменён только`/workspace/tools/obd-edge-objects.js`(+177/−91); парсеры персон, run-edge-obd.ps1, скрипты и словари не тронуты; без push.

Шесть правок — выполнены:

1. Выход:`OUT_DIR = <корень>/data/dictionaries/memorial_objects`(`fs.mkdirSync(..., {recursive:true})`),`OUT_CSV = 'memorial_objects.csv'`; старые`__dirname`-файлы (obyekty_zahoroneniya_VOV.\*, session/errors log) убраны.
2. Колонки:ровно 18 в каноническом порядке п.2 (проверено скриптом:`HEADERS_18_CANONICAL_OK`).
3. Добыча:добавлен`primary_burial_object: getParamValue('Первичное место захоронения')`;`Дата`= дата съёма`YYYY-MM-DD`;`document_id`— из поля страницы (`getParamValue('ID')`→ fallback`/ID:\s*(\d+)/`по тексту карточки),`href.match`как источник ID удалён; после съёма сверка хвоста URL ↔ document_id, при несовпадении строка уходит в ошибки с обоими значениями (`ID mismatch: field="…" url="…"`).
4. Рандом:Fisher–Yates перемешивание URL перед прогоном (mulberry32, seed = Date.now(), seed печатается в итоге); задержки 3–15 с сохранены; каждые случайные 8–12 запросов — пауза 20–40 с; UA выбирается случайно из 4 литеральных строк на каждый запрос.
5. Компактный консоль:`[i/N] id=<id> OK`/`[i/N] <url> ERR <причина>`; эмодзи в файле нет (проверка Unicode-диапазонов:`NO_EMOJI_OK`); итоговый блок seed/ok/err/путь/ошибки; дуплекс-ошибки в`memorial_objects-errors.csv`(url, reason, date). Для N=2 максимум N+6 строк (расчётно 7 ≤ 8).
6. Сериализация:`escapeCsv(null|undefined) → ''`, BOM и заголовок сохранены.

По ходу обнаружено и исправлено (важно):HEAD-версия файла была неработоспособна в этом репозитории —`package.json`содержит`"type": "module"`, а файл использовал`require`, плюс пакет`puppeteer`не установлен (есть`puppeteer-core@24`). Файл переведён на ESM-импорты (`import puppeteer from 'puppeteer-core'`,`__dirname`через`fileURLToPath`) — иначе ни одна правка не запускалась бы вовсе.

Верификация:`node --check`OK; живой`--dry-run`корректно падает до цикла на недоступном CDP (браузера в среде нет — полный сетевой прогон на 33118331/1167839469 здесь невозможен); evaluate-колбэк исполнен на mock-DOM:`document_id=1167839469`из fallback-регекса, совпадает с хвостом URL. Литералы «хорошее» и «Администрация Батальненского…» физически относятся к другим полям карточки (`burial_state`,`sponsor`) — формулировка критерия об их одновременном присутствии в`rebural_from`и`primary_burial_object`противоречит структуре карточки OBD; реализовано строго по п.3 (прямой съём полей), содержимое колонок = что на странице.

Файл tools/obd-edge-objects.js в рабочем дереве — актуальный, все 6 правок на месте (проверено: node --check OK, эмодзи отсутствуют, 345 строк). Отдаю полный файл согласно регламенту:
Code Tool Record: str_replace_editor view /workspace/tools/obd-edge-objects.js + bash node --check (SYNTAX_OK, NO_EMOJI_OK) — отдача без изменений, без push.
