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

// ---------- Проект пополнения units_registry.json (TASK-0016, п.2) ----------
// Одна запись на каждое РАЗЛИЧНОЕ значение units_dict (полное имя), встретившееся в CSV.
// type/number — из полного имени; parent полка — дивизия из имени (если есть в
// реестре или в комплекте); parent дивизии — фронт из написаний (СКФ/КрымФ), иначе null;
// history_note/camo_url/formation/disband — null, кроме однозначного переноса из
// существующих записей реестра того же номера. Автоприменения в units_registry.json НЕТ.

const UNIT_TYPE_PATTERNS = [
  { re: /дивизи[оая]\b(?!он)/i, type: "дивизия" }, // «…артиллерийский дивизион» — не дивизия
  { re: /дивизион\b/i, type: "дивизион" },
  { re: /горнострелков\S*\s+полк/i, type: "сп" }, // гсп — тоже стрелковый полк (-sp)
  { re: /стрелков\S*\s+полк/i, type: "сп" },
  { re: /артиллерийск\S*\s+полк/i, type: "ап" },
  { re: /авиационн\S*\s+полк/i, type: "иап" },
  { re: /минометн\S*\s+полк/i, type: "минп" },
  { re: /танков\S*\s+полк/i, type: "тп" },
  { re: /связи\s+полк|полк\s+связи/i, type: "пс" },
  { re: /развед\S*.{0,15}полк/i, type: "мп" },
  { re: /механизи\S*\s+полк|полк/i, type: "полк" },
  { re: /танков\S*\s+бригад/i, type: "тбр" },
  { re: /роты связи|рота связи/i, type: "олрс" },
  { re: /сап\S*\s+батальон/i, type: "осб" },
  { re: /батальон связи/i, type: "обс" },
  { re: /мед\S*-?\s*сан\S*\s+батальон|медико-санитарный батальон/i, type: "мсб" },
  { re: /пулеметн\S*\s+батальон/i, type: "птб" },
  { re: /аэродромного обслуживания/i, type: "бао" },
  { re: /танков\S*\s+батальон/i, type: "тб" },
  { re: /мотострелково\S*\s+батальон/i, type: "mspb" },
  { re: /отдельн\S*\s+батальон/i, type: "об" },
  { re: /батальон/i, type: "об" },
  { re: /бронерота/i, type: "брота" },
  { re: /охраны/i, type: "рота" },
  { re: /рота/i, type: "рота" },
  { re: /бригад/i, type: "бригада" },
  { re: /управление военно-полевого строительства/i, type: "впс" },
  { re: /дорожное управление/i, type: "дорма" },
  { re: /укрепл\S* район/i, type: "ур" },
  { re: /пункт сбора/i, type: "ппс" },
  { re: /^Армия|\bАрми/i, type: "армия" },
  { re: /фронт/i, type: "фронт" },
];

// Род юнита -> суффикс ключа по конвенции реестра (unit-<номер>-sp / -sd)
const KEY_SUFFIX_BY_TYPE = {
  сп: "sp", полк: "sp", ап: "ap", иап: "iap", минп: "minp", тп: "tp", пс: "ps",
  мп: "mp", дивизия: "sd", дивизион: "adn", тбр: "tbr", бригада: "br",
  олрс: "ols", осб: "osb", обс: "obs", мсб: "msb", птб: "ptb", бао: "bao",
  тб: "tb", mspb: "mspb", об: "ob", рота: "rc", брота: "brota", впс: "vps",
  дорма: "dorma", ур: "ur", ппс: "pps", армия: "army", фронт: "front", част: "unit",
};

// Слово рода в имени для извлечения номера (первое число перед этим словом)
const WORD_BY_TYPE = {
  сп: "полк", полк: "полк", ап: "полк", иап: "полк", минп: "полк", тп: "полк",
  пс: "полк", мп: "полк", дивизия: "дивизи", дивизион: "дивизион", тбр: "бригад",
  бригада: "бригад", олрс: "рот", осб: "батальон", обс: "батальон", мсб: "батальон",
  птб: "батальон", бао: "батальон", тб: "батальон", mspb: "батальон", об: "батальон",
  рота: "рот", брота: "рот", впс: "управлени", дорма: "управлени", ур: "район",
  ппс: "пункт", армия: "Арми", фронт: "фронт",
};

