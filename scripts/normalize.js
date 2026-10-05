/**
 * normalize.js — нормализация результатов парсера и экспертных файлов.
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/normalize.js --input=obd_primary_urls_2026-09-22-22-37-31
 *   node scripts/normalize.js --input=experts
 *   node scripts/normalize.js --input=data/processed/experts/killed.csv   (путь как есть)
 *
 * ВЫХОД:
 *   рядом с каждым csv: <basename>__normalized.json и <basename>__skipped.txt
 *   data/dictionaries/burials_primary.json / burials_current.json
 *   (словари ПЕРЕСЧИТЫВАЮТСЯ целиком из всех __normalized.json на диске)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collectBurials } from "../src/normalizers/location.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PROC = path.join(ROOT, "data", "processed");

const args = process.argv.slice(2);
const inputArg = args.find((a) => a.startsWith("--input="));

// ---------- Приём входа: файл как есть / папка как есть / имя под data/processed ----------
function resolveInputs(raw) {
  const stripped = raw.replace(/^data[\/\\]processed[\/\\]/, "");
  for (const c of [raw, stripped, path.join(PROC, stripped)]) {
    if (!fs.existsSync(c)) continue;
    const st = fs.statSync(c);
    if (st.isFile()) return [c];
    if (st.isDirectory()) {
      return fs
        .readdirSync(c)
        .filter((f) => f.toLowerCase().endsWith(".csv"))
        .sort()
        .map((f) => path.join(c, f));
    }
  }
  return [];
}

// ---------- CSV (кавычки/запятые/BOM) ----------
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
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else cur += ch;
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

function normalizeRow(row) {
  return { ...row };
}

// ---------- Обход всех normalized на диске ----------
function walkNormalized(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkNormalized(p, out);
    else if (e.name.endsWith("__normalized.json")) out.push(p);
  }
  return out;
}

(async () => {
  if (!inputArg) {
    console.error(
      "❌ Укажите вход: node scripts/normalize.js --input=<файл|папка|имя>",
    );
    process.exit(1);
  }
  const raw = inputArg.split("=").slice(1).join("=");
  const files = resolveInputs(raw);
  if (!files.length) {
    console.error(`❌ Нет данных для нормализации: ${raw}`);
    process.exit(1);
  }

  const seen = new Set();
  let totalRows = 0,
    totalKept = 0,
    totalSkipped = 0,
    noId = 0;

  for (const f of files) {
    const rows = readCsvRows(f);
    const base = path.basename(f).replace(/\.csv$/i, "");
    const outDir = path.dirname(f);
    const kept = [];
    const skippedLines = [];
    for (const row of rows) {
      const id = (row.document_id || "").trim();
      if (!id) {
        noId++;
        kept.push(normalizeRow(row));
        continue;
      }
      if (seen.has(id)) {
        totalSkipped++;
        skippedLines.push(
          `${id} | ${row.last_name || ""} ${row.first_name || ""} | duplicate_in_run`,
        );
        continue;
      }
      seen.add(id);
      kept.push(normalizeRow(row));
    }
    totalRows += rows.length;
    totalKept += kept.length;
    fs.writeFileSync(
      path.join(outDir, `${base}__normalized.json`),
      JSON.stringify(kept, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(outDir, `${base}__skipped.txt`),
      skippedLines.length ? skippedLines.join("\n") + "\n" : "",
      "utf-8",
    );
    console.log(
      `📄 ${path.basename(f)}: строк ${rows.length}, нормализовано ${kept.length}, дубликатов ${skippedLines.length}`,
    );
  }

  console.log(`⏭️  Пропущено дубликатов (по document_id): ${totalSkipped}`);
  if (noId) console.log(`⚠️  Без document_id (оставлены как есть): ${noId}`);

  // Словари — пересчёт ЦЕЛИКОМ из всех normalized на диске (идемпотентно)
  const all = [];
  const gseen = new Set();
  for (const f of walkNormalized(PROC)) {
    let arr = [];
    try {
      arr = JSON.parse(fs.readFileSync(f, "utf-8"));
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;
    for (const c of arr) {
      const id =
        (c.document_id || "").trim() ||
        `${c.last_name}|${c.first_name}|${c.date_death}`;
      if (gseen.has(id)) continue;
      gseen.add(id);
      all.push(c);
    }
  }
  const { primary, current } = collectBurials(all);
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

  console.log(
    `✅ Нормализовано ${totalKept} строк; уникальных в словарях: ${all.length}.`,
  );
  console.log(`   burials_primary.json: ${Object.keys(primary).length} мест`);
  console.log(`   burials_current.json: ${Object.keys(current).length} мест`);
})().catch((err) => {
  console.error("❌ Фатальная ошибка:", err);
  process.exit(1);
});
