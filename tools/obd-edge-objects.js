/**
 * obd-edge-objects.js — парсер карточек «Информация о захоронении»
 * (объекты гос-регистрации захоронений ВОВ, obd-memorial.ru)
 *
 * ЗАДАЧА:
 *   Из списка primary_url (например, собранного F12-сборщиком со страницы
 *   поиска) составить memorial_objects.csv с объектами «Захоронения ВОВ».
 *
 * ЗАПУСК:
 *   Edge с remote-debugging: pwsh tools/run-edge-obd.ps1   (порт 9226)
 *   node obd-edge-objects.js objects.txt
 *   node obd-edge-objects.js objects.txt --dry-run
 *   node obd-edge-objects.js objects.txt --port=9227
 *
 * ВХОД:
 *   objects.txt — список primary_url вида:
 *     https://obd-memorial.ru/html/info.htm?id=1167839469
 *   (по одной ссылке на строку; пустые строки и строки с # пропускаются)
 *
 * ВЫХОД:
 *   data/dictionaries/memorial_objects/memorial_objects-<YYYY-MM-DD_HHMM>.csv
 *   data/dictionaries/memorial_objects/memorial_objects-errors-<YYYY-MM-DD_HHMM>.csv
 *   (метка времени прогона в имени; повторный прогон в ту же минуту —
 *    добавляются секунды -<SS>; ПЕРЕЗАПИСЬ ЗАПРЕЩЕНА: существующие файлы
 *    не изменяются и не удаляются ни при каких условиях. Каталог создаётся
 *    при отсутствии; CSV объектов НЕ лежит рядом с карточками персон и
 *    рядом со скриптом)
 *
 * ОСОБЕННОСТИ:
 *   - Операция РАЗОВАЯ: контроль дублей и журнал processed НЕ нужны.
 *   - «Тормоз»/notes НЕ используется: объекты пишутся как есть.
 *   - Персон не парсит. Тип файла не определяет.
 *   - Порядок запросов случайный (Фишер–Йетс, seed = Date.now(), печатается).
 *   - document_id берётся ИЗ ПОЛЯ СТРАНИЦЫ (getParamValue('ID'), иначе
 *     регекс /ID:\s*(\d+)/ по тексту карточки); href.match как источник ID
 *     не используется. После съёма — сверка: хвост URL == document_id,
 *     иначе строка НЕ попадает в CSV, а уходит в ошибки с обоими значениями.
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
const DEFAULT_PORT = 9226;

// Аргументы: позиционный <файл.txt>, флаги --dry-run, --port=
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const portArg = args.find(a => a.startsWith('--port='));
const PORT = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_PORT;

// Позиционный аргумент — файл со списком URL:
//   node obd-edge-objects.js objects.txt
const positional = args.filter(a => !a.startsWith('--'));
const INPUT_FILE = positional[0] || null;

// ---------- Куда писать результат ----------
// Корень репозитория = на уровень выше tools/
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'data', 'dictionaries', 'memorial_objects');

// ---------- Имена выходных файлов (метка времени прогона) ----------
const OUT_CSV_BASE = 'memorial_objects';        // + -<YYYY-MM-DD_HHMM>.csv
const ERRORS_CSV_BASE = 'memorial_objects-errors'; // + -<YYYY-MM-DD_HHMM>.csv

// Метка времени для имён файлов: YYYY-MM-DD_HHMM (та же функция-формат,
// что в scripts/units-report.js; локальное время).
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

// ---------- Задержки (рандомизация, чтобы не походить на бота) ----------
const MIN_AFTER_LOAD = 3000;
const MAX_AFTER_LOAD = 6000;
const MIN_BETWEEN = 3000;   // случайная задержка между запросами: 3–15 с
const MAX_BETWEEN = 15000;
const LONG_PAUSE_MIN = 20000; // дополнительная пауза каждые 8–12 запросов: 20–40 с
const LONG_PAUSE_MAX = 40000;
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

// Сохранение CSV (UTF-8 с BOM); пусто = пустая строка (не [], не null).
// ПЕРЕЗАПИСЬ ЗАПРЕЩЕНА: если файл уже существует — запись не производится.
function saveCsv(filepath, headers, rows) {
  if (fs.existsSync(filepath)) return;
  const csvRows = rows.map(row =>
    headers.map(h => escapeCsv(row[h])).join(',')
  );
  const csvContent = '\uFEFF' + [headers.join(','), ...csvRows].join('\n');
  fs.writeFileSync(filepath, csvContent, 'utf-8');
}

// Хвост URL — id параметра: .../info.htm?id=1167839469 -> 1167839469
function extractIdFromUrl(url) {
  const m = url.match(/[?&]id=(\d+)/);
  return m ? m[1] : '';
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

// ---------- Схема объектного CSV (канонический порядок колонок) ----------
const headers = [
  'document_id',
  'country_burial',
  'region_burial',
  'vmc_number',
  'current_burial',
  'primary_burial_object',
  'rebural_from',
  'date_created',
  'date_last_burial',
  'burial_type',
  'burial_state',
  'graves_count',
  'buried_total',
  'buried_known',
  'buried_unknown',
  'sponsor',
  'primary_url',
  'Дата',
];

// ---------- Главная функция ----------
(async () => {
  if (!INPUT_FILE) {
    console.error('Использование: node obd-edge-objects.js objects.txt [--dry-run] [--port=9226]');
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
  const outPath = path.join(OUT_DIR, uniqueFilename(OUT_DIR, OUT_CSV_BASE, '.csv', runMoment));
  const errorsCsvPath = path.join(OUT_DIR, uniqueFilename(OUT_DIR, ERRORS_CSV_BASE, '.csv', runMoment));

  const seed = RNG_SEED;
  const runDate = scrapeDate();
  const errors = []; // { url, reason }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${PORT}`,
      defaultViewport: null,
    });
  } catch (e) {
    console.error(`Не удалось подключиться к Edge CDP localhost:${PORT}.`);
    console.error(`Сначала запустите: pwsh tools/run-edge-obd.ps1`);
    console.error(`Ошибка: ${e.message}`);
    process.exit(1);
  }

  const page = await browser.newPage();
  const rows = [];
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

      // Сбор данных с карточки «Информация о захоронении»
      const data = await page.evaluate(() => {
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

        // document_id ИЗ ПОЛЯ СТРАНИЦЫ: сначала поле ID,
        // при пустоте — регекс /ID:\s*(\d+)/ по тексту карточки;
        // если и там пусто — id из фактического URL страницы
        // (window.location.href — адрес съёма после редиректа, НЕ href из списка).
        let pageId = getParamValue('ID');
        if (!pageId) {
          const cardText = document.body ? document.body.innerText : '';
          const m = cardText.match(/ID:\s*(\d+)/);
          if (m) pageId = m[1];
        }
        if (!pageId) {
          const lm = window.location.href.match(/[?&]id=(\d+)/);
          if (lm) pageId = lm[1];
        }

        // Ярлыки primary_burial_object: добыча списком в порядке —
        // «Первичное место захоронения», затем «Откуда производились
        // захоронения»; оба отсутствуют — колонка пустая. Копирование
        // значения из rebural_from в primary_burial_object ЗАПРЕЩЕНА.
        function getPrimaryBurialObject() {
          const labels = [
            'Первичное место захоронения',
            'Откуда производились захоронения',
          ];
          for (const label of labels) {
            const v = getParamValue(label);
            if (v) return v;
          }
          return '';
        }

        const result = {
          document_id:       pageId,
          country_burial:    getParamValue('Страна захоронения'),
          region_burial:     getParamValue('Регион захоронения'),
          vmc_number:        getParamValue('Номер захоронения в ВМЦ'),
          current_burial:    getParamValue('Место захоронения'),
          primary_burial_object: getPrimaryBurialObject(),
          rebural_from:      getParamValue('Откуда производились перезахоронения'),
          date_created:      getParamValue('Дата создания современного места захоронения'),
          date_last_burial:  getParamValue('Дата последнего захоронения'),
          burial_type:       getParamValue('Вид захоронения'),
          burial_state:      getParamValue('Состояние захоронения'),
          graves_count:      getParamValue('Количество могил'),
          buried_total:      getParamValue('Захоронено всего'),
          buried_known:      getParamValue('Захоронено известных'),
          buried_unknown:    getParamValue('Захоронено неизвестных'),
          sponsor:           getParamValue('Кто шефствует над захоронением'),
          primary_url:       window.location.href,
        };
        return result;
      });

      // Сверка: хвост URL должен равняться document_id из поля страницы.
      const urlId = extractIdFromUrl(url);
      if (!data.document_id || data.document_id !== urlId) {
        throw new Error(
          `ID mismatch: field="${data.document_id || ''}" url="${urlId}"`
        );
      }

      data['Дата'] = runDate;
      rows.push(data);
      ok++;
      console.log(`[${i + 1}/${N}] id=${urlId} OK`);
    } catch (e) {
      err++;
      const reason = e.message || String(e);
      console.log(`[${i + 1}/${N}] ${url} ERR ${reason}`);
      errors.push({ url, reason });
    }

    // Паузы между запросами: 3–15 с; каждые случайные 8–12 запросов — 20–40 с
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
    saveCsv(outPath, headers, rows);
    // Ошибки — в отдельный CSV: url, причина, дата (тот же запрет перезаписи)
    if (!fs.existsSync(errorsCsvPath)) {
      const errLines = errors.map(e =>
        [escapeCsv(e.url), escapeCsv(e.reason), escapeCsv(runDate)].join(',')
      );
      fs.writeFileSync(
        errorsCsvPath,
        '\uFEFF' + ['url,reason,date', ...errLines].join('\n') + '\n',
        'utf-8'
      );
    }
  }

  // ---------- Итоговый блок (компактный, без эмодзи) ----------
  console.log('--- ИТОГ ---');
  console.log(`seed: ${seed}`);
  console.log(`ok: ${ok}`);
  console.log(`err: ${err}`);
  console.log(`выход: ${isDryRun ? '(dry-run, файл не записан) ' + outPath : outPath}`);
  if (errors.length > 0) {
    console.log('ошибки:');
    for (const e of errors) console.log(`  ${e.url} — ${e.reason}`);
  }
})();