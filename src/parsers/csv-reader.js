/**
 * Универсальный парсер CSV файлов.
 * 
 * ЗАДАЧА: прочитать CSV и вернуть массив сырых строк (без нормализации).
 * 
 * ВХОД: путь к CSV файлу
 * ВЫХОД: массив объектов { raw: {...} }
 * 
 * TODO:
 * - использовать csv-parse для надёжного парсинга
 * - обработка кавычек, экранирования
 * - валидация заголовков
 */

import { readFile } from 'node:fs/promises';

export async function parseCSV(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV файл пуст или содержит только заголовок');
  }
  
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push({ raw: row });
  }
  
  return rows;
}