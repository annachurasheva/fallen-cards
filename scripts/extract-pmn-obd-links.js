// scripts/extract-pmn-obd-links.js
// Извлекает nomer_dela (6-я колонка) из pamyat_parsed_rfc4180.csv
// и формирует список URL для obd-memorial

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const INPUT_FILE = path.join(ROOT, "data", "raw", "pamyat_parsed_rfc4180.csv");
const OUTPUT_FILE = path.join(ROOT, "data", "raw", "links_pmn_to_obd.txt");

function readUtf8(filepath) {
  return fs.readFileSync(filepath, "utf-8").replace(/^\uFEFF/, "");
}

function parseCsvRecords(text) {
  const rows = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      record.push(field);
      field = "";
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      if (record.length > 0 || field) {
        record.push(field);
        rows.push(record);
        record = [];
        field = "";
      }
    } else {
      field += char;
    }
  }
  if (record.length > 0 || field) {
    record.push(field);
    rows.push(record);
  }
  return rows;
}

const text = readUtf8(INPUT_FILE);
const rows = parseCsvRecords(text);

// Пропускаем заголовок (первая строка)
const dataRows = rows.slice(1);

const obdIds = [];
let emptyCount = 0;

for (const row of dataRows) {
  // 6-я колонка (индекс 5) — nomer_dela
  const nomerDela = (row[5] || "").trim();
  if (nomerDela && /^\d+$/.test(nomerDela)) {
    obdIds.push(nomerDela);
  } else {
    emptyCount++;
  }
}

// Формируем URL
const urls = obdIds.map(id => `https://obd-memorial.ru/html/info.htm?id=${id}`);

// Записываем
fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, urls.join("\n") + "\n", "utf-8");

console.log(`Всего строк в pmn-файле: ${dataRows.length}`);
console.log(`С непустым nomer_dela: ${obdIds.length}`);
console.log(`Пустые nomer_dela: ${emptyCount}`);
console.log(`\nЗаписано в ${OUTPUT_FILE}`);
console.log(`Запустите: node scripts/parse-obd.js --input=links_pmn_to_obd.txt`);