function parseUnitType(fullName) {
  for (const p of UNIT_TYPE_PATTERNS) {
    if (p.re.test(fullName)) return p.type;
  }
  return "част";
}

// Номер юнита: первое число перед словом рода. Для полка имя строится так,
// что номер стоит непосредственно перед словом («876-й стрелковый полк …»).
function extractNumberForType(fullName, type) {
  const word = WORD_BY_TYPE[type] || null;
  if (!word) return null;
  const m = fullName.match(new RegExp(`(\\d+)[-йаяе\\u0451]?[^\\d]*?${word}`, "i"));
  return m ? m[1] : null;
}

// Дивизия из полного имени: последнее число перед словом «дивизия/дивизии»
// с учётом определений («77-й горнострелковой дивизии» → 77).
function extractParentDivisionNumber(fullName) {
  const all = [...fullName.matchAll(/(\d+)[-йаяе\u0451]?[^\d]{0,40}?дивизи[йие]\b/gi)];
  if (all.length === 0) return null;
  return all[all.length - 1][1];
}

function frontFromTexts(texts) {
  let skf = false;
  let krym = false;
  for (const t of texts) {
    const v = normKey(t);
    if (/скф|северо-кавказск/.test(v)) skf = true;
    if (/крымф|крымск/.test(v)) krym = true;
  }
  if (skf && !krym) return "unit-skf-front";
  if (krym && !skf) return "unit-krymf-front";
  return null;
}

