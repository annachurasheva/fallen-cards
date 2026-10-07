/**
 * pmn-crosscheck.js — разовая сверка индексов pmn с корпусом obd.
 * Читает CSV pmn (RFC4180), забирает document_id (6-я колонка),
 * строит ссылки obd для парсинга и сравнивает соответствие с принятым корпусом.
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/pmn-crosscheck.js --input=pamyat_parsed_rfc4180.csv
 * ВЫХОД:
 *   data/raw/links_pmn_obd.txt                    — ссылки obd для parse-obd.js
 *   data/dictionaries/reports/pmn-crosscheck-<дата>.md — отчёт соответствия
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const args = process.argv.slice(2);
const inputArg = args.find((a) => a.startsWith("--input="));
const inputName = inputArg ? inputArg.split("=").slice(1).join("=") : "pamyat_parsed_rfc4180.csv";
const inputPath = path.isAbsolute(inputName)
  ? inputName
  : path.join(ROOT, "data", "raw", inputName);

function readUtf8(p) { return fs.readFileSync(p, "utf-8").replace(/^\uFEFF/, ""); }
function today() { return new Date().toISOString().split("T")[0]; }
function normName(s) {
  return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

// ---------- RFC4180: кавычки, "" внутри, многострочные поля ----------
function parseCsvRecords(text) {
  const rows = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let rowHasData = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
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

// ---------- Корпус obd: реестр + CSV ----------
const regPath = path.join(ROOT, "data", "summary", "processed_ids.txt");
const registry = new Set();
if (fs.existsSync(regPath)) {
  for (const line of readUtf8(regPath).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const id = t.split(/\s+/)[0];
    if (/^\d+$/.test(id)) registry.add(id);
  }
}

const corpus = new Map(); // id -> {session, kind, fio}
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/-(fallen|unclassified)\.csv$/.test(name)) {
      const session = path.basename(path.dirname(full));
      for (const r of csvToObjects(readUtf8(full))) {
        const id = String(r.document_id || "").trim();
        if (!id || corpus.has(id)) continue;
        corpus.set(id, {
          session,
          kind: name.endsWith("-fallen.csv") ? "fallen" : "unclassified",
          fio: normName(`${r.last_name || ""} ${r.first_name || ""} ${r.middle_name || ""}`),
        });
      }
    }
  }
})(path.join(ROOT, "data", "processed"));

// ---------- Чтение pmn и сверка ----------
if (!fs.existsSync(inputPath)) {
  console.error(`Файл не найден: ${inputPath}`);
  process.exit(1);
}
const pmnRows = csvToObjects(readUtf8(inputPath));

const seen = new Set();
const links = [];
const report = [];
let dupInFile = 0, inRegistry = 0, inCorpus = 0, nameMatch = 0, nameDiff = 0, absent = 0;

for (const r of pmnRows) {
  const id = String(r.document_id || "").trim();
  const fioPmn = normName(`${r.last_name || ""} ${r.first_name || ""} ${r.middle_name || ""}`);
  const fioDisplay = `${r.last_name || ""} ${r.first_name || ""} ${r.middle_name || ""}`.trim();
  if (!id || !/^\d+$/.test(id)) continue;
  if (seen.has(id)) { dupInFile++; continue; }
  seen.add(id);
  links.push(`https://obd-memorial.ru/html/info.htm?id=${id}`);

  const inReg = registry.has(id);
  const hit = corpus.get(id) || null;
  let match = "—";
  if (hit) {
    inCorpus++;
    if (hit.fio && fioPmn && hit.fio === fioPmn) { nameMatch++; match = "да"; }
    else { nameDiff++; match = `НЕТ (obd: ${hit.fio || "пусто"})`; }
  } else absent++;
  if (inReg) inRegistry++;

  report.push(
    `| ${id} | ${fioDisplay} | ${inReg ? "да" : "нет"} | ${hit ? hit.session + "/" + hit.kind : "—"} | ${match} |`,
  );
}

// ---------- Выход ----------
const linksPath = path.join(ROOT, "data", "raw", "links_pmn_obd.txt");
fs.mkdirSync(path.dirname(linksPath), { recursive: true });
fs.writeFileSync(linksPath, links.join("\n") + "\n", "utf-8");

const reportsDir = path.join(ROOT, "data", "dictionaries", "reports");
fs.mkdirSync(reportsDir, { recursive: true });
const repPath = path.join(reportsDir, `pmn-crosscheck-${today()}.md`);
fs.writeFileSync(repPath, [
  `# Сверка pmn → obd — ${today()}`,
  "",
  `Источник pmn: ${path.relative(ROOT, inputPath)}; строк: ${pmnRows.length}; уникальных id: ${seen.length} (дублей в файле: ${dupInFile}).`,
  `В реестре obd (processed_ids.txt): ${inRegistry}.`,
  `Найдено в CSV корпуса obd: ${inCorpus} (совпадение ФИО: ${nameMatch}; расхождение ФИО: ${nameDiff}).`,
  `Отсутствуют в корпусе obd: ${absent} — уйдут в парсинг по ${path.relative(ROOT, linksPath)}.`,
  "",
  "| id | ФИО pmn | в реестре | сессия obd | ФИО совпадает |",
  "|---|---|---|---|---|",
  ...report,
  "",
].join("\n"), "utf-8");

console.log(`Строк pmn: ${pmnRows.length}; уникальных id: ${seen.length} (дублей: ${dupInFile})`);
console.log(`В реестре obd: ${inRegistry}`);
console.log(`В CSV корпуса: ${inCorpus} (ФИО совпадают: ${nameMatch}; расходятся: ${nameDiff})`);
console.log(`Отсутствуют в корпусе: ${absent}`);
console.log(`→ ${path.relative(ROOT, linksPath)}`);
console.log(`→ ${path.relative(ROOT, repPath)}`);