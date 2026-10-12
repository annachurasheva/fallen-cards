/**
 * generate-cards.js — генерация карточек персон (Markdown + frontmatter)
 * ВЕРСИЯ: 2.1 (TASK-0022, Задача 2 + burial object key)
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/generate-cards.js [--input=data/processed|path/to/file.csv]
 *                                   [--output=data/cards]
 *                                   [--dry-run] [--force-overwrite]
 *                                   [--unit-key=<ключ>]
 *                                   [--burial-ob-<id>]
 *
 * СПЕЦИАЛЬНЫЙ РЕЖИМ:
 *   --burial-ob-<id> — всем карточкам из этого прогона присваивается
 *   burial_object_key: "<id>" в frontmatter. Данные ЦАМО не изменяются.
 *   Пометка "ВРЕМЕННОЕ РЕШЕНИЕ" добавляется автоматически.
 *
 * КРИТИЧЕСКИЕ ПРАВИЛА (§1.5, §5.1, A1–A5):
 *   - НИКАКИХ toLowerCase / trim / replace / normalize
 *   - Совпадение только по знакам (точное равенство)
 *   - Имена карточек: <источник>-<document_id>.md (A4)
 *   - Slug: bitva-za-krym-1942-<источник>-<document_id> (A4)
 *   - Нет совпадения → unit_key: null (§5.3)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForceOverwrite = args.includes('--force-overwrite');
const INPUT_ARG = args.find(a => a.startsWith('--input='));
const OUTPUT_ARG = args.find(a => a.startsWith('--output='));
const UNIT_KEY_FILTER = args.find(a => a.startsWith('--unit-key='));

// Ищем аргумент burial-ob-<id>
const BURIAL_OB_ARG = args.find(a => a.startsWith('--burial-ob-'));
const BURIAL_OBJECT_ID = BURIAL_OB_ARG ? BURIAL_OB_ARG.replace('--burial-ob-', '') : null;

const inputPath = INPUT_ARG
  ? path.resolve(ROOT, INPUT_ARG.split('=').slice(1).join('='))
  : path.join(ROOT, 'data', 'processed');

// Определяем: файл или папка?
const isSingleFile = fs.existsSync(inputPath) && fs.statSync(inputPath).isFile();
const processedRoot = isSingleFile ? path.dirname(inputPath) : inputPath;
const singleFile = isSingleFile ? inputPath : null;

const cardsDir = OUTPUT_ARG
  ? path.resolve(ROOT, OUTPUT_ARG.split('=').slice(1).join('='))
  : path.join(ROOT, 'data', 'cards');
const DICT_DIR = path.join(ROOT, 'data', 'dictionaries');

// ========== Утилиты ==========

function readUtf8(filepath) {
  return fs.readFileSync(filepath, 'utf-8').replace(/^\uFEFF/, '');
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += ch; }
    } else if (ch === '"') { inQuotes = true; }
    else if (ch === ',') { out.push(cur); cur = ''; }
    else { cur += ch; }
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



// ========== Словари ==========

function loadDictionaries() {
  const warunitsJsonPath = path.join(DICT_DIR, 'warunits-fallen-cards.json');
  if (!fs.existsSync(warunitsJsonPath)) {
    console.error('❌ warunits-fallen-cards.json не найден.');
    console.error('   Запустите: node scripts/sync-units-dict.js');
    process.exit(1);
  }
  const warunitsDict = JSON.parse(readUtf8(warunitsJsonPath));

  const burialDictPath = path.join(DICT_DIR, 'burial_dict.json');
  const burialDict = fs.existsSync(burialDictPath)
    ? JSON.parse(readUtf8(burialDictPath)) : {};

  const locationsDictPath = path.join(DICT_DIR, 'locations_dict.json');
  const locationsDict = fs.existsSync(locationsDictPath)
    ? JSON.parse(readUtf8(locationsDictPath)) : {};

  // A1: индекс Map(буквальная строка → ключ), без нормализации
  const unitIndex = new Map();
  for (const [key, entry] of Object.entries(warunitsDict)) {
    for (const variant of entry.variants) {
      unitIndex.set(variant, key);
    }
  }

  return { warunitsDict, burialDict, locationsDict, unitIndex };
}

function assignUnitKey(rawWarunit, dicts) {
  const wu = String(rawWarunit || '');
  if (!wu) return { key: null, source: 'empty' };
  const key = dicts.unitIndex.get(wu);
  if (key) return { key, source: 'warunits-fallen-cards.json' };
  return { key: null, source: 'unknown' };
}

function assignLocationKey(rawPlace, dicts) {
  const p = String(rawPlace || '');
  if (!p) return { key: null, source: 'empty' };
  for (const [dictKey, value] of Object.entries(dicts.locationsDict)) {
    if (dictKey.startsWith('_')) continue;
    if (String(value) === p) return { key: dictKey, source: 'locations_dict' };
  }
  return { key: null, source: 'unknown' };
}

function assignBurialKey(rawBurial, dicts) {
  const b = String(rawBurial || '');
  if (!b) return { key: null, source: 'empty' };
  for (const [dictKey, value] of Object.entries(dicts.burialDict)) {
    if (dictKey.startsWith('_')) continue;
    if (String(value) === b) return { key: dictKey, source: 'burial_dict' };
  }
  return { key: null, source: 'unknown' };
}

// ========== Генерация карточки ==========

function buildCard(row, dicts, source, options = {}) {
  const unit = assignUnitKey(row.warunit, dicts);
  const birth = assignLocationKey(row.place_birth, dicts);
  const conscription = assignLocationKey(row.conscription_location, dicts);
  const burialPrimary = assignBurialKey(row.primary_burial, dicts);
  const burialCurrent = assignBurialKey(row.current_burial, dicts);

  const fileName = source + '-' + row.document_id + '.md';
  const slug = 'bitva-za-krym-1942-' + source + '-' + row.document_id;

  const fm = {
    title: row['Заголовок'] || (row.last_name + ' ' + row.first_name).trim() || row.document_id,
    slug,
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
    Дата: row['Дата'],
    source
  };

  // Специальный режим: burial object key из аргумента командной строки
  if (BURIAL_OBJECT_ID) {
    fm.burial_object_key = BURIAL_OBJECT_ID;
    fm.burial_object_note = 'ВРЕМЕННОЕ РЕШЕНИЕ';
  }

  const fmLines = Object.entries(fm)
    .map(([k, v]) => {
      const val = v === null || v === undefined ? '' : String(v);
      return k + ': "' + val.replace(/"/g, '\\"') + '"';
    })
    .join('\n');

  const body = [
    '# ' + fm.title, '',
    '- Звание: ' + (row.rank || '—'),
    '- Часть: ' + (row.warunit || '—') + ' (`' + (unit.key || 'null') + '`)',
    '- Дата выбытия: ' + (row.date_death || '—'),
    '- Причина: ' + (row.cause_of_death || '—'),
    '- Первичное захоронение: ' + (row.primary_burial || '—'),
    '- Ныне: ' + (row.current_burial || '—'),
    '- Ссылка: ' + (row.primary_url || '—'),
    row.notes ? '\n## Доп. информация\n\n' + row.notes : '',
  ].join('\n');

  return {
    fileName,
    content: '---\n' + fmLines + '\n---\n\n' + body + '\n',
    sources: { unit: unit.source, birth: birth.source, burial: burialPrimary.source },
  };
}

// ========== Main ==========

(async () => {
  const csvFiles = singleFile ? [singleFile] : collectCsvFiles(processedRoot);
  if (csvFiles.length === 0) {
    console.error('*-fallen.csv не найдены в: ' + processedRoot);
    process.exit(1);
  }

  const dicts = loadDictionaries();

  // Специальный режим: burial object key из аргумента командной строки
  if (BURIAL_OBJECT_ID) {
    console.log('\n📍 Режим: burial object key');
    console.log('   ID объекта: ' + BURIAL_OBJECT_ID);
    console.log('   Все карточки получат burial_object_key: "' + BURIAL_OBJECT_ID + '"');
    console.log('   Пометка: ВРЕМЕННОЕ РЕШЕНИЕ');
  }

  // Если указана фильтрация по ключу
  if (UNIT_KEY_FILTER) {
    const filterKey = UNIT_KEY_FILTER.split('=')[1];
    if (!dicts.warunitsDict[filterKey]) {
      console.error('❌ Ключ не найден в словаре: ' + filterKey);
      console.error('   Доступные ключи: ' + Object.keys(dicts.warunitsDict).slice(0, 10).join(', ') + '...');
      process.exit(1);
    }
    console.log('🔍 Фильтрация по ключу: ' + filterKey);
    console.log('   Варианты: ' + dicts.warunitsDict[filterKey].variants.join(', '));
  }

  let generated = 0;
  let skipped = 0;
  const stats = { unit_with_key: 0, unit_null: 0, persons: 0, with_burial_object: 0 };
  const seenIds = new Set();
  const unknownWarunits = new Map();

  if (!isDryRun) {
    fs.mkdirSync(cardsDir, { recursive: true });
  }

  for (const file of csvFiles) {
    const fileBasename = path.basename(file);
    const source = fileBasename.includes('pmn') ? 'pmn' : 'obd';

    const lines = readUtf8(file).split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) continue;
    const headers = parseCsvLine(lines[0]);

    for (const line of lines.slice(1)) {
      const cols = parseCsvLine(line);
      const row = {};
      headers.forEach((h, i) => (row[h] = cols[i] ?? ''));
      if (!row.document_id || seenIds.has(row.document_id)) continue;
      seenIds.add(row.document_id);
      stats.persons++;

      // Фильтрация по ключу
      if (UNIT_KEY_FILTER) {
        const filterKey = UNIT_KEY_FILTER.split('=')[1];
        const unitCheck = assignUnitKey(row.warunit, dicts);
        if (unitCheck.key !== filterKey) continue;
      }

      const card = buildCard(row, dicts, source);

      // Статистика burial_object_key
      if (BURIAL_OBJECT_ID) {
        stats.with_burial_object++;
      }

      if (card.sources.unit === 'warunits-fallen-cards.json') {
        stats.unit_with_key++;
      } else if (card.sources.unit === 'unknown') {
        stats.unit_null++;
        const wu = row.warunit;
        if (!unknownWarunits.has(wu)) {
          unknownWarunits.set(wu, { count: 0, document_ids: [] });
        }
        const entry = unknownWarunits.get(wu);
        entry.count++;
        entry.document_ids.push(row.document_id);
      }

      const cardPath = path.join(cardsDir, card.fileName);

      // Защита slug
      if (fs.existsSync(cardPath)) {
        if (!isForceOverwrite) {
          skipped++;
          continue;
        }
      }

      if (!isDryRun) {
        fs.writeFileSync(cardPath, card.content, 'utf-8');
      }
      generated++;
    }
  }

  console.log('');
  console.log('📊 Статистика прогона:');
  console.log('   Всего записей: ' + stats.persons);
  console.log('   Создано/перезаписано карточек: ' + generated + (isDryRun ? ' (DRY-RUN)' : ''));
  console.log('   Пропущено (уже существуют): ' + skipped);

  if (BURIAL_OBJECT_ID) {
    console.log('');
    console.log('📍 Burial object key:');
    console.log('   ID объекта: ' + BURIAL_OBJECT_ID);
    console.log('   Карточек с burial_object_key: ' + stats.with_burial_object);
    console.log('   Пометка: ВРЕМЕННОЕ РЕШЕНИЕ');
  }

  console.log('');
  console.log('📊 unit_key:');
  console.log('   С ключом: ' + stats.unit_with_key);
  console.log('   Без ключа (null): ' + stats.unit_null);
  console.log('');
  console.log('📊 Уникальные warunit без ключа: ' + unknownWarunits.size);

  if (!isForceOverwrite && !isDryRun && skipped > 0) {
    console.log('');
    console.log('💡 Защита slug: ' + skipped + ' карточек не перезаписаны.');
    console.log('   Для перезаписи: --force-overwrite');
  }

  if (unknownWarunits.size > 0 && !isDryRun) {
    const journalPath = path.join(DICT_DIR, 'proposals', 'unknown-pending.json');
    const journal = {
      warunit: Object.fromEntries(unknownWarunits),
      generated_at: new Date().toISOString()
    };
    fs.mkdirSync(path.dirname(journalPath), { recursive: true });
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2), 'utf-8');
    console.log('');
    console.log('📝 Журнал кандидатов: ' + path.relative(ROOT, journalPath));
  }

  if (!isDryRun) {
    console.log('');
    console.log('📂 Выход: ' + path.relative(ROOT, cardsDir) + '/<источник>-<document_id>.md');
  }
})().catch(err => {
  console.error('Фатальная ошибка:', err);
  process.exit(1);
});
