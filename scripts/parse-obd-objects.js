/**
 * parse-obd-objects.js — CLI парсинга объектов захоронений OBD Memorial
 * (ESM-порт логики донора obd-edge-objects.js).
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/parse-obd-objects.js --input=objects.txt            (файл из data/raw/)
 *   node scripts/parse-obd-objects.js --input=objects.txt --dry-run  (план без браузера)
 *   node scripts/parse-obd-objects.js --port=9227 --limit=10
 *   node scripts/parse-obd-objects.js --output=data/processed/
 *
 * ВЫХОД (для входного файла <имя>):
 *   <output>/<имя>/
 *     obyekty_zahoroneniya_VOV.csv   — один файл для всех объектов (UTF-8 с BOM)
 *     <имя>__session.log
 *     <имя>__errors.log
 *
 * ОСОБЕННОСТИ (по донору): операция разовая — контроль дублей и журнал
 * processed НЕ ведутся; notes/«тормоз» не используется.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  parseObjectUrls,
  toCsv,
} from "../src/parsers/obd-burial-objects/index.js";

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

// Имена выходных файлов (транслитом, как у донора)
const BASE_NAME = "obyekty_zahoroneniya_VOV";

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

// ---------- Главная функция ----------
(async () => {
  if (!inputArg) {
    console.error(
      "❌ Укажите входной файл: node scripts/parse-obd-objects.js --input=objects.txt",
    );
    process.exit(1);
  }

  const inputName = inputArg.split("=").slice(1).join("="); // на случай '=' в имени
  const inputPath = path.isAbsolute(inputName)
    ? inputName
    : path.join(rawDir, inputName);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Файл не найден: ${inputPath}`);
    process.exit(1);
  }

  const baseName = path.basename(inputPath).replace(/\.[^.]+$/, "");
  const outDir = path.join(processedRoot, baseName);
  const outCsvPath = path.join(outDir, `${BASE_NAME}.csv`);
  const sessionLogPath = path.join(outDir, `${baseName}__session.log`);
  const errorsLogPath = path.join(outDir, `${baseName}__errors.log`);

  let urls = readUrlList(inputPath);
  if (urls.length === 0) {
    console.error(
      "❌ В файле нет ни одного URL (строки без http отфильтрованы).",
    );
    process.exit(1);
  }
  if (LIMIT < urls.length) urls = urls.slice(0, LIMIT);

  function log(msg) {
    console.log(msg);
    if (!isDryRun) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.appendFileSync(sessionLogPath, msg + "\n", "utf-8");
    }
  }

  function logError(msg) {
    console.error(msg);
    if (!isDryRun) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.appendFileSync(sessionLogPath, "[ERROR] " + msg + "\n", "utf-8");
      fs.appendFileSync(errorsLogPath, msg + "\n", "utf-8");
    }
  }

  log("=== Парсер объектов захоронений OBD Memorial (ESM) ===");
  log(`📂 Входной файл: ${inputPath}`);
  log(
    `📄 URL к обработке: ${urls.length}${LIMIT < Infinity ? ` (limit=${LIMIT})` : ""}`,
  );
  log(`📁 Результат: ${outCsvPath}`);

  // ---------- DRY-RUN: план без подключения к браузеру ----------
  if (isDryRun) {
    log(
      `🔍 DRY-RUN: объектов к сбору ${urls.length}. Файлы НЕ записаны, браузер НЕ трогаем.`,
    );
    log(`✅ Итог: objects=0, errors=0 (dry-run)`);
    return;
  }

  // ---------- Парсинг ----------
  let parsed;
  try {
    parsed = await parseObjectUrls(urls, {
      port: PORT,
      onLog: log,
      onError: logError,
    });
  } catch (e) {
    logError(
      `❌ Не удалось подключиться к Edge CDP localhost:${PORT}: ${e.message}`,
    );
    logError(
      "   Сначала запустите внешний Edge с remote-debugging (порт 9226).",
    );
    process.exit(1);
  }

  const { results, errors } = parsed;

  // ---------- Запись результатов ----------
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outCsvPath, toCsv(results), "utf-8");
  log(`\n💾 Сохранено: ${outCsvPath} — ${results.length} записей`);

  log("\n=== Отчёт ===");
  log(`Объектов собрано: ${results.length}`);
  log(`Ошибок:           ${errors.length}`);
  log("✅ Готово!");
})().catch((err) => {
  console.error("❌ Фатальная ошибка:", err);
  process.exit(1);
});
