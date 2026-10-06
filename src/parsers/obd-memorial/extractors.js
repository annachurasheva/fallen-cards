/**
 * extractors.js — извлечение данных со страницы card.html через page.evaluate.
 * Функция сериализуется и выполняется в контексте страницы OBD Memorial.
 *
 * Структура карточки персоны: таблица «Информация о выбытии» и блоки параметров.
 * Реальные имена полей уточняются при первом прогоне (см. docs/TASK-0005.md).
 *
 * ВАРИАНТ Б (TASK-0005): парсер пишет ВСЁ, что пришло из ЦАМО, — полнота данных
 * НЕ влияет на сохранение записи. Классификация — строго по статусу выбытия.
 *
 * TASK-0006, п.2: блок «Доп. информация» принимается как документальные данные:
 *  - notes ← сырой текст параметра дословно (без преобразований);
 *  - если прямой параметр пуст и в тексте есть метка «Место рождения:» /
 *    «Место призыва:» — значение берётся по метке (до ; или до конца строки, trim);
 *  - нет метки — поле остаётся пустым. Никаких домыслов, только текст документа.
 */

export const HEADERS = [
  "document_id",
  "primary_url",
  "last_name",
  "first_name",
  "patronymic",
  "birth_year",
  "death_year",
  "rank",
  "position",
  "birth_place",
  "place_birth",
  "conscription_location",
  "place_of_captivity",
  "capture_date",
  "cause_of_death",
  "death_date",
  "death_place",
  "burial_info",
  "rebural_from",
  "sources",
  "notes",
  "_verified",
  "_source_type",
  "_allParams",
];

// ---------- Внутренние хелперы (выполняются в контексте страницы) ----------

// Нормализация текста: схлопываем пробелы, убираем неразрывные
function normText(s) {
  return (s || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

// Извлечение значения по подписи ячейки: находим <td> с нужным текстом,
// берём соседнюю ячейку (или родительскую строку). Возвращает '' если не найдено.
function getValueByLabel(label) {
  const cells = Array.from(document.querySelectorAll("td"));
  for (const cell of cells) {
    const txt = normText(cell.textContent);
    if (txt === label || txt.startsWith(label + ":")) {
      // Пробуем следующую ячейку в той же строке
      const next = cell.nextElementSibling;
      if (next && normText(next.textContent)) {
        return normText(next.textContent);
      }
      // Или value-сосед в структуре label/value
      const parentRow = cell.parentElement;
      if (parentRow) {
        const tds = Array.from(parentRow.querySelectorAll("td"));
        const idx = tds.indexOf(cell);
        if (idx >= 0 && idx + 1 < tds.length) {
          const cand = normText(tds[idx + 1].textContent);
          if (cand) return cand;
        }
      }
    }
  }
  return "";
}

// Поиск по заголовкам блоков («Звания», «Место рождения», …) и их содержимому
function getValueBySection(sectionTitle) {
  const headers = Array.from(document.querySelectorAll("b, .label, td.label, th"));
  for (const h of headers) {
    if (normText(h.textContent) === sectionTitle) {
      const container = h.closest("table") || h.parentElement;
      if (container) {
        const text = normText(container.textContent);
        const after = text.split(sectionTitle)[1];
        if (after) return after.replace(/^[:\s]+/, "").split(/\s{2,}/)[0].trim();
      }
    }
  }
  return "";
}

// Собирает все параметры формы вида «Подпись: значение» из таблицы информации о выбытии
function collectAllParams() {
  const params = {};
  const rows = document.querySelectorAll("tr");
  rows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    if (cells.length >= 2) {
      const label = normText(cells[0].textContent).replace(/:$/, "");
      const value = normText(cells[1].textContent);
      if (label && value && !(label in params)) {
        params[label] = value;
      }
    }
  });
  return params;
}

// Извлечение document_id из текущего URL: id=(\d+)
function getDocumentId() {
  const m = location.href.match(/id=(\d+)/);
  return m ? m[1] : "";
}

// Разбор блока «Доп. информация»: поиск параметра по ключевому слову «доп»
// (регистронезависимо) среди подписей таблицы. Возвращает сырое значение или ''.
function findAdditionalInfo(params) {
  for (const label of Object.keys(params)) {
    if (/доп.*инф/i.test(label)) {
      return params[label];
    }
  }
  return "";
}

// Значение по метке внутри текста «Доп. информация»: до ';' или до конца строки, trim.
// Метка ищется регистронезависимо; возвращается кусок ДОКУМЕНТА, без домыслов.
function extractLabeledFragment(text, labelRe) {
  if (!text) return "";
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    const re = new RegExp(labelRe.source, "i");
    const m = line.match(re);
    if (m) {
      const rest = line.slice(m.index + m[0].length);
      const value = rest.split(";")[0].trim();
      if (value) return value;
    }
  }
  return "";
}

// ---------- Основная функция-экстрактор (сериализуется в page.evaluate) ----------

