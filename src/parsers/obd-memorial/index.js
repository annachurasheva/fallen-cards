/**
 * Точка входа для парсера OBD Memorial.
 * 
 * ЗАДАЧА: прочитать список URL, извлечь данные со страниц, вернуть сырые объекты.
 * 
 * ВХОД: массив URL страниц OBD Memorial
 * ВЫХОД: массив объектов { raw: {...}, source_url }
 * 
 * TODO:
 * - интеграция с Puppeteer (через obd-edge_v03.js)
 * - обработка ошибок загрузки страниц
 * - retry логика для нестабильных страниц
 */

import puppeteer from 'puppeteer-core';

export async function parseOBDMemorial(urls) {
  // Подключаемся к уже запущенному Edge (порт 9226 из RunEdgeOBD.ps1)
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9226'
  });

  const results = [];
  for (const url of urls) {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // TODO: извлечение данных
    
    await page.close();
    results.push({ raw: {}, source_url: url });
  }

  // НЕ закрываем browser — он внешний
  return results;
}