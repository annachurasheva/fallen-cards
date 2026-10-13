/**
 * units-report.js — отчёт по воинским частям (units_dict / unit_keys) для ревью Анны-Ch.
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/units-report.js [--input=data/processed] [--dict=data/dictionaries/units_dict.json]
 *
 * ВЫХОД:
 *   data/dictionaries/reports/units-<дата>_<время>.md          — сводка и кандидаты
 *   data/dictionaries/proposals/proposals-<дата>_<время>.json  — машиночитаемые предложения
 *   data/dictionaries/proposals/registry-draft-<дата>_<время>.json/.md — проект пополнения unit_keys
 *
 * ПРАВИЛА (TASK-0016):
 *   - частоты считаются по УНИКАЛЬНЫМ document_id (дубли строк не завышают частоту);
 *   - группировка написаний — по значению units_dict (синонимы в одной группе);
 *   - структурированный кандидат «полк + дивизия» рождается, когда паттерн матчит
 *     И (divKey есть в unit_keys ИЛИ divKey включается в тот же комплект предложения);
 *     regKey может отсутствовать — он и есть предлагаемый полк;
 *   - никакого автоприменения в unit_keys.json.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ---------- Параметры ----------
const args = process.argv.slice(2);
const INPUT_ARG = args.find((a) => a.startsWith("--input="));
const DICT_ARG = args.find((a) => a.startsWith("--dict="));

const processedRoot = INPUT_ARG
  ? path.resolve(ROOT, INPUT_ARG.split("=").slice(1).join("="))
  : path.join(ROOT, "data", "processed");
const dictPath = DICT_ARG
  ? path.resolve(ROOT, DICT_ARG.split("=").slice(1).join("="))
  : path.join(ROOT, "data", "dictionaries", "units_dict.json");
const keysPath = path.join(ROOT, "data", "dictionaries", "unit_keys.json");
const reportsDir = path.join(ROOT, "data", "dictionaries", "reports");
const proposalsDir = path.join(ROOT, "data", "dictionaries", "proposals");

// ---------- Утилиты ----------

function readUtf8(filepath) {
  return fs.readFileSync(filepath, "utf-8").replace(/^\uFEFF/, "");
}

// Метка времени для имён файлов: YYYY-MM-DD_HHMM (история прогонов)
function dateStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// Разбор CSV одной строки с учётом кавычек
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

// Сбор всех fallen.csv из data/processed/**
function collectCsvFiles(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && /-fallen\.csv$/.test(e.name)) found.push(full);
    }
  };
  walk(dir);
  return found;
}

// ---------- Токены и паттерны «полк + дивизия» ----------
const TOKEN_REGIMENT = "(?:гсп|полк|сп|п)";
const TOKEN_DIVISION = "(?:гсд|мсд|сд|дивизия|див)";

const reRegThenDiv = new RegExp(
  `(\\d+)\\s*[\\u0451]?й?\\s*${TOKEN_REGIMENT}[\\s\\S]*?(\\d+)\\s*[\\u0451]?й?\\s*${TOKEN_DIVISION}`,
  "iu",
);
const reDivThenReg = new RegExp(
  `(\\d+)\\s*[\\u0451]?й?\\s*${TOKEN_DIVISION}[\\s\\S]*?(\\d+)\\s*[\\u0451]?й?\\s*${TOKEN_REGIMENT}`,
  "iu",
);

// Фронт из написания → ключ фронта (для parent дивизии)
function frontFromText(text) {
  const t = (text || "").toLowerCase();
  if (/скф|север[^\s]*флот/.test(t)) return "unit-skf-front";
  if (/крымф|крымск[^\s]*фронт/.test(t)) return "unit-krymf-front";
  return null;
}

// Ключ полка: unit-<номер>-sp ; дивизии: unit-<номер>-sd
function makeRegKey(num) {
  return `unit-${num}-sp`;
}
function makeDivKey(num) {
  return `unit-${num}-sd`;
}
function isRegKey(key) {
  return /^unit-\d+-sp$/.test(key);
}
function isDivKey(key) {
  return /^unit-\d+-sd$/.test(key);
}

// ---------- Основная логика ----------
(async () => {
  // Словари
  if (!fs.existsSync(dictPath)) {
    console.error(`Словарь units_dict не найден: ${dictPath}`);
    process.exit(1);
  }
  const unitsDict = JSON.parse(readUtf8(dictPath)); // { "<ключ>": "<значение>" }
  const valueToKeys = new Map(); // значение → [ключи]
  for (const [k, v] of Object.entries(unitsDict)) {
    if (k.startsWith("_")) continue;
    if (!valueToKeys.has(v)) valueToKeys.set(v, []);
    valueToKeys.get(v).push(k);
  }

  let unitKeys = {};
  if (fs.existsSync(keysPath)) {
    const raw = JSON.parse(readUtf8(keysPath));
    unitKeys = raw; // новая плоская схема: без вложенного .units
  }

  // Чтение CSV: уникальные document_id на каждое различное написание warunit
  const csvFiles = collectCsvFiles(processedRoot);
  if (csvFiles.length === 0) {
    console.error(`CSV (-fallen.csv) не найдены в: ${processedRoot}`);
    process.exit(1);
  }

  // writing → { ids: Set(document_id), dictKeys: Set, sessions: Set }
  const writings = new Map();
  let totalRows = 0;
  let noIdRows = 0;

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
      const wu = (cols[idxWarunit] || "").trim();
      if (!wu) continue;
      totalRows++;
      const docId = idxDocId !== -1 ? (cols[idxDocId] || "").trim() : "";
      if (!writings.has(wu)) {
        writings.set(wu, { ids: new Set(), dictKeys: new Set(), sessions: new Set(), noId: 0 });
      }
      const rec = writings.get(wu);
      rec.sessions.add(session);
      if (docId) rec.ids.add(docId);
      else {
        rec.noId++;
        noIdRows++;
      }
      const keysForValue = valueToKeys.get(wu);
      if (keysForValue) keysForValue.forEach((k) => rec.dictKeys.add(k));
    }
  }

  // Частота: уникальные document_id (+ фолбек __row__ для строк без id)
  const freqOf = (rec) => rec.ids.size + (rec.noId > 0 ? rec.noId : 0);

  const entries = [...writings.entries()].map(([writing, rec]) => ({
    writing,
    count: freqOf(rec),
    dictKeys: [...rec.dictKeys],
    sessions: [...rec.sessions],
  }));
  entries.sort((a, b) => b.count - a.count);

  const recognized = entries.filter((e) => e.dictKeys.length > 0);
  const unrecognized = entries.filter((e) => e.dictKeys.length === 0);

  // Группировка кандидатов по значению units_dict: синонимы в одной группе
  const groups = new Map(); // значение → { values: [написания], dictKeys:Set, ids:Set, noId, sessions:Set }
  for (const e of entries) {
    const key = e.dictKeys.length > 0 ? unitsDict[e.dictKeys[0]] : e.writing;
    if (!groups.has(key)) {
      groups.set(key, { values: [], dictKeys: new Set(), ids: new Set(), noId: 0, sessions: new Set() });
    }
    const g = groups.get(key);
    g.values.push(e.writing);
    e.dictKeys.forEach((k) => g.dictKeys.add(k));
    const rec = writings.get(e.writing);
    rec.ids.forEach((id) => g.ids.add(id));
    g.noId += rec.noId;
    rec.sessions.forEach((s) => g.sessions.add(s));
  }

  // Структурированные кандидаты «полк + дивизия»
  // Ворота (обновлённые): предложение рождается, когда паттерн матчит И
  // (divKey есть в unit_keys ИЛИ divKey включается в тот же комплект предложения).
  // regKey может отсутствовать — он и есть предлагаемый полк.
  const structuredMap = new Map(); // `${regNum}|${divNum}` → блок
  for (const [value, g] of groups) {
    let m = value.match(reRegThenDiv);
    let regNum = null;
    let divNum = null;
    if (m) {
      regNum = m[1];
      divNum = m[2];
    } else {
      m = value.match(reDivThenReg);
      if (m) {
        divNum = m[1];
        regNum = m[2];
      }
    }
    if (!m) continue;

    const regKey = makeRegKey(regNum);
    const divKey = makeDivKey(divNum);
    const divInRegistry = isDivKey(divKey) && Object.prototype.hasOwnProperty.call(unitKeys, divKey);
    const regInRegistry = isRegKey(regKey) && Object.prototype.hasOwnProperty.call(unitKeys, regKey);

    // Комплект предложения: всегда proposed полк; дивизия добавляется, если её нет в реестре
    const proposed = [];
    if (!regInRegistry) {
      proposed.push({
        proposed_key: regKey,
        type: "полк",
        number: regNum,
        parent: divKey, // parent полка — дивизия (из имени/написания)
        observed_values: g.values,
        dict_keys: [...g.dictKeys],
      });
    }
    if (!divInRegistry) {
      proposed.push({
        proposed_key: divKey,
        type: "дивизия",
        number: divNum,
        parent: frontFromText(value), // фронт из написания: СКФ→unit-skf-front, КрымФ→unit-krymf-front, иначе null
        observed_values: g.values,
        dict_keys: [...g.dictKeys],
      });
    }

    // Ворота: divKey в unit_keys ИЛИ divKey в комплекте → считаем структурированным
    const divOk = divInRegistry || proposed.some((p) => p.proposed_key === divKey);
    if (!divOk) continue;

    const id = `${regNum}|${divNum}`;
    if (!structuredMap.has(id)) {
      structuredMap.set(id, {
        regKey,
        divKey,
        regNum,
        divNum,
        count: 0,
        ids: new Set(),
        noId: 0,
        values: [],
        dictKeys: new Set(),
        sessions: new Set(),
        proposed: [],
      });
    }
    const s = structuredMap.get(id);
    s.count += g.ids.size + (g.noId > 0 ? g.noId : 0);
    g.ids.forEach((x) => s.ids.add(x));
    s.noId += g.noId;
    s.values.push(...g.values);
    g.dictKeys.forEach((k) => s.dictKeys.add(k));
    g.sessions.forEach((x) => s.sessions.add(x));
    for (const p of proposed) {
      if (!s.proposed.some((q) => q.proposed_key === p.proposed_key)) s.proposed.push(p);
    }
  }
  const structuredList = [...structuredMap.values()].sort((a, b) => b.count - a.count);

  // ---------- Проект пополнения unit_keys (draft, без автоприменения) ----------
  const draft = {};
  const draftRows = [];
  for (const s of structuredList) {
    for (const p of s.proposed) {
      const k = p.proposed_key;
      if (Object.prototype.hasOwnProperty.call(unitKeys, k)) continue; // уже в словаре
      if (!draft[k]) {
        // history_note — только если однозначно известно из существующих записей того же номера
        let historyNote = null;
        for (const [ek, ev] of Object.entries(unitKeys)) {
          if (ev && ev.number === p.number && ev.type === p.type && ev.history_note) {
            historyNote = ev.history_note;
            break;
          }
        }
        draft[k] = {
          dict_keys: [...new Set([...(draft[k]?.dict_keys || []), ...p.dict_keys])],
          type: p.type,
          number: p.number,
          parent: p.parent,
          history_note: historyNote,
        };
      }
      p.dict_keys.forEach((dk) => draft[k].dict_keys.push(dk));
      draft[k].dict_keys = [...new Set(draft[k].dict_keys)];
      draftRows.push({
        proposed_key: k,
        type: draft[k].type,
        parent: draft[k].parent,
        count: s.count,
        dict_keys: draft[k].dict_keys,
        sessions: [...s.sessions],
      });
    }
  }

  // ---------- Запись выходов ----------
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(proposalsDir, { recursive: true });

  const stampName = dateStr();
  const reportPath = path.join(reportsDir, `units-${stampName}.md`);
  const proposalsPath = path.join(proposalsDir, `proposals-${stampName}.json`);
  const draftJsonPath = path.join(proposalsDir, `registry-draft-${stampName}.json`);
  const draftMdPath = path.join(proposalsDir, `registry-draft-${stampName}.md`);

  // proposals.json
  const proposalsPayload = {
    generated_at: new Date().toISOString(),
    distinct_ids: entries.reduce((acc, e) => acc + writings.get(e.writing).ids.size, 0),
    no_id_rows: noIdRows,
    candidates: [...groups.entries()].map(([value, g]) => ({
      value,
      observed_values: g.values,
      dict_keys: [...g.dictKeys],
      frequency: g.ids.size + (g.noId > 0 ? g.noId : 0),
      sessions: [...g.sessions],
    })),
    structured: structuredList.map((s) => ({
      key_pair: `${s.regKey} + ${s.divKey}`,
      frequency: s.count,
      observed_values: [...new Set(s.values)],
      dict_keys: [...s.dictKeys],
      sessions: [...s.sessions],
      proposed: s.proposed,
    })),
  };
  fs.writeFileSync(proposalsPath, JSON.stringify(proposalsPayload, null, 2) + "\n", "utf-8");

  // registry-draft.json (плоская схема unit_keys: dict_keys/type/number/parent/history_note)
  const draftPayload = { _operator_note: `Проект пополнения unit_keys от ${stampName}. Автоприменение запрещено.` };
  for (const [k, v] of Object.entries(draft)) {
    draftPayload[k] = {
      dict_keys: [...new Set(v.dict_keys)],
      type: v.type,
      number: v.number,
      parent: v.parent,
      history_note: v.history_note,
    };
  }
  fs.writeFileSync(draftJsonPath, JSON.stringify(draftPayload, null, 2) + "\n", "utf-8");

  // registry-draft.md — таблица для ревью
  const mdLines = [
    `# Проект пополнения unit_keys — ${stampName}`,
    "",
    "| proposed_key | type | parent | частота | dict_keys | сессии |",
    "|---|---|---|---|---|---|",
    ...draftRows.map(
      (r) =>
        `| ${r.proposed_key} | ${r.type} | ${r.parent ?? "null"} | ${r.count} | ${r.dict_keys.join(", ") || "—"} | ${r.sessions.join(", ")} |`,
    ),
    "",
    "Автоприменение в unit_keys.json запрещено. Решение за Анной-Ch.",
  ];
  fs.writeFileSync(draftMdPath, mdLines.join("\n") + "\n", "utf-8");

  // Отчёт units-<stamp>.md
  const lines = [];
  lines.push(`# Отчёт по воинским частям — ${stampName}`);
  lines.push("");
  lines.push(`Всего строк с warunit: ${totalRows} | Различных написаний: ${entries.length} | Распознано: ${recognized.length} | Не распознано: ${unrecognized.length}`);
  lines.push(`Уникальных document_id: ${proposalsPayload.distinct_ids} | Строк без id: ${noIdRows}`);
  lines.push("");
  lines.push("## Не распознанные написания (кандидаты в units_dict)");
  lines.push("");
  if (unrecognized.length === 0) {
    lines.push("— все написания покрыты units_dict —");
  } else {
    for (const e of unrecognized) {
      lines.push(`- **${e.writing}** — частота ${e.count} (сессии: ${e.sessions.join(", ")})`);
    }
  }
  lines.push("");
  lines.push("## Структурированные кандидаты (полк + дивизия)");
  lines.push("");
  if (structuredList.length === 0) {
    lines.push("— нет матчей паттерна при текущем словаре —");
  } else {
    for (const s of structuredList) {
      lines.push(`### ${s.regKey} + ${s.divKey}`);
      lines.push(`- Написания: ${[...new Set(s.values)].join(" / ")}`);
      lines.push(`- Частота (уникальных document_id): ${s.count}`);
      lines.push(`- dict_keys: ${[...s.dictKeys].join(", ") || "—"}`);
      lines.push(`- Сессии: ${[...s.sessions].join(", ")}`);
      for (const p of s.proposed) {
        lines.push(`- Предложение: \`${p.proposed_key}\` (${p.type}, parent: ${p.parent ?? "null"})`);
      }
      lines.push("");
    }
  }
  lines.push("## Распознанные группы (по значениям units_dict)");
  lines.push("");
  for (const [value, g] of groups) {
    if (g.dictKeys.size === 0) continue;
    lines.push(`- **${value}** — ${g.ids.size + (g.noId || 0)} уник., написания: ${g.values.join(" / ")}`);
  }
  fs.writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");

  // Консольная сводка
  console.log(`Написаний различных: ${entries.length}`);
  console.log(`Распознано: ${recognized.length}`);
  console.log(`Структурированных: ${structuredList.length}`);
  console.log(`Отчёт: ${path.relative(ROOT, reportPath)}`);
  console.log(`Proposals: ${path.relative(ROOT, proposalsPath)}`);
  console.log(`Draft: ${path.relative(ROOT, draftJsonPath)} , ${path.relative(ROOT, draftMdPath)}`);
})().catch((err) => {
  console.error("Фатальная ошибка:", err);
  process.exit(1);
});