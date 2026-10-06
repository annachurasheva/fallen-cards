/**
 * parse-obd.js — CLI парсинга карточек персон OBD Memorial (ESM). Вариант Б.
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/parse-obd.js --input=links_id_658_Арма-Эли.txt
 *   node scripts/parse-obd.js --input=file.txt --dry-run
 *   node scripts/parse-obd.js --input=file.txt --port=9227 --limit=50
 *   node scripts/parse-obd.js --input=file.txt --output=data/processed/
 *
 * ВЫХОД (для входного файла <имя>):
 *   data/processed/<имя>/
 *     <имя>-fallen.csv        — записи со статусом «убит»/«погиб» (UTF-8 без BOM)
 *     <имя>-unclassified.csv  — все остальные статусы (UTF-8 без BOM)
 *     <имя>-error.csv         — технические ошибки (TIMEOUT/NETWORK/PARSE_ERROR/EMPTY_PAGE)
 *     <имя>-repeats.txt       — URL, уже присутствующие в processed_ids.txt
 *   data/summary/processed_ids.txt — глобальный реестр (обновляется СТРОГО ПОСЛЕ CSV)
 *
 * ГАРАНТИИ ВАРИАНТА Б:
 *   - пакетная фильтрация повторов до начала парсинга;
 *   - классификация строго по cause_of_death (не по полноте данных);
 *   - id попадает в реестр только после физического appendFileSync в CSV;
 *   - отсутствие реестра на старте — не ошибка (создаётся при первой записи);
 *   - построчный прогресс в консоль (индикация жизни), без эмодзи.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseUrls } from "../src/parsers/obd-memorial/index.js";
import { HEADERS } from "../src/parsers/obd-memorial/extractors.js";
import { makeProgressPrinter } from "../src/parsers/obd-memorial/progress.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ---------- Параметры ----------
const DEFAULT_PORT = 9226;
const FLUSH_EVERY = 50; // каждые N записей: сначала CSV, потом реестр

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const portArg = args.find((a) => a.startsWith("--port="));
const PORT = portArg ? parseInt(portArg.split("=")[1], 10) : DEFAULT_PORT;
const inputArg = args.find((a) => a.startsWith("--input="));
const OUTPUT_ARG = args.find((a) => a.startsWith("--output="));
const LIMIT_ARG = args.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1], 10) : Infinity;

const rawDir = path.join(ROOT, "data", "raw");
const processedRoot = OUTPUT_ARG
  ? path.resolve(ROOT, OUTPUT_ARG.split("=")[1])
  : path.join(ROOT, "data", "processed");
const summaryDir = path.join(ROOT, "data", "summary");
const globalProcessedFile = path.join(summaryDir, "processed_ids.txt");

// ---------- Утилиты ----------

// Срезание BOM (U+FEFF) при чтении любого внешнего файла (п.8: одна строка нормализации)
function readUtf8(filepath) {
  return fs.readFileSync(filepath, "utf-8").replace(/^\uFEFF/, "");
}

// Текущая дата обработки: YYYY-MM-DD
function today() {
  return new Date().toISOString().split("T")[0];
}

// Метка времени [ЧЧ:ММ:СС]
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`;
}

// Чтение файла со списком URL: пропускаем пустые строки, комментарии (#) и не-http
function readUrlList(filepath) {
  if (!fs.existsSync(filepath)) return [];
  return readUtf8(filepath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .filter((line) => line.startsWith("http"));
}

// Извлечение document_id из URL: id=(\d+)
function extractIdFromUrl(url) {
  const m = url.match(/id=(\d+)/);
  return m ? m[1] : "";
}

// Загрузка множества уже обработанных id.
// Терпимость к отсутствию: нет файла / пустой файл — это НЕ ошибка, пустое множество.
function loadRegistrySet(globalFile) {
  const set = new Set();
  if (fs.existsSync(globalFile)) {
    readUtf8(globalFile)
      .split(/\r?\n/)
      .forEach((line) => {
        const t = line.trim();
        if (t && !t.startsWith("#")) {
          const id = t.split(/\s+/)[0];
          if (/^\d+$/.test(id)) set.add(id);
        }
      });
  }
  return set;
}

// Экранирование значения для CSV (кавычки и запятые)
function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Строка CSV по HEADERS (порядок колонок — п.8)
function rowToCsvLine(row) {
  return HEADERS.map((h) => escapeCsv(row[h])).join(",");
}

// ---------- Главная функция ----------
(async () => {
  if (!inputArg) {
    console.error(
      `${stamp()} Укажите входной файл: node scripts/parse-obd.js --input=имя.txt`,
    );
    process.exit(1);
  }

  const inputName = inputArg.split("=").slice(1).join("=");
  const inputPath = path.isAbsolute(inputName)
    ? inputName
    : path.join(rawDir, inputName);

  if (!fs.existsSync(inputPath)) {
    console.error(`${stamp()} Файл не найден: ${inputPath}`);
    process.exit(1);
  }

  const baseName = path.basename(inputPath).replace(/\.[^.]+$/, "");
  const outDir = path.join(processedRoot, baseName);

  const fallenCsvPath = path.join(outDir, `${baseName}-fallen.csv`);
  const unclassifiedCsvPath = path.join(outDir, `${baseName}-unclassified.csv`);
  const errorCsvPath = path.join(outDir, `${baseName}-error.csv`);
  const repeatsTxtPath = path.join(outDir, `${baseName}-repeats.txt`);

  // ---------- 1. Пакетная фильтрация (Вариант Б) ----------
  const urls = readUrlList(inputPath);
  if (urls.length === 0) {
    console.error(
      `${stamp()} В файле нет ни одного URL (строки без http отфильтрованы): ${inputPath}`,
    );
    process.exit(1);
  }

  const registrySet = loadRegistrySet(globalProcessedFile);
  const repeats = [];
  const pending = [];
  for (const url of urls) {
    const id = extractIdFromUrl(url);
    if (id && registrySet.has(id)) repeats.push({ id, url });
    else pending.push(url);
  }
  const queue = pending.slice(0, LIMIT);
  const totalNew = queue.length;

  console.log(`${stamp()} Входной файл: ${inputPath}`);
  console.log(
    `${stamp()} Всего: ${urls.length} | Повторов: ${repeats.length} | Новых: ${totalNew}`,
  );

  // ---------- DRY-RUN: план без подключения к браузеру, файлы НЕ пишем ----------
  if (isDryRun) {
    console.log(
      `${stamp()} DRY-RUN: новых ${totalNew}, повторов ${repeats.length}. Файлы не записаны, реестр не изменён.`,
    );
    return;
  }

  if (repeats.length > 0) {
    // <имя>-repeats.txt — формат из п.10
    fs.mkdirSync(outDir, { recursive: true });
    const now = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const checkTime =
      `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ` +
      `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    const lines = [
      `# Файл: ${path.basename(inputPath)}`,
      `# Дата проверки: ${checkTime}`,
      `# Повторов найдено: ${repeats.length}`,
      "",
      ...repeats.map((r) => `${r.id}  ${r.url}`),
    ];
    fs.writeFileSync(repeatsTxtPath, lines.join("\n") + "\n", "utf-8");
  }

  if (queue.length === 0) {
    console.log(`${stamp()} Новых записей нет — парсинг не требуется.`);
    return;
  }

  // ---------- 2. Буферы и запись с атомарностью реестра ----------
  let fallenBuf = [];
  let unclassifiedBuf = [];
  let registryBuf = []; // id, готовые к внесению в реестр (CSV уже записан)
  const errorRows = []; // ошибки: только в error.csv, в реестр НЕ попадают

  // Создание CSV с заголовком (UTF-8 без BOM), если файла ещё нет
  function ensureCsvHeader(csvPath, headerLine) {
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    if (!fs.existsSync(csvPath)) {
      fs.writeFileSync(csvPath, headerLine + "\n", "utf-8");
    }
  }

  // Атомарность (п.4/«Реестр: атомарность»):
  //   1. fs.appendFileSync в CSV-файлы;
  //   2. ТОЛЬКО ПОТОМ fs.appendFileSync в processed_ids.txt.
  // Ситуация «id в реестре, а CSV нет» невозможна по построению.
  function flushBuffers() {
    if (
      fallenBuf.length === 0 &&
      unclassifiedBuf.length === 0 &&
      registryBuf.length === 0
    ) {
      return;
    }
    ensureCsvHeader(fallenCsvPath, HEADERS.join(","));
    ensureCsvHeader(unclassifiedCsvPath, HEADERS.join(","));

    if (fallenBuf.length > 0) {
      fs.appendFileSync(fallenCsvPath, fallenBuf.join("\n") + "\n", "utf-8");
      fallenBuf = [];
    }
    if (unclassifiedBuf.length > 0) {
      fs.appendFileSync(
        unclassifiedCsvPath,
        unclassifiedBuf.join("\n") + "\n",
        "utf-8",
      );
      unclassifiedBuf = [];
    }
    // Реестр — строго ПОСЛЕ физической записи CSV на диск
    if (registryBuf.length > 0) {
      fs.mkdirSync(summaryDir, { recursive: true }); // терпимость: файла может не быть
      fs.appendFileSync(
        globalProcessedFile,
        registryBuf.join("\n") + "\n",
        "utf-8",
      );
      registryBuf = [];
    }
  }

  const printProgress = makeProgressPrinter();
  let counters = { fallen: 0, unclassified: 0, error: 0 };

  // Колбэк по одной обработанной записи: буферизация + прогресс + flush каждые FLUSH_EVERY
  function onRecord(rec) {
    const idx = rec.index; // 1-based
    if (rec.status === "error") {
      counters.error++;
      errorRows.push(rec);
      ensureCsvHeader(
        errorCsvPath,
        "document_id,primary_url,error_type,error_message,Дата",
      );
      fs.appendFileSync(
        errorCsvPath,
        [
          escapeCsv(rec.documentId),
          escapeCsv(rec.url),
          escapeCsv(rec.errorType || "UNKNOWN"),
          escapeCsv(rec.message || ""),
          escapeCsv(today()),
        ].join(",") + "\n",
        "utf-8",
      );
      printProgress({
        current: idx,
        total: totalNew,
        documentId: rec.documentId,
        status: "error",
        errorType: rec.errorType,
      });
      return;
    }

    if (rec.status === "fallen") {
      counters.fallen++;
      fallenBuf.push(rowToCsvLine(rec.row));
    } else {
      counters.unclassified++;
      unclassifiedBuf.push(rowToCsvLine(rec.row));
    }
    registryBuf.push(`${rec.documentId}\t${rec.url}`);

    printProgress({
      current: idx,
      total: totalNew,
      row: rec.row,
      documentId: rec.documentId,
      status: rec.status,
    });

    const done = counters.fallen + counters.unclassified;
    if (done % FLUSH_EVERY === 0) {
      flushBuffers();
    }
  }

  // ---------- 3. Парсинг ----------
  let parsed;
  try {
    parsed = await parseUrls(queue, {
      port: PORT,
      onLog: () => {}, // весь смысловой вывод идёт через onRecord/прогресс
      onError: () => {},
      onRecord,
    });
  } catch (e) {
    console.error(
      `${stamp()} Не удалось подключиться к Edge CDP localhost:${PORT}: ${e.message}`,
    );
    console.error(
      `   Сначала запустите внешний Edge: powershell -File tools/run-edge-obd.ps1`,
    );
    process.exit(1);
  }

  // ---------- 4. Дописать остаток буферов (хвост < 50) ----------
  flushBuffers();

  // ---------- 5. Итоговый вывод (п.6): без эмодзи, тон строгий ----------
  const registryAdded = counters.fallen + counters.unclassified;
  console.log(`Сессия завершена: ${baseName}`);
  console.log(`   Всего в файле:      ${urls.length}`);
  console.log(
    `   Повторов:           ${repeats.length}` +
      (repeats.length > 0 ? `  → ${path.basename(repeatsTxtPath)}` : ""),
  );
  console.log(`   Новых обработано:   ${totalNew}`);
  console.log(
    `       Павшие (fallen):       ${counters.fallen}  → ${path.basename(fallenCsvPath)}`,
  );
  console.log(
    `       Прочие статусы:        ${counters.unclassified}  → ${path.basename(unclassifiedCsvPath)}`,
  );
  console.log(
    `       Ошибки:                ${counters.error}  → ${path.basename(errorCsvPath)}`,
  );
  console.log(
    `   Реестр обновлён:    ${registryAdded} записей (ошибки не в реестре)`,
  );
})().catch((err) => {
  console.error(`${stamp()} Фатальная ошибка:`, err);
  process.exit(1);
});
