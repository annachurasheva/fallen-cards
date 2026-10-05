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