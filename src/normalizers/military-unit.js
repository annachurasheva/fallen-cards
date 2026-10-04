/**
 * Нормализация воинской части.
 * 
 * ЗАДАЧА: из шифрограммы (например "398 сд 821 сп") получить:
 * - unit_id (для URL и связывания)
 * - unit_norm (полное наименование)
 * 
 * ВХОД: unit_raw (строка), units_dict (словарь)
 * ВЫХОД: { unit_raw, unit_id, unit_norm }
 * 
 * TODO:
 * - регулярка для извлечения номера и типа части
 * - поиск в словаре units_dict.json
 * - fallback на транслитерацию, если не найден
 */

export function normalizeUnit(unitRaw, unitsDict) {
  const unitId = extractUnitId(unitRaw);
  const unitNorm = unitsDict[unitRaw] || unitRaw;
  
  return {
    unit_raw: unitRaw,
    unit_id: unitId,
    unit_norm: unitNorm
  };
}

function extractUnitId(unitRaw) {
  // TODO: регулярка для извлечения "398 сд" → "unit-398-sd"
  const match = unitRaw.match(/(\d{1,4})\s*(сп|сд|ап|мсп|тбр)/);
  if (match) {
    return `unit-${match[1]}-${match[2]}`;
  }
  return null;
}