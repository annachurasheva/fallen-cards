/**
 * csv-control.js — чистая логика контроля CSV перед генерацией карточек.
 * Защищает от дублей: document_id, персоны (ФИО+дата), уже сгенерированные карточки.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';

export function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += ch;
  }
  result.push(current.trim());
  return result;
}

export function analyzeCsvFile(filepath, outputDir) {
  const lines = readFileSync(filepath, 'utf-8').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { total: 0, dupIds: [], dupPersons: [], alreadyGenerated: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const values = parseCSVLine(l);
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] || '').replace(/^"|"$/g, ''); });
    return row;
  });

  const idMap = new Map();
  const personMap = new Map();
  for (const row of rows) {
    const id = (row.document_id || '').trim();
    if (id) idMap.set(id, (idMap.get(id) || 0) + 1);
    const key = [row.last_name, row.first_name, row.middle_name, row.date_death]
      .map(s => (s || '').trim().toLowerCase()).join('|');
    personMap.set(key, (personMap.get(key) || 0) + 1);
  }

  const outputNames = existsSync(outputDir) ? readdirSync(outputDir).join('\n') : '';
  const alreadyGenerated = rows.filter(r => r.document_id && outputNames.includes(r.document_id));

  return {
    total: rows.length,
    dupIds: [...idMap.entries()].filter(([, n]) => n > 1),
    dupPersons: [...personMap.entries()].filter(([, n]) => n > 1),
    alreadyGenerated,
  };
}