// scripts/pmn-edge-persons.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PORT = 9230;
const OUT_DIR = path.join(__dirname, '..', 'data', 'processed');
const OUT_CSV = `pmn-persons-${new Date().toISOString().split('T')[0]}-${new Date().toTimeString().slice(0,5).replace(':','')}.csv`;

const args = process.argv.slice(2);
const INPUT_FILE = args[0];

function escapeCsv(value) {
  if (typeof value !== 'string') return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

(async () => {
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null,
  });

  console.log(`Подключено к Edge CDP localhost:${PORT}`);

  const page = await browser.newPage();
  const urls = fs.readFileSync(INPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const rows = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i].trim();
    console.log(`[${i+1}/${urls.length}] ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));

      const data = await page.evaluate(() => {
        // Парсер полей персоны с pamyat-naroda.ru
        const getText = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.innerText.trim() : '';
        };

        const result = {
          document_id: window.location.pathname.match(/id=(\d+)/)?.[1] || '',
          fio: getText('.person-name') || getText('h1'),
          birth_date: '',
          birth_place: '',
          death_date: '',
          warunit: '',
          rank: '',
          primary_burial: '',
          current_burial: '',
          obd_url: '',
          pmn_url: window.location.href,
        };

        // Ищем поля в таблице или списке
        const params = document.querySelectorAll('.person-param, .card_parameter');
        for (const param of params) {
          const title = param.querySelector('.param-title, .card_param-title');
          const value = param.querySelector('.param-value, .card_param-result');
          if (title && value) {
            const t = title.innerText.trim();
            const v = value.innerText.trim();
            if (t.includes('Дата рождения')) result.birth_date = v;
            if (t.includes('Место рождения')) result.birth_place = v;
            if (t.includes('Дата выбытия') || t.includes('Дата смерти')) result.death_date = v;
            if (t.includes('Воинская часть') || t.includes('Место службы')) result.warunit = v;
            if (t.includes('Звание')) result.rank = v;
            if (t.includes('Первичное место')) result.primary_burial = v;
            if (t.includes('Место захоронения')) result.current_burial = v;
            if (t.includes('OBD') || t.includes('obd')) result.obd_url = v;
          }
        }

        return result;
      });

      rows.push(data);
      console.log(`   ✅ собрано`);
    } catch (e) {
      console.error(`   ❌ ${e.message}`);
    }

    if (i < urls.length - 1) {
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
    }
  }

  await page.close();
  await browser.disconnect();

  const headers = ['document_id', 'fio', 'birth_date', 'birth_place', 'death_date', 'warunit', 'rank', 'primary_burial', 'current_burial', 'obd_url', 'pmn_url'];
  const csvRows = rows.map(row => headers.map(h => escapeCsv(row[h] || '')).join(','));
  const csvContent = '\uFEFF' + [headers.join(','), ...csvRows].join('\n');

  const outPath = path.join(OUT_DIR, OUT_CSV);
  fs.writeFileSync(outPath, csvContent, 'utf-8');
  console.log(`Сохранено: ${outPath}`);
})();