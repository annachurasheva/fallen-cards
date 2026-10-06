/**
 * extractors.js — извлечение данных карточки персоны OBD Memorial из DOM.
 * Донорский экстрактор: .card_parameter / .card_param-title / .card_param-result.
 * HEADERS утверждены (TASK-0007): 24 колонки, порядок фиксирован.
 * Дополнения TASK-0006 сохранены: notes ← «Доп. информация»; при пустом прямом
 * параметре place_birth / conscription_location — значение по метке из текста notes.
 */

export const HEADERS = [
  "Заголовок",
  "nomer_fonda",
  "nomer_opisi",
  "nomer_dela",
  "document_type",
  "document_id",
  "last_name",
  "first_name",
  "middle_name",
  "date_birth",
  "place_birth",
  "date_death",
  "rank",
  "warunit",
  "cause_of_death",
  "primary_burial",
  "current_burial",
  "country_burial",
  "region_burial",
  "rebural_from",
  "conscription_location",
  "primary_url",
  "notes",
  "Дата",
];

// Функция для page.evaluate: собирает параметры карточки в объект по утверждённым ключам
export function pageExtractor() {
  const params = {};
  const blocks = document.querySelectorAll(".card_parameter");
  for (const block of blocks) {
    const titleEl = block.querySelector(".card_param-title");
    const valueEl = block.querySelector(".card_param-result");
    if (!titleEl || !valueEl) continue;
    const title = titleEl.textContent.trim().replace(/:$/, "").trim();
    const value = valueEl.textContent.trim();
    if (title && !(title in params)) params[title] = value;
  }

  // _allParams остаётся как есть (для отладки), в CSV НЕ сериализуется
  const row = { _allParams: params };

  // ---------- Утверждённый маппинг ----------
  row.document_id = (location.href.match(/id=(\d+)/) || [])[1] || "";
  row.primary_url = location.href.split("#")[0];
  row.last_name = params["Фамилия"] || "";
  row.first_name = params["Имя"] || "";
  row.middle_name = params["Отчество"] || "";
  // Заголовок — сборное ФИО: «Фамилия Имя Отчество» (не из составной подписи)
  row["Заголовок"] = `${row.last_name} ${row.first_name} ${row.middle_name}`.trim();
  row.date_birth = params["Год рождения"] || params["Дата рождения"] || "";
  row.rank = params["Звание"] || params["Воинское звание"] || "";
  row.warunit = params["Последнее место службы"] || "";
  row.cause_of_death = params["Причина выбытия"] || params["Выбытие"] || "";
  row.date_death = params["Дата выбытия"] || params["Дата смерти"] || "";
  row.primary_burial = params["Первичное место захоронения"] || "";
  row.current_burial = params["Место захоронения"] || "";
  row.rebural_from = params["Откуда перезахоронен"] || "";
  row.country_burial = params["Страна захоронения"] || "";
  row.region_burial = params["Регион захоронения"] || "";
  row.conscription_location = params["Место призыва"] || "";
  row.nomer_fonda = params["Номер фонда источника информации"] || "";
  row.nomer_opisi = params["Номер описи источника информации"] || "";
  row.nomer_dela = params["Номер дела источника информации"] || "";
  row.document_type = params["Название источника донесения"] || "";

  // ---------- Единственные дополнения (TASK-0006, п.2) ----------
  // notes ← сырой текст «Доп. информация» дословно; нет параметра — пусто
  row.notes = params["Доп. информация"] || "";

  // Fallback по меткам из текста notes: только если прямой параметр пуст
  const extractLabel = (text, label) => {
    if (!text) return "";
    const re = new RegExp(label + ":\\s*([^;\\n]+)", "i");
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };
  if (!row.place_birth) {
    row.place_birth = params["Место рождения"] || extractLabel(row.notes, "Место рождения");
  }
  if (!row.conscription_location) {
    row.conscription_location = extractLabel(row.notes, "Место призыва");
  }

  // Дата обработки: YYYY-MM-DD
  row["Дата"] = new Date().toISOString().split("T")[0];

  return row;
}