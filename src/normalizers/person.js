/**
 * Нормализация данных персоны.
 * 
 * ЗАДАЧА: привести сырые данные о персоне к стандартному формату.
 * 
 * ВХОД: { last_name, first_name, middle_name, date_birth, place_birth }
 * ВЫХОД: { last_name, first_name, middle_name, birth: { date, location } }
 * 
 * TODO:
 * - валидация дат (формат YYYY-MM-DD)
 * - нормализация мест рождения (словарь регионов)
 * - обработка отсутствующих данных
 */

export function normalizePerson(rawData) {
  return {
    last_name: rawData.last_name || '',
    first_name: rawData.first_name || '',
    middle_name: rawData.middle_name || null,
    birth: {
      date: rawData.date_birth || null,
      location: rawData.place_birth || null
    }
  };
}