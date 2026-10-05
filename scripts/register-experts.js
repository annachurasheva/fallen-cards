/**
 * register-experts.js — учёт экспертных карточек в глобальном журнале.
 *
 * Читает все .csv из data/processed/experts, собирает document_id,
 * дописывает в data/summary/processed_ids.txt только недостающие id
 * (в формате "<id>	<url>", как это делает parse-obd.js).
 * CSV не изменяется.
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/register-experts.js
 *   node scripts/register-experts.js --dry-run   # только показать, что добавится
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listCsvFiles,
  loadRegistry,
  collectCsvRecords,
} from '../src/validators/registry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const EXPERTS_DIR = path.join(ROOT, 'data', 'processed', 'experts');
const SUMMARY_DIR = path.join(ROOT, 'data', 'summary');
const GLOBAL_FILE = path.join(SUMMARY_DIR, 'processed_ids.txt');

const isDryRun = process.argv.includes('--dry-run');

const csvFiles = listCsvFiles(EXPERTS_DIR);
if (csvFiles.length === 0) {
  console.log('❌ В data/processed/experts нет .csv файлов.');
  process.exit(1);
}

const existing = loadRegistry(GLOBAL_FILE);

const pending = [];
for (const filepath of csvFiles) {
  for (const rec of collectCsvRecords(filepath)) {
    if (!existing.has(rec.id)) {
      existing.add(rec.id);
      pending.push({ file: path.basename(filepath), ...rec });
    }
  }
}

console.log(`📂 Экспертных файлов: ${csvFiles.length}`);
console.log(`📊 Глобальный журнал: ${GLOBAL_FILE}`);
console.log(`   Всего id в журнале до учёта: ${existing.size - pending.length}`);
console.log(`   🆕 Будет добавлено: ${pending.length}`);
for (const p of pending.slice(0, 10)) {
  console.log(`      ${p.id}	${p.url || ''}	(${p.file})`);
}
if (pending.length > 10) {
  console.log(`      … и ещё ${pending.length - 10}`);
}

if (isDryRun) {
  console.log('\n🔍 DRY-RUN: журнал НЕ изменён.');
  process.exit(0);
}

if (pending.length === 0) {
  console.log('\n✅ Все экспертные карточки уже учтены в глобальном журнале.');
  process.exit(0);
}

fs.mkdirSync(SUMMARY_DIR, { recursive: true });
const lines = pending.map((p) => `${p.id}	${p.url}`).join('\n');
fs.appendFileSync(GLOBAL_FILE, lines + '\n', 'utf-8');

console.log(`\n✅ В глобальный журнал добавлено id: ${pending.length}`);
console.log('Теперь check-input.js и check-csv.js покажут эти карточки как «уже учтённые».');