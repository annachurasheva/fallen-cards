/**
 * classifier.js — классификация карточки: «павшие» или остальное.
 *
 * Перенесено из донора: puppeteer-project/obd-edge_v03.js (CommonJS -> ESM).
 *
 * Правила (три ветки):
 *  1. Если Причина выбытия содержит «убит» или «погиб» → fallen.
 *  2. Если причина НЕ указана, но есть «Дата смерти» (тип «списки захоронения»)
 *     и есть захоронение (первичное/место) → fallen (это погибший из списка захоронения).
 *  3. Во всех остальных случаях → unclassified (причина/особенности уходят в notes).
 */
export function classify(data) {
  const cause = (data.cause_of_death || '').toLowerCase().trim();
  if (cause.includes('убит') || cause.includes('погиб')) {
    return 'fallen';
  }
  const hasDeathDate = !!(data.date_death || '').trim();
  const hasBurial = !!((data.primary_burial || '').trim() || (data.current_burial || '').trim());
  if (!cause && hasDeathDate && hasBurial) {
    return 'fallen';
  }
  return 'unclassified';
}