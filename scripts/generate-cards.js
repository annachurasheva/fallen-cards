/**
 * generate-cards.js — слой подготовки карточек персон (TASK-0014).
 *
 * Архитектура: fallen-cards выдаёт КЛЮЧИ (unit_key, location_key, burial_*_key),
 * раскрытие ключей в названия — задача Astro-генератора по словарям Astro-репо.
 * Словари в fallen-cards — зеркала ТОЛЬКО ДЛЯ ЧТЕНИЯ; значения в CSV не нормализуются.
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/generate-cards.js --dry-run
 *   node scripts/generate-cards.js
 *   node scripts/generate-cards.js --only=links_id_160_Огуз-Тобе
 *
 * ВХОД : все CSV *-fallen.csv / *-unclassified.csv в data/processed/<имя>/ (рекурсивно)
 * ВЫХОД: data/cards/<document_id>.md            — карточки с frontmatter (без префикса
 *        источника: пока все карточки от obd-memorial.ru)
 *        data/summary/slug_registry.txt         — document_id -> slug (заморозка при 1-м выпуске)
 *        scripts/logs/run.log                   — ход обработки
 *        scripts/logs/refused.log               — отказные строки (причина + список)
 *        scripts/logs/errors.json               — ошибки записи файлов
 *
 * SLUG: bitva-za-krym-1942-<document_id> — детерминированный, без транслита ФИО.
 * DRY-RUN: ничего не пишет (ни карточек, ни логов, ни реестра), только показывает
 *          соответствие «строка CSV -> файл» в консоли.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const PROCESSED_DIR = path.join(ROOT, "data", "processed");
const CARDS_DIR = path.join(ROOT, "data", "cards");
const SUMMARY_DIR = path.join(ROOT, "data", "summary");
const DICT_DIR = path.join(ROOT, "data", "dictionaries");
const LOGS_DIR = path.join(ROOT, "scripts", "logs");
const SLUG_REGISTRY = path.join(SUMMARY_DIR, "slug_registry.txt");

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const onlyArg = args.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.split("=").slice(1).join("=") : null;

// ---------- Утилиты ----------

function readUtf8(filepath) {
  return fs.readFileSync(filepath, "utf-8").replace(/^\uFEFF/, "");
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`;
}

// Чтение JSON-зеркала словаря; отсутствие файла — не ошибка (пустой словарь)
function readJsonSafe(filepath) {
  if (!fs.existsSync(filepath)) return {};
  try {
    return JSON.parse(readUtf8(filepath));
  } catch (e) {
    console.error(`${stamp()} Словарь повреждён: ${filepath}: ${e.message}`);
    return {};
  }
}

// ---------- Рекорд-осознающий парсер CSV ----------
// Поддержка многострочных полей (notes из «Доп. информация») и "" внутри значений.
// Без новых npm-зависимостей.
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
        field += c; // в т.ч. \n — многострочное поле
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

// Массив строк CSV -> массив объектов по заголовку
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

// ---------- Словари-зеркала (только для чтения) ----------

const unitsRegistryRaw = readJsonSafe(path.join(DICT_DIR, "units_registry.json"));
const unitsRegistry = unitsRegistryRaw.units || unitsRegistryRaw; // формат v2: {version, units:{...}}
const unitsDict = readJsonSafe(path.join(DICT_DIR, "units_dict.json"));
const locationsDict = readJsonSafe(path.join(DICT_DIR, "locations_dict.json")); // может отсутствовать
const burialsCurrent = readJsonSafe(path.join(DICT_DIR, "burials_current.json"));
const burialsPrimary = readJsonSafe(path.join(DICT_DIR, "burials_primary.json"));
const burialObjects = readJsonSafe(path.join(DICT_DIR, "burial-objects.json"));

function normKey(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Индекс dict_keys реестра: нормализованное написание -> unit_key
const registryIndex = new Map();
for (const [unitKey, unit] of Object.entries(unitsRegistry)) {
  const keysList = Array.isArray(unit.dict_keys) ? unit.dict_keys : [];
  for (const k of keysList) {
    const nk = normKey(k);
    if (nk && !registryIndex.has(nk)) registryIndex.set(nk, unitKey);
  }
}

// Короткий хэш написания для fallback-ключа (детерминированный)
function shortHash(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 8);
}

// ---------- Назначение ключей (значения НЕ нормализуются — только ключи) ----------

// unit_key: warunit -> units_registry по dict_keys; не распознан -> unit_unknown_<hash>
function assignUnitKey(warunit, proposals) {
  const raw = String(warunit || "").trim();
  if (!raw) return "";
  const nk = normKey(raw);
  const byRegistry = registryIndex.get(nk);
  if (byRegistry) return byRegistry;
  // units_dict — зеркало написаний: написание есть в словаре, но ключа в реестре нет —
  // всё равно кандидат; ключ выдаётся только реестром Astro
  const key = `unit_unknown_${shortHash(nk)}`;
  if (!proposals.seen.has(key)) {
    proposals.seen.add(key);
    proposals.list.push({
      kind: "unit",
      proposed_key: key,
      value: raw,
      in_units_dict: Object.prototype.hasOwnProperty.call(unitsDict, raw),
    });
  }
  return key;
}

// location_key: через locations_dict (зеркало только для чтения); нет словаря/метки — loc_unknown_<hash>
function assignLocationKey(value, proposals) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const direct = locationsDict[raw] || locationsDict[normKey(raw)];
  if (direct && typeof direct === "string") return direct;
  if (direct && direct.location_key) return direct.location_key;
  const key = `loc_unknown_${shortHash(normKey(raw))}`;
  if (!proposals.seen.has(key)) {
    proposals.seen.add(key);
    proposals.list.push({ kind: "location", proposed_key: key, value: raw });
  }
  return key;
}

// burial_*_key: по тексту места через burials_current/burials_primary + объекты TASK-0010
function assignBurialKey(value, dict, proposals) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const nk = normKey(raw);
  const entry = dict[raw] || dict[nk];
  if (entry) {
    const uk = entry.burial_key || entry.key || entry.object_id || entry.unit_key;
    if (uk) return String(uk);
    // запись в словаре есть, ключа нет — объект ещё не заведён: предлагаем по названию
  }
  // попытка связать с объектом TASK-0010 по совпадению имени/локации
  for (const [objKey, obj] of Object.entries(burialObjects)) {
    if (normKey(obj.name) === nk || normKey(obj.location) === nk) return objKey;
  }
  const key = `burial_unknown_${shortHash(nk)}`;
  if (!proposals.seen.has(key)) {
    proposals.seen.add(key);
    proposals.list.push({ kind: "burial", proposed_key: key, value: raw });
  }
  return key;
}

// ---------- Slug-реестр (заморозка при первом выпуске) ----------

function loadSlugRegistry() {
  const map = new Map();
  if (fs.existsSync(SLUG_REGISTRY)) {
    for (const line of readUtf8(SLUG_REGISTRY).split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const [id, slug] = t.split(/\s+/);
      if (id && slug) map.set(id, slug);
    }
  }
  return map;
}

// ---------- Frontmatter (значения дословно, экранирование минимальное) ----------

function yamlStr(v) {
  const s = String(v ?? "");
  if (s === "") return '""';
  if (/^[\w\-./:]+$/u.test(s) && !/^(true|false|null|~)$/i.test(s)) return s;
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

function buildFrontmatter(row, keys, slug) {
  const lines = [
    "---",
    `document_id: ${yamlStr(row.document_id)}`,
    `slug: ${yamlStr(slug)}`,
    `source: obd-memorial.ru`,
    `primary_url: ${yamlStr(row.primary_url)}`,
    `title: ${yamlStr(row["Заголовок"])}`,
    `last_name: ${yamlStr(row.last_name)}`,
    `first_name: ${yamlStr(row.first_name)}`,
    `middle_name: ${yamlStr(row.middle_name)}`,
    `date_birth: ${yamlStr(row.date_birth)}`,
    `place_birth_raw: ${yamlStr(row.place_birth)}`,
    `date_death: ${yamlStr(row.date_death)}`,
    `rank_raw: ${yamlStr(row.rank)}`,
    `warunit_raw: ${yamlStr(row.warunit)}`,
    `cause_of_death_raw: ${yamlStr(row.cause_of_death)}`,
    `primary_burial_raw: ${yamlStr(row.primary_burial)}`,
    `current_burial_raw: ${yamlStr(row.current_burial)}`,
    `country_burial: ${yamlStr(row.country_burial)}`,
    `region_burial: ${yamlStr(row.region_burial)}`,
    `rebural_from_raw: ${yamlStr(row.rebural_from)}`,
    `conscription_location_raw: ${yamlStr(row.conscription_location)}`,
    `nomer_fonda: ${yamlStr(row.nomer_fonda)}`,
    `nomer_opisi: ${yamlStr(row.nomer_opisi)}`,
    `nomer_dela: ${yamlStr(row.nomer_dela)}`,
    `document_type: ${yamlStr(row.document_type)}`,
    `unit_key: ${yamlStr(keys.unit_key)}`,
    `location_key_birth: ${yamlStr(keys.location_key_birth)}`,
    `location_key_conscription: ${yamlStr(keys.location_key_conscription)}`,
    `burial_current_key: ${yamlStr(keys.burial_current_key)}`,
    `burial_primary_key: ${yamlStr(keys.burial_primary_key)}`,
    `rebural_from_key: ${yamlStr(keys.rebural_from_key)}`,
    `status: ${yamlStr(row.__status)}`,
    `session: ${yamlStr(row.__session)}`,
    `generated_date: ${yamlStr(today())}`,
    "notes: |-",
  ];
  const notes = String(row.notes || "").replace(/\r/g, "");
  for (const nl of notes.split("\n")) lines.push(nl ? `  ${nl}` : "");
  lines.push("---", "", `# ${row["Заголовок"] || row.document_id}`, "");
  return lines.join("\n");
}

// ---------- Обход CSV ----------

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
  const runLog = [];
  const refusedLog = [];
  const errorsLog = [];
  const proposals = { seen: new Set(), list: [] };
  const slugMap = loadSlugRegistry();
  const newSlugs = [];

  const csvFiles = collectCsvFiles(PROCESSED_DIR).filter((f) => {
    if (!ONLY) return true;
    return path.basename(path.dirname(f)) === ONLY;
  });

  if (csvFiles.length === 0) {
    console.error(`${stamp()} CSV для обработки не найдены: ${PROCESSED_DIR}`);
    process.exit(1);
  }

  console.log(`${stamp()} Генерация карточек${isDryRun ? " (DRY-RUN)" : ""}`);
  console.log(`${stamp()} Источник: ${csvFiles.length} CSV-файл(ов)`);

  let total = 0;
  let generated = 0;
  let skippedNoId = 0;
  let skippedNoName = 0;
  let reused = 0;

  for (const csvFile of csvFiles) {
    const session = path.basename(path.dirname(csvFile));
    const kind = path.basename(csvFile).endsWith("-fallen.csv") ? "fallen" : "unclassified";
    const objects = csvToObjects(readUtf8(csvFile));
    runLog.push(`${today()} ${stamp()} Файл: ${path.relative(ROOT, csvFile)} | записей: ${objects.length}`);

    for (const row of objects) {
      total++;
      row.__status = kind;
      row.__session = session;
      const docId = String(row.document_id || "").trim();
      const fullName = `${row.last_name || ""} ${row.first_name || ""} ${row.middle_name || ""}`.trim();

      if (!docId || !/^\d+$/.test(docId)) {
        skippedNoId++;
        refusedLog.push(
          `${today()} ОТКАЗ: нет document_id | ${session}/${kind} | ${[
            row["Заголовок"], row.last_name, row.first_name, row.date_death, row.primary_url,
          ].join(" | ")}`,
        );
        continue;
      }
      if (!fullName) {
        skippedNoName++;
        refusedLog.push(
          `${today()} ОТКАЗ: нет ФИО | ${session}/${kind} | id=${docId} | ${[
            row.date_death, row.rank, row.warunit, row.primary_url,
          ].join(" | ")}`,
        );
        continue;
      }

      const keys = {
        unit_key: assignUnitKey(row.warunit, proposals),
        location_key_birth: assignLocationKey(row.place_birth, proposals),
        location_key_conscription: assignLocationKey(row.conscription_location, proposals),
        burial_current_key: assignBurialKey(row.current_burial, burialsCurrent, proposals),
        burial_primary_key: assignBurialKey(row.primary_burial, burialsPrimary, proposals),
        rebural_from_key: assignBurialKey(row.rebural_from, burialsCurrent, proposals),
      };

      // Slug заморожен при первом выпуске; перегенерация карточки slug не меняет
      let slug = slugMap.get(docId);
      if (!slug) {
        slug = `bitva-za-krym-1942-${docId}`;
        slugMap.set(docId, slug);
        newSlugs.push(`${docId}\t${slug}`);
      } else {
        reused++;
      }

      const cardPath = path.join(CARDS_DIR, `${docId}.md`);
      const content = buildFrontmatter(row, keys, slug);

      if (isDryRun) {
        console.log(
          `  строка CSV [${session}/${kind}] id=${docId} "${fullName}" -> ${path.relative(ROOT, cardPath)} (slug=${slug})`,
        );
        generated++;
        continue;
      }

      try {
        fs.mkdirSync(CARDS_DIR, { recursive: true });
        fs.writeFileSync(cardPath, content, "utf-8");
        generated++;
        runLog.push(
          `${today()} ${stamp()} Карточка: ${docId}.md | unit_key=${keys.unit_key} | slug=${slug}`,
        );
      } catch (e) {
        errorsLog.push({ time: new Date().toISOString(), document_id: docId, file: cardPath, error: e.message });
      }
    }
  }

  // ---------- Запись результатов (не в dry-run) ----------
  if (!isDryRun) {
    if (newSlugs.length > 0) {
      fs.mkdirSync(SUMMARY_DIR, { recursive: true });
      if (!fs.existsSync(SLUG_REGISTRY)) {
        fs.writeFileSync(
          SLUG_REGISTRY,
          "# Реестр slug: document_id -> slug (заморозка при первом выпуске)\n" +
            newSlugs.join("\n") + "\n",
          "utf-8",
        );
      } else {
        fs.appendFileSync(SLUG_REGISTRY, newSlugs.join("\n") + "\n", "utf-8");
      }
    }
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOGS_DIR, "run.log"), runLog.join("\n") + "\n", "utf-8");
    if (refusedLog.length > 0) {
      fs.appendFileSync(path.join(LOGS_DIR, "refused.log"), refusedLog.join("\n") + "\n", "utf-8");
    }
    fs.writeFileSync(
      path.join(LOGS_DIR, "errors.json"),
      JSON.stringify(errorsLog, null, 2) + "\n",
      "utf-8",
    );
  }

  // ---------- Отчёт ----------
  console.log(`Генерация завершена${isDryRun ? " (DRY-RUN, файлы не записаны)" : ""}:`);
  console.log(`   Всего строк CSV:     ${total}`);
  console.log(`   Карточек:            ${generated} (новых slug: ${newSlugs.length}, заморожено переиспользовано: ${reused})`);
  console.log(`   Отказов (нет id):    ${skippedNoId}`);
  console.log(`   Отказов (нет ФИО):   ${skippedNoName}`);
  console.log(`   Предложений ключей:  ${proposals.list.length} (см. units-report)`);
  console.log(`   Ошибок записи:       ${errorsLog.length}`);
})().catch((err) => {
  console.error(`${stamp()} Фатальная ошибка:`, err);
  process.exit(1);
});
