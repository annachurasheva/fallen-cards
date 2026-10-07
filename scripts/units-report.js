/**
 * units-report.js — отчёт по warunit и журнал предложений (TASK-0014, TASK-0016).
 *
 * Назначение: показать, какие написания `warunit` встречаются в принятых CSV,
 * распознаны ли они словарями, и какие кандидаты нуждаются в выдаче нового ключа.
 *
 * ВЛАДЕНИЕ СЛОВАРЯМИ (TASK-0016): словари units*dict / units_registry / burials_* —
 * рабочие инструменты fallen-cards; пополнение выполняется ЗДЕСЬ решением Анны-Ch
 * по предложениям отчёта. Astro-репо получает копии словарей и раскрывает ключи
 * при генерации. locations_dict — внешний импорт, только чтение.
 *
 * ЧАСТОТЫ (TASK-0016): частота написания = число уникальных document_id;
 * строки без document_id учитываются по одной с ключом `__row__:<сессия>:<номер>`.
 * КАНДИДАТЫ: группировка по значению units_dict (одна часть = одно предложение,
 * observed_values = все написания); структурированный паттерн «полк + дивизия»
 * с расширенными токенами (гсп|полк|сп|п; гсд|мсд|сд|дивизия|див), длинные первыми.
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
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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

  // Частоты различных написаний warunit; частота = число УНИКАЛЬНЫХ document_id
  // с этим написанием (строки НЕ считаются: дубли одной персоны не надувают вес).
  // Строки без document_id учитываются по одной с ключом `__row__:<сессия>:<номер>`.
  const freq = new Map(); // raw value -> { ids:Set, sessions:Set }
  let totalRows = 0;
  let emptyWarunit = 0;
  let noIdRows = 0;
  const distinctIds = new Set();
  for (const csvFile of csvFiles) {
    const session = path.basename(path.dirname(csvFile));
    const objects = csvToObjects(readUtf8(csvFile));
    objects.forEach((row, rowIdx) => {
      totalRows++;
      const raw = String(row.warunit || "").trim();
      if (!raw) {
        emptyWarunit++;
        return;
      }
      const docId = String(row.document_id || "").trim();
      const dedupeKey = docId || `__row__:${session}:${rowIdx}`;
      if (docId) distinctIds.add(docId);
      else noIdRows++;
      if (!freq.has(raw))
        freq.set(raw, { ids: new Set(), sessions: new Set() });
      const e = freq.get(raw);
      e.ids.add(dedupeKey);
      e.sessions.add(session);
    });
  }

  // Статусы: есть в units_dict / нет в units_dict / есть в units_registry
  const entries = [...freq.entries()]
    .map(([value, info]) => {
      const inDict = Object.prototype.hasOwnProperty.call(unitsDict, value);
      const regKey = registryIndex.get(normKey(value)) || null;
      return {
        value,
        count: info.ids.size,
        _ids: info.ids, // для группировки: сумма уникальных document_id (TASK-0016)
        sessions: [...info.sessions].sort(),
        in_units_dict: inDict,
        in_units_registry: !!regKey,
        unit_key: regKey,
      };
    })
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ru"));

  const recognized = entries.filter((e) => e.in_units_registry);
  const candidates = entries.filter((e) => !e.in_units_registry);

  // ---------- Группировка кандидатов по значению units_dict (TASK-0016, п.1а) ----------
  // Одна часть (одно полное имя в словаре) = одно предложение;
  // observed_values = все встреченные написания; частота = сумма уникальных document_id.
  const dictGroups = new Map(); // dict value | null -> [entries]
  for (const e of candidates) {
    const v = unitsDict[e.value];
    const gkey = typeof v === "string" && v ? v : `__raw__:${normKey(e.value)}`;
    if (!dictGroups.has(gkey)) dictGroups.set(gkey, []);
    dictGroups.get(gkey).push(e);
  }

  // ---------- Структурированные кандидаты «полк + дивизия» (TASK-0016) ----------
  // Паттерн: число + токен полка и число + токен дивизии, в любом порядке.
  // Токены расширенные, с границами слов, длинные первыми.
  const isRegKey = (key) => Object.prototype.hasOwnProperty.call(unitsRegistry, key);

  const TOKEN_REGIMENT = "(?:гсп|полк|сп|п)(?:\\.+)?";
  const TOKEN_DIVISION = "(?:гсд|мсд|сд|дивизия|див)(?:\\.+)?";
  const reRegThenDiv = new RegExp(
    `(\\d+)\\s*[-\\u0451]?й?\\s*${TOKEN_REGIMENT}[\\s\\S]*?(\\d+)\\s*[-\\u0451]?й?\\s*${TOKEN_DIVISION}`,
    "iu",
  );
  const reDivThenReg = new RegExp(
    `(\\d+)\\s*[-\\u0451]?й?\\s*${TOKEN_DIVISION}[\\s\\S]*?(\\d+)\\s*[-\\u0451]?й?\\s*${TOKEN_REGIMENT}`,
    "iu",
  );

  const structuredGroups = new Map(); // proposed_key -> {reg, div, values:Set, ids:Set}
  const matchedValues = new Set(); // написание может дать пару только один раз
  const addStructured = (value, info) => {
    if (matchedValues.has(value)) return false;
    let m = value.match(reRegThenDiv);
    let reg, div;
    if (m) {
      reg = m[1];
      div = m[2];
    } else {
      m = value.match(reDivThenReg);
      if (!m) return false;
      div = m[1];
      reg = m[2];
    }
    const regKey = `unit-${reg}-sp`;
    const divKey = `unit-${div}-sd`;
    if (!(isRegKey(regKey) && isRegKey(divKey))) return false;
    matchedValues.add(value);
    const proposedKey = `unit-${reg}-sp-${div}-sd`;
    if (!structuredGroups.has(proposedKey)) {
      structuredGroups.set(proposedKey, {
        reg,
        div,
        regKey,
        divKey,
        values: new Set(),
        ids: new Set(),
      });
    }
    const g = structuredGroups.get(proposedKey);
    g.values.add(value);
    for (const id of info.ids) g.ids.add(id);
    return true;
  };

  const structuredList = [];
  for (const [gkey, groupEntries] of dictGroups) {
    const totalIds = new Set();
    for (const e of groupEntries) for (const id of e._ids) totalIds.add(id);
    const observedValues = groupEntries.map((e) => e.value);
    const rep = groupEntries.reduce((a, b) => (b.count > a.count ? b : a));
    // структурированный кандидат: все написания группы проверяются паттерном;
    // одно написание может дать пару «полк+дивизия» только один раз
    const structuredHits = [];
    for (const e of groupEntries) {
      if (addStructured(e.value, { ids: e._ids })) {
        structuredHits.push([...structuredGroups.keys()].pop());
      }
    }
    structuredList.push({
      kind: "unit_structured_candidate",
      group_basis: gkey.startsWith("__raw__:") ? null : gkey,
      proposed_key: structuredHits[0] || rep.unit_key || rep.proposed_key_fallback,
      observed_values: observedValues,
      count: totalIds.size,
      in_units_dict: observedValues.some((v) =>
        Object.prototype.hasOwnProperty.call(unitsDict, v),
      ),
      sessions: [...new Set(groupEntries.flatMap((e) => e.sessions))].sort(),
      action: "выдать unit_key в units_registry (fallen-cards), затем обновить копию в Astro",
    });
  }
  structuredList.sort((a, b) => b.count - a.count);

  const structuredBlocks = [...structuredGroups.entries()]
    .map(([proposedKey, g]) => ({
      kind: "unit_structured",
      proposed_key: proposedKey,
      regiment_key: g.regKey,
      division_key: g.divKey,
      observed_values: [...g.values],
      count: g.ids.size,
    }))
    .filter((b) => b.observed_values.length > 0)
    .sort((a, b) => b.count - a.count);

  // ---------- Отчёт md ----------
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = path.join(REPORTS_DIR, `units-${today()}.md`);
  const lines = [
    `# Отчёт по warunit — ${today()}`,
    "",
    `Источник: ${csvFiles.length} CSV-файл(ов), строк: ${totalRows} (уникальных document_id: ${distinctIds.size}; строк без id: ${noIdRows}; пустой warunit: ${emptyWarunit}).`,
    `Частота = число уникальных document_id на написание.`,
    "",
    "> Словари units*dict / units_registry / burials_* — рабочие инструменты fallen-cards;",
    "> пополнение выполняется здесь решением Анны-Ch по предложениям отчёта.",
    "> Astro-репо получает копии словарей и раскрывает ключи при генерации.",
    "> locations_dict — внешний импорт, только чтение.",
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
    "## Кандидаты на выдачу нового ключа (группировка по units_dict)",
    "",
    "Одна часть (одно значение units_dict) = одна строка; observed_values — все написания.",
    "",
    "| observed_values | частота | units_dict | сессии |",
    "|---|---|---|---|",
    ...(structuredList.length
      ? structuredList.map(
          (g) =>
            `| ${g.observed_values
              .map((v) => v.replace(/\|/g, "\\|"))
              .join("; ")} | ${g.count} | ${g.in_units_dict ? "есть" : "нет"} | ${g.sessions.join(", ")} |`,
        )
      : ["| — | | | |"]),
    "",
    "## Структурированные кандидаты «полк + дивизия»",
    "",
    "Паттерн: число + сп/полк/гсп/п и число + сд/див/дивизия/гсд/мсд, в любом порядке;",
    "предлагается, если оба числа есть в units_registry как отдельные юниты.",
    "",
    ...(structuredBlocks.length
      ? structuredBlocks.flatMap((b) => [
          `### ${b.proposed_key} (частота: ${b.count})`,
          "",
          `- полк: ${b.regiment_key}, дивизия: ${b.division_key}`,
          `- observed_values: ${b.observed_values.join("; ")}`,
          "",
        ])
      : ["— нет кандидатов, удовлетворяющих условию (оба числа в units_registry)", ""]),
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
        distinct_ids: distinctIds.size,
        no_id_rows: noIdRows,
        distinct_values: entries.length,
        recognized: recognized.length,
        proposals: structuredList.map((g) => ({
          kind: "unit",
          value: g.observed_values[0],
          observed_values: g.observed_values,
          count: g.count,
          in_units_dict: g.in_units_dict,
          sessions: g.sessions,
          action: "выдать unit_key в units_registry (fallen-cards), затем обновить копию в Astro",
        })),
        structured: structuredBlocks,
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  console.log(`Отчёт по warunit завершён:`);
  console.log(`   Написаний различных: ${entries.length}`);
  console.log(`   Распознано:          ${recognized.length}`);
  console.log(`   Кандидатов (групп):  ${structuredList.length}`);
  console.log(`   Структурированных:   ${structuredBlocks.length}`);
  console.log(`   → ${path.relative(ROOT, reportPath)}`);
  console.log(`   → ${path.relative(ROOT, proposalsPath)}`);
})().catch((err) => {
  console.error("Фатальная ошибка:", err);
  process.exit(1);
});
