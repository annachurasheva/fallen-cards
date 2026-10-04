/**
 * input-control.js — чистая логика контроля входа парсера OBD.
 * Ничего не печатает: возвращает данные, печатает CLI (scripts/check-input.js).
 *
 * Для .txt со списком URL считает: всего строк, уникальных, дубли внутри файла;
 * сколько уже в журнале файла и в глобальном журнале; какие новые.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function readLines(filepath) {
  return readFileSync(filepath, 'utf-8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
}

export function extractIdFromUrl(url) {
  const m = url.match(/[?&]id=(\d+)/);
  return m ? m[1] : null;
}

function loadSet(filepath) {
  if (!existsSync(filepath)) return new Set();
  return new Set(readLines(filepath));
}

export function analyzeInputFile(filepath, dirs) {
  const baseName = path.basename(filepath, path.extname(filepath));
  const urls = readLines(filepath);

  const countMap = new Map();
  for (const url of urls) countMap.set(url, (countMap.get(url) || 0) + 1);
  const uniqueUrls = [...countMap.keys()];
  const dupUrls = [...countMap.entries()].filter(([, n]) => n > 1);

  const processedFile = path.join(dirs.processed, baseName, `${baseName}__processed.txt`);
  const processedSet = loadSet(processedFile);
  const summarySet = loadSet(dirs.summary);

  const inJournal = uniqueUrls.filter(u => processedSet.has(u)).length;
  const inSummary = uniqueUrls.filter(u => {
    const id = extractIdFromUrl(u);
    return id && summarySet.has(id);
  }).length;

  const newUrls = uniqueUrls.filter(u => {
    if (processedSet.has(u)) return false;
    const id = extractIdFromUrl(u);
    if (id && summarySet.has(id)) return false;
    return true;
  });

  return { baseName, total: urls.length, unique: uniqueUrls.length, dupUrls, inJournal, inSummary, newUrls };
}