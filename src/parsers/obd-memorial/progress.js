/**
 * progress.js — построчная индикация жизни парсера (TASK-0005, п.5).
 *
 * Формат строки:
 *   [ЧЧ:ММ:СС] {текущий}/{всего_новых} | {фамилия имя} | {document_id} → {fallen|unclassified|error}
 *
 * Правила тона (мемориальный проект):
 *  - НЕ использовать слова «убит/погиб» в консоли — только fallen / unclassified / error;
 *  - НЕ использовать эмодзи — вывод строгий, деловой;
 *  - если ФИО пустое — писать `[без имени]`.
 */

// Метка времени [ЧЧ:ММ:СС] по локальному часовому поясу
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`;
}

// Краткое имя для консоли: «Фамилия Имя»; при пустом ФИО — [без имени]
function shortName(row) {
  const name = `${row?.last_name || ""} ${row?.first_name || ""}`.trim();
  return name || "[без имени]";
}

/**
 * makeProgressPrinter — печать прогресса в stdout.
 * process.stdout.write пишет строку сразу — важно для лаунчера
 * (сторож видит вывод в реальном времени, без буферизации).
 */
export function makeProgressPrinter() {
  return function printProgress({ current, total, row, documentId, status, errorType }) {
    let line;
    if (status === "error") {
      line =
        `${stamp()} ${current}/${total} | [ОШИБКА] | ${documentId || "?"} ` +
        `→ error (${errorType || "UNKNOWN"})`;
    } else {
      line =
        `${stamp()} ${current}/${total} | ${shortName(row)} | ` +
        `${documentId || "?"} → ${status}`;
    }
    process.stdout.write(line + "\n");
  };
}