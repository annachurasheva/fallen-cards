/**
 * location.js — сбор уникальных мест захоронения из строк парсера.
 * ESM. Без внешних зависимостей.
 */

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
