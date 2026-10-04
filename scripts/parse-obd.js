/**
 * parse-obd.js — CLI парсинга OBD Memorial (ESM-порт логики донора obd-edge_v03.js).
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/parse-obd.js --input=имя.txt            (файл из data/raw/)
 *   node scripts/parse-obd.js --input=имя.txt --dry-run  (план без браузера)
 *   node scripts/parse-obd.js --port=9227 --limit=10
 *   node scripts/parse-obd.js --output=data/processed/
 *
 * ВЫХОД (для входного файла <имя>):
 *   <output>/<имя>/
 *     <имя>__parser_mem2026.csv   — убит/погиб
 *     <имя>__other_mem2026_.csv   — остальные причины
 *     <имя>__session.log
 *     <имя>__errors.log
 *     <имя>__processed.txt
 *   data/summary/processed_ids.txt (дописывается; папка создаётся при отсутствии)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseUrls, toCsv, extractIdFromUrl } from '../src/parsers/obd-memorial/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ---------- Параметры ----------
const DEFAULT_PORT = 9226;
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const portArg = args.find(a => a.startsWith('--port='));
const PORT = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_PORT;
const inputArg = args.find(a => a.startsWith('--input='));
const OUTPUT_ARG = args.find(a => a.startsWith('--output='));
const LIMIT_ARG = args.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

const rawDir = path.join(ROOT, 'data', 'raw');
const processedRoot = OUTPUT_ARG
  ? path.resolve(ROOT, OUTPUT_ARG.split('=')[1])
  : path.join(ROOT, 'data', 'processed');
const summaryFile = path.join(ROOT, 'data', 'summary', 'processed_ids.txt');

// Чтение файла со списком URL: пропускаем пустые строки, комментарии (#) и не-http
function readUrlList(filepath) {
  if (!fs.existsSync(filepath)) return [];
  return fs.readFileSync(filepath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .filter(line => line.startsWith('http'));
}

// Загрузка множества из файла (по одной записи на строку)
function loadSet(filepath) {
  const set = new Set();
  if (fs.existsSync(filepath)) {
    fs.readFileSync(filepath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .forEach(line => set.add(line));
  }
  return set;
}

// Сохранение CSV (UTF-8 с BOM); пустые списки не пишутся — как в доноре
function saveCsv(filepath, rows) {
  if (rows.length === 0) return;
  fs.writeFileSync(filepath, toCsv(rows), 'utf-8');
}

// ---------- Обработка одного входного файла ----------
async function processInputFile(inputFile) {
  const baseName = path.basename(inputFile, path.extname(inputFile));
  const outDir = path.join(processedRoot, baseName);

  const killedFile = path.join(outDir, `${baseName}__parser_mem2026.csv`);
  const otherFile = path.join(outDir, `${baseName}__other_mem2026_.csv`);
  const sessionLogFile = path.join(outDir, `${baseName}__session.log`);
  const errorsLogFile = path.join(outDir, `${baseName}__errors.log`);
  const processedFile = path.join(outDir, `${baseName}__processed.txt`);

  if (!isDryRun) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.mkdirSync(path.dirname(summaryFile), { recursive: true });
  }

  function log(msg) {
    console.log(msg);
    if (!isDryRun) fs.appendFileSync(sessionLogFile, msg + '\n', 'utf-8');
  }

  function logError(msg) {
    console.error(msg);
    if (!isDryRun) {
      fs.appendFileSync(sessionLogFile, '[ERROR] ' + msg + '\n', 'utf-8');
      fs.appendFileSync(errorsLogFile, msg + '\n', 'utf-8');
    }
  }

  log(`\n===== Файл: ${baseName} =====`);

  const allUrls = readUrlList(inputFile);
  if (allUrls.length === 0) {
    logError(`❌ В файле ${baseName} нет ни одного URL. Пропускаю.`);
    return { killed: 0, other: 0, errors: 0, skipped: 0 };
  }

  // --- Контроль дублей внутри файла ---
  const urlCount = new Map();
  for (const url of allUrls) {
    urlCount.set(url, (urlCount.get(url) || 0) + 1);
  }
  const internalDuplicates = [...urlCount.entries()].filter(([, n]) => n > 1);
  if (internalDuplicates.length > 0) {
    log(`⚠️  Внутренние дубли в файле (${internalDuplicates.length} адресов повторяются):`);
    for (const [url, n] of internalDuplicates) {
      log(`   ×${n}  ${url}`);
    }
  }

  // --- Журнал этого файла + глобальная сумма: пропуск обработанных ---
  const processedSet = loadSet(processedFile);
  const summaryIds = loadSet(summaryFile);

  if (processedSet.size > 0) {
    log(`♻️  В журнале файла: ${processedSet.size} уже обработанных URL — пропускаем`);
  }

  // Отбираем URL, которые ещё не обрабатывались:
  // 1) нет в журнале файла (полный URL)
  // 2) id нет в глобальной сумме
  let urlsToProcess = allUrls.filter((url) => {
    if (processedSet.has(url)) return false;
    const id = extractIdFromUrl(url);
    if (id && summaryIds.has(id)) return false;
    return true;
  });

  const skippedBySummary = allUrls.length - urlsToProcess.length - processedSet.size;
  if (skippedBySummary > 0) {
    log(`♻️  Из них ${skippedBySummary} уже есть в глобальной сумме (data/summary/processed_ids.txt) — пропускаем`);
  }

  const skippedTotal = allUrls.length - urlsToProcess.length;

  // --- Ограничение --limit ---
  if (Number.isFinite(LIMIT) && urlsToProcess.length > LIMIT) {
    log(`✂️  --limit=${LIMIT}: берём первые ${LIMIT} из ${urlsToProcess.length}`);
    urlsToProcess = urlsToProcess.slice(0, LIMIT);
  }

  if (urlsToProcess.length === 0) {
    log('✅ Все URL уже обработаны (журнал файла + сумма).');
    return { killed: 0, other: 0, errors: 0, skipped: skippedTotal };
  }

  log(`📄 Всего URL: ${allUrls.length}, осталось обработать: ${urlsToProcess.length}`);

  // --- DRY-RUN: только план, без подключения к браузеру ---
  if (isDryRun) {
    log(`🔍 DRY-RUN (${baseName}): новых ${urlsToProcess.length}, пропуск ${skippedTotal}. Файлы НЕ записаны, журналы/сумма НЕ изменены.`);
    return { killed: 0, other: 0, errors: 0, skipped: skippedTotal };
  }

  log(`📁 Результаты: ${killedFile}`);
  log(`📁 Результаты: ${otherFile}`);

  // --- Парсинг ---
  const { killed, other, errors } = await parseUrls(urlsToProcess, {
    port: PORT,
    onLog: log,
    onError: logError,
  });

  // --- Отмечаем обработанные: полный URL в журнал файла, id в глобальную сумму ---
  for (const url of urlsToProcess) {
    fs.appendFileSync(processedFile, url + '\n', 'utf-8');
    const id = extractIdFromUrl(url);
    if (id) {
      fs.appendFileSync(summaryFile, id + '\n', 'utf-8');
    }
  }

  // --- Финальное сохранение результатов ---
  log('\n📊 Финальное сохранение результатов...');
  saveCsv(killedFile, killed);
  saveCsv(otherFile, other);

  log(`   💾 ${baseName}__parser_mem2026.csv — ${killed.length} записей`);
  log(`   💾 ${baseName}__other_mem2026_.csv — ${other.length} записей`);

  return { killed: killed.length, other: other.length, errors: errors.length, skipped: skippedTotal };
}

// ---------- Главная функция ----------
(async () => {
  const inputArgValue = inputArg ? inputArg.split('=')[1] : null;

  // Определяем список входных файлов
  let inputFiles = [];
  if (inputArgValue) {
    const p = path.join(rawDir, inputArgValue);
    if (!fs.existsSync(p)) {
      console.error(`❌ Файл не найден: data/raw/${inputArgValue}`);
      process.exit(1);
    }
    inputFiles = [p];
  } else {
    if (!fs.existsSync(rawDir)) {
      console.error(`❌ Папка не найдена: data/raw/`);
      process.exit(1);
    }
    inputFiles = fs.readdirSync(rawDir)
      .filter(f => f.endsWith('.txt'))
      .map(f => path.join(rawDir, f))
      .sort();
  }

  if (inputFiles.length === 0) {
    console.error('❌ В data/raw/ нет ни одного .txt файла. Положите список URL.');
    process.exit(1);
  }

  console.log(`📂 Входных файлов: ${inputFiles.length}`);
  for (const f of inputFiles) {
    console.log(`   - ${path.basename(f)}`);
  }

  if (!isDryRun) {
    console.log(`🔗 Парсинг через внешний Edge CDP localhost:${PORT} (запустите: pwsh tools/run-edge-obd.ps1)`);
  }

  const totals = { killed: 0, other: 0, errors: 0, skipped: 0 };
  for (const file of inputFiles) {
    const t = await processInputFile(file);
    totals.killed += t.killed;
    totals.other += t.other;
    totals.errors += t.errors;
    totals.skipped += t.skipped;
  }

  console.log('\n✅ Готово!');
  console.log(`Итог: killed=${totals.killed}, other=${totals.other}, errors=${totals.errors}, пропущено=${totals.skipped}`);
})();
