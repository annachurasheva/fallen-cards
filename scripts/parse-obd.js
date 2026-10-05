/**
 * parse-obd.js — CLI парсинга карточек персон OBD Memorial (ESM).
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/parse-obd.js --input=obd_primary_urls_2026-10-04-test.txt
 *   node scripts/parse-obd.js --input=file.txt --dry-run
 *   node scripts/parse-obd.js --input=file.txt --port=9227 --limit=50
 *   node scripts/parse-obd.js --input=file.txt --output=data/processed/
 *
 * ВЫХОД (для входного файла <имя>):
 *   <output>/<имя>/
 *     <имя>__parser_mem2026.csv        — fallen (UTF-8 с BOM)
 *     <имя>__other_mem2026_.csv        — unclassified (UTF-8 с BOM)
 *     <имя>__session.log               — лог сессии
 *     <имя>__errors.log                — ошибки страниц
 *     <имя>__processed.txt             — id+url обработанных (локальный журнал)
 *   data/summary/processed_ids.txt     — глобальный журнал (дополняется)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseUrls, toCsv } from "../src/parsers/obd-memorial/index.js";
import { HEADERS } from "../src/parsers/obd-memorial/extractors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ---------- Параметры ----------
const DEFAULT_PORT = 9226;
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

// Чтение файла со списком URL: пропускаем пустые строки, комментарии (#) и не-http
function readUrlList(filepath) {
  if (!fs.existsSync(filepath)) return [];
  return fs
    .readFileSync(filepath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .filter((line) => line.startsWith("http"));
}

// Извлечение document_id из URL: id=(\d+)
function extractIdFromUrl(url) {
  const m = url.match(/id=(\d+)/);
  return m ? m[1] : "";
}

// Загрузка множества уже обработанных id (глобальный + локальный журналы)
function loadProcessedIds(globalFile, localFile) {
  const set = new Set();
  for (const f of [globalFile, localFile]) {
    if (fs.existsSync(f)) {
      fs.readFileSync(f, "utf-8")
        .split("\n")
        .forEach((line) => {
          const t = line.trim();
          if (t && !t.startsWith("#")) {
            // формат записи: "<id>	<url>" или просто "<id>"
            const id = t.split(/\s+/)[0];
            if (/^\d+$/.test(id)) set.add(id);
          }
        });
    }
  }
  return set;
}

// ---------- Главная функция ----------
(async () => {
  if (!inputArg) {
    console.error(
      "❌ Укажите входной файл: node scripts/parse-obd.js --input=имя.txt",
    );
    process.exit(1);
  }

  const inputName = inputArg.split("=").slice(1).join("=");
  const inputPath = path.isAbsolute(inputName)
    ? inputName
    : path.join(rawDir, inputName);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Файл не найден: ${inputPath}`);
    process.exit(1);
  }

  const baseName = path.basename(inputPath).replace(/\.[^.]+$/, "");
  const outDir = path.join(processedRoot, baseName);
  const localProcessedFile = path.join(outDir, `${baseName}__processed.txt`);

  let urls = readUrlList(inputPath);
  if (urls.length === 0) {
    console.error(
      "❌ В файле нет ни одного URL (строки без http отфильтрованы).",
    );
    process.exit(1);
  }

  // ---------- Пропуск обработанных ----------
  const processedSet = loadProcessedIds(
    globalProcessedFile,
    localProcessedFile,
  );
  const skipped = [];
  const pending = [];
  for (const url of urls) {
    const id = extractIdFromUrl(url);
    if (id && processedSet.has(id)) skipped.push(url);
    else pending.push(url);
  }

  const limited = pending.slice(0, LIMIT);

  function log(msg) {
    console.log(msg);
    if (!isDryRun) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.appendFileSync(
        path.join(outDir, `${baseName}__session.log`),
        msg + "\n",
        "utf-8",
      );
    }
  }

  function logError(msg) {
    console.error(msg);
    if (!isDryRun) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.appendFileSync(
        path.join(outDir, `${baseName}__session.log`),
        "[ERROR] " + msg + "\n",
        "utf-8",
      );
      fs.appendFileSync(
        path.join(outDir, `${baseName}__errors.log`),
        msg + "\n",
        "utf-8",
      );
    }
  }

  log("=== Парсер карточек персон OBD Memorial (ESM) ===");
  log(`📂 Входной файл: ${inputPath}`);
  log(
    `📄 Всего URL: ${urls.length}, осталось обработать: ${limited.length}, пропуск: ${skipped.length}`,
  );

  // ---------- DRY-RUN: план без подключения к браузеру ----------
  if (isDryRun) {
    log(
      `🔍 DRY-RUN: новых ${limited.length}, пропуск ${skipped.length}. Файлы НЕ записаны, журналы/сумма НЕ изменены.`,
    );
    log(
      `✅ Итог: fallen=0, unclassified=0, errors=0, пропущено=${skipped.length}`,
    );
    return;
  }

  if (LIMIT < pending.length) {
    log(
      `⚠️  Ограничение: --limit=${LIMIT} (обрабатываю только первые ${LIMIT})`,
    );
  }

  // ---------- Парсинг ----------
  let parsed;
  try {
    parsed = await parseUrls(limited, {
      port: PORT,
      onLog: log,
      onError: logError,
    });
  } catch (e) {
    logError(
      `❌ Не удалось подключиться к Edge CDP localhost:${PORT}: ${e.message}`,
    );
    logError(
      "   Сначала запустите внешний Edge: powershell -File tools/run-edge-obd.ps1",
    );
    process.exit(1);
  }

  const { fallen, unclassified, errors } = parsed;

  // ---------- Запись результатов ----------
  fs.mkdirSync(outDir, { recursive: true });

  const fallenCsvPath = path.join(outDir, `${baseName}__parser_mem2026.csv`);
  const unclassifiedCsvPath = path.join(
    outDir,
    `${baseName}__other_mem2026_.csv`,
  );
  fs.writeFileSync(fallenCsvPath, toCsv(fallen), "utf-8");
  fs.writeFileSync(unclassifiedCsvPath, toCsv(unclassified), "utf-8");

  // Локальный журнал обработанных (id	url) — все дошедшие страницы
  const doneRows = [...fallen, ...unclassified].map(
    (r) =>
      `${r.document_id || extractIdFromUrl(r.primary_url)}	${r.primary_url}`,
  );
  fs.appendFileSync(
    localProcessedFile,
    doneRows.join("\n") + (doneRows.length ? "\n" : ""),
    "utf-8",
  );

  // Глобальный журнал
  fs.mkdirSync(summaryDir, { recursive: true });
  fs.appendFileSync(
    globalProcessedFile,
    doneRows.join("\n") + (doneRows.length ? "\n" : ""),
    "utf-8",
  );

  log(
    `\n💾 CSV: ${fallenCsvPath} (${fallen.length}), ${unclassifiedCsvPath} (${unclassified.length})`,
  );
  log("\n=== Отчёт ===");
  log(
    `fallen=${fallen.length}, unclassified=${unclassified.length}, errors=${errors.length}, пропущено=${skipped.length}`,
  );
  log("✅ Готово!");
})().catch((err) => {
  console.error("❌ Фатальная ошибка:", err);
  process.exit(1);
});