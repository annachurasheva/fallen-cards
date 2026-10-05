/**
 * index.js — точка входа парсера карточек персон OBD Memorial.
 * Подключение к внешнему Edge через CDP (puppeteer-core), постраничный сбор,
 * классификация fallen/unclassified, сериализация в CSV.
 *
 * ВАЖНО: browser НЕ закрывать (внешний Edge) — только disconnect().
 */

import puppeteer from "puppeteer-core";
import { HEADERS, pageExtractor } from "./extractors.js";
import { classify } from "./classifier.js";

const DEFAULT_PORT = 9226;

// Экранирование значения для CSV (кавычки и запятые)
function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * toCsv — сериализация строк по HEADERS с экранированием кавычек и запятых.
 * UTF-8 с BOM (для Excel).
 */
export function toCsv(rows) {
  const headerLine = HEADERS.join(",");
  const lines = (rows || []).map((row) =>
    HEADERS.map((h) => escapeCsv(row[h])).join(","),
  );
  return "\uFEFF" + [headerLine, ...lines].join("\n");
}

// Сбор notes по правилам донора:
//  - не-fallen с причиной → причина в notes;
//  - архивные реквизиты пусты → нестандартные параметры из _allParams в notes;
//  - country/region/rebural в notes НЕ дублировать.
function buildNotes(row, cls) {
  const notesParts = [];

  if (cls !== "fallen" && row.cause) {
    notesParts.push(`Причина: ${row.cause}`);
  }

  const archiveEmpty = !row.archive_refs || !row.archive_refs.trim();
  if (archiveEmpty && Array.isArray(row._allParams)) {
    const knownRe = new RegExp("^(" + KNOWN_TITLES_ESC + ")$", "i");
    for (const p of row._allParams) {
      if (!p.title || !p.value) continue;
      if (knownRe.test(p.title)) continue;
      // не дублируем country/region/rebural
      if (
        /страна захоронения|регион захоронения|перезахоронение/i.test(p.title)
      )
        continue;
      notesParts.push(`${p.title}: ${p.value}`);
    }
  }

  return notesParts.join("; ");
}

// Экранирование регулярных выражений для KNOWN_TITLES
import { KNOWN_TITLES } from "./extractors.js";
const KNOWN_TITLES_ESC = KNOWN_TITLES.map((t) =>
  t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
).join("|");

/**
 * parseUrls — последовательный обход URL карточек персон.
 * @param {string[]} urls
 * @param {{port?: number, onLog?: Function, onError?: Function}} opts
 * @returns {Promise<{fallen: object[], unclassified: object[], errors: {url: string, message: string}[]}>}
 */
export async function parseUrls(
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

  const fallen = [];
  const unclassified = [];
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
        const cls = classify(data);
        data.notes = buildNotes(data, cls);

        if (cls === "fallen") fallen.push(data);
        else unclassified.push(data);
        onLog(`   ${data["Заголовок"] || data.document_id || "?"}`);
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

  return { fallen, unclassified, errors };
}