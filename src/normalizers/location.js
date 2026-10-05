/**
 * location.js — нормализатор локаций/захоронений (fallen-cards, ESM).
 *
 * Функция attachObject(burial, objectsDict) реализует требования ревизии
 * (REVIEW.md, раздел «Объекты захоронений»):
 *   - совпало «Место захоронения» персоны (burial.current_burial) с name
 *     объекта захоронения из словаря → подставить object_id в burial.object_id;
 *   - поле rebural_from сохраняется дословно (не нормализуется);
 *   - при привязке значение rebural_from дописывается в массив
 *     rebural_from_locations соответствующего объекта в словаре
 *     (дедупликация: не добавлять уже имеющееся значение).
 *
 * Словарь объектов: data/dictionaries/burial-objects.json (каркас;
 * наполнение — после первого прогона scripts/parse-obd-objects.js).
 */

// Нормализация строки для сравнения «Место захоронения» ↔ name объекта:
// нижний регистр, ё→е, отбрасываем пунктуацию, схлопываем пробелы.
function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,;:()\[\]"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// slug для ключа obj-<slug> (используется при наполнении словаря)
export function objectSlug(name) {
  return normalizeName(name)
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/**
 * attachObject — привязка записи персоны к объекту захоронения.
 * @param {object} burial        запись персоны (поля current_burial, rebural_from)
 * @param {object} objectsDict   словарь burial-objects.json { "obj-<slug>": {...} }
 * @returns {object} burial с проставленным object_id (если найдено совпадение);
 *                   mutations: объект словаря получает rebural_from в
 *                   rebural_from_locations. Возвращает тот же burial.
 */
export function attachObject(burial, objectsDict) {
  if (!burial || !objectsDict) return burial;

  const target = normalizeName(burial.current_burial);
  if (!target) return burial; // нет «Место захоронения» — не к чему привязывать

  let matched = null;
  for (const key of Object.keys(objectsDict)) {
    if (key.startsWith('_')) continue; // служебные _comment/_schema
    const obj = objectsDict[key];
    if (!obj || typeof obj !== 'object') continue;
    if (normalizeName(obj.name) === target) {
      matched = obj;
      break;
    }
  }

  if (!matched) return burial; // совпадений нет — оставляем без object_id

  // 1) Подставляем object_id объекта захоронения
  burial.object_id = matched.object_id || '';

  // 2) rebural_from сохраняем дословно (ничего не переписываем) и
  //    дописываем его значение в реестр мест-источников объекта
  const from = String(burial.rebural_from || '').trim();
  if (from) {
    if (!Array.isArray(matched.rebural_from_locations)) {
      matched.rebural_from_locations = [];
    }
    const exists = matched.rebural_from_locations.some(
      v => normalizeName(v) === normalizeName(from)
    );
    if (!exists) {
      matched.rebural_from_locations.push(from); // дословно, как в источнике
    }
  }

  return burial;
}