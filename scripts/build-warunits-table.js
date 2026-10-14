/**
 * build-warunits-table.js — сборка активного словаря warunits-fallen-cards.md
 * с сохранением ручных правок оператора и дописыванием кандидатов вниз.
 *
 * ЗАПУСК:
 *   node scripts/build-warunits-table.js [warunits-draft3-XXXX.json]
 *   (без аргумента — самый поздний warunits-draft3-*.json в data/dictionaries
 *   и data/dictionaries/proposals; свежие пары перепись пишет в proposals/)
 *
 * ПОВЕДЕНИЕ:
 *   - Донор (текущий data/dictionaries/warunits-fallen-cards.md) перед
 *     перезаписью сохраняется в warunits-fallen-cards_old<метка>.md
 *     (метка YYYY-MM-DD_HHMM, -SS при коллизии; история ручных правок).
 *   - ВСЁ, что сделано оператором (верифицированные ключи, строки
 *     «— (оператор)», шапка файла), сохраняется в новом мастере ДОСЛОВНО:
 *     операторская зона = всё до маркера <!-- CANDIDATES:BEGIN -->.
 *   - Кандидаты из draft3 (proposed_key = null) и новые написания активных
 *     групп (new_variants) дописываются вниз файла, в машинную секцию между
 *     маркерами CANDIDATES:BEGIN/END. Колонка 1 у кандидатов заполнена
 *     значением «— (оператор)» — пустых колонок не бывает.
 *   - sync-units-dict.js пропускает строки с ключом «— (оператор)»:
 *     в JSON-зеркало уходят только верифицированные ключи, кандидаты
 *     зеркало не загрязняют. sync-units-dict.js НЕ изменяется.
 *   - Идемпотентность: кандидат, чьё написание уже есть в операторской
 *     зоне (буквальное равенство по знакам), повторно не добавляется.
 *   - Дата прогона и состав фиксируются в
 *     data/dictionaries/proposals/warunits-table-index.json.
 *
 * ОГРАНИЧЕНИЯ:
 *   - Скрипт НЕ выдаёт ключи и НЕ переназначает выданные оператором.
 *   - Существующие строки оператора не переставляются и не редактируются.
 *   - draft3-файлы не изменяются.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DICTS_DIR = path.join(ROOT, "data", "dictionaries");
const PROPOSALS_DIR = path.join(DICTS_DIR, "proposals");
const TEXT_DIR = path.join(ROOT, "docs", "TEXT");
const MASTER = path.join(DICTS_DIR, "warunits-fallen-cards.md");
const INDEX_PATH = path.join(PROPOSALS_DIR, "warunits-table-index.json");

const BEGIN_MARKER = "<!-- CANDIDATES:BEGIN -->";
const END_MARKER = "<!-- CANDIDATES:END -->";

// ---------- Утилиты ----------
function readUtf8(filepath) {
  return fs.readFileSync(filepath, "utf-8").replace(/^\uFEFF/, "");
}

function makeTimestamp() {
  const iso = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  return iso.replace("T", "_"); // YYYY-MM-DD_HHMM
}

// Путь бэкапа донора: warunits-fallen-cards_old<метка>.md (-SS при коллизии)
function backupPath() {
  let ts = makeTimestamp();
  let p = path.join(DICTS_DIR, `warunits-fallen-cards_old${ts}.md`);
  if (fs.existsSync(p)) {
    ts = `${ts}-${String(new Date().getSeconds()).padStart(2, "0")}`;
    p = path.join(DICTS_DIR, `warunits-fallen-cards_old${ts}.md`);
  }
  return p;
}

// ---------- Выбор источника ----------
function pickSource() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (arg) {
    return path.isAbsolute(arg) ? arg : path.join(DICTS_DIR, arg);
  }
  // Свежие пары перепись build-warunits-dict.js пишет в proposals/,
  // исторические пары лежат в data/dictionaries — ищем в обоих каталогах.
  const cands = [];
  for (const dir of [PROPOSALS_DIR, DICTS_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/^warunits-draft3-.*\.json$/.test(f)) {
        cands.push(path.join(dir, f));
      }
    }
  }
  cands.sort(); // метка времени в имени → хронология
  if (cands.length === 0) {
    console.error(
      "warunits-draft3-*.json не найдены ни в data/dictionaries, ни в data/dictionaries/proposals.",
    );
    process.exit(1);
  }
  return cands[cands.length - 1]; // самый поздний
}

// ---------- Имена из docs/TEXT (единственный допустимый источник) ----------
const sig = (s) => (s.match(/\d+/g) || []).join(",");

function loadTitles() {
  const titles = [];
  if (!fs.existsSync(TEXT_DIR)) return titles;
  for (const f of fs.readdirSync(TEXT_DIR)) {
    if (!f.endsWith(".md")) continue;
    const m = fs
      .readFileSync(path.join(TEXT_DIR, f), "utf-8")
      .match(/^title:\s*(.+)$/m);
    if (m) titles.push(m[1].trim());
  }
  return titles;
}

// Точное совпадение: числовой ключ выжившей строки == числовой ключ заголовка.
function nameFor(survivor, titles) {
  const s = sig(survivor);
  if (s === "") return "— (оператор)";
  for (const t of titles) {
    if (sig(t) === s) return t;
  }
  return "— (оператор)";
}

// ---------- Операторская зона ----------
// Отделяем от машинной секции по маркеру CANDIDATES:BEGIN.
function operatorPartOf(text) {
  const idx = text.indexOf(BEGIN_MARKER);
  return idx >= 0 ? text.slice(0, idx) : text;
}

// Буквальные написания из строк таблицы (колонка 3) — для исключения дублей.
function collectExistingVariants(text) {
  const set = new Set();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (t.includes("---")) continue;
    const cells = t.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    if (/^(proposed_key|Ключ)$/.test(cells[0])) continue; // заголовок таблицы
    for (const v of cells[2].split(";")) {
      const s = v.trim();
      if (s) set.add(s);
    }
  }
  return set;
}

function countTableRows(text) {
  let n = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (t.includes("---")) continue;
    const cells = t.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    if (/^(proposed_key|Ключ)$/.test(cells[0])) continue;
    n++;
  }
  return n;
}

// ---------- Сборка ----------
const src = pickSource();
const d = JSON.parse(readUtf8(src));
if (!Array.isArray(d.groups)) {
  console.error(`В ${src} нет поля groups.`);
  process.exit(1);
}

// 1. Бэкап донора (текущего мастера), если он существует
let oldRel = null;
if (fs.existsSync(MASTER)) {
  const oldPath = backupPath();
  fs.copyFileSync(MASTER, oldPath);
  oldRel = path.relative(ROOT, oldPath);
}

// 2. Операторская зона — сохраняется дословно
const donor = fs.existsSync(MASTER) ? readUtf8(MASTER) : "";
const operatorPart = operatorPartOf(donor).trimEnd();
const operatorRows = countTableRows(operatorPart);
const existing = collectExistingVariants(operatorPart);

// 3. Кандидаты: новые группы (d.candidates) + доп. варианты активных групп
const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const candidateRows = [];
const pushCandidate = (variants, note) => {
  const vs = variants.filter(
    (v) => v.trim() !== "" && !existing.has(v.trim()),
  );
  if (vs.length === 0) return;
  vs.forEach((v) => existing.add(v.trim())); // защита от дублей между кандидатами
  candidateRows.push(`| — (оператор) | — (оператор) | ${vs.join("; ")} | ${note}, ${dateStr} |`);
};

for (const c of Array.isArray(d.candidates) ? d.candidates : []) {
  pushCandidate(c.variants || [], "кандидат");
}

const titles = loadTitles();
for (const g of d.groups || []) {
  const nvs = Array.isArray(g.new_variants) ? g.new_variants : [];
  if (nvs.length === 0) continue;
  pushCandidate(nvs, `доп. вариант группы ${g.proposed_key || "—"}`);
}

// 4. Новый мастер: операторская зона + машинная секция кандидатов
const section = [
  "",
  BEGIN_MARKER,
  "<!-- Машинная секция: правится скриптом build-warunits-table.js. Кандидаты на заполнение. -->",
  "| Ключ | Развёрнутое имя | Написания | Примечания |",
  "|---|---|---|---|",
  ...candidateRows,
  END_MARKER,
  "",
].join("\n");

const newText = (operatorPart ? operatorPart + "\n" : "") + section + "\n";
fs.writeFileSync(MASTER, newText, "utf-8");

// 5. Индекс прогонов (дата создания, источник, состав)
let index = { runs: [] };
if (fs.existsSync(INDEX_PATH)) {
  try {
    index = JSON.parse(readUtf8(INDEX_PATH));
  } catch {
    index = { runs: [] };
  }
  if (!Array.isArray(index.runs)) index.runs = [];
}
index.runs.unshift({
  created: new Date().toISOString(),
  source_draft3: path.relative(ROOT, src),
  master: path.relative(ROOT, MASTER),
  old_backup: oldRel,
  operator_rows: operatorRows,
  candidates_added: candidateRows.length,
});
fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");

// ---------- Самопроверка ----------
console.log(`источник draft3: ${src}`);
if (oldRel) console.log(`бэкап донора:    ${oldRel}`);
console.log(`выход (мастер):  ${path.relative(ROOT, MASTER)}`);
console.log(`строк оператора сохранено: ${operatorRows}`);
console.log(`кандидатов добавлено: ${candidateRows.length}`);
console.log(`индекс: ${path.relative(ROOT, INDEX_PATH)}`);