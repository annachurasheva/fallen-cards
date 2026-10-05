/**
 * normalize.js — CLI нормализации карточек OBD Memorial (ESM).
 *
 * ИСПОЛЬЗОВАНИЕ:
 *   node scripts/normalize.js                              — все прогоны из data/processed/
 *   node scripts/normalize.js --input=<имя_папки>          — один прогон (папка в data/processed/)
 *   node scripts/normalize.js --input=data/processed/<имя> — то же; повторный префикс стриппится
 *   node scripts/normalize.js --input=killed.csv           — конкретный CSV (путь от CWD или абсолютный)
 *   node scripts/normalize.js --input=./runs/              — папка с *.csv (путь от CWD или абсолютный)
 *   node scripts/normalize.js --dry-run                    — счётчики, файлы НЕ писать
 *
 * ВЫХОД:
 *   <папка входа>/<базовое имя файла>__normalized.json     — нормализованные карточки
 *     (killed.csv → killed__normalized.json)
 *   data/dictionaries/burials_primary.json                 — уникальные первичные места (ПОПОЛНЯЕНИЕ)
 *   data/dictionaries/burials_current.json                 — уникальные текущие места  (ПОПОЛНЯЕНИЕ)
 *
 * Приём экспертных поставок без переименования: если значение --input
 * существует как путь от CWD или как абсолютный — используется как есть,
 * БЕЗ приклеивания data/processed/. В папочном режиме берутся ВСЕ *.csv.
 * Словари мест пополняются из всех обработанных файлов прогона (merge),
 * а не перезаписываются.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { collectBurials } from '../src/normalizers/location.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ---------- Параметры ----------
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const inputArg = args.find(a => a.startsWith('--input='));

const processedRoot = path.join(ROOT, 'data', 'processed');
const dictDir = path.join(ROOT, 'data', 'dictionaries');

// ---------- Разбор CSV (парсер tolerant: кавычки, запятые, переводы строк внутри кавычек) ----------
function parseCsv(text) {
  // снимаем BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some(c => c !== '')) rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows.shift();
  return rows.map(cells => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h.trim()] = cells[idx] ?? ''; });
    return obj;
  });
}

// ---------- Минимальная нормализация карточки ----------
// person/burial — исходные поля строки CSV; burial.current_norm / primary_norm —
// сюда пока попадают канонизированные дословные значения (словарь нормализации
// мест будет по мере наполнения burials_primary/current.json).
function normalizeCard(raw) {
  return {
    document_id: raw['document_id'] || raw['id'] || '',
    person: {
      name: raw['Заголовок'] || raw['surname_name'] || '',
      death_date: raw['date_death'] || '',
    },
    burial: {
      primary_raw: raw['primary_burial'] || '',
      current_raw: raw['current_burial'] || '',
      primary_norm: (raw['primary_burial'] || '').trim(),
      current_norm: (raw['current_burial'] || '').trim(),
      rebural_from: raw['rebural_from'] || '', // дословно, не нормализуется
    },
    cause_of_death: raw['cause_of_death'] || '',
    primary_url: raw['primary_url'] || '',
  };
}

// ---------- Разрешение входа (--input) ----------
// 1) existsSync ДО склейки: путь от CWD или абсолютный → используем как есть;
// 3) повторно переданный префикс data/processed/ стриппится.
function resolveInput(raw) {
  let p = String(raw || '').trim().replace(/^["']|["']$/g, '');
  const candidates = [];

  // прямые пути (от CWD / абсолютные) — проверяются ПЕРВЫМИ, до склейки
  candidates.push(p);
  if (path.isAbsolute(p)) candidates.push(path.resolve(p));

  // стрипп повтора "data/processed/" (старая грабля):
  // "data/processed/data/processed/foo" → "data/processed/foo"
  let stripped = p;
  const pref = 'data/processed/';
  while (stripped.toLowerCase().startsWith(pref.toLowerCase() + pref.toLowerCase()) ||
         stripped.replace(/\\/g, '/').toLowerCase().includes(pref.toLowerCase() + '/' + 'data/processed/'.toLowerCase())) {
    const next = stripped.replace(/\\/g, '/').replace(new RegExp('(' + pref.replace(/\//g, '\\/') + '){2,}', 'ig'), pref);
    if (next === stripped) break;
    stripped = next;
  }
  if (stripped !== p) candidates.push(stripped);

  // базовое имя без префикса → под data/processed/ (режим имени папки прогона)
  const base = path.basename(stripped.replace(/[\\/]+$/, ''));
  if (base) candidates.push(path.join(processedRoot, base));

  // и просто относительно корня проекта (запуск не из ROOT)
  candidates.push(path.resolve(ROOT, stripped));

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return path.resolve(c); // ← existsSync до всякой склейки с data/processed
    } catch { /* нечитаемый путь — пропускаем */ }
  }
  return null;
}

