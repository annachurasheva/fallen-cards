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

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const DIRS = {
  processed: path.join(ROOT, 'data', 'processed'),
  summary: path.join(ROOT, 'data', 'summary', 'processed_ids.txt'),
};

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

console.log('\n✅ Проверка завершена. Запускайте парсер: node scripts/parse-obd.js');