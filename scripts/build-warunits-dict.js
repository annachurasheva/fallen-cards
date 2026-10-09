/**
 * build-warunits-dict.js — ШАГ 1: наполнение из исходных данных (CSV из OBD).
 * Перепись буквальных написаний warunit БЕЗ нормализаций:
 * группа переписи = строка как есть (кириллица, регистр, пробелы).
 * Частота = число уникальных document_id группы.
 * Возле каждой группы — предполагаемый ключ <NNN>-fallen-cards,
 * 001 — самому массовому повтору, далее по убыванию частоты.
 * ВЫХОД (черновик, НЕ трогает warunits_dict.json):
 *   data/dictionaries/proposals/warunits-draft-<дата>.json
 *   data/dictionaries/proposals/warunits-draft-<дата>.md
 * ШАГ 2 (анализ) и ШАГ 3 (разнос ключа во frontmatter) — отдельными решениями.
 * ИСПОЛЬЗОВАНИЕ: node scripts/build-warunits-dict.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PROCESSED_DIR = path.join(ROOT, "data", "processed");
const OUT_DIR = path.join(ROOT, "data", "dictionaries", "proposals");

function readUtf8(p) { return fs.readFileSync(p, "utf-8").replace(/^\uFEFF/, ""); }
function today() { return new Date().toISOString().split("T")[0]; }

function parseCsvRecords(text) {
  const rows = [];
  let field = ""; let record = []; let inQuotes = false; let rowHasData = false;
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
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ""; });
    return o;
  });
}
function collectCsvFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...collectCsvFiles(full));
    else if (/-(fallen|unclassified)\.csv$/.test(name)) out.push(full);
  }
  return out.sort();
}

const csvFiles = collectCsvFiles(PROCESSED_DIR);
if (!csvFiles.length) { console.error(`CSV не найдены: ${PROCESSED_DIR}`); process.exit(1); }

// Группа переписи = буквальная строка warunit (без trim, без регистра, без схлопываний)
const groups = new Map(); // literal -> { ids:Set, sessions:Set, samples:[] }
let totalRows = 0; let emptyWarunit = 0;

for (const f of csvFiles) {
  const session = path.basename(path.dirname(f));
  for (const row of csvToObjects(readUtf8(f))) {
    totalRows++;
    const raw = row.warunit === undefined ? "" : String(row.warunit);
    if (!raw) { emptyWarunit++; continue; }
    const docId = String(row.document_id || "").trim();
    const dedupeKey = docId || `__row__:${session}:${totalRows}`;
    if (!groups.has(raw)) groups.set(raw, { ids: new Set(), sessions: new Set(), samples: [] });
    const g = groups.get(raw);
    g.ids.add(dedupeKey);
    g.sessions.add(session);
    if (docId && g.samples.length < 3 && !g.samples.includes(docId)) g.samples.push(docId);
  }
}

const sorted = [...groups.entries()]
  .map(([literal, g]) => ({ literal, frequency: g.ids.size, sessions: [...g.sessions].sort(), sample_ids: g.samples }))
  .sort((a, b) => b.frequency - a.frequency || a.literal.localeCompare(b.literal, "ru"));

const groupsOut = sorted.map((g, idx) => ({
  proposed_key: `${String(idx + 1).padStart(3, "0")}-fallen-cards`,
  key: null,        // ШАГ 2: подтверждённый ключ (решение оператора)
  merge_into: null, // ШАГ 2: влить вариант в группу с этим proposed_key
  variants: [g.literal],
  frequency: g.frequency,
  sessions: g.sessions,
  sample_ids: g.sample_ids,
}));

const out = {
  _operator_note: {
    purpose: "ШАГ 1: перепись буквальных написаний warunit из принятых CSV OBD. Группы = строки как есть; ключи предполагаемые.",
    generated_date: today(),
    generated_from: csvFiles.map((f) => path.relative(ROOT, f)),
    key_format: "<NNN>-fallen-cards; 001 — самый массовый повтор; номер выдаётся один раз и навсегда",
    rule: "Никаких нормализаций: совпадение = точное равенство строк. ШАГ 2 (слияние вариантов в группы, подтверждение key) и ШАГ 3 (разнос во frontmatter) — решения оператора, не этого скрипта.",
  },
  groups: groupsOut,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const d = today();
const jsonPath = path.join(OUT_DIR, `warunits-draft-${d}.json`);
const mdPath = path.join(OUT_DIR, `warunits-draft-${d}.md`);
fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2) + "\n", "utf-8");
fs.writeFileSync(mdPath, [
  `# Перепись написаний warunit — ${d} (ШАГ 1, черновик)`,
  "",
  `Строк CSV: ${totalRows} (пустой warunit: ${emptyWarunit}). Групп переписи: ${groupsOut.length}.`,
  "Ключ предполагается по убыванию частоты; 001 — самый массовый повтор.",
  "",
  "| proposed_key | частота | написание (буквально) | сессии |",
  "|---|---|---|---|",
  ...groupsOut.map((g) => `| ${g.proposed_key} | ${g.frequency} | ${g.variants[0].replace(/\|/g, "\\|")} | ${g.sessions.join(", ")} |`),
  "",
].join("\n"), "utf-8");

console.log(`Групп переписи: ${groupsOut.length} (строк CSV: ${totalRows}, пустой warunit: ${emptyWarunit})`);
console.log("Топ-10:");
for (const g of groupsOut.slice(0, 10)) console.log(`  ${g.proposed_key} | ${g.frequency} | ${g.variants[0]}`);
console.log(`→ ${path.relative(ROOT, jsonPath)}`);
console.log(`→ ${path.relative(ROOT, mdPath)}`);