// Сбор CSV-источников: файл → [файл]; папка → все *.csv в ней (рекурсивно по 1 уровню вложенности прогонов)
function collectCsvSources(target) {
  const st = fs.statSync(target);
  if (st.isFile()) {
    if (!target.toLowerCase().endsWith('.csv')) {
      console.error(`❌ Вход --input — файл не CSV: ${target}`);
      process.exit(1);
    }
    return [target];
  }
  if (st.isDirectory()) {
    let files = fs.readdirSync(target, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.csv'))
      .map(e => path.join(target, e.name));
    if (files.length === 0) {
      // вкладка вида data/processed/<имя>/<ещё csv>? — один уровень вниз
      for (const e of fs.readdirSync(target, { withFileTypes: true })) {
        if (e.isDirectory()) {
          const sub = path.join(target, e.name);
          files = files.concat(fs.readdirSync(sub, { withFileTypes: true })
            .filter(x => x.isFile() && x.name.toLowerCase().endsWith('.csv'))
            .map(x => path.join(sub, x.name)));
        }
      }
    }
    return files.sort();
  }
  return [];
}

// ---------- Merge словарей мест (пополнение, не перезапись) ----------
function mergeDict(existing, incoming) {
  const out = { ...(existing || {}) };
  for (const key of Object.keys(incoming || {})) {
    const inc = incoming[key];
    if (!out[key]) {
      out[key] = { ...inc };
    } else {
      out[key].count = (out[key].count || 0) + (inc.count || 0);
      if (!out[key].first_seen && inc.first_seen) out[key].first_seen = inc.first_seen;
    }
  }
  return out;
}

function readJsonSafe(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch { /* битый JSON — стартуем с пустого */ }
  return {};
}

// ---------- Главная функция ----------
(async () => {
  // Определяем цель: --input или весь data/processed/
  let target = processedRoot;
  if (inputArg) {
    const raw = inputArg.split('=').slice(1).join('=');
    target = resolveInput(raw);
    if (!target) {
      console.error(`❌ Вход не найден: "${raw}" (ни как путь от CWD, ни как абсолютный, ни как папка в data/processed/).`);
      process.exit(1);
    }
  }

  const csvFiles = collectCsvSources(target);
  if (csvFiles.length === 0) {
    console.error(`❌ В "${path.relative(ROOT, target) || target}" нет ни одного *.csv.`);
    process.exit(1);
  }

  console.log('=== Нормализатор OBD Memorial (ESM) ===');
  console.log(`📂 Цель: ${target}`);
  console.log(`📄 CSV-файлов: ${csvFiles.length}`);

  let totalCards = 0;
  const allRows = [];

  // Группируем выходы по папке входа; имя выхода — от базового имени файла
  const byDir = new Map();
  for (const f of csvFiles) {
    const rows = parseCsv(fs.readFileSync(f, 'utf-8'));
    const cards = rows.map(normalizeCard);
    totalCards += cards.length;
    allRows.push(...rows); // сырые строки: collectBurials берёт primary_burial/current_burial
    const dir = path.dirname(f);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push({ file: f, cards });
    console.log(`   📄 ${path.basename(f)}: ${cards.length} карточек`);
  }

  if (totalCards === 0) {
    console.error('❌ Карточек не найдено — словари не обновляются.');
    process.exit(1);
  }

  // Запись нормализованных JSON рядом с каждым CSV: killed.csv → killed__normalized.json
  if (!isDryRun) {
    for (const [, items] of byDir) {
      for (const { file, cards } of items) {
        const outFile = path.join(path.dirname(file), `${path.basename(file, path.extname(file))}__normalized.json`);
        fs.writeFileSync(outFile, JSON.stringify(cards, null, 2), 'utf-8');
        console.log(`   💾 ${path.relative(ROOT, outFile)}`);
      }
    }
  }

  // ---------- Словари мест: пополнение из ВСЕХ обработанных файлов прогона ----------
  const burials = collectBurials(allRows);
  const primaryPath = path.join(dictDir, 'burials_primary.json');
  const currentPath = path.join(dictDir, 'burials_current.json');

  if (isDryRun) {
    console.log(`\n🔍 DRY-RUN: карточек ${totalCards}, primary+=${Object.keys(burials.primary).length}, current+=${Object.keys(burials.current).length}. Файлы НЕ записаны.`);
    return;
  }

  fs.mkdirSync(dictDir, { recursive: true });
  const mergedPrimary = mergeDict(readJsonSafe(primaryPath), burials.primary);
  const mergedCurrent = mergeDict(readJsonSafe(currentPath), burials.current);

  fs.writeFileSync(primaryPath, JSON.stringify(mergedPrimary, null, 2), 'utf-8');
  fs.writeFileSync(currentPath, JSON.stringify(mergedCurrent, null, 2), 'utf-8');

  console.log(`\n💾 Словари мест (пополнены): primary=${Object.keys(mergedPrimary).length} (в этом прогоне ${Object.keys(burials.primary).length}), current=${Object.keys(mergedCurrent).length} (в этом прогоне ${Object.keys(burials.current).length})`);
  console.log(`✅ Нормализация завершена. Карточек: ${totalCards}.`);
})().catch(err => {
  console.error('❌ Фатальная ошибка:', err);
  process.exit(1);
});