/**
 * Генерация Markdown карточки для Astro.
 * 
 * ЗАДАЧА: из нормализованных данных создать .md файл с frontmatter.
 * 
 * ВХОД: нормализованный объект карточки
 * ВЫХОД: строка Markdown (frontmatter + body)
 * 
 * TODO:
 * - формирование YAML frontmatter
 * - генерация тела карточки
 * - шаблонизация (возможно, использовать шаблоны)
 */

export function generateMarkdown(normalizedData) {
  const frontmatter = buildFrontmatter(normalizedData);
  const body = buildBody(normalizedData);
  
  return `---\n${frontmatter}\n---\n\n${body}`;
}

function buildFrontmatter(data) {
  // TODO: преобразовать объект в YAML
  return `title: "${data.person.last_name} ${data.person.first_name}"
status: draft`;
}

function buildBody(data) {
  // TODO: шаблон тела карточки
  return `# ${data.person.last_name} ${data.person.first_name}\n\nКарточка в разработке.`;
}