/**
 * build-warunits-dict.js — перепись warunit (WARUNITS_DICT v2) с учётом
 * активного словаря и предложением кандидатов на заполнение.
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
 *   - выход: data/dictionaries/proposals/warunits-draft3-<timestamp>.json и .md;
 *     метка времени генерируется ОДИН РАЗ в начале прогона и передаётся в оба
 *     писателя; перезапись запрещена (существующие файлы не изменяются и не
 *     удаляются ни при каких условиях).
 *
 * ЗАПРЕЩЕНО: нормализации строк (trim/toLowerCase) для ключей группировки;
 * ручные слияния; чтение unit_keys.json.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ---------- Пути ----------
const PROCESSED_ROOT = path.join(ROOT, "data", "processed");
const DICTS_DIR = path.join(ROOT, "data", "dictionaries");
const PROPOSALS_DIR = path.join(DICTS_DIR, "proposals");

// ---------- Метка времени прогона (генерируется ОДИН РАЗ, п.1) ----------
// Формат YYYY-MM-DD_HHMM: из ISO-строки убираем ':' и '.', берём 15 символов:
// "2026-10-10T08:41:12.345Z" -> "2026-10-10T084112345Z".slice(0,15) -> "2026-10-10T0841"
// (символ T заменяется на '_' ниже — тот же формат, что в units-report)
function makeRunTimestamp() {
  const iso = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  return iso.replace("T", "_"); // YYYY-MM-DD_HHMM
}

// Если файл(ы) с такой меткой уже существуют (повторный прогон в ту же минуту) —
// добавить секунды -<SS>. Возвращает метку, свободную для ОБОИХ писателей.
function resolveTimestamp(baseDir, base) {
  let ts = makeRunTimestamp();
  const existsAny = (t) =>
    fs.existsSync(path.join(baseDir, `${base}-${t}.json`)) ||
    fs.existsSync(path.join(baseDir, `${base}-${t}.md`));
  if (existsAny(ts)) {
    const ss = String(new Date().getSeconds()).padStart(2, "0");
    ts = `${ts}-${ss}`;
  }
  return ts;
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
      else if (e.isFile() && /-(?:fallen|unclassified)\.csv$/.test(e.name))
        found.push(full);
    }
  };
  walk(dir);
  return found;
}

// ---------- Автовызов sync-units-dict.js (MD → JSON) ----------
// Перед переписью активный словарь должен быть актуален: JSON — SSOT для
// generate-cards.js, собирается ТОЛЬКО sync-units-dict.js из MD (A2, §5.6).
// Вызываем отдельным процессом node — чище и не ломает текущий процесс.
function runSyncUnitsDict() {
  const syncScript = path.join(__dirname, "sync-units-dict.js");
  if (!fs.existsSync(syncScript)) {
    console.error(`sync-units-dict.js не найден: ${syncScript}`);
    process.exit(1);
  }
  console.log("--- sync-units-dict.js (MD → JSON) ---");
  const res = execFile("node", [syncScript], {
    cwd: ROOT,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (res.status !== 0) {
    console.error(`sync-units-dict.js завершился с кодом ${res.status}`);
    process.exit(1);
  }
  console.log("--- sync-units-dict.js: OK ---");
}

// ---------- Активный словарь (SSOT: warunits-fallen-cards.json) ----------
// Читаем JSON-зеркало активного MD-словаря. Группы с ключом «— (оператор)»
// в индекс НЕ попадают (A3): их варианты не считаются активными.
// Возвращает:
//   activeByVariant: Map(буквальная строка варианта → семантический ключ)
//   activeGroups:    [{ key, name, variants, source_doc }]
function loadActiveDict() {
  const jsonPath = path.join(DICTS_DIR, "warunits-fallen-cards.json");
  if (!fs.existsSync(jsonPath)) {
    console.error(`Активный словарь не найден: ${jsonPath}`);
    console.error("   Запустите: node scripts/sync-units-dict.js");
    process.exit(1);
  }
  const dict = JSON.parse(readUtf8(jsonPath));
  const activeByVariant = new Map();
  const activeGroups = [];
  for (const [key, entry] of Object.entries(dict)) {
    if (key === "— (оператор)") continue; // A3
    const variants = Array.isArray(entry.variants) ? entry.variants : [];
    const group = {
      key,
      name: entry.name || "",
      variants,
      source_doc: entry.source_doc || "",
    };
    activeGroups.push(group);
    for (const v of variants) {
      // Точное совпадение по знакам (A1): без нормализаций
      activeByVariant.set(v, key);
    }
  }
  return { activeByVariant, activeGroups };
}

// ---------- Основная логика ----------
(function main() {
  // 0. Автовызов sync-units-dict.js: JSON должен быть актуален MD (п.4)
  runSyncUnitsDict();

  const csvFiles = collectCsvFiles(PROCESSED_ROOT);
  if (csvFiles.length === 0) {
    console.error(
      `CSV (*-fallen.csv / *-unclassified.csv) не найдены в: ${PROCESSED_ROOT}`,
    );
    process.exit(1);
  }

  // Метка прогона — ОДИН РАЗ, передаётся в оба писателя (п.1)
  fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
  const timestamp = resolveTimestamp(PROPOSALS_DIR, "warunits-draft3");

  // Активный словарь (SSOT) — читаем ПОСЛЕ sync-units-dict.js
  const { activeByVariant, activeGroups } = loadActiveDict();

  // БУКВАЛЬНАЯ строка warunit → { ids: Set(document_id), sessions: Set, noId: число }
  const writings = new Map();
  let totalRows = 0;

  for (const file of csvFiles) {
    const session = path.basename(path.dirname(file));
    const lines = readUtf8(file)
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "");
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
    (s.match(/\d+/g) || [])
      .map(Number)
      .sort((a, b) => a - b)
      .join(",");

  // Шаг 1: группы по буквальной строке
  const byString = [...writings.entries()].map(([writing, rec]) => ({
    writing,
    count: freqOf(rec),
    ids: rec.ids,
    noId: rec.noId,
    sessions: rec.sessions,
    sig: signatureOf(writing),
  }));

  // Шаг 2: разделение на АКТИВНЫЕ (есть в словаре) и КАНДИДАТОВ (нет в словаре).
  // Точное совпадение по знакам (A1): вариант из CSV == вариант из словаря.
  const activeEntries = [];
  const candidateEntries = [];
  for (const e of byString) {
    if (activeByVariant.has(e.writing)) {
      activeEntries.push(e);
    } else {
      candidateEntries.push(e);
    }
  }

  // ---------- АКТИВНЫЕ ГРУППЫ ----------
  // Группируем по семантическому ключу из словаря; частоты пересчитываются
  // по ВСЕМ CSV (каждое повышение объёма — пересчёт).
  const activeByKey = new Map(); // key -> { entries: [], ids: Set, noId, sessions: Set }
  for (const e of activeEntries) {
    const key = activeByVariant.get(e.writing);
    if (!activeByKey.has(key)) {
      activeByKey.set(key, {
        entries: [],
        ids: new Set(),
        noId: 0,
        sessions: new Set(),
      });
    }
    const rec = activeByKey.get(key);
    rec.entries.push(e);
    e.ids.forEach((id) => rec.ids.add(id));
    rec.noId += e.noId;
    e.sessions.forEach((s) => rec.sessions.add(s));
  }

  const activeGroupsOut = [];
  for (const [key, rec] of activeByKey) {
    // variants — из словаря (буквально, регистр как в MD), плюс новые написания
    // из CSV, которых ещё нет в словаре (пополнение вариантов — решение оператора,
    // поэтому они помечаются как новые и НЕ сливаются автоматически).
    const dictGroup = activeGroups.find((g) => g.key === key);
    const dictVariants = dictGroup ? dictGroup.variants : [];
    const csvVariants = rec.entries.map((e) => e.writing);
    const newVariants = csvVariants.filter((v) => !dictVariants.includes(v));
    const frequency = rec.ids.size + (rec.noId > 0 ? rec.noId : 0);
    activeGroupsOut.push({
      proposed_key: key, // семантический ключ из словаря (п.3)
      key,
      merge_into: null,
      variants: dictVariants,
      new_variants: newVariants, // кандидаты на пополнение вариантов группы
      frequency,
      sessions: [...rec.sessions].sort(),
      source_doc: dictGroup ? dictGroup.source_doc : "",
    });
  }

  // Сортировка активных групп по убыванию частоты (детерминированный тай-брейк)
  activeGroupsOut.sort(
    (a, b) =>
      b.frequency - a.frequency ||
      (a.proposed_key < b.proposed_key ? -1 : a.proposed_key > b.proposed_key ? 1 : 0),
  );

  // ---------- КАНДИДАТЫ ----------
  // Группируем по сигнатуре набора чисел (как раньше), но НЕ сливаем с активными
  // и НЕ присваиваем ключи (A3, §5.3): proposed_key = null, status = "candidate".
  const bySig = new Map(); // sig -> [entries]
  for (const e of candidateEntries) {
    if (!bySig.has(e.sig)) bySig.set(e.sig, []);
    bySig.get(e.sig).push(e);
  }

  const candidateGroups = [];
  for (const [, entries] of bySig) {
    entries.sort(
      (a, b) => b.count - a.count || (a.writing < b.writing ? -1 : 1),
    );
    const survivor = entries[0];
    const ids = new Set();
    let noId = 0;
    const sessions = new Set();
    for (const e of entries) {
      e.ids.forEach((id) => ids.add(id));
      noId += e.noId;
      e.sessions.forEach((s) => sessions.add(s));
    }
    const frequency = ids.size + (noId > 0 ? noId : 0);
    candidateGroups.push({
      proposed_key: null, // ключ не выдаём — решение оператора
      key: null,
      status: "candidate",
      merge_into: null,
      variants: entries.map((e) => e.writing),
      frequency,
      sessions: [...sessions].sort(),
      document_ids: [...ids].sort(),
    });
  }

  // Сортировка кандидатов по убыванию частоты
  candidateGroups.sort(
    (a, b) =>
      b.frequency - a.frequency ||
      (a.variants[0] < b.variants[0] ? -1 : a.variants[0] > b.variants[0] ? 1 : 0),
  );

  // ---------- Формирование содержимого обоих писателей (метка одна, п.1) ----------

  const payload = {
    _meta: {
      generated: new Date().toISOString(),
      timestamp,
      schema: "WARUNITS_DICT v2 (draft3)",
      source: "data/processed/**/*-fallen.csv, *-unclassified.csv",
      rule_merge:
        "автоматическое слияние по отсортированному набору чисел (/\\d+/g) — только для кандидатов",
      rule_frequency: "уникальные document_id",
      rule_active: "активные группы — из warunits-fallen-cards.json (SSOT), частоты пересчитаны",
      strings_total: byString.length,
      active_total: activeGroupsOut.length,
      candidates_total: candidateGroups.length,
      rows_scanned: totalRows,
    },
    groups: activeGroupsOut,
    candidates: candidateGroups,
  };
  const jsonText = JSON.stringify(payload, null, 2);

  // md БЕЗ фильтров, порогов и срезов: активные группы + кандидаты.
  const mdLines = [];
  mdLines.push(
    `# WARUNITS_DICT draft3 — перепись warunit (активные группы + кандидаты)`,
  );
  mdLines.push(``);
  mdLines.push(
    `- Источник: \`data/processed/**/*-fallen.csv\`, \`*-unclassified.csv\``,
  );
  mdLines.push(
    `- Активных групп: ${activeGroupsOut.length}; кандидатов: ${candidateGroups.length}; строк всего: ${byString.length}`,
  );
  mdLines.push(
    `- Частота = уникальные document_id. Сортировка по убыванию частоты.`,
  );
  mdLines.push(
    `- Активные группы — из \`warunits-fallen-cards.json\` (SSOT); кандидаты — новые написания, ключ не выдан.`,
  );
  mdLines.push(``);
  mdLines.push(`## Активные группы (${activeGroupsOut.length})`);
  mdLines.push(``);
  mdLines.push(`| # | ключ | частота | выжившая строка | вариантов | новых вариантов |`);
  mdLines.push(`|---|---|---|---|---|---|`);
  activeGroupsOut.forEach((g, i) => {
    mdLines.push(
      `| ${i + 1} | ${g.proposed_key} | ${g.frequency} | ${g.variants[0] || ""} | ${g.variants.length} | ${g.new_variants.length} |`,
    );
  });
  mdLines.push(``);
  mdLines.push(`## Кандидаты на заполнение (${candidateGroups.length})`);
  mdLines.push(``);
  mdLines.push(`| # | частота | написания | document_id |`);
  mdLines.push(`|---|---|---|---|`);
  candidateGroups.forEach((g, i) => {
    mdLines.push(
      `| ${i + 1} | ${g.frequency} | ${g.variants.join("; ")} | ${g.document_ids.slice(0, 10).join(", ")}${g.document_ids.length > 10 ? ", …" : ""} |`,
    );
  });
  mdLines.push(``);
  const mdText = mdLines.join("\n");

  const jsonPath = path.join(
    PROPOSALS_DIR,
    `warunits-draft3-${timestamp}.json`,
  );
  const mdPath = path.join(PROPOSALS_DIR, `warunits-draft3-${timestamp}.md`);

  // Защита от перезаписи (п.2/п.3): существующие файлы не изменяются
  if (fs.existsSync(jsonPath) || fs.existsSync(mdPath)) {
    console.error(
      `Файлы с меткой ${timestamp} уже существуют — перезапись запрещена.`,
    );
    process.exit(1);
  }

  // ---------- Атомарная запись пары (п.4) ----------
  // Сначала во временные файлы, затем rename json→md подряд, без промежуточных
  // console.log между ними. При любом сбое временные файлы удаляются, целевые
  // не создаются; при сбое rename уже записанный целевой удаляется.
  const jsonTmp = jsonPath + ".tmp";
  const mdTmp = mdPath + ".tmp";
  try {
    fs.writeFileSync(jsonTmp, jsonText, "utf-8");
    fs.writeFileSync(mdTmp, mdText, "utf-8");
    fs.renameSync(jsonTmp, jsonPath);
    fs.renameSync(mdTmp, mdPath);
  } catch (e) {
    for (const t of [jsonTmp, mdTmp]) {
      try {
        if (fs.existsSync(t)) fs.unlinkSync(t);
      } catch {}
    }
    // если один из целевых файлов всё же успел появиться — убираем пару целиком
    for (const t of [jsonPath, mdPath]) {
      try {
        if (fs.existsSync(t)) fs.unlinkSync(t);
      } catch {}
    }
    console.error(`Запись пары файлов не выполнена: ${e.message}`);
    process.exit(1);
  }

  console.log(
    `строк: ${byString.length}, активных групп: ${activeGroupsOut.length}, кандидатов: ${candidateGroups.length}`,
  );
  console.log(`выход: ${jsonPath}`);
  console.log(`       ${mdPath}`);
})();
