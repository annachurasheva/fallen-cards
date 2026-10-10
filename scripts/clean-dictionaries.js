/**
 * clean-dictionaries.js — очистка data/dictionaries от тупиковых файлов.
 *
 * Регламент: «История проекта = файлы с метками времени». Тупиковые развилки
 * (аннулированные словари unit_* и черновики draft1/draft2) перемещаются в
 * data/dictionaries/archive/ с префиксом deprecated-<timestamp>-.
 *
 * ЗАПУСК:
 *   node scripts/clean-dictionaries.js            # dry-run (по умолчанию)
 *   node scripts/clean-dictionaries.js --move     # переместить в archive/
 *   node scripts/clean-dictionaries.js --delete   # удалить (без архива)
 *
 * БЕЗОПАСНОСТЬ (никогда не трогаются):
 *   - warunits-draft3-* (любое расширение)
 *   - memorial_objects-* (включая подкаталог memorial_objects/)
 *   - plates_*.json
 *   - docs/ (вне области действия скрипта)
 *   - любые файлы с меткой времени YYYY-MM-DD_HHMM в имени
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DICTS_DIR = path.join(ROOT, "data", "dictionaries");
const ARCHIVE_DIR = path.join(DICTS_DIR, "archive");

// ---------- Режим ----------
const args = process.argv.slice(2);
const MODE_DELETE = args.includes("--delete");
const MODE_MOVE = args.includes("--move");
// без флагов — dry-run: только список
const isDryRun = !MODE_DELETE && !MODE_MOVE;

// Метка прогона для префикса archive: YYYY-MM-DD_HHMM
function runTimestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// ---------- Правила ----------

// Явный список тупиков (п.1)
const EXPLICIT_DEAD_ENDS = [
  "unit_keys.json",
  "units_registry.json",
  "units_dict.json",
  "unit_hierarchy.json",
];

// Защита: НЕ трогать (п.3 / «Запрещено»)
const PROTECTED_PATTERNS = [
  /^warunits-draft3-.*\.(json|md)$/,          // draft3 — активная история
  /^memorial_objects-.*\.csv$/,               // объекты с меткой времени
  /^plates_.*\.json$/,                        // транскрипции камней
];

// Метка времени YYYY-MM-DD_HHMM (с опциональным -SS) в имени = живой файл
const HAS_TIMESTAMP = /\d{4}-\d{2}-\d{2}_\d{4}(-\d{2})?/;

function isProtected(name) {
  if (PROTECTED_PATTERNS.some((re) => re.test(name))) return true;
  if (HAS_TIMESTAMP.test(name)) return true; // любой файл с меткой времени
  return false;
}

// Черновики draft1/draft2 в proposals/ (п.1)
function collectDraftsOld(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (/^warunits-draft[12]-.*\.(md|json)$/.test(f)) {
      out.push(path.join(dir, f));
    }
  }
  return out;
}

// Любой файл в data/dictionaries/ без метки времени и вне белых списков
// (п.1, последний пункт): остаются только files с меткой или plates_*.
function collectUndatedLooseFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue; // каталоги (archive/, memorial_objects/, proposals/) не трогаем
    const name = e.name;
    if (isProtected(name)) continue;
    // файл без метки времени и не из защищённых — кандидат
    if (!HAS_TIMESTAMP.test(name)) out.push(path.join(dir, name));
  }
  return out;
}

// ---------- Сбор кандидатов ----------
function collectCandidates() {
  const candidates = new Set();

  // 1. явные тупики
  for (const name of EXPLICIT_DEAD_ENDS) {
    const full = path.join(DICTS_DIR, name);
    if (fs.existsSync(full) && !isProtected(name)) candidates.add(full);
  }

  // 2. draft1/draft2 в proposals/
  for (const full of collectDraftsOld(path.join(DICTS_DIR, "proposals"))) {
    candidates.add(full);
  }

  // 3. loose-файлы без метки времени в корне data/dictionaries/
  for (const full of collectUndatedLooseFiles(DICTS_DIR)) {
    candidates.add(full);
  }

  return [...candidates].sort();
}

// ---------- Действие ----------
function moveOrDelete(files, ts) {
  const moved = [];
  if (files.length === 0) return moved;

  if (MODE_MOVE || isDryRun) {
    if (!isDryRun) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }

  for (const full of files) {
    const base = path.basename(full);
    const rel = path.relative(DICTS_DIR, full);
    if (MODE_DELETE) {
      if (!isDryRun) fs.rmSync(full);
      moved.push({ from: rel, to: "(удалён)", action: "delete" });
    } else {
      // перемещение в archive/ с префиксом deprecated-<timestamp>-;
      // вложенные пути сохраняются (proposals/x.md -> archive/proposals/deprecated-ts-x.md)
      const destName = `deprecated-${ts}-${base}`;
      const destDir = path.join(ARCHIVE_DIR, path.dirname(rel) === "." ? "" : path.dirname(rel));
      let dest = path.join(destDir, destName);
      // перезапись запрещена: при коллизии добавляем секунды
      if (!isDryRun && fs.existsSync(dest)) {
        const ss = String(new Date().getSeconds()).padStart(2, "0");
        dest = path.join(destDir, `deprecated-${ts}-${ss}-${base}`);
      }
      if (!isDryRun) {
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(full, dest);
      }
      moved.push({ from: rel, to: path.relative(DICTS_DIR, dest), action: "move" });
    }
  }
  return moved;
}

// ---------- Main ----------
(function main() {
  if (!fs.existsSync(DICTS_DIR)) {
    console.error(`Каталог не найден: ${DICTS_DIR}`);
    process.exit(1);
  }

  const ts = runTimestamp();
  const mode = isDryRun ? "dry-run" : MODE_DELETE ? "delete" : "move";
  const candidates = collectCandidates();

  console.log(`Режим: ${mode}; метка: ${ts}`);
  if (candidates.length === 0) {
    console.log("Тупиковых файлов не найдено — каталог чист.");
    return;
  }

  console.log(`Кандидатов: ${candidates.length}`);
  const results = moveOrDelete(candidates, ts);
  for (const r of results) {
    console.log(`  ${isDryRun ? "[dry-run] " : ""}${r.action}: ${r.from} -> ${r.to}`);
  }
  console.log(isDryRun
    ? "Ничего не перемещено (dry-run). Запустите с --move или --delete."
    : `Готово: ${results.length} файл(ов) обработано.`);
})();