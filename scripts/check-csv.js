/**
 * check-csv.js — CLI: контроль CSV ПЕРЕД генерацией карточек.
 *   node scripts/check-csv.js                 # все .csv в data/csv/
 *   node scripts/check-csv.js --file=имя.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCsvFile } from '../src/validators/csv-control.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const CSV_DIR = path.join(ROOT, 'data', 'csv');
const OUTPUT_DIR = path.join(ROOT, 'data', 'output');

const fileArg = process.argv.find(a => a.startsWith('--file='));
const FILE = fileArg ? fileArg.slice('--file='.length) : null;

if (!fs.existsSync(CSV_DIR)) { console.error('❌ Папка не найдена: data/csv/'); process.exit(1); }

let files = [];
if (FILE) {
  const p = path.join(CSV_DIR, FILE);
  if (!fs.existsSync(p)) { console.error(`❌ Файл не найден: data/csv/${FILE}`); process.exit(1); }
  files = [p];
} else {
  files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv')).map(f => path.join(CSV_DIR, f)).sort();
}

if (files.length === 0) { console.log('В data/csv/ нет ни одного .csv файла.'); process.exit(0); }

console.log(`📂 CSV файлов для проверки: ${files.length}`);

for (const filepath of files) {
  const r = analyzeCsvFile(filepath, OUTPUT_DIR);
  console.log(`\n===== ${path.basename(filepath)} =====`);
  if (!r.total) { console.log('   (пусто)'); continue; }
  console.log(`   Строк: ${r.total}`);
  if (r.dupIds.length) {
    console.log(`   ⚠️  Дубли document_id: ${r.dupIds.length}:`);
    for (const [id, n] of r.dupIds) console.log(`      ×${n}  ${id}`);
  } else console.log('   ✅ document_id уникальны');
  if (r.dupPersons.length) {
    console.log(`   ⚠️  Подозрительные дубли персон (ФИО+дата): ${r.dupPersons.length}:`);
    for (const [key, n] of r.dupPersons) console.log(`      ×${n}  ${key.replaceAll('|', ' ')}`);
  } else console.log('   ✅ Дублей персон по ФИО+дате нет');
  console.log(`   🃏 Уже сгенерировано карточек в data/output/: ${r.alreadyGenerated.length}`);
  for (const row of r.alreadyGenerated.slice(0, 5)) console.log(`      ${row.document_id}  ${row.last_name} ${row.first_name}`);
}

console.log('\n✅ Проверка завершена. Генерация: node scripts/generate-cards.js');