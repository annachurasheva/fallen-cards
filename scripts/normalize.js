/**
 * normalize.js — нормализация результатов парсера: генерация словарей мест
 * захоронения из CSV-выходов parse-obd.
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/normalize.js --input=obd_primary_urls_2026-10-04-test.txt
 *
 * ВЫХОД:
 *   data/dictionaries/burials_primary.json
 *   data/dictionaries/burials_current.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collectBurials } from "../src/normalizers/location.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const args = process.argv.slice(2);
const inputArg = args.find((a) => a.startsWith("--input="));

function parseCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function readCsvRows(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  const text = fs.readFileSync(csvPath, "utf-8").replace(/^\uFEFF/, "");
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] !== undefined ? cells[i] : "";
    });
    return row;
  });
}

(async () => {
  if (!inputArg) {
    console.error(
      "❌ Укажите входной файл: node scripts/normalize.js --input=<имя>",
    );
    process.exit(1);
  }
  const baseName = inputArg.split("=").slice(1).join("=");
  const dir = path.join(ROOT, "data", "processed", baseName);

  const csvFiles = ["killed", "other"].map((kind) =>
    path.join(
      dir,
      `${baseName}__${kind === "killed" ? "parser_mem2026" : "other_mem2026_"}.csv`,
    ),
  );

  let rows = [];
  for (const f of csvFiles) rows = rows.concat(readCsvRows(f));

  if (rows.length === 0) {
    console.error(`❌ Нет данных для нормализации в ${dir}`);
    process.exit(1);
  }

  const { primary, current } = collectBurials(rows);

  const dictDir = path.join(ROOT, "data", "dictionaries");
  fs.mkdirSync(dictDir, { recursive: true });
  fs.writeFileSync(
    path.join(dictDir, "burials_primary.json"),
    JSON.stringify(primary, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dictDir, "burials_current.json"),
    JSON.stringify(current, null, 2),
    "utf-8",
  );

  console.log(`✅ Нормализовано ${rows.length} строк.`);
  console.log(`   burials_primary.json: ${Object.keys(primary).length} мест`);
  console.log(`   burials_current.json: ${Object.keys(current).length} мест`);
})().catch((err) => {
  console.error("❌ Фатальная ошибка:", err);
  process.exit(1);
});
