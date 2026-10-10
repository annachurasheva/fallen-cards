/**
 * build-warunits-dict.js — перепись warunit (WARUNITS_DICT v2) с АВТОМАТИЧЕСКИМ
 * слиянием по набору чисел.
 *
 * ЗАПУСК:
 *   node scripts/build-warunits-dict.js
 *
 * ИСТОЧНИК:
 *   все CSV *-fallen.csv / *-unclassified.csv в data/processed/** (рекурсивно).
 *
 * ПРАВИЛА:
 *   - группировка по БУКВАЛЬНОЙ строке warunit (без trim, без toLowerCase);
 *   - автоматическое слияние: из каждой строки извлекаются все числа (/\d+/g),
 *     сортируются по возрастанию; группы с одинаковым набором чисел сливаются —
 *     выживает самая частая, остальные получают merge_into: <proposed_key выжившей>;
 *   - частота = количество уникальных document_id;
 *   - сортировка итоговых групп по убыванию частоты;
 *   - нумерация proposed_key: 001-fallen-cards, 002-fallen-cards, ...;
 *     стабильность — перенос прежних proposed_key по совпадению строки;
 *   - выход: data/dictionaries/warunits-draft3-<YYYY-MM-DD_HHMM>.json и .md;
 *     перезапись запрещена (существующие файлы не изменяются и не удаляются).
 *
 * ЗАПРЕЩЕНО: нормализации строк (trim/toLowerCase) для ключей группировки;
 * ручные слияния; чтение unit_keys.json.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ---------- Пути ----------
const PROCESSED_ROOT = path.join(ROOT, "data", "processed");
const DICTS_DIR = path.join(ROOT, "data", "dictionaries");

// Метка времени для имён файлов: YYYY-MM-DD_HHMM (та же функция-формат, что в units-report)
function dateStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// Защита от перезаписи: если имя занято — добавить секунды -<SS>
function uniquePath(dir, base, ext, d) {
  let name = `${base}-${dateStr(d)}${ext}`;
  let full = path.join(dir, name);
  if (fs.existsSync(full)) {
    const p = (n) => String(n).padStart(2, "0");
    name = `${base}-${dateStr(d)}-${p(d.getSeconds())}${ext}`;
    full = path.join(dir, name);
  }
  return full;
}

// ---------- Утилиты CSV ----------
function readUtf8(filepath) {
  return fs.readFileSync(filepath, "utf-8").replace(/^\uFEFF/, "");
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Сбор всех *-fallen.csv / *-unclassified.csv из data/processed/**
function collectCsvFiles(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && /-(?:fallen|unclassified)\.csv$/.test(e.name)) found.push(full);
    }
  };
  walk(dir);
  return found;
}

// ---------- Стабильность нумерации ----------
// Перенос прежних proposed_key по совпадению СТРОКИ: строка получает прежний
// номер группы, в которой она встречалась (первое/самое позднее вхождение).
// Источник — все warunits-draft3-*.json в data/dictionaries (сортировка имён
// = хронология, поздние перекрывают ранние).
function loadPreviousKeys() {
  const map = new Map(); // writing -> proposed_key
  if (!fs.existsSync(DICTS_DIR)) return map;
  const files = fs
    .readdirSync(DICTS_DIR)
    .filter((f) => /^warunits-draft3-.*\.json$/.test(f))
    .map((f) => path.join(DICTS_DIR, f))
    .sort(); // метка времени в имени → лексикографическая сортировка = хронологическая
  for (const f of files) {
    try {
      const data = JSON.parse(readUtf8(f));
      const groups = Array.isArray(data.groups) ? data.groups : [];
      for (const g of groups) {
        for (const v of g.variants || []) {
          map.set(v, g.proposed_key); // позднее вхождение перекрывает прежнее
        }
      }
    } catch {
      // повреждённый прежний файл пропускаем
    }
  }
  return map;
}

// ---------- Основная логика ----------
(function main() {
  const csvFiles = collectCsvFiles(PROCESSED_ROOT);
  if (csvFiles.length === 0) {
    console.error(`CSV (*-fallen.csv / *-unclassified.csv) не найдены в: ${PROCESSED_ROOT}`);
    process.exit(1);
  }

  // БУКВАЛЬНАЯ строка warunit → { ids: Set(document_id), sessions: Set, noId: число }
  const writings = new Map();
  let totalRows = 0;

  for (const file of csvFiles) {
    const session = path.basename(path.dirname(file));
    const lines = readUtf8(file).split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    const headers = parseCsvLine(lines[0]);
    const idxWarunit = headers.indexOf("warunit");
    const idxDocId = headers.indexOf("document_id");
    if (idxWarunit === -1) continue;

    for (const line of lines.slice(1)) {
      const cols = parseCsvLine(line);
      const wu = cols[idxWarunit] ?? "";
      if (wu === "") continue; // пустое поле игнорируется; само значение НЕ нормализуется
      totalRows++;
      if (!writings.has(wu)) {
        writings.set(wu, { ids: new Set(), sessions: new Set(), noId: 0 });
      }
      const rec = writings.get(wu);
      rec.sessions.add(session);
      const docId = idxDocId !== -1 ? (cols[idxDocId] ?? "") : "";
      if (docId !== "") rec.ids.add(docId);
      else rec.noId++;
    }
  }

  // Частота написания: уникальные document_id (+ фолбек для строк без id)
  const freqOf = (rec) => rec.ids.size + (rec.noId > 0 ? rec.noId : 0);

  // Сигнатура = отсортированный по возрастанию набор чисел строки
  const signatureOf = (s) =>
    (s.match(/\d+/g) || []).map(Number).sort((a, b) => a - b).join(",");

  // Шаг 1: группы по буквальной строке
  const byString = [...writings.entries()].map(([writing, rec]) => ({
    writing,
    count: freqOf(rec),
    ids: rec.ids,
    noId: rec.noId,
    sessions: rec.sessions,
    sig: signatureOf(writing),
  }));

  // Шаг 2: автоматическое слияние по сигнатуре набора чисел
  const bySig = new Map(); // sig -> [entries]
  for (const e of byString) {
    if (!bySig.has(e.sig)) bySig.set(e.sig, []);
    bySig.get(e.sig).push(e);
  }

  const mergedGroups = [];
  for (const [, entries] of bySig) {
    // выживает самая частая строка; при равенстве частот — буквальное сравнение для детерминизма
    entries.sort((a, b) => b.count - a.count || (a.writing < b.writing ? -1 : 1));
    const survivor = entries[0];
    const ids = new Set();
    let noId = 0;
    const sessions = new Set();
    for (const e of entries) {
      e.ids.forEach((id) => ids.add(id));
      noId += e.noId;
      e.sessions.forEach((s) => sessions.add(s));
    }
    mergedGroups.push({
      survivor: survivor.writing,
      variants: entries.map((e) => e.writing),
      merged: entries.slice(1).map((e) => e.writing),
      ids,
      noId,
      sessions,
      sig: survivor.sig,
    });
  }

  // Частота группы — по УНИКАЛЬНЫМ document_id внутри группы
  for (const g of mergedGroups) {
    g.frequency = g.ids.size + (g.noId > 0 ? g.noId : 0);
  }

  // Сортировка групп по убыванию частоты (детерминированный тай-брейк)
  mergedGroups.sort(
    (a, b) =>
      b.frequency - a.frequency ||
      (a.survivor < b.survivor ? -1 : a.survivor > b.survivor ? 1 : 0),
  );

  // Нумерация: стабильность через перенос прежних proposed_key по совпадению строки.
  // prevKeys заполняется из ПРЕЖНИХ прогонов (до создания текущего файла).
  const prevKeys = loadPreviousKeys();
  const usedKeys = new Set(); // занятые в ЭТОМ прогоне ключи
  let counter = 1;
  const keyForNew = () => {
    while (true) {
      const k = `${String(counter).padStart(3, "0")}-fallen-cards`;
      counter++;
      if (!usedKeys.has(k)) {
        usedKeys.add(k);
        return k;
      }
    }
  };

  const groupsOut = mergedGroups.map((g) => {
    // перенос прежнего proposed_key по совпадению строки (выжившая или любой вариант)
    let pk = null;
    for (const v of g.variants) {
      const cand = prevKeys.get(v);
      if (cand && !usedKeys.has(cand)) {
        pk = cand;
        break;
      }
    }
    if (!pk) pk = keyForNew();
    else usedKeys.add(pk);
    return { g, proposed_key: pk };
  });

  const finalGroups = groupsOut.map(({ g, proposed_key }) => ({
    proposed_key,
    key: null,
    merge_into: null,
    variants: g.variants,
    frequency: g.frequency,
    sessions: [...g.sessions].sort(),
  }));

  // Частота отдельной написания (для списка merge_into)
  const countByWriting = new Map(byString.map((e) => [e.writing, e.count]));

  // Строки, проигравшие слияние, получают запись с merge_into на выжившую группу
  const mergedEntries = [];
  for (const { g, proposed_key } of groupsOut) {
    for (const loser of g.merged) {
      mergedEntries.push({
        writing: loser,
        frequency: countByWriting.get(loser),
        merge_into: proposed_key,
      });
    }
  }
  mergedEntries.sort((a, b) => b.frequency - a.frequency);

  // ---------- Выход ----------

  const jsonPath = uniquePath(DICTS_DIR, "warunits-draft3", ".json", new Date());
  const mdPath = uniquePath(DICTS_DIR, "warunits-draft3", ".md", new Date());

  const payload = {
    _meta: {
      generated: new Date().toISOString(),
      schema: "WARUNITS_DICT v2 (draft3)",
      source: "data/processed/**/*-fallen.csv, *-unclassified.csv",
      rule_merge: "автоматическое слияние по отсортированному набору чисел (/\\d+/g)",
      rule_frequency: "уникальные document_id",
      strings_total: byString.length,
      groups_total: finalGroups.length,
      merged_total: mergedEntries.length,
      rows_scanned: totalRows,
    },
    groups: finalGroups,
    merged: mergedEntries,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf-8");

  const mdLines = [];
  mdLines.push(`# WARUNITS_DICT draft3 — перепись warunit (слияние по набору чисел)`);
  mdLines.push(``);
  mdLines.push(`- Источник: \`data/processed/**/*-fallen.csv\`, \`*-unclassified.csv\``);
  mdLines.push(`- Написаний (буквальных строк): ${byString.length}; групп после слияния: ${finalGroups.length}; слито строк: ${mergedEntries.length}`);
  mdLines.push(`- Частота = уникальные document_id. Сортировка по убыванию частоты.`);
  mdLines.push(``);
  mdLines.push(`## Топ-группы`);
  mdLines.push(``);
  mdLines.push(`| # | proposed_key | частота | выжившая строка | варианты |`);
  mdLines.push(`|---|---|---|---|---|`);
  finalGroups.slice(0, 60).forEach((g, i) => {
    const mergedSet = new Set(mergedEntries.filter((m) => m.merge_into === g.proposed_key).map((m) => m.writing));
    const survivor = g.variants.find((v) => !mergedSet.has(v)) || g.variants[0] || "";
    mdLines.push(
      `| ${i + 1} | ${g.proposed_key} | ${g.frequency} | ${survivor} | ${g.variants.length} |`,
    );
  });
  mdLines.push(``);
  mdLines.push(`## Слитые строки (merge_into)`);
  mdLines.push(``);
  mdLines.push(`| строка | частота | merge_into |`);
  mdLines.push(`|---|---|---|`);
  for (const m of mergedEntries) {
    mdLines.push(`| ${m.writing} | ${m.frequency} | ${m.merge_into} |`);
  }
  mdLines.push(``);
  fs.writeFileSync(mdPath, mdLines.join("\n"), "utf-8");

  console.log(`написаний: ${byString.length}, групп: ${finalGroups.length}, слито: ${mergedEntries.length}`);
  console.log(`выход: ${jsonPath}`);
  console.log(`       ${mdPath}`);
})();