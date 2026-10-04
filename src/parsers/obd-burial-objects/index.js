/**
 * index.js — точка входа парсера объектов захоронений OBD Memorial.
 * ESM-порт донора obd-edge-objects.js: подключение к внешнему Edge через CDP
 * (puppeteer-core), постраничный сбор карточек «Информация о захоронении»,
 * сериализация в CSV по OBJECT_HEADERS.
 *
 * ВАЖНО: browser НЕ закрывать (внешний Edge) — только disconnect().
 */

import puppeteer from "puppeteer-core";
import { OBJECT_HEADERS, pageExtractor } from "./extractors.js";

const DEFAULT_PORT = 9226;

// Экранирование значения для CSV (кавычки и запятые)
function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  let s;
  if (typeof value === "object") {
    // registered_persons и прочие массивы/объекты — JSON-строкой
    s = JSON.stringify(value);
  } else {
    s = String(value);
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * toCsv — сериализация строк по OBJECT_HEADERS с экранированием кавычек и запятых.
 * registered_persons сериализуется как JSON-строка. UTF-8 с BOM (для Excel).
 */
export function toCsv(rows) {
  const headerLine = OBJECT_HEADERS.join(",");
  const lines = (rows || []).map((row) =>
    OBJECT_HEADERS.map((h) => escapeCsv(row[h])).join(","),
  );
  return "\uFEFF" + [headerLine, ...lines].join("\n");
}

/**
 * parseObjectUrls — последовательный обход URL объектов захоронения.
 * Для каждого url: newPage() → goto(networkidle2, 60s) → evaluate(pageExtractor)
 * → push в results; page.close() в finally; ошибка страницы → в errors,
 * цикл продолжается. Задержки рандомизированы (как у донора), browser не
 * закрывается — только disconnect().
 *
 * @param {string[]} urls
 * @param {{port?: number, onLog?: Function, onError?: Function}} opts
 * @returns {Promise<{results: object[], errors: {url: string, message: string}[]}>}
 */
export async function parseObjectUrls(
  urls,
  { port = DEFAULT_PORT, onLog = () => {}, onError = () => {} } = {},
) {
  const MIN_AFTER_LOAD = 3000;
  const MAX_AFTER_LOAD = 6000;
  const MIN_BETWEEN = 3000;
  const MAX_BETWEEN = 15000;

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const randomDelay = (min, max) =>
    delay(Math.floor(min + Math.random() * (max - min + 1)));

  const browser = await puppeteer.connect({
    browserURL: "http://127.0.0.1:" + port,
    defaultViewport: null,
  });
  onLog(`🔗 Подключено к Edge CDP localhost:${port}`);

  const results = [];
  const errors = [];

  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      onLog(`\n[${i + 1}/${urls.length}] ${url}`);

      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
        await randomDelay(MIN_AFTER_LOAD, MAX_AFTER_LOAD);

        const data = await page.evaluate(pageExtractor);
        results.push(data);
        onLog(`   ✅ объект ${data.object_id || "?"} собран`);
      } catch (e) {
        const err = { url, message: e.message };
        errors.push(err);
        onError(`   ❌ ${url} — ${e.message}`);
      } finally {
        await page.close().catch(() => {});
      }

      if (i < urls.length - 1) {
        await randomDelay(MIN_BETWEEN, MAX_BETWEEN);
      }
    }
  } finally {
    // browser НЕ закрываем (внешний Edge) — только отключаемся
    browser.disconnect();
    onLog("🔌 Отключено от Edge (браузер оставлен открытым)");
  }

  return { results, errors };
}
