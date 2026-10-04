/**
 * extractors.js — извлечение полей из DOM карточки OBD Memorial.
 *
 * Перенесено дословно из донора: puppeteer-project/obd-edge_v03.js
 * (CommonJS -> ESM). Функция pageExtractor передаётся в page.evaluate.
 */

// Итоговые заголовки CSV — v03: добавлены country_burial, region_burial, rebural_from
export const HEADERS = [
  'Заголовок',
  'nomer_fonda',
  'nomer_opisi',
  'nomer_dela',
  'document_type',
  'document_id',
  'last_name',
  'first_name',
  'middle_name',
  'date_birth',
  'place_birth',
  'date_death',
  'rank',
  'warunit',
  'cause_of_death',
  'primary_burial',
  'current_burial',
  'country_burial',
  'region_burial',
  'rebural_from',
  'conscription_location',
  'primary_url',
  'notes',
  'Дата'
];

// Известные заголовки параметров (стандартные) — не попадают в extra-поиск notes
export const KNOWN_TITLES = [
  'Фамилия',
  'Имя',
  'Отчество',
  'Дата рождения',
  'Место рождения',
  'Дата выбытия',
  'Дата смерти',
  'Воинское звание',
  'Последнее место службы',
  'Причина выбытия',
  'Первичное место захоронения',
  'Номер фонда источника информации',
  'Номер описи источника информации',
  'Номер дела источника информации',
  'Название источника донесения',
  'Место захоронения',
  'Место призыва',
  'Страна захоронения',
  'Регион захоронения',
  'Откуда перезахоронен'
];

/**
 * Сбор данных со страницы (аналог F12-скрипта, но универсальный под оба типа карточек).
 * Вызывается внутри page.evaluate(pageExtractor).
 * @returns объект с полями v03 + _allParams (сырой список всех параметров)
 */
export function pageExtractor() {
  function getParamValue(title) {
    const elements = document.querySelectorAll('.card_parameter');
    for (let el of elements) {
      const titleSpan = el.querySelector('.card_param-title');
      if (titleSpan && titleSpan.innerText.trim() === title) {
        const valueSpan = el.querySelector('.card_param-result');
        return valueSpan ? valueSpan.innerText.trim() : '';
      }
    }
    return '';
  }

  // Собираем ВСЕ пары «заголовок → значение» для анализа типа карточки
  const allParams = {};
  const elements = document.querySelectorAll('.card_parameter');
  for (let el of elements) {
    const titleSpan = el.querySelector('.card_param-title');
    const valueSpan = el.querySelector('.card_param-result');
    if (titleSpan && valueSpan) {
      allParams[titleSpan.innerText.trim()] = valueSpan.innerText.trim();
    }
  }

  const result = {
    last_name:        getParamValue('Фамилия'),
    first_name:       getParamValue('Имя'),
    middle_name:      getParamValue('Отчество'),
    date_birth:       getParamValue('Дата рождения'),
    place_birth:      getParamValue('Место рождения'),
    // Дата выбытия (тип 1) или Дата смерти (тип 2)
    date_death:       getParamValue('Дата выбытия') || getParamValue('Дата смерти'),
    rank:             getParamValue('Воинское звание'),
    warunit:          getParamValue('Последнее место службы'),
    cause_of_death:   getParamValue('Причина выбытия'),
    primary_burial:   getParamValue('Первичное место захоронения'),
    nomer_fonda:      getParamValue('Номер фонда источника информации'),
    nomer_opisi:      getParamValue('Номер описи источника информации'),
    nomer_dela:       getParamValue('Номер дела источника информации'),
    document_type:    getParamValue('Название источника донесения'),
    // Тип 2: «Место захоронения» — БЕЗ fallback на первичное (v03)
    current_burial:   getParamValue('Место захоронения'),
    // Новые поля (v03) — только если есть в карточке
    country_burial:   getParamValue('Страна захоронения'),
    region_burial:    getParamValue('Регион захоронения'),
    rebural_from:     getParamValue('Откуда перезахоронен'),
    conscription_location: getParamValue('Место призыва'),
    primary_url:      window.location.href,
  };

  // document_id: id_common или из URL
  const idCommon = document.querySelector('[id_common]')?.getAttribute('id_common');
  if (idCommon) {
    result.document_id = idCommon;
  } else {
    const urlMatch = window.location.href.match(/id=(\d+)/);
    if (urlMatch) result.document_id = urlMatch[1];
  }

  result['Заголовок'] = `${result.last_name} ${result.first_name} ${result.middle_name}`.trim();
  result['Дата'] = new Date().toISOString().split('T')[0];

  // Сохраняем «сырой» список всех параметров для анализа в notes
  result._allParams = allParams;

  return result;
}
