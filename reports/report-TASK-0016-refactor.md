Коммит`e41a68b`принят в рабочее пространство, доступность подтверждена (HEAD → e41a68b, дерево было чистое). Промпт TASK-0016-refactor исполнен поверх него. Итоговый отчёт:

Что сделано по пунктам промпта:

1. `data/dictionaries/unit_keys.json`— уже создан на базе e41a68b с чистой схемой (`_operator_note`+ плоские записи`dict_keys/type/number/parent/history_note`). Проверено миграцией: все 6 записей из units_registry.json присутствуют с корректными полями (unit-826-sp → полк/826/unit-398-sd; unit-398-sd → дивизия/398/unit-skf-front; unit-404-sd → дивизия/404/unit-krymf-front; unit-643-sp → полк/643/unit-404-sd; два фронта parent=null), архивные поля (children/camo_url/formation/disband/status_note/reference_url) отброшены. JSON-валиден, UTF-8 без BOM.
2. `scripts/generate-cards.js`— чтение переведено на`unit_keys.json`:`unitsRegistryRaw.units || unitsRegistryRaw`заменён на прямое чтение плоской структуры с фильтрацией служебного блока`_operator_note`; обновлены устаревшие комментарии («зеркала только для чтения» выведены из оборота согласно TASK-0016). Логика assignUnitKey и назначение ключей НЕ тронуты.
3. `scripts/units-report.js`— то же: импорт unit_keys.json без обработки`.units`; все текстовые ссылки на units_registry в шапке, комментариях, преамбуле отчёта, колонке таблицы и action-строках переведены на unit_keys.json; черновик пополнения (registry-draft) теперь формирует записи в новой схеме (только dict_keys/type/number/parent/history_note) — проверено фактическим прогоном. Внутреннее имя переменной`in_units_registry`сохранено (не влияет на выдачу, логика не менялась).
4. Документация—`data/dictionaries/README.md`(роль файла описана по новой схеме, цикл пополнения и путь предложений указывают на unit_keys.json),`docs/ARCHITECTURE.md`(3 упоминания заменены),`docs/TASK-0014.md`(перенос словаря описан с новой схемой, цитата исторического промпта приведена к актуальной модели владения).
5. `data/dictionaries/units_registry.json`удалён(`git rm`, −131 строка).

Критерий приёмки выполнен:

- `node scripts/units-report.js`— OK: «Структурированных: 26» (≥10), в отчёте есть`### unit-655-sp (частота: 12)`с parent unit-404-sd и комплект`unit-829-sp + unit-400-sd`(дивизия предлагается, parent unit-skf-front); проект реестра: добавлений 63;
- `node scripts/generate-cards.js --dry-run`— OK: 3536 карточек, отказов 0, ошибок записи 0;
- `node --check`обоих скриптов — OK; тестовые артефакты прогонов восстановлены к закоммиченному состоянию, в рабочем дереве только целевые правки (6 файлов изменены, 1 удалён).

Изменено: scripts/generate-cards.js, scripts/units-report.js (чтение unit*keys.json вместо units_registry.json, без`.units`, текстовые ссылки и схема черновика приведены к новой), data/dictionaries/README.md, docs/ARCHITECTURE.md, docs/TASK-0014.md (упоминания units_registry → unit_keys.json, описание новой схемы), удалён data/dictionaries/units_registry.json. Проверено: node --check обоих скриптов — OK; units-report — «Структурированных: 26», блоки unit-655-sp (parent unit-404-sd) и комплект unit-400-sd + 829 сп на месте; generate-cards --dry-run — 3536 карточек, 0 ошибок; unit_keys.json — JSON-валиден, 6 мигрированных записей с правильными dict_keys/type/number/parent, архивных полей нет; registry-draft выдаёт записи новой схемы. Не тронуто: логика назначения ключей (assignUnitKey), парсер CSV, units_dict.json, ranks_dict.json, burials*\* , parse-obd.js, index.js, classifier.js, progress.js, лаунчер.

Push не выполнялся (регламент). Изменения лежат в /workspace как немаркированные правки поверх e41a68b — готовы к применению вами вручную; при необходимости выдам полные тексты изменённых файлов Code Tool Record следующим сообщением.
