/**
 * check-csv.js — CLI: контроль CSV ПЕРЕД генерацией карточек.
 *   node scripts/check-csv.js                 # все .csv в data/csv/
 *   node scripts/check-csv.js --file=имя.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCsvFile } from '../src/validators/csv-control.js';
import {
  listCsvFiles,
  loadRegistry,
  analyzeCsvAgainstRegistry,
  findNameDuplicates,
  formatNameDuplicates,
} from '../src/validators/registry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const CSV_DIR = path.join(ROOT, 'data', 'csv');
const OUTPUT_DIR = path.join(ROOT, 'data', 'output');
const EXPERTS_DIR = path.join(ROOT, 'data', 'processed', 'experts');
const SUMMARY_DIR = path.join(ROOT, 'data', 'summary');

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

// ---------- Экспертные файлы (data/processed/experts) ----------
console.log('\n===== Экспертные файлы: data/processed/experts =====');
const expertFiles = listCsvFiles(EXPERTS_DIR);
if (expertFiles.length === 0) {
  console.log('   (нет .csv файлов)');
} else {
  const globalRegistry = loadRegistry(path.join(SUMMARY_DIR, 'processed_ids.txt'));
  console.log(`📊 Глобальный журнал: ${path.join(SUMMARY_DIR, 'processed_ids.txt')} (${globalRegistry.size} id)`);
  for (const filepath of expertFiles) {
    const base = path.basename(filepath, '.csv');
    const localJournal = path.join(
      path.dirname(filepath),
      `${base}__processed.txt`,
    );
    const r = analyzeCsvAgainstRegistry(filepath, localJournal, globalRegistry);
    console.log(`\n===== ${path.basename(filepath)} =====`);
    if (!r.total) { console.log('   (пусто)'); continue; }
    console.log(`   Всего уникальных document_id: ${r.total}`);
    console.log(`   Уже в журнале файла: ${r.inLocal}`);
    console.log(`   Уже в глобальном журнале: ${r.inGlobal}`);
    console.log(`   🆕 Новых к обработке: ${r.newIds.length}`);
    for (const id of r.newIds.slice(0, 5)) console.log(`      ${id}`);
  }
  console.log(
    '\n   Учёт экспертных файлов: node scripts/register-experts.js',
  );

  // ---------- Дубли ФИО с разными document_id (требуют оператора) ----------
  console.log('\n===== Дубли ФИО с разными document_id =====');
  const dups = findNameDuplicates(expertFiles);
  for (const line of formatNameDuplicates(dups)) console.log(line);
}

console.log('\n✅ Проверка завершена. Генерация: node scripts/generate-cards.js');