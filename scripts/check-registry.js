// check-registry.js — разовая сверка целостности: реестр ↔ CSV. Только чтение.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function readUtf8(p) { return fs.readFileSync(p, "utf-8").replace(/^\uFEFF/, ""); }

// RFC4180-парсер (тот же, что в generate-cards.js): кавычки, "", многострочные поля
function parseCsvRecords(text) {
  const rows = []; let field = ""; let record = []; let inQuotes = false; let rowHasData = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') { inQuotes = true; rowHasData = true; }
    else if (c === ",") { record.push(field); field = ""; rowHasData = true; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field); field = "";
      if (rowHasData || record.length > 1) rows.push(record);
      record = []; rowHasData = false;
    } else { field += c; rowHasData = true; }
  }
  if (field !== "" || record.length > 0) { record.push(field); rows.push(record); }
  return rows;
}
function csvToObjects(text) {
  const rows = parseCsvRecords(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {}; headers.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ""; }); return o;
  });
}

// ---------- 1) Реестр ----------
const regPath = path.join(ROOT, "data", "summary", "processed_ids.txt");
const regIds = [];
for (const t of readUtf8(regPath).split(/\r?\n/)) {
  const s = t.trim(); if (!s || s.startsWith("#")) continue;
  const id = s.split(/\s+/)[0]; if (/^\d+$/.test(id)) regIds.push(id);
}
const regCount = new Map();
for (const id of regIds) regCount.set(id, (regCount.get(id) || 0) + 1);
const regDups = [...regCount.entries()].filter(([, c]) => c > 1);

// ---------- 2) CSV (experts не трогаем: у них свой контур регистрации) ----------
const csvIds = new Map(); // id -> [сессии]
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name); const st = fs.statSync(full);
    if (st.isDirectory()) { if (name !== "experts") walk(full); continue; }
    if (!/-(fallen|unclassified)\.csv$/.test(name)) continue;
    const session = path.basename(path.dirname(full));
    for (const r of csvToObjects(readUtf8(full))) {
      const id = String(r.document_id || "").trim(); if (!id) continue;
      if (!csvIds.has(id)) csvIds.set(id, []);
      csvIds.get(id).push(session);
    }
  }
})(path.join(ROOT, "data", "processed"));
const csvDups = [...csvIds.entries()].filter(([, s]) => s.length > 1);

// ---------- 3) Перекрёстно ----------
const regSet = new Set(regIds);
const inCsvNotReg = [...csvIds.keys()].filter((id) => !regSet.has(id));
const inRegNotCsv = [...regSet].filter((id) => !csvIds.has(id));

console.log(`РЕЕСТР: строк ${regIds.length}, уникальных ${regSet.size}, дублей: ${regDups.length}`);
for (const [id, c] of regDups) console.log(`  дубль реестра: ${id} × ${c}`);
console.log(`CSV: уникальных id ${csvIds.size}, id с >1 строкой: ${csvDups.length}`);
for (const [id, s] of csvDups) console.log(`  дубль CSV: ${id} → ${s.join(", ")}`);
console.log(`В CSV, но НЕТ в реестре (при следующем прогоне уйдут в повторный парсинг): ${inCsvNotReg.length}`);
for (const id of inCsvNotReg) console.log(`  ${id}`);
console.log(`В реестре, но НЕТ в CSV («сироты»: считаются повторами, а строки нигде нет): ${inRegNotCsv.length}`);
for (const id of inRegNotCsv) console.log(`  ${id}`);