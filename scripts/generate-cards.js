/**
 * generate-cards.js — генерация карточек персон (Markdown + frontmatter)
 * ВЕРСИЯ: 3.0 (рефакторинг frontmatter по образцу new-csv-to-markdown.mjs)
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/generate-cards.js [--input=data/processed|path/to/file.csv]
 *                                   [--output=data/cards]
 *                                   [--dry-run] [--force-overwrite]
 *                                   [--unit-key=<ключ>]   (можно несколько раз)
 *                                   [--burial-ob-<id>]
 *
 * ПРАВИЛА:
 *   - Frontmatter по образцу new-csv-to-markdown.mjs: title, slug, unit_key (массив)
 *   - unit_key в frontmatter — МАССИВ (зеркалит JSON-SCHEMA пост-обработки);
 *     живёт нижней строкой frontmatter.
 *   - Slug: bitva-za-krym-1942-<транслит ФИО>-<document_id>
 *   - Нет unit_key → карточка НЕ генерируется (запись уходит в unknown-pending.json)
 *   - «Воинская часть» в теле карточки = unit_key (не сырой warunit)
 *   - Реестр slug: data/summary/slug_registry.txt (id → slug → unit_key),
 *     заморозка при первом выпуске; обновляется только при реальной генерации.
 *   - НИКАКИХ toLowerCase / trim / replace / normalize для значений ЦАМО
 *     (совпадение warunit со словарём — только по знакам, точное равенство).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForceOverwrite = args.includes('--force-overwrite');

// --input=... (без пробела после =)
const INPUT_ARG = args.find(a => a.startsWith('--input='));
const OUTPUT_ARG = args.find(a => a.startsWith('--output='));

// --unit-key=... можно указывать несколько раз (вариант А)
const UNIT_KEY_FILTERS = args
  .filter(a => a.startsWith('--unit-key='))
  .map(a => a.split('=').slice(1).join('='));

// Ищем аргумент burial-ob-<id>
const BURIAL_OB_ARG = args.find(a => a.startsWith('--burial-ob-'));
const BURIAL_OBJECT_ID = BURIAL_OB_ARG ? BURIAL_OB_ARG.replace('--burial-ob-', '') : null;

// ========== Валидация аргументов ==========

if (INPUT_ARG && !INPUT_ARG.split('=')[1]) {
  console.error('❌ Ошибка: --input= указан без значения (возможно, после = лишний пробел).');
  console.error('   Пример: --input=data/processed/83_bmp_2026-10-17_urls/file-fallen.csv');
  process.exit(1);
}

const inputPath = INPUT_ARG
  ? path.resolve(ROOT, INPUT_ARG.split('=').slice(1).join('='))
  : path.join(ROOT, 'data', 'processed');

if (INPUT_ARG && !fs.existsSync(inputPath)) {
  console.error('❌ Путь не найден: ' + inputPath);
  process.exit(1);
}

if (UNIT_KEY_FILTERS.some(k => !k)) {
  console.error('❌ Ошибка: --unit-key= указан без значения (возможно, после = лишний пробел).');
  console.error('   Пример: --unit-key=083-04-fallen-cards');
  process.exit(1);
}

// Определяем: файл или папка?
const isSingleFile = fs.existsSync(inputPath) && fs.statSync(inputPath).isFile();
const processedRoot = isSingleFile ? path.dirname(inputPath) : inputPath;
const singleFile = isSingleFile ? inputPath : null;

const cardsDir = OUTPUT_ARG
  ? path.resolve(ROOT, OUTPUT_ARG.split('=').slice(1).join('='))
  : path.join(ROOT, 'data', 'cards');
const DICT_DIR = path.join(ROOT, 'data', 'dictionaries');
const SUMMARY_DIR = path.join(ROOT, 'data', 'summary');
const SLUG_REGISTRY_PATH = path.join(SUMMARY_DIR, 'slug_registry.txt');

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

// Транслитерация для slug (русский → латиница, нижний регистр, только a-z0-9-)
function translit(str) {
  const ru = 'А-а-Б-б-В-в-Ґ-ґ-Г-г-Д-д-Е-е-Ё-ё-Є-є-Ж-ж-З-з-И-и-І-і-Ї-ї-Й-й-К-к-Л-л-М-м-Н-н-О-о-П-п-Р-р-С-с-Т-т-У-у-Ф-ф-Х-х-Ц-ц-Ч-ч-Ш-ш-Щ-щ-Ъ-ъ-Ы-ы-Ь-ь-Э-э-Ю-ю-Я-я-.';
  const en = "A-a-B-b-V-v-G-g-G-g-D-d-E-e-E-e-E-e-ZH-zh-Z-z-I-i-I-i-I-i-J-j-K-k-L-l-M-m-N-n-O-o-P-p-R-r-S-s-T-t-U-u-F-f-H-h-TS-ts-CH-ch-SH-sh-SCH-sch-'-Y-y-'-E-e-YU-yu-YA-ya-";
  const arr = str.split('');
  for (let i = 0; i < arr.length; i++) {
    const index = ru.indexOf(arr[i]);
    if (index !== -1) {
      arr[i] = en.split('-')[index];
    }
  }
  return arr.join('').toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Полное ФИО из строки (с fallback на колонку «Заголовок»)
function buildFullName(row) {
  let last = (row['last_name'] || '').trim();
  let first = (row['first_name'] || '').trim();
  let middle = (row['middle_name'] || '').trim();

  const header = (row['Заголовок'] || '').trim();
  if (!last && header) {
    const parts = header.split(/\s+/);
    last = parts[0] || '';
    first = parts[1] || '';
    middle = parts[2] || '';
  }

  return [last, first, middle].filter(Boolean).join(' ');
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

  // A1: индекс Map(буквальная строка → ключ), без нормализации
  const unitIndex = new Map();
  for (const [key, entry] of Object.entries(warunitsDict)) {
    for (const variant of entry.variants) {
      unitIndex.set(variant, key);
    }
  }

  return { warunitsDict, unitIndex };
}

function assignUnitKey(rawWarunit, dicts) {
  const wu = String(rawWarunit || '');
  if (!wu) return { key: null, source: 'empty' };
  const key = dicts.unitIndex.get(wu);
  if (key) return { key, source: 'warunits-fallen-cards.json' };
  return { key: null, source: 'unknown' };
}

// ========== Реестр slug ==========

function loadSlugRegistry() {
  const map = new Map();
  if (!fs.existsSync(SLUG_REGISTRY_PATH)) return map;
  for (const line of readUtf8(SLUG_REGISTRY_PATH).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [id, slug, unitKeys] = t.split('	');
    if (id && slug) map.set(id, { slug, unitKeys: unitKeys || '' });
  }
  return map;
}

function saveSlugRegistry(map) {
  const lines = ['# document_id	slug	unit_key'];
  for (const [id, rec] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))) {
    lines.push(`${id}	${rec.slug}	${rec.unitKeys}`);
  }
  fs.mkdirSync(SUMMARY_DIR, { recursive: true });
  fs.writeFileSync(SLUG_REGISTRY_PATH, lines.join('\n') + '\n', 'utf-8');
}

// ========== Генерация карточки ==========

function buildCard(row, source, unitKeys, slug) {
  const fullName = buildFullName(row);

  const fmLines = [
    '---',
    `title: "${fullName}"`,
    `slug: "${slug}"`,
  ];

  // Специальный режим: burial object key из аргумента командной строки
  if (BURIAL_OBJECT_ID) {
    fmLines.push(`burial_object_key: "${BURIAL_OBJECT_ID}"`);
    fmLines.push(`burial_object_note: "ВРЕМЕННОЕ РЕШЕНИЕ"`);
  }

  // unit_key — массив, нижней строкой frontmatter
  fmLines.push('unit_key:');
  for (const k of unitKeys) fmLines.push(`  - "${k}"`);
  fmLines.push('---', '');

  const body = [`# ${fullName}`, ''];

  // Поле выводится ТОЛЬКО если значение есть в CSV (нет позиции — нет строки)
  const rank = (row['rank'] || '').trim();
  if (rank) { body.push(`**Звание** ${rank}`, ''); }

  // «Воинская часть» = unit_key (не сырой warunit)
  if (unitKeys.length > 0) {
    body.push(`**Воинская часть** — ${unitKeys.join(', ')}`, '');
  }

  const dateBirth = (row['date_birth'] || '').trim();
  if (dateBirth) { body.push(`**Дата рождения** ${dateBirth}`, ''); }

  const placeBirth = (row['place_birth'] || '').trim();
  if (placeBirth) { body.push(`**Место рождения** ${placeBirth}`, ''); }

  const primaryBurial = (row['primary_burial'] || '').trim();
  if (primaryBurial) { body.push(`**Захоронен** ${primaryBurial}`, ''); }

  const currentBurial = (row['current_burial'] || '').trim();
  if (currentBurial) { body.push(`**Современное захоронение** ${currentBurial}`, ''); }

  const conscriptionLocation = (row['conscription_location'] || '').trim();
  if (conscriptionLocation) { body.push(`**Призывной пункт** ${conscriptionLocation}`, ''); }

  const primaryUrl = (row['primary_url'] || '').trim();
  if (primaryUrl) { body.push(`**Источник** ${primaryUrl}`, ''); }

  // cause_of_death — НЕ выводится (по образцу)

  const content = fmLines.join('\n') + body.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  return { fileName: source + '-' + row.document_id + '.md', content };
}

// ========== Main ==========

(async () => {
  const csvFiles = singleFile ? [singleFile] : collectCsvFiles(processedRoot);
  if (csvFiles.length === 0) {
    console.error('*-fallen.csv не найдены в: ' + processedRoot);
    process.exit(1);
  }

  console.log('📂 Вход: ' + (isSingleFile ? 'файл ' + singleFile : 'папка ' + processedRoot));
  console.log('   CSV файлов: ' + csvFiles.length);

  const dicts = loadDictionaries();

  // Валидация ключей фильтра
  if (UNIT_KEY_FILTERS.length > 0) {
    for (const filterKey of UNIT_KEY_FILTERS) {
      if (!dicts.warunitsDict[filterKey]) {
        console.error('❌ Ключ не найден в словаре: ' + filterKey);
        console.error('   Доступные ключи: ' + Object.keys(dicts.warunitsDict).slice(0, 10).join(', ') + '...');
        process.exit(1);
      }
    }
    console.log('🔍 Фильтрация по ключам: ' + UNIT_KEY_FILTERS.join(', '));
    for (const filterKey of UNIT_KEY_FILTERS) {
      console.log('   ' + filterKey + ' → ' + dicts.warunitsDict[filterKey].variants.join(', '));
    }
  }

  // Специальный режим: burial object key из аргумента командной строки
  if (BURIAL_OBJECT_ID) {
    console.log('\n📍 Режим: burial object key');
    console.log('   ID объекта: ' + BURIAL_OBJECT_ID);
    console.log('   Все карточки получат burial_object_key: "' + BURIAL_OBJECT_ID + '"');
    console.log('   Пометка: ВРЕМЕННОЕ РЕШЕНИЕ');
  }

  const slugRegistry = loadSlugRegistry();
  console.log('📖 Реестр slug: ' + path.relative(ROOT, SLUG_REGISTRY_PATH) + ' (' + slugRegistry.size + ' записей)');

  let generated = 0;
  let skipped = 0;
  let filtered = 0;
  const stats = { persons: 0, unit_with_key: 0, unit_null: 0, with_burial_object: 0 };
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

      const unitCheck = assignUnitKey(row.warunit, dicts);

      // Нет unit_key → нет генерации
      if (!unitCheck.key) {
        stats.unit_null++;
        const wu = row.warunit;
        if (!unknownWarunits.has(wu)) {
          unknownWarunits.set(wu, { count: 0, document_ids: [] });
        }
        const entry = unknownWarunits.get(wu);
        entry.count++;
        entry.document_ids.push(row.document_id);
        continue;
      }

      // Фильтрация по группе ключей
      if (UNIT_KEY_FILTERS.length > 0 && !UNIT_KEY_FILTERS.includes(unitCheck.key)) {
        filtered++;
        continue;
      }

      stats.unit_with_key++;

      // Slug: заморозка из реестра или новый
      let slug;
      const reg = slugRegistry.get(row.document_id);
      if (reg && reg.slug) {
        slug = reg.slug; // заморожен при первом выпуске
      } else {
        const fullName = buildFullName(row);
        const namePart = translit(fullName);
        slug = 'bitva-za-krym-1942-' + namePart + '-' + row.document_id;
      }

      // unit_key для карточки: найденный ключ + дополнения из реестра
      // (по офицерскому составу будут перечисления войсковых частей)
      const unitKeys = new Set([unitCheck.key]);
      if (reg && reg.unitKeys) {
        for (const k of reg.unitKeys.split(',')) {
          const t = k.trim();
          if (t) unitKeys.add(t);
        }
      }
      const unitKeysArr = [...unitKeys];

      const card = buildCard(row, source, unitKeysArr, slug);

      // Статистика burial_object_key
      if (BURIAL_OBJECT_ID) {
        stats.with_burial_object++;
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
        // Обновляем реестр: slug замораживается, unit_key дополняется
        slugRegistry.set(row.document_id, { slug, unitKeys: unitKeysArr.join(',') });
      }
      generated++;
    }
  }

  if (!isDryRun) {
    saveSlugRegistry(slugRegistry);
  }

  console.log('');
  console.log('📊 Статистика прогона:');
  console.log('   Всего записей: ' + stats.persons);
  console.log('   С unit_key (кандидаты на генерацию): ' + stats.unit_with_key);
  console.log('   Без unit_key (пропущено): ' + stats.unit_null);
  if (UNIT_KEY_FILTERS.length > 0) {
    console.log('   Отфильтровано (не входят в --unit-key): ' + filtered);
  }
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
