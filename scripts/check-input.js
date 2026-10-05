/**
 * check-input.js — CLI: контроль входа ПЕРЕД запуском парсера OBD.
 * Печатает отчёт, ничего не пишет в файлы.
 *
 *   node scripts/check-input.js                # все .txt в data/raw/
 *   node scripts/check-input.js --file=имя.txt
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeInputFile } from '../src/validators/input-control.js';
import {
  listCsvFiles,
  loadRegistry,
  analyzeCsvAgainstRegistry,
} from '../src/validators/registry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const DIRS = {
  processed: path.join(ROOT, 'data', 'processed'),
  summary: path.join(ROOT, 'data', 'summary', 'processed_ids.txt'),
};
const EXPERTS_DIR = path.join(ROOT, 'data', 'processed', 'experts');

const fileArg = process.argv.find(a => a.startsWith('--file='));
const FILE = fileArg ? fileArg.slice('--file='.length) : null;

if (!fs.existsSync(RAW_DIR)) {
  console.error('❌ Папка не найдена: data/raw/');
  process.exit(1);
}

let files = [];
if (FILE) {
  const p = path.join(RAW_DIR, FILE);
  if (!fs.existsSync(p)) {
    console.error(`❌ Файл не найден: data/raw/${FILE}`);
    process.exit(1);
  }
  files = [p];
} else {
  files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.txt')).map(f => path.join(RAW_DIR, f)).sort();
}

if (files.length === 0) {
  console.log('В data/raw/ нет ни одного .txt файла.');
  process.exit(0);
}

console.log(`📂 Файлов для проверки: ${files.length}`);
console.log(`📊 Глобальный журнал: ${DIRS.summary}`);

for (const filepath of files) {
  const r = analyzeInputFile(filepath, DIRS);
  console.log(`\n===== ${r.baseName} =====`);
  if (r.total === 0) { console.log('   (пусто или только комментарии)'); continue; }
  console.log(`   Всего строк (URL): ${r.total}`);
  console.log(`   Уникальных адресов: ${r.unique}`);
  if (r.dupUrls.length) {
    console.log(`   ⚠️  Дублей ВНУТРИ файла: ${r.dupUrls.length}:`);
    for (const [url, n] of r.dupUrls) console.log(`      ×${n}  ${url}`);
  } else {
    console.log('   ✅ Внутри файла дублей нет');
  }
  console.log(`   Уже в журнале файла: ${r.inJournal}`);
  console.log(`   Уже в глобальном журнале: ${r.inSummary}`);
  console.log(`   🆕 Новых к обработке: ${r.newUrls.length}`);
  for (const url of r.newUrls.slice(0, 5)) console.log(`      ${url}`);
}

// ---------- Экспертные файлы (data/processed/experts) ----------
console.log('\n===== Экспертные файлы: data/processed/experts =====');
const expertFiles = listCsvFiles(EXPERTS_DIR);
if (expertFiles.length === 0) {
  console.log('   (нет .csv файлов)');
} else {
  const globalRegistry = loadRegistry(DIRS.summary);
  console.log(`📊 Глобальный журнал: ${DIRS.summary} (${globalRegistry.size} id)`);
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
}

console.log('\n✅ Проверка завершена. Запускайте парсер: node scripts/parse-obd.js');