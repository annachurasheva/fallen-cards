/**
 * generate-cards.js — генерация карточек персон (Markdown + frontmatter) из принятых CSV.
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/generate-cards.js [--input=data/processed] [--out=data/cards] [--dry-run]
 *
 * ЛОГИКА:
 *   - читает все *-fallen.csv из data/processed/**;
 *   - сопоставляет warunit / place_birth / burial со словарями (units_dict, locations_dict, burial_dict);
 *   - неизвестные значения получают ключ unit_unknown_<hash>, location_unknown_<hash>, burial_unknown_<hash>;
 *   - пишет карточку person-<document_id>.md в data/cards/<region>/;
 *   - --dry-run: только статистика, файлы не пишутся.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const INPUT_ARG = args.find((a) => a.startsWith("--input="));
const OUT_ARG = args.find((a) => a.startsWith("--output="));

const processedRoot = INPUT_ARG
  ? path.resolve(ROOT, INPUT_ARG.split("=").slice(1).join("="))
  : path.join(ROOT, "data", "processed");
const cardsDir = OUT_ARG
  ? path.resolve(ROOT, OUT_ARG.split("=").slice(1).join("="))
  : path.join(ROOT, "data", "cards");
const DICT_DIR = path.join(ROOT, "data", "dictionaries");

// ---------- Утилиты ----------

function readUtf8(filepath) {
  return fs.readFileSync(filepath, "utf-8").replace(/^\uFEFF/, "");
}

function readJsonSafe(filepath) {
  if (!fs.existsSync(filepath)) return {};
  try {
    return JSON.parse(readUtf8(filepath));
  } catch (e) {
    console.error(`Словарь повреждён или не читается: ${filepath}: ${e.message}`);
    process.exit(1);
  }
}

function shortHash(str) {
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 10);
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

// ---------- Словари ----------

function loadDictionaries() {
  const unitsDictRaw = readJsonSafe(path.join(DICT_DIR, "units_dict.json"));
  const locationsDictRaw = readJsonSafe(path.join(DICT_DIR, "locations_dict.json"));
  const burialDictRaw = readJsonSafe(path.join(DICT_DIR, "burial_dict.json"));
  const unitsRegistryRaw = readJsonSafe(path.join(DICT_DIR, "unit_keys.json"));
  const unitsRegistry = unitsRegistryRaw; // плоская схема, без .units

  // Индекс значений реестра: name/variants → key
  const registryIndex = new Map();
  for (const [key, entry] of Object.entries(unitsRegistry)) {
    if (key.startsWith("_")) continue;
    if (!entry || typeof entry !== "object") continue;
    const names = [entry.name, ...(entry.variants || [])].filter(Boolean);
    for (const n of names) {
      registryIndex.set(String(n).toLowerCase().trim(), key);
    }
  }

  return {
    unitsDict: unitsDictRaw,
    locationsDict: locationsDictRaw,
    burialDict: burialDictRaw,
    registryIndex,
  };
}

// Назначение ключа воинской части: units_dict → реестр → unknown-хэш
function assignUnitKey(rawWarunit, dicts) {
  const wu = String(rawWarunit || "").trim();
  if (!wu) return { key: "", source: "empty" };
  // 1) точное совпадение с units_dict (по написанию-значению)
  for (const [dictKey, value] of Object.entries(dicts.unitsDict)) {
    if (dictKey.startsWith("_")) continue;
    if (String(value).toLowerCase().trim() === wu.toLowerCase()) {
      // dict-ключ существует → отдаём его как основной ключ карточки
      return { key: dictKey, source: "units_dict" };
    }
  }
  // 2) совпадение через реестр unit_keys (name/variants)
  const regKey = dicts.registryIndex.get(wu.toLowerCase());
  if (regKey) return { key: regKey, source: "unit_keys" };
  // 3) unknown
  return { key: `unit_unknown_${shortHash(wu.toLowerCase())}`, source: "unknown" };
}

function assignLocationKey(rawPlace, dicts) {
  const p = String(rawPlace || "").trim();
  if (!p) return { key: "", source: "empty" };
  for (const [dictKey, value] of Object.entries(dicts.locationsDict)) {
    if (dictKey.startsWith("_")) continue;
    if (String(value).toLowerCase().trim() === p.toLowerCase()) {
      return { key: dictKey, source: "locations_dict" };
    }
  }
  return { key: `location_unknown_${shortHash(p.toLowerCase())}`, source: "unknown" };
}

function assignBurialKey(rawBurial, dicts) {
  const b = String(rawBurial || "").trim();
  if (!b) return { key: "", source: "empty" };
  for (const [dictKey, value] of Object.entries(dicts.burialDict)) {
    if (dictKey.startsWith("_")) continue;
    if (String(value).toLowerCase().trim() === b.toLowerCase()) {
      return { key: dictKey, source: "burial_dict" };
    }
  }
  return { key: `burial_unknown_${shortHash(b.toLowerCase())}`, source: "unknown" };
}

// ---------- Генерация карточки ----------

function buildCard(row, dicts) {
  const unit = assignUnitKey(row.warunit, dicts);
  const birth = assignLocationKey(row.place_birth, dicts);
  const conscription = assignLocationKey(row.conscription_location, dicts);
  const burialPrimary = assignBurialKey(row.primary_burial, dicts);
  const burialCurrent = assignBurialKey(row.current_burial, dicts);

  const region = row.region_burial || row.country_burial || "unknown-region";

  const fm = {
    title: row["Заголовок"] || `${row.last_name} ${row.first_name}`.trim() || row.document_id,
    document_id: row.document_id,
    last_name: row.last_name,
    first_name: row.first_name,
    middle_name: row.middle_name,
    date_birth: row.date_birth,
    date_death: row.date_death,
    rank: row.rank,
    cause_of_death: row.cause_of_death,
    unit_key: unit.key,
    unit_raw: row.warunit,
    place_birth_key: birth.key,
    place_birth_raw: row.place_birth,
    conscription_key: conscription.key,
    conscription_raw: row.conscription_location,
    primary_burial_key: burialPrimary.key,
    primary_burial_raw: row.primary_burial,
    current_burial_key: burialCurrent.key,
    current_burial_raw: row.current_burial,
    country_burial: row.country_burial,
    region_burial: row.region_burial,
    nomer_fonda: row.nomer_fonda,
    nomer_opisi: row.nomer_opisi,
    nomer_dela: row.nomer_dela,
    document_type: row.document_type,
    primary_url: row.primary_url,
    notes: row.notes,
    Дата: row["Дата"],
    source: "obd-memorial",
  };

  const fmLines = Object.entries(fm)
    .map(([k, v]) => {
      const val = v === null || v === undefined ? "" : String(v);
      return `${k}: "${val.replace(/"/g, '\\"')}"`;
    })
    .join("\n");

  const body = [
    `# ${fm.title}`,
    "",
    `- Звание: ${row.rank || "—"}`,
    `- Часть: ${row.warunit || "—"} (\`${unit.key || "—"}\`)`,
    `- Дата выбытия: ${row.date_death || "—"}`,
    `- Причина: ${row.cause_of_death || "—"}`,
    `- Первичное захоронение: ${row.primary_burial || "—"}`,
    `- Ныне: ${row.current_burial || "—"}`,
    `- Ссылка: ${row.primary_url || "—"}`,
    row.notes ? `\n## Доп. информация\n\n${row.notes}` : "",
  ].join("\n");

  return {
    fileName: `person-${row.document_id}.md`,
    region,
    content: `---\n${fmLines}\n---\n\n${body}\n`,
    sources: { unit: unit.source, birth: birth.source, burial: burialPrimary.source },
  };
}

// ---------- Main ----------
(async () => {
  const csvFiles = collectCsvFiles(processedRoot);
  if (csvFiles.length === 0) {
    console.error(`*-fallen.csv не найдены в: ${processedRoot}`);
    process.exit(1);
  }
  const dicts = loadDictionaries();

  let generated = 0;
  const stats = { unit_dict: 0, unit_registry: 0, unit_unknown: 0, persons: 0 };
  const seenIds = new Set();

  for (const file of csvFiles) {
    const lines = readUtf8(file).split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    const headers = parseCsvLine(lines[0]);
    for (const line of lines.slice(1)) {
      const cols = parseCsvLine(line);
      const row = {};
      headers.forEach((h, i) => (row[h] = cols[i] ?? ""));
      if (!row.document_id || seenIds.has(row.document_id)) continue; // дубли id между файлами
      seenIds.add(row.document_id);
      stats.persons++;

      const card = buildCard(row, dicts);
      if (card.sources.unit === "units_dict") stats.unit_dict++;
      else if (card.sources.unit === "unit_keys") stats.unit_registry++;
      else if (card.sources.unit === "unknown") stats.unit_unknown++;

      if (!isDryRun) {
        const outDir = path.join(cardsDir, card.region);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, card.fileName), card.content, "utf-8");
      }
      generated++;
    }
  }

  console.log(`Карточек: ${generated}${isDryRun ? " (DRY-RUN, файлы не записаны)" : ""}`);
  console.log(`Персон (уникальных id): ${stats.persons}`);
  console.log(`Части: units_dict=${stats.unit_dict}, unit_keys=${stats.unit_registry}, unknown=${stats.unit_unknown}`);
  if (!isDryRun) console.log(`Выход: ${path.relative(ROOT, cardsDir)}/<регион>/person-<id>.md`);
})().catch((err) => {
  console.error("Фатальная ошибка:", err);
  process.exit(1);
});