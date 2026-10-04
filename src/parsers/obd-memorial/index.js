/**
 * index.js — точка входа парсера OBD Memorial (ESM-порт донора obd-edge_v03.js).
 *
 * Подключение к уже запущенному внешнему Edge по CDP (browser НЕ закрывать!).
 *   pwsh tools/run-edge-obd.ps1  (порт 9226)
 *
 * Экспорты:
 *   parseUrls(urls, { port, onLog, onError }) -> { killed, other, errors }
 *   toCsv(rows) -> строка CSV по HEADERS (UTF-8 с BOM)
 */

import puppeteer from 'puppeteer-core';
import { HEADERS, KNOWN_TITLES, pageExtractor } from './extractors.js';
import { classify } from './classifier.js';

const DEFAULT_PORT = 9226;

// ---------- Задержки (рандомизация, чтобы не походить на бота) ----------
const MIN_AFTER_LOAD = 3000;
const MAX_AFTER_LOAD = 6000;
const MIN_BETWEEN = 3000;
const MAX_BETWEEN = 15000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  const value = Math.floor(min + Math.random() * (max - min + 1));
  return delay(value);
}

// Извлечение id из URL (хвост адреса): https://obd-memorial.ru/html/info.htm?id=551267195 -> 551267195
export function extractIdFromUrl(url) {
  const match = url.match(/id=(\d+)/);
  return match ? match[1] : '';
}

/**
 * Парсинг списка URL карточек OBD Memorial через внешний Edge (CDP).
 * @param {string[]} urls
 * @param {{ port?: number, onLog?: Function, onError?: Function }} [options]
 * @returns {Promise<{ killed: object[], other: object[], errors: Array<{url: string, message: string}> }>}
 */
export async function parseUrls(urls, { port = DEFAULT_PORT, onLog = () => {}, onError = () => {} } = {}) {
  // Подключаемся к уже запущенному внешнему Edge; browser НЕ закрываем (не наш)
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:' + port,
    defaultViewport: null,
  });

  const killed = [];
  const other = [];
  const errors = [];

  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const globalIndex = i + 1;
      onLog(`\n[${globalIndex}/${urls.length}] ${url}`);

      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await randomDelay(MIN_AFTER_LOAD, MAX_AFTER_LOAD); // пауза для полной отрисовки DOM

        // Сбор данных со страницы (pageExtractor выполняется внутри DOM страницы)
        const data = await page.evaluate(pageExtractor);

        // Определяем категорию
        const category = classify(data);
        const isKilled = category === 'killed';

        // Формируем notes — ТОРМОЗ: если с карточкой что-то не так,
        // без проверки она не появляется. Сюда попадают только проблемные/нестандартные данные.
        const notesParts = [];

        // Если не «убит/погиб» и причина есть — добавляем причину в notes
        if (!isKilled && data.cause_of_death) {
          notesParts.push(data.cause_of_death);
        }

        // Если архивные поля пусты — ищем альтернативные/нестандартные параметры
        const archiveFieldsEmpty = !data.nomer_fonda && !data.nomer_opisi && !data.nomer_dela && !data.document_type;
        if (archiveFieldsEmpty) {
          const extraParams = Object.entries(data._allParams)
            .filter(([title]) => !KNOWN_TITLES.includes(title))
            .map(([title, value]) => `${title}: ${value}`)
            .join('; ');
          if (extraParams) {
            notesParts.push(extraParams);
          }
        }

        // country_burial / region_burial / rebural_from в notes НЕ дублируем —
        // это отдельные колонки CSV (v03)

        // Убираем служебное поле _allParams из выгрузки
        delete data._allParams;
        data.notes = notesParts.join(' | ');

        if (isKilled) {
          killed.push(data);
          onLog(`   ✅ убит/погиб — добавлен в killed`);
        } else {
          other.push(data);
          onLog(`   ⚠️  другое ("${data.cause_of_death || 'не указано'}") — добавлен в other`);
        }

        await randomDelay(MIN_BETWEEN, MAX_BETWEEN);
      } catch (err) {
        // Ошибка страницы → в errors, цикл продолжается
        errors.push({ url, message: err.message });
        onError(`   ❌ Ошибка: ${err.message}`);
        await randomDelay(MIN_BETWEEN, MAX_BETWEEN);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    // Отключаемся от внешнего браузера; browser.close() НЕ вызываем
    browser.disconnect();
  }

  return { killed, other, errors };
}

// Экранирование значения для CSV
function escapeCsv(value) {
  if (typeof value !== 'string') return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Сериализация строк в CSV по HEADERS (UTF-8 с BOM), как в доноре saveCsv.
 * @param {object[]} rows
 * @returns {string}
 */
export function toCsv(rows) {
  const csvRows = rows.map(row => {
    return HEADERS.map(header => {
      const key = header.toLowerCase();
      return escapeCsv(row[key] || row[header] || '');
    }).join(',');
  });
  return '\uFEFF' + [HEADERS.join(','), ...csvRows].join('\n');
}
