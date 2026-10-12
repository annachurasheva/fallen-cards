/**
 * sync-units-dict.js — конвертер MD-словаря → JSON (Single Source of Truth)
 * 
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/sync-units-dict.js
 * 
 * ЛОГИКА:
 *   - Читает data/dictionaries/warunits-fallen-cards.md
 *   - Парсит Markdown-таблицу (4 колонки)
 *   - Группы с ключом "— (оператор)" пропускаются (A3)
 *   - Варианты записываются буквально, без нормализации (A2)
 *   - Записывает data/dictionaries/warunits-fallen-cards.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const MD_PATH = path.join(ROOT, 'data', 'dictionaries', 'warunits-fallen-cards.md');
const JSON_PATH = path.join(ROOT, 'data', 'dictionaries', 'warunits-fallen-cards.json');

function readUtf8(filepath) {
  return fs.readFileSync(filepath, 'utf-8').replace(/^\uFEFF/, '');
}

function parseMarkdownTable(md) {
  const lines = md.split('\n');
  const result = [];
  
  for (const line of lines) {
    // Пропускаем заголовок, разделители, пустые строки
    if (!line.startsWith('|')) continue;
    if (line.includes('---')) continue;
    if (line.includes('Ключ') && line.includes('Развёрнутое')) continue;
    
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length >= 3) {
      result.push({
        key: cells[0],
        name: cells[1],
        variants: cells[2].split(';').map(v => v.trim()).filter(v => v),
        source_doc: cells[3] || ''
      });
    }
  }
  
  return result;
}

function buildJson(rows) {
  const json = {};
  
  for (const row of rows) {
    // A3: Группы с ключом "— (оператор)" не попадают в индекс
    if (row.key === '— (оператор)') {
      continue;
    }
    
    // A2: варианты буквально, регистр как в MD
    json[row.key] = {
      name: row.name,
      variants: row.variants,
      source_doc: row.source_doc
    };
  }
  
  return json;
}

// Main
const md = readUtf8(MD_PATH);
const rows = parseMarkdownTable(md);
const json = buildJson(rows);

fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2), 'utf-8');

console.log('✅ Синхронизация завершена');
console.log(`📖 Прочитан: ${path.relative(ROOT, MD_PATH)}`);
console.log(`📝 Записан: ${path.relative(ROOT, JSON_PATH)}`);
console.log(`🔑 Ключей: ${Object.keys(json).length}`);
console.log(`📊 Вариантов: ${Object.values(json).reduce((sum, v) => sum + v.variants.length, 0)}`);