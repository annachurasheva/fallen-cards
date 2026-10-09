/**
 * obd-edge-objects.js — парсер карточек «Информация о захоронении»
 * (объекты гос-регистрации, obd-memorial.ru)
 *
 * ЗАПУСК:
 *   Edge с remote-debugging: pwsh scripts/RunEdgeOBD.ps1   (порт 9226)
 *   node obd-edge-objects.js objects.txt
 *
 * ВЫХОД:
 *   объекты_mem2026.csv — рядом со скриптом (см. OUT_DIR ниже)
 *
 * Один прогон. Список URL задаётся позиционным аргументом.
 * Персон не парсит. Тип файла не определяет.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ---------- Параметры ----------
const DEFAULT_PORT = 9226;

// Аргументы: позиционный <файл.txt>, флаги --dry-run, --port=
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const portArg = args.find(a => a.startsWith('--port='));
const PORT = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_PORT;

// ВАРИАНТ A (рабочий): позиционный аргумент — node obd-edge-objects.js objects.txt
// ВАРИАНТ B: ключ --input=  — node obd-edge-objects.js --input=objects.txt
const positional = args.filter(a => !a.startsWith('--'));
const INPUT_FILE = positional[0] || null;

// ---------- Куда писать результат ----------
// ВАРИАНТ A (рабочий): рядом со скриптом — __dirname
// ВАРИАНТ B: откуда запущен терминал — process.cwd()
// ВАРИАНТ C: рядом с входным .txt — path.dirname(inputPath)
const OUT_DIR = __dirname;

// ---------- Имя выходного CSV ----------
const OUT_CSV = 'объекты_mem2026.csv';

// ---------- Задержки ----------
const MIN_AFTER_LOAD = 3000;
const MAX_AFTER_LOAD = 6000;
const MIN_BETWEEN = 3000;
const MAX_BETWEEN = 15000;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay(min, max) {
  return delay(Math.floor(min + Math.random() * (max - min + 1)));
}

function escapeCsv(value) {
  if (typeof value !== 'string') return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function saveCsv(filepath, headers, rows) {
  const csvRows = rows.map(row => {
    return headers.map(h => escapeCsv(row[h] || '')).join(',');
  });
  const csvContent = '\uFEFF' + [headers.join(','), ...csvRows].join('\n');
  fs.writeFileSync(filepath, csvContent, 'utf-8');
}

function extractIdFromUrl(url) {
  const m = url.match(/id=(\d+)/);
  return m ? m[1] : '';
}

function readUrlList(filepath) {
  if (!fs.existsSync(filepath)) return [];
  return fs.readFileSync(filepath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));
}

// ---------- Схема объектного CSV ----------
// Порядок — сверху вниз по карточке объекта + служебные в начале.
const headers = [
  'document_id',
  'primary_url',
  'country_burial',
  'region_burial',
  'vmc_number',
  'current_burial',
  'date_created',
  'date_last_burial',
  'burial_type',
  'burial_state',
  'graves_count',
  'buried_total',
  'buried_known',
  'buried_unknown',
  'sponsor',
  'rebural_from'
];

// ---------- Главная функция ----------
(async () => {
  if (!INPUT_FILE) {
    console.error('❌ Укажите файл со списком URL: node obd-edge-objects.js objects.txt');
    process.exit(1);
  }

  const inputPath = path.isAbsolute(INPUT_FILE)
    ? INPUT_FILE
    : path.join(process.cwd(), INPUT_FILE);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Файл не найден: ${inputPath}`);
    process.exit(1);
  }

  const urls = readUrlList(inputPath);
  if (urls.length === 0) {
    console.error('❌ В файле нет ни одного URL.');
    process.exit(1);
  }

  const outPath = path.join(OUT_DIR, OUT_CSV);

  console.log(`📂 Входной файл: ${inputPath}`);
  console.log(`📄 URL: ${urls.length}`);
  console.log(`📁 Результат: ${outPath}`);
  if (isDryRun) console.log('🔍 DRY-RUN');

  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${PORT}`,
      defaultViewport: null,
    });
    console.log(`🔗 Подключено к Edge CDP localhost:${PORT}`);
  } catch (e) {
    console.error(`❌ Не удалось подключиться к Edge CDP localhost:${PORT}.`);
    console.error(`   Сначала запустите: pwsh scripts/RunEdgeOBD.ps1`);
    console.error(`   Ошибка: ${e.message}`);
    process.exit(1);
  }

  const page = await browser.newPage();
  const rows = [];
  let ok = 0;
  let err = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`\n[${i + 1}/${urls.length}] ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await randomDelay(MIN_AFTER_LOAD, MAX_AFTER_LOAD);

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

        const result = {
          country_burial:  getParamValue('Страна захоронения'),
          region_burial:   getParamValue('Регион захоронения'),
          vmc_number:      getParamValue('Номер захоронения в ВМЦ'),
          current_burial:  getParamValue('Место захоронения'),
          date_created:    getParamValue('Дата создания современного места захоронения'),
          date_last_burial:getParamValue('Дата последнего захоронения'),
          burial_type:     getParamValue('Вид захоронения'),
          burial_state:    getParamValue('Состояние захоронения'),
          graves_count:    getParamValue('Количество могил'),
          buried_total:    getParamValue('Захоронено всего'),
          buried_known:    getParamValue('Захоронено известных'),
          buried_unknown:  getParamValue('Захоронено неизвестных'),
          sponsor:         getParamValue('Кто шефствует над захоронением'),
          rebural_from:    getParamValue('Откуда производились перезахоронения'),
          primary_url:     window.location.href
        };

        const urlMatch = window.location.href.match(/id=(\d+)/);
        if (urlMatch) result.document_id = urlMatch[1];

        return result;
      });

      rows.push(data);
      ok++;
      console.log(`   ✅ собрано`);
    } catch (e) {
      err++;
      console.error(`   ❌ ${e.message}`);
    }

    if (i < urls.length - 1) {
      await randomDelay(MIN_BETWEEN, MAX_BETWEEN);
    }
  }

  await page.close();
  await browser.disconnect();

  if (!isDryRun) {
    saveCsv(outPath, headers, rows);
    console.log(`\n💾 Сохранено: ${outPath} — ${rows.length} записей`);
  } else {
    console.log(`\n🔍 DRY-RUN: собрано ${rows.length}, ошибок ${err}, файл НЕ записан`);
  }

  console.log(`\n=== Отчёт ===`);
  console.log(`Успешно: ${ok}`);
  console.log(`Ошибок:  ${err}`);
  console.log('✅ Готово!');
})();