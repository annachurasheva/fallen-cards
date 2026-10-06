/**
 * index.js — точка входа парсера карточек персон OBD Memorial.
 * Подключение к внешнему Edge через CDP (puppeteer-core), постраничный сбор,
 * классификация fallen/unclassified, колбэк onRecord для вызывающего CLI.
 *
 * ВАЖНО: browser НЕ закрывать (внешний Edge) — только disconnect().
 *
 * Вариант Б (TASK-0005):
 *  - сериализация CSV и ведение реестра — задача CLI (scripts/parse-obd.js),
 *    здесь только извлечение данных, классификация и ошибки;
 *  - на каждую обработанную запись вызывается onRecord({index, status, row/url, ...}),
 *    что даёт CLI писать прогресс построчно и соблюдать атомарность реестра;
 *  - ошибки страниц не прерывают сессию: типизируются (TIMEOUT / NETWORK /
 *    PARSE_ERROR / EMPTY_PAGE) и уходят в onRecord со status="error".
 */

import puppeteer from "puppeteer-core";
import { pageExtractor } from "./extractors.js";
import { classify } from "./classifier.js";

const DEFAULT_PORT = 9226;
const NAV_TIMEOUT_MS = 30000; // превышено время ожидания 30с → TIMEOUT

// Типизация ошибок страницы (п.9): TIMEOUT | NETWORK | PARSE_ERROR | EMPTY_PAGE
function classifyError(e, data) {
  if (e) {
    const msg = e.message || String(e);
    if (/timeout/i.test(msg)) return "TIMEOUT";
    return "NETWORK";
  }
  // Ошибок загрузки нет, но данные битые/пустые
  if (!data) return "PARSE_ERROR";
  const hasAnyField = Object.entries(data).some(
    ([k, v]) => k !== "_allParams" && typeof v === "string" && v.trim() !== "",
  );
  const hasParams = data._allParams && Object.keys(data._allParams).length > 0;
  if (!hasAnyField && !hasParams) return "EMPTY_PAGE";
  return null;
}

/**
 * parseUrls — последовательный обход URL карточек персон.
 * @param {string[]} urls
 * @param {{port?: number, onLog?: Function, onError?: Function,
 *          onRecord?: Function}} opts
 *   onRecord(rec) вызывается ровно один раз на каждый URL:
 *     успешный: { index, status: 'fallen'|'unclassified', row, documentId, url }
 *     ошибка:   { index, status: 'error', url, documentId, errorType, message }
 * @returns {Promise<{fallen: object[], unclassified: object[], errors: object[]}>}
 */
export async function parseUrls(
  urls,
  { port = DEFAULT_PORT, onLog = () => {}, onError = () => {}, onRecord = () => {} } = {},
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
  onLog(`Подключено к Edge CDP localhost:${port}`);

  const fallen = [];
  const unclassified = [];
  const errors = [];

  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const index = i + 1;
      const idFromUrl = (url.match(/id=(\d+)/) || [])[1] || "";

      const page = await browser.newPage();
      let loadError = null;
      let data = null;
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT_MS });
        await randomDelay(MIN_AFTER_LOAD, MAX_AFTER_LOAD);
        try {
          data = await page.evaluate(pageExtractor);
        } catch (e) {
          loadError = e; // битый HTML / исключение в evaluate
        }
      } catch (e) {
        loadError = e; // TIMEOUT или NETWORK
      } finally {
        await page.close().catch(() => {});
      }

      const errType = classifyError(loadError, data);
      if (errType) {
        const err = {
          index,
          status: "error",
          url,
          documentId: idFromUrl,
          errorType: errType,
          message: loadError
            ? (loadError.message || String(loadError))
            : errType === "EMPTY_PAGE"
              ? "Страница не содержит полей карточки"
              : "Не удалось разобрать страницу",
        };
        errors.push(err);
        onError(`${url} — ${err.errorType}: ${err.message}`);
        onRecord(err);
      } else {
        const cls = classify(data);
        if (cls === "fallen") {
          fallen.push(data);
        } else {
          unclassified.push(data);
        }
        onRecord({
          index,
          status: cls,
          row: data,
          documentId: data.document_id || idFromUrl,
          url: data.primary_url || url,
        });
      }

      if (i < urls.length - 1) {
        await randomDelay(MIN_BETWEEN, MAX_BETWEEN);
      }
    }
  } finally {
    // browser НЕ закрываем (внешний Edge) — только отключаемся
    browser.disconnect();
    onLog("Отключено от Edge (браузер оставлен открытым)");
  }

  return { fallen, unclassified, errors };
}