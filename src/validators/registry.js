/**
 * registry.js — работа с журналами обработанных карточек и экспертными CSV.
 * Чистая логика без вывода: печатают CLI-скрипты (scripts/check-*.js и др.).
 *
 * Журналы:
 *   - локальный (журнал файла): <dir>/<base>__processed.txt
 *     формат записи: "<id>	<url>" или просто "<id>"
 *   - глобальный: data/summary/processed_ids.txt — тот же формат
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseCSVLine } from './csv-control.js';

/** Список .csv-файлов в каталоге (отсортирован). */
export function listCsvFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .sort()
    .map((f) => path.join(dir, f));
}

/** Множество document_id из журнала (файл может отсутствовать). */
export function loadRegistry(filepath) {
  if (!existsSync(filepath)) return new Set();
  return new Set(
    readFileSync(filepath, 'utf-8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split(/\s+/)[0])
      .filter((id) => /^\d+$/.test(id)),
  );
}

/** Чтение строк CSV (BOM, кавычки, запятые) в массив объектов. */
export function readCsvRows(filepath) {
  const text = readFileSync(filepath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] || '').replace(/^"|"$/g, '');
    });
    return row;
  });
}

/**
 * Уникальные записи document_id + primary_url из CSV.
 * Пустые и нечисловые document_id пропускаются.
 */
export function collectCsvRecords(filepath) {
  const seen = new Set();
  const out = [];
  for (const row of readCsvRows(filepath)) {
    const id = (row.document_id || '').trim();
    if (!/^\d+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, url: (row.primary_url || '').trim() });
  }
  return out;
}

/**
 * Сравнение CSV с журналами: сколько уникальных id уже учтено
 * в журнале файла и в глобальном журнале, какие id новые.
 */
export function analyzeCsvAgainstRegistry(filepath, localJournal, globalRegistry) {
  const records = collectCsvRecords(filepath);
  const localSet = loadRegistry(localJournal);
  const inLocal = records.filter((r) => localSet.has(r.id)).length;
  const inGlobal = records.filter((r) => globalRegistry.has(r.id)).length;
  const newIds = records
    .filter((r) => !localSet.has(r.id) && !globalRegistry.has(r.id))
    .map((r) => r.id);
  return { total: records.length, inLocal, inGlobal, newIds };
}

/** Нормализованный ключ ФИО для поиска дублей (регистр и пробелы не важны). */
export function personKey(row) {
  return [row.last_name, row.first_name, row.middle_name]
    .map((s) => (s || '').trim().toLowerCase())
    .join('|');
}

/**
 * Поиск групп одинаковых ФИО с РАЗНЫМИ document_id по нескольким CSV.
 * Возвращает массив групп:
 *   { key, ids, entries }
 * где entries — все записи группы (файл, id, url, ФИО, дата гибели).
 * Группы с одним уникальным id (повторы строк/файлов) не считаются дублями.
 */
export function findNameDuplicates(csvFilePaths) {
  const groups = new Map();
  for (const filepath of csvFilePaths) {
    const base = path.basename(filepath);
    for (const row of readCsvRows(filepath)) {
      const key = personKey(row);
      if (!key || !key.replace(/\|/g, '').trim()) continue;
      const id = (row.document_id || '').trim();
      if (!/^\d+$/.test(id)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        file: base,
        id,
        url: (row.primary_url || '').trim(),
        last_name: row.last_name || '',
        first_name: row.first_name || '',
        middle_name: row.middle_name || '',
        date_death: row.date_death || '',
      });
    }
  }
  const result = [];
  for (const [key, entries] of groups) {
    const ids = [...new Set(entries.map((e) => e.id))];
    if (ids.length > 1) result.push({ key, ids, entries });
  }
  result.sort((a, b) => a.key.localeCompare(b.key));
  return result;
}

/** Форматирование групп дублей для печати в отчёте. */
export function formatNameDuplicates(dups) {
  if (dups.length === 0) {
    return ['   ✅ Одинаковых ФИО с разными document_id не найдено'];
  }
  const lines = [
    `   ⚠️ ТРЕБУЕТ ВМЕШАТЕЛЬСТВА ОПЕРАТОРА: одинаковых ФИО с разными document_id — ${dups.length} групп`,
  ];
  for (const g of dups) {
    lines.push(`   🔸 ${g.key} — id: ${g.ids.join(', ')}`);
    for (const e of g.entries) {
      const datePart = e.date_death ? `  дата: ${e.date_death}` : '';
      lines.push(`      ${e.id}  ${e.url || '-'}  (${e.file})${datePart}`);
    }
  }
  return lines;
}