export function pageExtractor() {
  // Все внутренние хелперы определяются ЗДЕСЬ, внутри pageExtractor,
  // потому что page.evaluate сериализует только эту функцию.

  function normText(s) {
    return (s || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  }

  function getValueByLabel(label) {
    const cells = Array.from(document.querySelectorAll("td"));
    for (const cell of cells) {
      const txt = normText(cell.textContent);
      if (txt === label || txt.startsWith(label + ":")) {
        const next = cell.nextElementSibling;
        if (next && normText(next.textContent)) {
          return normText(next.textContent);
        }
        const parentRow = cell.parentElement;
        if (parentRow) {
          const tds = Array.from(parentRow.querySelectorAll("td"));
          const idx = tds.indexOf(cell);
          if (idx >= 0 && idx + 1 < tds.length) {
            const cand = normText(tds[idx + 1].textContent);
            if (cand) return cand;
          }
        }
      }
    }
    return "";
  }

  function getValueBySection(sectionTitle) {
    const headers = Array.from(document.querySelectorAll("b, .label, td.label, th"));
    for (const h of headers) {
      if (normText(h.textContent) === sectionTitle) {
        const container = h.closest("table") || h.parentElement;
        if (container) {
          const text = normText(container.textContent);
          const after = text.split(sectionTitle)[1];
          if (after) return after.replace(/^[:\s]+/, "").split(/\s{2,}/)[0].trim();
        }
      }
    }
    return "";
  }

  function collectAllParams() {
    const params = {};
    const rows = document.querySelectorAll("tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 2) {
        const label = normText(cells[0].textContent).replace(/:$/, "");
        const value = normText(cells[1].textContent);
        if (label && value && !(label in params)) {
          params[label] = value;
        }
      }
    });
    return params;
  }

  function getDocumentId() {
    const m = location.href.match(/id=(\d+)/);
    return m ? m[1] : "";
  }

  function findAdditionalInfo(params) {
    for (const label of Object.keys(params)) {
      if (/доп.*инф/i.test(label)) {
        return params[label];
      }
    }
    return "";
  }

  function extractLabeledFragment(text, labelRe) {
    if (!text) return "";
    const lines = String(text).split(/\r?\n/);
    for (const line of lines) {
      const re = new RegExp(labelRe.source, "i");
      const m = line.match(re);
      if (m) {
        const rest = line.slice(m.index + m[0].length);
        const value = rest.split(";")[0].trim();
        if (value) return value;
      }
    }
    return "";
  }

  // document_id и primary_url
  const document_id = getDocumentId();
  const primary_url = location.href;

  // Персона: ФИО из заголовка «Фамилия: Имя Отчество» либо по отдельным подписям
  const fullNameRaw =
    getValueByLabel("Фамилия") ||
    (() => {
      const h = document.querySelector("h1, .title, b");
      return h ? normText(h.textContent) : "";
    })();

  // Ожидаемый формат: «Фамилия Имя Отчество» или «Фамилия: Имя Отчество»
  const nameParts = fullNameRaw
    .replace(/^Фамилия:\s*/i, "")
    .split(/\s+/)
    .filter(Boolean);
  const last_name = nameParts[0] || "";
  const first_name = nameParts[1] || "";
  const patronymic = nameParts.slice(2).join(" ") || "";

  // Годы жизни/гибели
  const birth_year = getValueByLabel("Год рождения") || getValueBySection("Год рождения");
  const death_year = getValueByLabel("Год гибели") || getValueBySection("Год гибели");

  // Звание и должность
  const rank = getValueByLabel("Воинское звание") || getValueBySection("Звания");
  const position = getValueByLabel("Воинская часть") || getValueByLabel("Должность");

  // Место рождения: прямой параметр, при его отсутствии — метка из «Доп. информация» (п.2)
  const additionalInfoRaw = findAdditionalInfo(collectAllParams());
  const birth_place_direct =
    getValueByLabel("Место рождения") || getValueBySection("Место рождения");
  const birth_place = birth_place_direct || extractLabeledFragment(additionalInfoRaw, /Место рождения:/);

  // place_birth / conscription_location — прямые поля, заполняются при наличии
  const place_birth = birth_place_direct || extractLabeledFragment(additionalInfoRaw, /Место рождения:/);
  const conscription_location_direct = getValueByLabel("Место службы") || getValueByLabel("Место призыва");
  const conscription_location =
    conscription_location_direct || extractLabeledFragment(additionalInfoRaw, /Место призыва:/);

  // Плен
  const place_of_captivity = getValueByLabel("Место пленения");
  const capture_date = getValueByLabel("Пленён") || getValueByLabel("Дата пленения");

  // Выбытие
  const cause_of_death = getValueByLabel("Причина выбытия") || getValueBySection("Причина выбытия");
  const death_date = getValueByLabel("Дата выбытия");
  const death_place = getValueByLabel("Место захоронения");

  // Захоронение / перезахоронение
  const burial_info = getValueByLabel("Первичное место захоронения") || death_place;
  const rebural_from = getValueByLabel("Вторичное место захоронения") || "";

  // Источники: ссылки на документы
  const sources = Array.from(document.querySelectorAll("a[href*='doc'], a[href*='source']"))
    .map((a) => normText(a.textContent))
    .filter(Boolean)
    .join("; ");

  // notes — сырой текст параметра «Доп. информация» дословно (п.2); нет параметра — пусто
  const notes = additionalInfoRaw;

  // Метаданные
  const _verified = "false";
  const _source_type = "OBD-Memorial";

  // Полный словарь всех параметров для отладки
  const allParams = collectAllParams();

  return {
    document_id,
    primary_url,
    last_name,
    first_name,
    patronymic,
    birth_year,
    death_year,
    rank,
    position,
    birth_place,
    place_birth,
    conscription_location,
    place_of_captivity,
    capture_date,
    cause_of_death,
    death_date,
    death_place,
    burial_info,
    rebural_from,
    sources,
    notes,
    _verified,
    _source_type,
    _allParams: JSON.stringify(allParams),
  };
}