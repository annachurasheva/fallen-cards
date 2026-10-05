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

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return fallback;
  }
}

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

// ---------- Орфографическая нормализация мест (НЕ трогает румбы/дистанции) ----------
const LAT2CYR = {
  a: "а",
  c: "с",
  e: "е",
  o: "о",
  p: "р",
  x: "х",
  y: "у",
  k: "к",
  m: "м",
  t: "т",
  b: "в",
};
function spellNorm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .split("")
    .map((ch) => LAT2CYR[ch] || ch)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

const SETTLEMENTS = loadJson(
  path.join(ROOT, "data", "dictionaries", "settlements.json"),
  null,
) || {
  korpech: ["корпечь"],
  frontovoe: ["фронтовое", "кой-асан"],
  ak_monay: ["ак-манай"],
  dalnie_kamyshi: ["дальние камыши"],
  vladislavovka: ["владиславовка"],
  tulunchak: ["тулумчак", "стульмчак"],
  dzhanatora: ["джантора", "львово"],
  feodosia: ["феодосия"],
};
function settlementOf(norm) {
  for (const [key, markers] of Object.entries(SETTLEMENTS)) {
    if (markers.some((m) => norm.includes(m))) return key;
  }
  return null;
}

// ---------- Привязка к объектам: твёрдо по current/rebural, гипотеза по primary ----------
const objectsDict = loadJson(
  path.join(ROOT, "data", "dictionaries", "burial-objects.json"),
  {},
);
const objBySettlement = {};
for (const [key, obj] of Object.entries(objectsDict)) {
  if (key.startsWith("_") || !obj || typeof obj !== "object") continue;
  const s = settlementOf(spellNorm(`${obj.name || ""} ${obj.location || ""}`));
  if (s && !objBySettlement[s]) objBySettlement[s] = obj.object_id;
}

function normalizeRow(row) {
  const primary = (row.primary_burial || "").trim();
  const current = (row.current_burial || "").trim();
  const rebural = (row.rebural_from || "").trim();
  const sPrim = settlementOf(spellNorm(primary));
  const sCur = settlementOf(spellNorm(`${current} ${rebural}`));
  const card = { ...row };
  card.field_site = primary || null;
  card.settlement_norm = sPrim || sCur || null;
  if (sCur && objBySettlement[sCur]) card.object_id = objBySettlement[sCur];
  else if (sPrim && objBySettlement[sPrim])
    card.object_id_hint = objBySettlement[sPrim];
  return card;
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
