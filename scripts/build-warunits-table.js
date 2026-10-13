/**
 * build-warunits-table.js — механическая сборка единого активного словаря
 * data/dictionaries/warunits-fallen-cards.md из draft3-json.
 *
 * ЗАПУСК:
 *   node scripts/build-warunits-table.js [warunits-draft3-XXXX.json]
 *   (без аргумента — самый поздний warunits-draft3-*.json в data/dictionaries
 *   и data/dictionaries/proposals; свежие пары перепись пишет в proposals/)
 *
 * ПРАВИЛА (по промпту оператора):
 *   - Источник строк: выбранный draft3-json, ВСЕ группы, без срезов/порогов;
 *     порядок строк таблицы = порядок групп в json.
 *   - Колонки (4, сверх не добавлять):
 *       1. proposed_key (семантический ключ <NNN>-00-fallen-cards /
 *          <NNN>-<MM>-fallen-cards или «— (оператор)»; у кандидатов — null);
 *       2. развёрнутое имя: только из docs/TEXT/*.md (front-matter title),
 *          по точному совпадению числового ключа выжившей строки и заголовка;
 *          нет совпадения — «— (оператор)». Скрипт НЕ выдумывает имена.
 *       3. написания: массив variants буквально, через «; »;
 *       4. примечания: карта примечаний оператором не заполняется → пусто.
 *   - draft3-файлы не изменяются; перезапись выходного md безопасна (это живой
 *     словарь, а не история прогонов).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DICTS_DIR = path.join(ROOT, "data", "dictionaries");
const PROPOSALS_DIR = path.join(DICTS_DIR, "proposals");
const TEXT_DIR = path.join(ROOT, "docs", "TEXT");
const OUT = path.join(DICTS_DIR, "warunits-fallen-cards.md");

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

// ---------- Числовой ключ строки ----------
const sig = (s) => (s.match(/\d+/g) || []).join(",");

// ---------- Имена из docs/TEXT (единственный допустимый источник) ----------
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
// Род/тип подразделения при этом тоже должен встречаться в заголовке или быть
// нечисловым сокращением — не угадываем: при любом расхождении чисел — прочерк.
function nameFor(survivor, titles) {
  const s = sig(survivor);
  if (s === "") return "— (оператор)";
  for (const t of titles) {
    if (sig(t) === s) return t;
  }
  return "— (оператор)";
}

// ---------- Сборка ----------
const src = pickSource();
const d = JSON.parse(fs.readFileSync(src, "utf-8").replace(/^\uFEFF/, ""));
if (!Array.isArray(d.groups)) {
  console.error(`В ${src} нет поля groups.`);
  process.exit(1);
}
const mergedSet = new Set((d.merged || []).map((m) => m.writing));
const titles = loadTitles();

const rows = d.groups.map((g) => {
  const survivor = g.variants.find((v) => !mergedSet.has(v)) || g.variants[0] || "";
  const key = g.proposed_key;
  const name = nameFor(survivor, titles);
  const writings = g.variants.join("; ");
  const note = ""; // карта примечаний: не заполняется
  return `| ${key} | ${name} | ${writings} | ${note} |`;
});

const header = [
  "# Словарь warunit — fallen-cards",
  "",
  `- Источник строк: \`${path.relative(ROOT, src)}\` (${d.groups.length} групп, порядок = порядок в json).`,
  "- Колонка 2: развёрнутое имя только из docs/TEXT (совпадение числового ключа); нет — «— (оператор)».",
  "- Колонка 3: написания (variants) буквально, через «; ». Колонка 4: примечания (карта не заполняется).",
  "",
  "| proposed_key | Развёрнутое имя | Написания, опознаваемые в CSV | Примечания |",
  "|---|---|---|---|",
];

fs.writeFileSync(OUT, header.concat(rows, "").join("\n"), "utf-8");

// ---------- Самопроверка критериев приёмки ----------
const tableLines = rows.length;
const keysUnique = new Set(d.groups.map((g) => g.proposed_key)).size === tableLines;
console.log(`источник: ${src}`);
console.log(`выход:    ${OUT}`);
console.log(`строк таблицы: ${tableLines} (групп в json: ${d.groups.length}) — ${tableLines === d.groups.length ? "OK" : "FAIL"}`);
console.log(`колонка 1 уникальна: ${keysUnique ? "OK" : "FAIL"}`);
const named = rows.filter((r) => !r.includes("(оператор)")).length;
console.log(`имён из docs/TEXT: ${named}; прочерков: ${tableLines - named}`);