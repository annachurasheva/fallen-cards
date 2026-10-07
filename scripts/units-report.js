/**
 * units-report.js — отчёт по warunit и журнал предложений (TASK-0014).
 *
 * Назначение: показать, какие написания `warunit` встречаются в принятых CSV,
 * распознаны ли они словарями, и какие кандидаты нуждаются в выдаче нового ключа.
 * Это журнал предложений для Astro-репо: пополнение словарей — там, не здесь.
 * Словари в fallen-cards — зеркала только для чтения; значения НЕ нормализуются.
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/units-report.js
 *
 * ВХОД : все *-fallen.csv / *-unclassified.csv в data/processed/<имя>/ (рекурсивно)
 * ВЫХОД: data/dictionaries/reports/units-<дата>.md  — отчёт с частотами и статусами
 *        data/dictionaries/reports/proposals.json   — кандидаты на выдачу нового ключа
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const PROCESSED_DIR = path.join(ROOT, "data", "processed");
const DICT_DIR = path.join(ROOT, "data", "dictionaries");
const REPORTS_DIR = path.join(DICT_DIR, "reports");

// ---------- Утилиты ----------

function readUtf8(filepath) {
  return fs.readFileSync(filepath, "utf-8").replace(/^\uFEFF/, "");
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function readJsonSafe(filepath) {
  if (!fs.existsSync(filepath)) return {};
  try {
    return JSON.parse(readUtf8(filepath));
  } catch (e) {
    console.error(`Словарь повреждён: ${filepath}: ${e.message}`);
    return {};
  }
}

function normKey(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------- Рекорд-осознающий парсер CSV (как в generate-cards.js) ----------

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
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
      rowHasData = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
      rowHasData = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (rowHasData || record.length > 1) rows.push(record);
      record = [];
      rowHasData = false;
    } else {
      field += c;
      rowHasData = true;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    rows.push(record);
  }
  return rows;
}

function csvToObjects(text) {
  const rows = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx] : "";
    });
    return obj;
  });
}

// ---------- Сбор файлов ----------

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

// ---------- Главная функция ----------
(async () => {
  const unitsDict = readJsonSafe(path.join(DICT_DIR, "units_dict.json"));
  const registryRaw = readJsonSafe(path.join(DICT_DIR, "units_registry.json"));
  const unitsRegistry = registryRaw.units || registryRaw;

  // Индекс dict_keys реестра: нормализованное написание -> unit_key
  const registryIndex = new Map();
  for (const [unitKey, unit] of Object.entries(unitsRegistry)) {
    const keysList = Array.isArray(unit.dict_keys) ? unit.dict_keys : [];
    for (const k of keysList) {
      const nk = normKey(k);
      if (nk && !registryIndex.has(nk)) registryIndex.set(nk, unitKey);
    }
  }

  const csvFiles = collectCsvFiles(PROCESSED_DIR);
  if (csvFiles.length === 0) {
    console.error(`CSV не найдены: ${PROCESSED_DIR}`);
    process.exit(1);
  }

  // Частоты различных написаний warunit (сырое написание — ключ статистики)
  const freq = new Map(); // raw value -> {count, sessions:Set}
  let totalRows = 0;
  let emptyWarunit = 0;

  for (const csvFile of csvFiles) {
    const session = path.basename(path.dirname(csvFile));
    const objects = csvToObjects(readUtf8(csvFile));
    for (const row of objects) {
      totalRows++;
      const raw = String(row.warunit || "").trim();
      if (!raw) {
        emptyWarunit++;
        continue;
      }
      if (!freq.has(raw)) freq.set(raw, { count: 0, sessions: new Set() });
      const e = freq.get(raw);
      e.count++;
      e.sessions.add(session);
    }
  }

  // Статусы: есть в units_dict / нет в units_dict / есть в units_registry
  const entries = [...freq.entries()]
    .map(([value, info]) => {
      const inDict = Object.prototype.hasOwnProperty.call(unitsDict, value);
      const regKey = registryIndex.get(normKey(value)) || null;
      return {
        value,
        count: info.count,
        sessions: [...info.sessions].sort(),
        in_units_dict: inDict,
        in_units_registry: !!regKey,
        unit_key: regKey,
      };
    })
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ru"));

  const recognized = entries.filter((e) => e.in_units_registry);
  const candidates = entries.filter((e) => !e.in_units_registry);

  // ---------- Отчёт md ----------
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = path.join(REPORTS_DIR, `units-${today()}.md`);
  const lines = [
    `# Отчёт по warunit — ${today()}`,
    "",
    `Источник: ${csvFiles.length} CSV-файл(ов), строк: ${totalRows} (пустой warunit: ${emptyWarunit}).`,
    `Различных написаний: ${entries.length}. Распознано units_registry: ${recognized.length}. Кандидатов на новый ключ: ${candidates.length}.`,
    "",
    "> Пополнение словарей выполняется в Astro-репо (mem-2026-soursecraft-site).",
    "> Зеркала в fallen-cards — только для чтения. Решения о ключах — Анна-Ch.",
    "",
    "## Распознанные написания",
    "",
    "| warunit | частота | units_dict | units_registry | unit_key |",
    "|---|---|---|---|---|",
    ...recognized.map(
      (e) =>
        `| ${e.value.replace(/\|/g, "\\|")} | ${e.count} | ${e.in_units_dict ? "есть" : "нет"} | есть | ${e.unit_key} |`,
    ),
    "",
    "## Кандидаты на выдачу нового ключа",
    "",
    "| warunit | частота | units_dict | сессии |",
    "|---|---|---|---|",
    ...(candidates.length
      ? candidates.map(
          (e) =>
            `| ${e.value.replace(/\|/g, "\\|")} | ${e.count} | ${e.in_units_dict ? "есть" : "нет"} | ${e.sessions.join(", ")} |`,
        )
      : ["| — | | | |"]),
    "",
  ];
  fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");

  // ---------- proposals.json ----------
  const proposalsPath = path.join(REPORTS_DIR, "proposals.json");
  fs.writeFileSync(
    proposalsPath,
    JSON.stringify(
      {
        generated_date: today(),
        source_csv: csvFiles.map((f) => path.relative(ROOT, f)),
        total_rows: totalRows,
        distinct_values: entries.length,
        recognized: recognized.length,
        proposals: candidates.map((e) => ({
          kind: "unit",
          value: e.value,
          count: e.count,
          in_units_dict: e.in_units_dict,
          sessions: e.sessions,
          action: "выдать новый unit_key в Astro-репо",
        })),
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  console.log(`Отчёт по warunit завершён:`);
  console.log(`   Написаний различных: ${entries.length}`);
  console.log(`   Распознано:          ${recognized.length}`);
  console.log(`   Кандидатов:          ${candidates.length}`);
  console.log(`   → ${path.relative(ROOT, reportPath)}`);
  console.log(`   → ${path.relative(ROOT, proposalsPath)}`);
})().catch((err) => {
  console.error("Фатальная ошибка:", err);
  process.exit(1);
});
