/**
 * Проверка полноты данных.
 * 
 * ЗАДАЧА: проверить, что все обязательные поля заполнены.
 * 
 * ВХОД: нормализованный объект карточки
 * ВЫХОД: { valid: boolean, missing_fields: [] }
 * 
 * TODO:
 * - определить список обязательных полей
 * - проверка на пустые строки
 * - логирование пропущенных полей
 */

export function validateCompleteness(normalizedData) {
  const required = ['last_name', 'first_name'];
  const missing = [];
  
  for (const field of required) {
    if (!normalizedData.person[field]) {
      missing.push(field);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing_fields: missing
  };
}