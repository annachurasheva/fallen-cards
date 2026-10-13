/**
 * verify-cards-integrity.js — проверка целостности сгенерированных карточек
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/verify-cards-integrity.js [--cards-dir=data/cards] [--csv-dir=data/processed]
 *
 * ПРОВЕРКИ:
 *   1. Формат имён файлов (A4): <источник>-<document_id>.md
 *   2. Наличие обязательных полей в frontmatter
 *   3. unit_raw не изменён (дословно из CSV)
 *   4. slug соответствует A4: bitva-za-krym-1942-<источник>-<document_id>
 *   5. unit_key: null или валидный ключ из warunits-fallen-cards.json
 *
 * КРИТИЧЕСКИЕ ПРАВИЛА (§1.5, §5.1):
 *   - Никаких нормализаций в unit_raw
 *   - Точное совпадение по знакам
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const CARDS_DIR_ARG = args.find(a => a.startsWith('--cards-dir='));
const CSV_DIR_ARG = args.find(a => a.startsWith('--csv-dir='));

const cardsDir = CARDS_DIR_ARG
  ? path.resolve(ROOT, CARDS_DIR_ARG.split('=').slice(1).join('='))
  : path.join(ROOT, 'data', 'cards');
const csvDir = CSV_DIR_ARG
  ? path.resolve(ROOT, CSV_DIR_ARG.split('=').slice(1).join('='))
  : path.join(ROOT, 'data', 'processed');

const DICT_DIR = path.join(ROOT, 'data', 'dictionaries');

// ========== Утилиты ==========

function readUtf8(filepath) {
  return fs.readFileSync(filepath, 'utf-8').replace(/^\uFEFF/, '');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    // Убираем кавычки
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }
  return fm;
}

function collectCardFiles(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.md')) found.push(full);
    }
  };
  walk(dir);
  return found;
}

function collectCsvFiles(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.csv')) found.push(full);
    }
  };
  walk(dir);
  return found;
}

// ========== Загрузка данных ==========

function loadWarunitsDict() {
  const jsonPath = path.join(DICT_DIR, 'warunits-fallen-cards.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ warunits-fallen-cards.json не найден');
    process.exit(1);
  }
  return JSON.parse(readUtf8(jsonPath));
}

function loadCsvData(csvFiles) {
  const data = new Map(); // document_id -> row

  for (const file of csvFiles) {
    const lines = readUtf8(file).split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) continue;

    const headers = lines[0].split(',').map(h => h.trim());
    for (const line of lines.slice(1)) {
      const cols = line.split(',');
      const row = {};
      headers.forEach((h, i) => (row[h] = cols[i] ?? ''));
      if (row.document_id) {
        data.set(row.document_id, row);
      }
    }
  }

  return data;
}

// ========== Проверки ==========

function checkFileNameFormat(fileName) {
  // A4: <источник>-<document_id>.md
  const match = fileName.match(/^(obd|pmn)-(\d+)\.md$/);
  return match !== null;
}

function checkSlugFormat(slug, source, documentId) {
  // A4: bitva-za-krym-1942-<источник>-<document_id>
  const expected = `bitva-za-krym-1942-${source}-${documentId}`;
  return slug === expected;
}

function checkUnitKeyValid(unitKey, warunitsDict) {
  if (unitKey === '' || unitKey === 'null') return true; // null допустим
  return warunitsDict.hasOwnProperty(unitKey);
}

// ========== Main ==========

(async () => {
  console.log('🔍 Проверка целостности карточек\n');

  const cardFiles = collectCardFiles(cardsDir);
  if (cardFiles.length === 0) {
    console.error('❌ Карточки не найдены в: ' + cardsDir);
    process.exit(1);
  }

  console.log('📂 Найдено карточек: ' + cardFiles.length);

  const warunitsDict = loadWarunitsDict();
  const csvFiles = collectCsvFiles(csvDir);
  const csvData = loadCsvData(csvFiles);

  console.log('📂 Найдено CSV: ' + csvFiles.length);
  console.log('📊 Записей в CSV: ' + csvData.size);
  console.log('🔑 Ключей в словаре: ' + Object.keys(warunitsDict).length);
  console.log('');

  const stats = {
    total: 0,
    errors: [],
    warnings: []
  };

  for (const cardPath of cardFiles) {
    stats.total++;
    const fileName = path.basename(cardPath);
    const content = readUtf8(cardPath);
    const fm = parseFrontmatter(content);

    if (!fm) {
      stats.errors.push({ file: fileName, error: 'Нет frontmatter' });
      continue;
    }

    // Проверка 1: Формат имени файла (A4)
    if (!checkFileNameFormat(fileName)) {
      stats.errors.push({ file: fileName, error: 'Неверный формат имени (ожидается <источник>-<id>.md)' });
    }

    // Проверка 2: Обязательные поля
    const requiredFields = ['title', 'slug', 'document_id', 'source'];
    for (const field of requiredFields) {
      if (!fm[field]) {
        stats.errors.push({ file: fileName, error: `Отсутствует поле: ${field}` });
      }
    }

    // Проверка 3: Slug (A4)
    if (fm.slug && fm.source && fm.document_id) {
      if (!checkSlugFormat(fm.slug, fm.source, fm.document_id)) {
        stats.errors.push({
          file: fileName,
          error: `Неверный slug (ожидается bitva-za-krym-1942-${fm.source}-${fm.document_id})`
        });
      }
    }

    // Проверка 4: unit_key валиден
    if (fm.unit_key !== undefined) {
      if (!checkUnitKeyValid(fm.unit_key, warunitsDict)) {
        stats.errors.push({
          file: fileName,
          error: `Невалидный unit_key: "${fm.unit_key}"`
        });
      }
    }

    // Проверка 5: unit_raw не изменён (§1.5)
    if (fm.document_id && fm.unit_raw !== undefined) {
      const csvRow = csvData.get(fm.document_id);
      if (csvRow && csvRow.warunit !== undefined) {
        if (fm.unit_raw !== csvRow.warunit) {
          stats.warnings.push({
            file: fileName,
            warning: `unit_raw изменён! CSV: "${csvRow.warunit}", карточка: "${fm.unit_raw}"`
          });
        }
      }
    }
  }

  // Вывод результатов
  console.log('📊 Результаты проверки:');
  console.log('   Всего карточек: ' + stats.total);
  console.log('   Ошибок: ' + stats.errors.length);
  console.log('   Предупреждений: ' + stats.warnings.length);
  console.log('');

  if (stats.errors.length > 0) {
    console.log('❌ ОШИБКИ:');
    for (const err of stats.errors.slice(0, 10)) {
      console.log('   ' + err.file + ': ' + err.error);
    }
    if (stats.errors.length > 10) {
      console.log('   ... и ещё ' + (stats.errors.length - 10) + ' ошибок');
    }
    console.log('');
  }

  if (stats.warnings.length > 0) {
    console.log('⚠️  ПРЕДУПРЕЖДЕНИЯ (возможные нарушения §1.5):');
    for (const warn of stats.warnings.slice(0, 10)) {
      console.log('   ' + warn.file + ': ' + warn.warning);
    }
    if (stats.warnings.length > 10) {
      console.log('   ... и ещё ' + (stats.warnings.length - 10) + ' предупреждений');
    }
    console.log('');
  }

  if (stats.errors.length === 0 && stats.warnings.length === 0) {
    console.log('✅ Все проверки пройдены!');
  } else if (stats.errors.length === 0) {
    console.log('✅ Критических ошибок нет, но есть предупреждения');
  } else {
    console.log('❌ Обнаружены критические ошибки');
    process.exit(1);
  }
})().catch(err => {
  console.error('Фатальная ошибка:', err);
  process.exit(1);
});
