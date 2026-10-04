/**
 * extractors.js — извлечение данных объекта захоронения из DOM OBD Memorial.
 * ESM-порт логики донора obd-edge-objects.js (карточка «Информация о захоронении»,
 * объекты гос-регистрации захоронений ВОВ). pageExtractor() изолирована
 * (не использует внешние переменные) — безопасна для page.evaluate.
 */

// ---------- Схема объектного CSV ----------
// Порядок — сверху вниз по карточке объекта + служебные в начале.
export const OBJECT_HEADERS = [
  "object_id",
  "object_name",
  "object_type",
  "location_address",
  "location_coords",
  "registration_date",
  "registration_number",
  "total_buried",
  "identified_buried",
  "unidentified_buried",
  "creation_date",
  "last_update_date",
  "registered_persons", // JSON-массив ФИО
  "primary_url",
  "Дата",
];

// ---------- Стандартные заголовки параметров для объектов захоронений ----------
// (отличаются от карточек персон)
export const KNOWN_OBJECT_TITLES = [
  "Наименование объекта",
  "Тип объекта",
  "Адрес местонахождения",
  "Координаты",
  "Дата создания",
  "Дата последнего обновления",
  "Номер регистрации",
  "Количество захороненных",
  "Из них известных",
  "Из них неизвестных",
  "Список захороненных",
];

// ---------- Извлечение id объекта из URL ----------
// .../info.htm?id=1167839469 -> 1167839469
export function extractObjectIdFromUrl(url) {
  const m = String(url || "").match(/id=(\d+)/);
  return m ? m[1] : "";
}

/**
 * pageExtractor — функция для page.evaluate. Парсит структуру объекта
 * захоронения аналогично карточке персоны:
 *   - getParamValue(title) по .card_parameter / .card_param-title / .card_param-result;
 *   - основной проход по KNOWN_OBJECT_TITLES;
 *   - фолбэк на реальные заголовки карточки «Информация о захоронении»
 *     (донор obd-edge-objects.js), если стандартный заголовок отсутствует;
 *   - registered_persons — парсинг списка ФИО из поля «Список захороненных»
 *     (может быть таблица или список), результат — массив строк;
 *   - object_id из id=(\d+) в URL; primary_url = window.location.href;
 *   - Дата — дата прогона (YYYY-MM-DD);
 *   - возвращает также _allParams (все параметры страницы) для отладки.
 */
export function pageExtractor() {
  function getParamValue(title) {
    const elements = document.querySelectorAll(".card_parameter");
    for (const el of elements) {
      const t = el.querySelector(".card_param-title");
      if (t && t.innerText.trim() === title) {
        const v = el.querySelector(".card_param-result");
        return v ? v.innerText.trim() : "";
      }
    }
    return "";
  }

  // Все параметры страницы: {title, value} — для отладки и нестандартных полей
  const allParams = [];
  document.querySelectorAll(".card_parameter").forEach((el) => {
    const t = el.querySelector(".card_param-title");
    const v = el.querySelector(".card_param-result");
    allParams.push({
      title: t ? t.innerText.trim() : "",
      value: v ? v.innerText.trim() : "",
    });
  });

  function paramByTitles(standardTitle, fallbackTitles) {
    let val = getParamValue(standardTitle);
    if (!val && fallbackTitles) {
      for (const ft of fallbackTitles) {
        val = getParamValue(ft);
        if (val) break;
      }
    }
    return val;
  }

  // ---------- «Список захороненных» (ФИО): таблица или список ----------
  function parseRegisteredPersons() {
    const names = [];
    let containerEl = null;
    document.querySelectorAll(".card_parameter").forEach((el) => {
      const t = el.querySelector(".card_param-title");
      if (t && /список захороненных/i.test(t.innerText.trim())) {
        containerEl = el.querySelector(".card_param-result") || el;
      }
    });
    if (!containerEl) return names;

    // Вариант 1: таблица с ФИО
    const tableCells = containerEl.querySelectorAll("table td, table th");
    if (tableCells.length > 0) {
      tableCells.forEach((td) => {
        const txt = td.innerText.trim();
        if (txt && txt.length > 3) names.push(txt);
      });
      return names;
    }
    // Вариант 2: маркированный/нумерованный список
    const listItems = containerEl.querySelectorAll("li");
    if (listItems.length > 0) {
      listItems.forEach((li) => {
        const txt = li.innerText.trim();
        if (txt) names.push(txt);
      });
      return names;
    }
    // Вариант 3: plain text — построчно
    const raw = containerEl.innerText || "";
    raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        names.push(line.replace(/^[-–•*\s]+/, ""));
      });
    return names.filter(Boolean);
  }

  const result = {
    object_name: paramByTitles("Наименование объекта", ["Место захоронения"]),
    object_type: paramByTitles("Тип объекта", ["Вид захоронения"]),
    location_address: (function () {
      let v = getParamValue("Адрес местонахождения");
      if (!v) {
        const parts = [
          getParamValue("Страна захоронения"),
          getParamValue("Регион захоронения"),
        ].filter(Boolean);
        v = parts.join(", ");
      }
      return v;
    })(),
    location_coords: paramByTitles("Координаты", null),
    registration_date: paramByTitles("Дата создания", [
      "Дата создания современного места захоронения",
    ]),
    last_update_date: paramByTitles("Дата последнего обновления", [
      "Дата последнего захоронения",
    ]),
    registration_number: paramByTitles("Номер регистрации", [
      "Номер захоронения в ВМЦ",
    ]),
    total_buried: paramByTitles("Количество захороненных", [
      "Захоронено всего",
    ]),
    identified_buried: paramByTitles("Из них известных", [
      "Захоронено известных",
    ]),
    unidentified_buried: paramByTitles("Из них неизвестных", [
      "Захоронено неизвестных",
    ]),
    primary_url: window.location.href,
  };

  // object_id из id=(\d+) в URL
  const urlMatch = window.location.href.match(/id=(\d+)/);
  result.object_id = urlMatch ? urlMatch[1] : "";

  // creation_date — дата создания объекта (в карточке ВОВ это дата создания места захоронения)
  result.creation_date = result.registration_date;

  // last_update_date — дата последнего обновления (фолбэк: «Дата последнего захоронения»)
  result.last_update_date = paramByTitles("Дата последнего обновления", [
    "Дата последнего захоронения",
  ]);

  // Список ФИО захороненных → массив (в JSON сериализуется на этапе CSV)
  result.registered_persons = parseRegisteredPersons();

  // Служебная колонка «Дата» — дата прогона
  result["Дата"] = new Date().toISOString().split("T")[0];

  // Отладочный сбор всех параметров страницы
  result._allParams = allParams;

  return result;
}