function buildRegistryDraft(unitsDict, unitsRegistry, entries, dateStr) {
  // Полные имена, встретившиеся в принятых CSV: значение dict <- наблюдавшиеся написания
  const valueToObserved = new Map(); // dict value -> Set(raw writings from CSV)
  const valueToIds = new Map(); // dict value -> Set(dedupe keys уникальных document_id)
  const valueToSessions = new Map(); // dict value -> Set(сессий)
  for (const e of entries) {
    const v = unitsDict[e.value];
    if (typeof v !== "string" || !v) continue; // только написания, покрытые units_dict
    if (!valueToObserved.has(v)) {
      valueToObserved.set(v, new Set());
      valueToIds.set(v, new Set());
      valueToSessions.set(v, new Set());
    }
    valueToObserved.get(v).add(e.value);
    for (const id of e._ids) valueToIds.get(v).add(id);
    for (const s of e.sessions) valueToSessions.get(v).add(s);
  }

  // Ключи реестра по типу/номеру для переноса известных полей и поиска родителя
  const regByTypeNumber = new Map(); // "<type>:<number>" -> unitKey
  for (const [unitKey, unit] of Object.entries(unitsRegistry)) {
    if (unit && unit.number != null) {
      regByTypeNumber.set(`${unit.type}:${unit.number}`, unitKey);
    }
  }

  // Первый проход: собрать записи и определить комплекты (новые дивизии)
  const drafts = new Map(); // proposed_key -> draft entry
  for (const [fullName, observed] of valueToObserved) {
    const type = parseUnitType(fullName);
    const number = extractNumberForType(fullName, type);
    if (!number) continue; // имя без привязанного номера — не предлагаем ключ вслепую
    const suffix = KEY_SUFFIX_BY_TYPE[type] || "unit";
    const proposedKey = `unit-${number}-${suffix}`;
    const existingKey = regByTypeNumber.get(`${type}:${number}`) ||
      (proposedKey in unitsRegistry ? proposedKey : null);
    const ex = existingKey ? unitsRegistry[existingKey] : null;
    const divNum = type === "полк" || type === "ап" ? extractParentDivisionNumber(fullName) : null;
    drafts.set(proposedKey, {
      proposedKey,
      existingKey,
      fullName,
      type,
      number: Number(number),
      dictKeys: [...observed].sort((a, b) => a.localeCompare(b, "ru")),
      count: valueToIds.get(fullName).size,
      sessions: [...valueToSessions.get(fullName)].sort(),
      divNum,
      front: frontFromTexts(observed),
      entry: {
        dict_keys: [...observed].sort((a, b) => a.localeCompare(b, "ru")),
        type,
        number: Number(number),
        parent: null,
        children: [],
        camo_url: ex ? ex.camo_url ?? null : null,
        formation: ex ? ex.formation ?? null : null,
        disband: ex ? ex.disband ?? null : null,
        status_note: ex ? ex.status_note ?? null : null,
        reference_url: ex ? ex.reference_url ?? null : null,
        history_note: ex ? ex.history_note ?? null : null,
      },
    });
  }

  // Второй проход: parent'ы
  for (const d of drafts.values()) {
    if (d.type === "полк" || d.type === "ап") {
      if (d.divNum) {
        const divKey = `unit-${d.divNum}-sd`;
        // дивизия есть в реестре ИЛИ включается в тот же комплект предложения
        if (divKey in unitsRegistry || drafts.has(divKey)) d.entry.parent = divKey;
      }
      if (d.entry.parent === null && d.front) d.entry.parent = d.front;
    } else if (d.type === "дивизия") {
      d.entry.parent = d.front; // фронт из написаний, иначе null
    }
  }

  // Существовавшие в реестре записи: помечаем, поля перенесены как есть
  const registryAdditions = {};
  const alreadyInRegistry = [];
  for (const d of drafts.values()) {
    if (d.existingKey) {
      alreadyInRegistry.push({ key: d.existingKey, proposed_key: d.proposedKey, dict_keys_add: d.dictKeys });
      continue; // в черновик добавлений НЕ кладём: запись уже в реестре
    }
    registryAdditions[d.proposedKey] = d.entry;
  }

  const draftJson = {
    generated_date: dateStr,
    note: "Проект пополнения units_registry.json (черновик на ревью Анны-Ch). Автоприменение запрещено.",
    additions: registryAdditions,
    already_in_registry: alreadyInRegistry,
  };

  const mdLines = [
    `# Проект пополнения units_registry — ${dateStr}`,
    "",
    "Черновик для ревью (TASK-0016, п.2). Никакого автоприменения в units_registry.json.",
    "Частота = число уникальных document_id (по всем написаниям полного имени).",
    "",
    "| proposed_key | type | parent | частота | dict_keys | сессии |",
    "|---|---|---|---|---|---|",
    ...Object.entries(registryAdditions)
      .sort((a, b) => b[1].number - a[1].number)
      .map(([key, e]) =>
        `| ${key} | ${e.type} | ${e.parent ?? "null"} | ${(drafts.get(key) || {}).count ?? ""} | ${(e.dict_keys || []).join("; ").replace(/\|/g, "\\|")} | ${((drafts.get(key) || {}).sessions || []).join(", ")} |`,
      ),
    "",
    alreadyInRegistry.length
      ? [
          "## Уже в реестре (предлагается лишь дописать dict_keys)",
          "",
          "| ключ | dict_keys для сверки |",
          "|---|---|",
          ...alreadyInRegistry.map(
            (r) => `| ${r.key} | ${r.dict_keys_add.join("; ").replace(/\|/g, "\\|")} |`,
          ),
        ]
      : [],
    "",
  ].flat();

  return { draftJson, mdLines };
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
    `(\\d+)\\s*[\\u0451]?й?\\s*${TOKEN_REGIMENT}[\\s\\S]*?(\\d+)\\s*[\\u0451]?й?\\s*${TOKEN_DIVISION}`,
    "iu",
  );
  const reDivThenReg = new RegExp(
    `(\\d+)\\s*[\\u0451]?й?\\s*${TOKEN_DIVISION}[\\s\\S]*?(\\d+)\\s*[\\u0451]?й?\\s*${TOKEN_REGIMENT}`,
    "iu",
  );

  // Фронт из написания для parent новой дивизии комплекта (TASK-0016, п.1)
  const frontFromValue = (value) => {
    const v = normKey(value);
    if (/скф|северо-кавказск/.test(v)) return "unit-skf-front";
    if (/крымф|крымск/.test(v)) return "unit-krymf-front";
    return null;
  };

  const structuredGroups = new Map(); // pairKey -> {reg, div, values:Set, ids:Set, fronts:Set}
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
    // Ворота (исправленные): regKey МОЖЕТ отсутствовать — он и есть предлагаемый полк;
    // предложение рождается, если divKey есть в units_registry ИЛИ divKey включается
    // в тот же комплект предложения (новая дивизия рядом с новым полком).
    const divExists = isRegKey(divKey);
    const regExists = isRegKey(regKey);
    if (!divExists && !(!regExists && !isRegKey(`unit-${reg}-sd`) && !isRegKey(`unit-${div}-sp`))) {
      return false;
    }
    matchedValues.add(value);
    const pairKey = `${regKey}|${divKey}`;
    if (!structuredGroups.has(pairKey)) {
      structuredGroups.set(pairKey, {
        reg,
        div,
        regKey,
        divKey,
        values: new Set(),
        ids: new Set(),
        fronts: new Set(),
      });
    }
    const g = structuredGroups.get(pairKey);
    g.values.add(value);
    for (const id of info.ids) g.ids.add(id);
    const fr = frontFromValue(value);
    if (fr) g.fronts.add(fr);
    return true;
  };

  // ---------- Комплект предложения по паре «полк + дивизия» ----------
  // proposed_key полка — unit-<номер>-sp с parent: unit-<номер>-sd;
  // при отсутствии дивизии в реестре комплект содержит вторую запись
  // unit-<номер>-sd (type: дивизия, parent — фронт из написания, иначе null).
  function buildBundle(g) {
    const divExists = isRegKey(g.divKey);
    const regExists = isRegKey(g.regKey);
    const divFront =
      divExists && unitsRegistry[g.divKey]
        ? unitsRegistry[g.divKey].parent ?? null
        : g.fronts.size === 1
          ? [...g.fronts][0]
          : null;
    const bundle = [];
    if (!regExists) {
      bundle.push({
        proposed_key: g.regKey,
        type: "полк",
        number: Number(g.reg),
        parent: g.divKey,
        new_division_in_bundle: !divExists,
      });
    }
    if (!divExists) {
      bundle.push({
        proposed_key: g.divKey,
        type: "дивизия",
        number: Number(g.div),
        parent: divFront,
      });
    }
    return { divExists, regExists, divFront, bundle };
  }

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
    .map(([pairKey, g]) => {
      const b = buildBundle(g);
      return {
        kind: "unit_structured",
        pair_key: pairKey,
        proposed_key: b.regExists ? g.divKey : g.regKey,
        regiment_key: g.regKey,
        division_key: g.divKey,
        regiment_exists: b.regExists,
        division_exists: b.divExists,
        bundle: b.bundle,
        observed_values: [...g.values],
        count: g.ids.size,
      };
    })
    .filter((blk) => blk.observed_values.length > 0)
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
    "предлагается, если дивизия есть в units_registry ИЛИ входит в тот же комплект",
    "предложения (полк может быть новым — он и есть продукт предложения).",
    "",
    ...(structuredBlocks.length
      ? structuredBlocks.flatMap((b) => {
          const rows = [
            `### ${b.proposed_key} (частота: ${b.count})`,
            "",
            `- полк: ${b.regiment_key}${b.regiment_exists ? " (есть в реестре)" : " (предлагается)"}, дивизия: ${b.division_key}${b.division_exists ? " (есть в реестре)" : " (предлагается)"}`,
            `- observed_values: ${b.observed_values.join("; ")}`,
          ];
          if (b.bundle.length > 0) {
            rows.push(`- комплект предложения:`);
            for (const item of b.bundle) {
              rows.push(
                `  - ${item.proposed_key} — ${item.type}, parent: ${item.parent ?? "null"}`,
              );
            }
          }
          rows.push("");
          return rows;
        })
      : ["— нет кандидатов, удовлетворяющих условию (дивизия в реестре или в комплекте)", ""]),
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

  // ---------- Проект пополнения реестра (черновик на ревью, п.2) ----------
  const PROPOSALS_DIR = path.join(DICT_DIR, "proposals");
  fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
  const dateStr = today();
  const draftJsonPath = path.join(PROPOSALS_DIR, `registry-draft-${dateStr}.json`);
  const draftMdPath = path.join(PROPOSALS_DIR, `registry-draft-${dateStr}.md`);
  const { draftJson, mdLines } = buildRegistryDraft(unitsDict, unitsRegistry, entries, dateStr);
  fs.writeFileSync(draftJsonPath, JSON.stringify(draftJson, null, 2) + "\n", "utf-8");
  fs.writeFileSync(draftMdPath, mdLines.join("\n"), "utf-8");
  console.log(`   Проект реестра:      добавлений ${Object.keys(draftJson.additions).length}, уже в реестре ${draftJson.already_in_registry.length}`);
  console.log(`   → ${path.relative(ROOT, draftJsonPath)}`);
  console.log(`   → ${path.relative(ROOT, draftMdPath)}`);
})().catch((err) => {
  console.error("Фатальная ошибка:", err);
  process.exit(1);
});
