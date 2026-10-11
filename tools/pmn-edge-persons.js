/**
 * pmn-edge-persons.js — парсер карточек персон (pamyat-naroda.ru, TASK-8, п.1)
 *
 * ЗАДАЧА:
 *   Из списка URL карточек персон pamyat-naroda.ru собрать CSV персон
 *   по схеме CSV_SCHEMA.md v03 (24 колонки, имена фиксированы).
 *
 * ЗАПУСК:
 *   Edge с remote-debugging (С ОКНОМ — ручная верификация капчи/логина):
 *     pwsh tools/run-edge-pmn.ps1
 *   Парсер:
 *     node tools/pmn-edge-persons.js pmn-urls.txt
 *     node tools/pmn-edge-persons.js pmn-urls.txt --dry-run
 *     node tools/pmn-edge-persons.js pmn-urls.txt --port=9231
 *
 * ВХОД:
 *   pmn-urls.txt — список URL карточек вида:
 *     https://pamyat-naroda.ru/heroes/memorial-chelovek_prikaz74365833/
 *   (по одной ссылке на строку; пустые строки и строки с # пропускаются)
 *
 * ВЫХОД:
 *   data/processed/pmn-persons-fallen-<YYYY-MM-DD_HHMM>.csv        (причина выбытия «убит»/«погиб»)
 *   data/processed/pmn-persons-unclassified-<YYYY-MM-DD_HHMM>.csv  (остальное)
 *   data/processed/pmn-persons-errors-<YYYY-MM-DD_HHMM>.csv
 *     (схема ошибок: document_id,primary_url,error_type,error_message,Дата;
 *      метка времени прогона в имени; ПЕРЕЗАПИСЬ ЗАПРЕЩЕНА: существующие
 *      файлы не изменяются и не удаляются ни при каких условиях.
 *      Каталог создаётся при отсутствии.)
 *
 * ОСОБЕННОСТИ:
 *   - Подключение к уже запущенному Edge через puppeteer-core (CDP).
 *   - document_id берётся ИЗ ПОЛЯ СТРАНИЦЫ; СВЕРКА «хвост URL == document_id»
 *     НЕ ПРИМЕНЯЕТСЯ: на pamyat-naroda.ru такого соответствия, как на OBD, нет.
 *   - Классификация fallen/unclassified по причине выбытия на карточке
 *     («убит»/«погиб» → fallen; иначе unclassified).
 *   - Порядок запросов случайный (Фишер–Йетс, seed = Date.now(), печатается).
 *   - Паузы мягче, чем у OBD-объектов: 3–10 с между запросами,
 *     15–30 с каждые 8–12 запросов; User-Agent случайный на запрос.
 *   - Пустое поле = пустая строка в CSV (не null, не N/A); UTF-8 без BOM.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// puppeteer-core — по package.json (в репозитории нет пакета «puppeteer»);
// CommonJS-модуль, импортируется скоупом по умолчанию.
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Параметры ----------
const DEFAULT_PORT = 9230;

// Аргументы: позиционный <файл.txt>, флаги --dry-run, --port=
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const portArg = args.find(a => a.startsWith('--port='));
const PORT = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_PORT;

// Позиционный аргумент — файл со списком URL:
//   node pmn-edge-persons.js pmn-urls.txt
const positional = args.filter(a => !a.startsWith('--'));
const INPUT_FILE = positional[0] || null;

// ---------- Куда писать результат ----------
// Корень репозитория = на уровень выше tools/
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'data', 'processed');

// ---------- Имена выходных файлов (метка времени прогона) ----------
const FALLEN_CSV_BASE = 'pmn-persons-fallen';             // + -<YYYY-MM-DD_HHMM>.csv
const UNCLASSIFIED_CSV_BASE = 'pmn-persons-unclassified'; // + -<YYYY-MM-DD_HHMM>.csv
const ERRORS_CSV_BASE = 'pmn-persons-errors';             // + -<YYYY-MM-DD_HHMM>.csv

// Метка времени для имён файлов: YYYY-MM-DD_HHMM (та же функция-формат,
// чт�� в scripts/units-report.js; локальное время).
function timestampStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// Имя с меткой времени; если файл уже существует (повторный прогон в ту же
// минуту) — добавляются секунды -<SS>. ПЕРЕЗАПИСЬ ЗАПРЕЩЕНА: возвращаемая
// дорожка гарантированно не существует; существующие файлы не изменяются
// и не удаляются ни при каких условиях.
function uniqueFilename(dir, base, ext, when) {
  let name = `${base}-${timestampStr(when)}${ext}`;
  if (fs.existsSync(path.join(dir, name))) {
    const p = n => String(n).padStart(2, '0');
    name = `${base}-${timestampStr(when)}-${p(when.getSeconds())}${ext}`;
  }
  return name;
}

// ---------- Задержки (рандомизация, мягче, чем у OBD-объектов) ----------
const MIN_AFTER_LOAD = 2000;
const MAX_AFTER_LOAD = 4000;
const MIN_BETWEEN = 3000;     // случайная задержка между запросами: 3–10 с
const MAX_BETWEEN = 10000;
const LONG_PAUSE_MIN = 15000; // дополнительная пауза каждые 8–12 запросов: 15–30 с
const LONG_PAUSE_MAX = 30000;
const LONG_PAUSE_MIN_N = 8;   // каждые случайные 8–12 запросов
const LONG_PAUSE_MAX_N = 12;

// ---------- PRNG с seed (Date.now()) — воспроизводимость рандома прогона ----------
let RNG_SEED = Date.now();
let rngState = RNG_SEED >>> 0;
function rnd() {
  // mulberry32
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rndInt(min, max) { return Math.floor(min + rnd() * (max - min + 1)); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay(min, max) { return delay(rndInt(min, max)); }

// Перемешивание Фишера–Йетса (на месте, детерминированно по seed)
function fisherYatesShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rndInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- User-Agent: случайный выбор из литеральных строк на запрос ----------
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.67',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.2420.81',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];
function pickUserAgent() {
  return USER_AGENTS[rndInt(0, USER_AGENTS.length - 1)];
}

// Экранирование значения для CSV
function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Сохранение CSV (UTF-8 БЕЗ BOM по CSV_SCHEMA.md v03); пусто = пустая строка.
// ПЕРЕЗАПИСЬ ЗАПРЕЩЕНА: если файл уже существует — запись не производится.
function saveCsv(filepath, headers, rows) {
  if (fs.existsSync(filepath)) return;
  const csvRows = rows.map(row =>
    headers.map(h => escapeCsv(row[h])).join(',')
  );
  const csvContent = [headers.join(','), ...csvRows].join('\n');
  fs.writeFileSync(filepath, csvContent, 'utf-8');
}

// Дата съёма YYYY-MM-DD
function scrapeDate() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Чтение списка URL: пропускаем пустые строки и комментарии (#)
function readUrlList(filepath) {
  if (!fs.existsSync(filepath)) return [];
  return fs.readFileSync(filepath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));
}

// ---------- Схема CSV_SCHEMA.md v03 (канонический порядок колонок) ----------
const headers = [
  'Заголовок',
  'nomer_fonda',
  'nomer_opisi',
  'nomer_dela',
  'document_type',
  'document_id',
  'last_name',
  'first_name',
  'middle_name',
  'date_birth',
  'place_birth',
  'date_death',
  'rank',
  'warunit',
  'cause_of_death',
  'primary_burial',
  'current_burial',
  'country_burial',
  'region_burial',
  'rebural_from',
  'conscription_location',
  'primary_url',
  'notes',
  'Дата',
];

// Классификация fallen/unclassified по причине выбытия.
// «убит»/«погиб» → fallen; остальное (в т.ч. пусто) → unclassified.
function classifyCause(cause) {
  const c = (cause || '').toLowerCase();
  return (c.includes('убит') || c.includes('погиб')) ? 'fallen' : 'unclassified';
}

// ---------- Главная функция ----------
(async () => {
  if (!INPUT_FILE) {
    console.error('Использование: node tools/pmn-edge-persons.js pmn-urls.txt [--dry-run] [--port=9230]');
    process.exit(1);
  }

  const inputPath = path.isAbsolute(INPUT_FILE)
    ? INPUT_FILE
    : path.join(process.cwd(), INPUT_FILE);

  if (!fs.existsSync(inputPath)) {
    console.error(`Файл не найден: ${inputPath}`);
    process.exit(1);
  }

  const urls = readUrlList(inputPath);
  if (urls.length === 0) {
    console.error('В файле нет ни одного URL.');
    process.exit(1);
  }

  // Случайный порядок запросов: Фишер–Йетс, seed = Date.now()
  fisherYatesShuffle(urls);

  // Каталог выхода создаётся при отсутствии
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Имена с меткой времени прогона; перезапись запрещена — выбирается
  // дорожка, которой ещё нет (при коллизии минуты добавляются секунды).
  const runMoment = new Date();
  const fallenPath = path.join(OUT_DIR, uniqueFilename(OUT_DIR, FALLEN_CSV_BASE, '.csv', runMoment));
  const unclassifiedPath = path.join(OUT_DIR, uniqueFilename(OUT_DIR, UNCLASSIFIED_CSV_BASE, '.csv', runMoment));
  const errorsCsvPath = path.join(OUT_DIR, uniqueFilename(OUT_DIR, ERRORS_CSV_BASE, '.csv', runMoment));

  const seed = RNG_SEED;
  const runDate = scrapeDate();
  const errors = []; // { document_id, url, error_type, reason }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${PORT}`,
      defaultViewport: null,
    });
  } catch (e) {
    console.error(`Не удалось подключиться к Edge CDP localhost:${PORT}.`);
    console.error(`Сначала запустите: pwsh tools/run-edge-pmn.ps1 (Edge С ОКНОМ для ручной верификации)`);
    console.error(`Ошибка: ${e.message}`);
    process.exit(1);
  }

  const page = await browser.newPage();
  const fallenRows = [];
  const unclassifiedRows = [];
  let ok = 0;
  let err = 0;
  let sinceLongPause = 0;
  let nextLongPauseAt = rndInt(LONG_PAUSE_MIN_N, LONG_PAUSE_MAX_N);

  const N = urls.length;
  for (let i = 0; i < N; i++) {
    const url = urls[i];

    try {
      // Случайный User-Agent на каждый запрос
      await page.setUserAgent(pickUserAgent());

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await randomDelay(MIN_AFTER_LOAD, MAX_AFTER_LOAD);

      // Сбор данных с карточки персоны pamyat-naroda.ru
      const data = await page.evaluate(() => {
        // Параметры карточки: пары «заголовок — значение»
        function getParamValue(title) {
          const elements = document.querySelectorAll('.card_parameter');
          for (const el of elements) {
            const t = el.querySelector('.card_param-title');
            if (t && t.innerText.trim() === title) {
              const v = el.querySelector('.card_param-result');
              return v ? v.innerText.trim() : '';
            }
          }
          return '';
        }

        // ФИО: «Заголовок» — сборное («Фамилия, имя, отчество»); при пустоте — h1
        const h1 = document.querySelector('h1');
        const fio = h1 ? h1.innerText.trim() : '';

        // document_id ИЗ ПОЛЯ СТРАНИЦЫ: сначала поле ID, при пустоте —
        // регекс /ID:\s*(\d+)/ по тексту карточки. Сверка с хвостом URL
        // НЕ ПРИМЕНЯЕТСЯ: на pamyat-naroda.ru такого соответствия нет.
        let pageId = getParamValue('ID');
        if (!pageId) {
          const cardText = document.body ? document.body.innerText : '';
          const m = cardText.match(/ID:\s*(\d+)/);
          if (m) pageId = m[1];
        }

        // Метки из «Доп. информация»: «Место рождения:» и «Место призыва:»
        const notesRaw = getParamValue('Доп. информация');
        function noteValue(label) {
          if (!notesRaw) return '';
          const m = notesRaw.match(new RegExp(label + '\\s*:\\s*([^;\\n]+)'));
          return m ? m[1].trim() : '';
        }

        return {
          'Заголовок':            fio,
          nomer_fonda:            getParamValue('Номер фонда'),
          nomer_opisi:            getParamValue('Номер описи'),
          nomer_dela:             getParamValue('Номер дела'),
          document_type:          getParamValue('Тип документа') || getParamValue('Документ'),
          document_id:            pageId,
          last_name:              '',
          first_name:             '',
          middle_name:            '',
          date_birth:             getParamValue('Дата рождения'),
          place_birth:            getParamValue('Место рождения') || noteValue('Место рождения'),
          date_death:             getParamValue('Дата выбытия') || getParamValue('Дата смерти'),
          rank:                   getParamValue('Звание'),
          warunit:                getParamValue('Воинская часть') || getParamValue('Место службы'),
          cause_of_death:         getParamValue('Причина выбытия') || getParamValue('Выбытие'),
          primary_burial:         getParamValue('Первичное место захоронения'),
          current_burial:         getParamValue('Место захоронения'),
          country_burial:         getParamValue('Страна захоронения'),
          region_burial:          getParamValue('Регион захоронения'),
          rebural_from:           getParamValue('Откуда перезахоронен'),
          conscription_location:  getParamValue('Место призыва') || noteValue('Место призыва'),
          primary_url:            window.location.href,
          notes:                  notesRaw,
        };
      });

      // Разбивка ФИО: «Заголовок» («Фамилия, имя, отчество») → last/first/middle
      const fioParts = (data['Заголовок'] || '').split(',').map(s => s.trim()).filter(Boolean);
      data.last_name = fioParts[0] || '';
      data.first_name = fioParts[1] || '';
      data.middle_name = fioParts[2] || '';

      data['Дата'] = runDate;

      const bucket = classifyCause(data.cause_of_death) === 'fallen' ? fallenRows : unclassifiedRows;
      bucket.push(data);
      ok++;
      console.log(`[${i + 1}/${N}] OK ${data.document_id || '(без ID)'} → ${classifyCause(data.cause_of_death)}`);
    } catch (e) {
      err++;
      const reason = e.message || String(e);
      console.log(`[${i + 1}/${N}] ${url} ERR ${reason}`);
      errors.push({ document_id: '', url, error_type: 'parse', reason });
    }

    // Паузы: 3–10 с; каждые случайные 8–12 запросов — 15–30 с
    if (i < N - 1) {
      sinceLongPause++;
      if (sinceLongPause >= nextLongPauseAt) {
        await randomDelay(LONG_PAUSE_MIN, LONG_PAUSE_MAX);
        sinceLongPause = 0;
        nextLongPauseAt = rndInt(LONG_PAUSE_MIN_N, LONG_PAUSE_MAX_N);
      } else {
        await randomDelay(MIN_BETWEEN, MAX_BETWEEN);
      }
    }
  }

  await page.close();
  await browser.disconnect();

  if (!isDryRun) {
    // Каждый CSV пишется только если в нём есть строки; перезапись запрещена
    if (fallenRows.length > 0) saveCsv(fallenPath, headers, fallenRows);
    if (unclassifiedRows.length > 0) saveCsv(unclassifiedPath, headers, unclassifiedRows);
    // Ошибки — в отдельный CSV (схема из CSV_SCHEMA.md), тот же запрет перезаписи
    if (errors.length > 0) {
      const errHeaders = ['document_id', 'primary_url', 'error_type', 'error_message', 'Дата'];
      const errLines = errors.map(e =>
        [e.document_id, e.url, e.error_type, e.reason, runDate].map(escapeCsv).join(',')
      );
      fs.writeFileSync(
        errorsCsvPath,
        [errHeaders.join(','), ...errLines].join('\n') + '\n',
        'utf-8'
      );
    }
  }

  // ---------- Итоговый блок (компактный, без эмодзи) ----------
  console.log('--- ИТОГ ---');
  console.log(`seed: ${seed}`);
  console.log(`ok: ${ok} (fallen: ${fallenRows.length}, unclassified: ${unclassifiedRows.length})`);
  console.log(`err: ${err}`);
  if (!isDryRun) {
    console.log(`выход fallen:       ${fallenRows.length > 0 ? fallenPath : '(нет строк — файл не создан)'}`);
    console.log(`выход unclassified: ${unclassifiedRows.length > 0 ? unclassifiedPath : '(нет строк — файл не создан)'}`);
    console.log(`выход ошибки:       ${errors.length > 0 ? errorsCsvPath : '(нет ошибок — файл не создан)'}`);
  } else {
    console.log('выход: (dry-run, файлы не записаны)');
  }
  if (errors.length > 0) {
    console.log('ошибки:');
    for (const e of errors) console.log(`  ${e.url} — ${e.reason}`);
  }
})();