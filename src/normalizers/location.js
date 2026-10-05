/**
 * location.js — нормализация мест захоронения и привязка объектов.
 * ESM. Без внешних зависимостей.
 */

/**
 * objectSlug — слаг названия объекта для ключа словаря obj-<slug>.
 * Транслитерация кириллицы, нижний регистр, дефисы вместо пробелов.
 */
export function objectSlug(name) {
  const map = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "kh",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "shch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
  };
  const translit = String(name || "")
    .toLowerCase()
    .split("")
    .map((ch) => (ch in map ? map[ch] : ch))
    .join("");
  return translit
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * attachObject — привязка строки выбытия к объекту захоронения.
 * Совпало «Место захоронения» (current_burial) с name объекта → подставить object_id.
 * Поле rebural_from сохранять дословно и при привязке дописывать его значение
 * в rebural_from_locations объекта (без дублей).
 *
 * @param {object} burial       — строка парсера (current_burial, rebural_from, ...)
 * @param {object} objectsDict  — словарь burial-objects.json { "obj-<slug>": {...} }
 * @returns {object} burial с полями object_id (при совпадении) и обновлённым словарём
 */
export function attachObject(burial, objectsDict) {
  const result = { ...burial };
  const place = String(result.current_burial || "")
    .trim()
    .toLowerCase();
  if (!place || !objectsDict) return result;

  for (const key of Object.keys(objectsDict)) {
    const obj = objectsDict[key];
    const objName = String(obj.name || "")
      .trim()
      .toLowerCase();
    if (objName && objName === place) {
      result.object_id = obj.object_id;
      // rebural_from сохраняем дословно; дописываем в locations объекта при привязке
      const reb = String(result.rebural_from || "").trim();
      if (reb) {
        if (!Array.isArray(obj.rebural_from_locations))
          obj.rebural_from_locations = [];
        if (!obj.rebural_from_locations.includes(reb)) {
          obj.rebural_from_locations.push(reb);
        }
      }
      break;
    }
  }
  return result;
}

/**
 * collectBurials — сбор уникальных мест захоронения из строк парсера.
 * Возвращает два словаря:
 *   primary — первичные места (primary_burial), current — текущие (current_burial).
 * Ключ — нормализованное название, значение — {name, count, source_urls[]}.
 */
export function collectBurials(rows) {
  const primary = {};
  const current = {};

  function add(dict, rawName, url) {
    const name = String(rawName || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!dict[key]) dict[key] = { name, count: 0, source_urls: [] };
    dict[key].count += 1;
    if (url && !dict[key].source_urls.includes(url))
      dict[key].source_urls.push(url);
  }

  for (const row of rows || []) {
    add(primary, row.primary_burial, row.primary_url);
    add(current, row.current_burial, row.primary_url);
  }

  return { primary, current };
}
